"""
The S10 migration gate: Claude 4.x against Claude 5.5 on bookbench UK dev.

Every request is the app's own: the prompt comes from `build_categoriser_prompt` and the
params from the gateway's `build_request`, so an arm measures what production would send
under that profile. Responses are scored offline with the app's validation, escalation and
decide thresholds; tiered results are derived per rep (primary rep r, with the escalation
arm's rep r on the rows that escalate), so the escalation arm runs on every item once and
both "Sonnet only" and "tiered" come from the same calls.

Modes:
    mock      free, no network: a deterministic fake model through the same pipeline (CI)
    estimate  free: count_tokens on a sample per arm, scaled to n items x reps
    live      paid, Message Batches: needs --budget; aborts if the estimate exceeds it

Usage (from backend/):
    py -3.13 -m evals.migration_ab --extract eval/phase-2-data --data-dir <scratch>/bookbench
    py -3.13 -m evals.migration_ab --data-dir <scratch>/bookbench --mode mock
    py -3.13 -m evals.migration_ab --data-dir <scratch>/bookbench --mode estimate
    py -3.13 -m evals.migration_ab --data-dir <scratch>/bookbench --mode live --budget 8

The bookbench labels are rule-generated and unreviewed: the result is a relative comparison
for the flip decision, not an accuracy figure. Synthetic data only, never Xero data.
"""
from __future__ import annotations

import argparse
import csv
import dataclasses
import hashlib
import inspect
import io
import json
import os
import random
import subprocess
import sys
import tarfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Union

from anthropic.types import Message

from app.agents.categoriser import CategoryPrediction, _validate_prediction, build_categoriser_prompt
from app.services.llm_client import (
    PROFILES,
    LLMResult,
    Mechanism,
    Profile,
    Route,
    RouteConfig,
    Status,
    build_request,
    parse_response,
)
from evals.cost_tracker import PRICING

BOOKBENCH_PATH = "backend/evals/datasets/bookbench/draft"
DATASET_DIR = "full_dryrun"
DATASET_FILES = ("items.jsonl", "history.jsonl", "stats.json")
RESULTS_DIR = Path(__file__).parent / "results" / "migration_ab"
BATCH_DISCOUNT = 0.5
REVIEW = "NEEDS_REVIEW"

# chart_uk.json uses Xero's display names for account types; the app stores what
# `GET /Accounts` returns (contract.md 1.3), the AccountType enum. System accounts map
# to the type Xero files them under. Mapping written for this harness, not checked
# against a live Xero org (the app's own chart rows are never used here).
XERO_ACCOUNT_TYPE = {
    "Revenue": "REVENUE",
    "Direct Costs": "DIRECTCOSTS",
    "Overhead": "OVERHEADS",
    "Fixed Asset": "FIXED",
    "Current Asset": "CURRENT",
    "Inventory": "INVENTORY",
    "Bank": "BANK",
    "Current Liability": "CURRLIAB",
    "Non-current Liability": "TERMLIAB",
    "Equity": "EQUITY",
    "Accounts Receivable": "CURRENT",
    "Accounts Payable": "CURRLIAB",
    "Unpaid Expense Claims": "CURRLIAB",
    "VAT": "CURRLIAB",
    "Historical": "CURRLIAB",
    "Rounding": "CURRLIAB",
    "Tracking": "CURRLIAB",
    "Retained Earnings": "EQUITY",
}
CIS_ACCOUNTS = {"625", "827"}


# ── Data ─────────────────────────────────────────────────────────────────────

def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract_bookbench(ref: str, dest: Path, repo: Path) -> dict:
    """`git archive <ref> bookbench/draft` into dest, recording the commit it came from."""
    commit = subprocess.run(
        ["git", "rev-parse", ref], cwd=repo, check=True, capture_output=True, text=True
    ).stdout.strip()
    # bookbench hashes LF bytes; with core.autocrlf on (Windows) git archive writes CRLF.
    tar_bytes = subprocess.run(
        ["git", "-c", "core.autocrlf=false", "-c", "core.eol=lf", "archive", "--format=tar", commit, BOOKBENCH_PATH],
        cwd=repo, check=True, capture_output=True,
    ).stdout
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(tar_bytes)) as tar:
        tar.extractall(dest, filter="data")
    source = {"ref": ref, "commit": commit, "path": BOOKBENCH_PATH}
    (dest / "SOURCE.json").write_text(json.dumps(source, indent=1), encoding="utf-8")
    return source


@dataclass
class Bookbench:
    root: Path
    items: list[dict]
    history: dict[str, dict]
    chart: dict
    manifest: dict
    source: dict
    sha256: dict[str, str]
    review_equivalents: set[str]
    # S6 channels where `underlying_correct` is scored (manifest scoring)
    scored_channels: set[str]


def load_bookbench(data_dir: Path) -> Bookbench:
    """Load the extracted draft and check every file against manifest.json."""
    root = data_dir / BOOKBENCH_PATH
    ds = root / DATASET_DIR
    manifest = json.loads((ds / "manifest.json").read_text(encoding="utf-8"))
    sha = {}
    for name in DATASET_FILES:
        got = _sha256(ds / name)
        want = manifest["files"][name]["sha256"]
        if got != want:
            raise ValueError(f"{name}: sha256 {got} does not match manifest {want}")
        sha[f"{DATASET_DIR}/{name}"] = got
    got = _sha256(root / "chart_uk.json")
    if got != manifest["inputs"]["chart_uk.json"]:
        raise ValueError(f"chart_uk.json: sha256 {got} does not match manifest {manifest['inputs']['chart_uk.json']}")
    sha["chart_uk.json"] = got
    sha[f"{DATASET_DIR}/manifest.json"] = _sha256(ds / "manifest.json")

    source_path = data_dir / "SOURCE.json"
    source = json.loads(source_path.read_text(encoding="utf-8")) if source_path.exists() else {}
    items = [json.loads(line) for line in (ds / "items.jsonl").read_text(encoding="utf-8").splitlines() if line]
    history = {}
    for line in (ds / "history.jsonl").read_text(encoding="utf-8").splitlines():
        if line:
            row = json.loads(line)
            history[row["row_id"]] = row
    return Bookbench(
        root=root,
        items=items,
        history=history,
        chart=json.loads((root / "chart_uk.json").read_text(encoding="utf-8")),
        manifest=manifest,
        source=source,
        sha256=sha,
        review_equivalents=set(manifest["scoring"]["review_equivalents"]["UK"]),
        scored_channels=set(manifest["scoring"]["underlying_correct_scored_channels"]),
    )


def uk_dev(bb: Bookbench) -> list[dict]:
    """UK dev items in file order. The app's prompt is UK-only, so the US config is out."""
    return [i for i in bb.items if i["jurisdiction"] == "UK" and i["split"] == "dev"]


def firm_chart(chart: dict, firm: dict) -> list[dict]:
    """The chart the app would hold for this firm, in chart_uk.json order, as {code, name, type}.

    All default accounts minus the entity variant's removals, plus the dataset-added bank
    accounts the firm holds and the CIS accounts when the firm is in CIS.
    """
    variant = next(v for v in chart["entity_variants"].values() if firm["entity_type"] in v["applies_to"])
    removed = set(variant["remove"])
    cis = firm["tax_registration"].get("cis") or {}
    in_cis = bool(cis.get("contractor") or cis.get("subcontractor"))
    out = []
    for a in chart["accounts"] + chart["dataset_added_accounts"]:
        code = a["code"]
        if code in removed:
            continue
        if a["type"] == "Bank" and code not in firm["bank_accounts"]:
            continue
        if code in CIS_ACCOUNTS and not in_cis:
            continue
        out.append({"code": code, "name": a["name"], "type": XERO_ACCOUNT_TYPE[a["type"]]})
    return out


def precedents(item: dict, history: dict[str, dict]) -> list[dict]:
    """retrieved_top5 as the app's similar_examples, nearest first."""
    rows = [history[row_id] for row_id in item["retrieved_top5"]]
    return [
        {"description": r["description"], "amount": r["amount"], "category": r["category"], "date": r["date"]}
        for r in rows
        if r["category"]
    ]


def transaction_data(item: dict) -> dict:
    """The four fields the graph reads (contract.md 6.1); `xero` is not shown."""
    r = item["record"]
    return {"date": r["date"], "amount": r["amount"], "description": r["description"], "reference": r["reference"]}


@dataclass
class Case:
    item: dict
    chart: list[dict]
    prompt: str


def build_cases(bb: Bookbench, items: list[dict]) -> list[Case]:
    cases = []
    for item in items:
        chart = firm_chart(bb.chart, item["firm_profile"])
        codes = {a["code"] for a in chart}
        missing = [c for c in item["acceptable_labels"] if c not in codes]
        if missing:
            raise ValueError(f"{item['item_id']}: acceptable labels {missing} are not in the firm chart")
        prompt = build_categoriser_prompt(transaction_data(item), chart, precedents(item, bb.history))
        cases.append(Case(item=item, chart=chart, prompt=prompt))
    return cases


# ── Arms ─────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Arm:
    key: str
    profile: Profile
    route: Route
    description: str
    optional: bool = False

    @property
    def config(self) -> RouteConfig:
        return self.profile.routes[self.route]


def _with_primary(profile: Profile, name: str, cfg: RouteConfig) -> Profile:
    return dataclasses.replace(profile, name=name, routes={**profile.routes, Route.CATEGORISE_PRIMARY: cfg})


_OLD, _NEW = PROFILES["claude-4"], PROFILES["claude-5-5"]
_NEW_PRIMARY = _NEW.routes[Route.CATEGORISE_PRIMARY]

ARMS: dict[str, Arm] = {
    "A": Arm("A", _OLD, Route.CATEGORISE_PRIMARY, "Haiku 4.5, tool (today's primary)"),
    "B": Arm("B", _OLD, Route.CATEGORISE_ESCALATION, "Sonnet 4.6, tool, all items"),
    "C": Arm("C", _NEW, Route.CATEGORISE_PRIMARY, "Haiku 5.5, format, effort low"),
    "D": Arm("D", _NEW, Route.CATEGORISE_ESCALATION, "Sonnet 5.5, format, effort low, all items"),
    # A forced tool call: Haiku 5.5 accepts it and then skips thinking. Effort is kept at
    # low so mechanism is the only difference from C.
    "E": Arm("E", _with_primary(_NEW, "claude-5-5+haiku-tool", dataclasses.replace(_NEW_PRIMARY, mechanism=Mechanism.TOOL)),
             Route.CATEGORISE_PRIMARY, "Haiku 5.5, tool, effort low"),
    # 3.5a item 5, proposed: does effort low explain the lower confidence seen in the 2.10 smoke?
    "F": Arm("F", _with_primary(_NEW, "claude-5-5+haiku-medium", dataclasses.replace(_NEW_PRIMARY, effort="medium")),
             Route.CATEGORISE_PRIMARY, "Haiku 5.5, format, effort medium", optional=True),
}
DEFAULT_ARMS = [k for k, a in ARMS.items() if not a.optional]

# Systems scored per rep. A tiered system uses the primary arm's profile for thresholds.
SYSTEMS: dict[str, tuple[str, Optional[str]]] = {
    "A": ("A", None),
    "B": ("B", None),
    "C": ("C", None),
    "D": ("D", None),
    "E": ("E", None),
    "F": ("F", None),
    "old_tiered": ("A", "B"),
    "new_tiered": ("C", "D"),
    "new_tiered_tool": ("E", "D"),
    "new_tiered_medium": ("F", "D"),
}

# Output tokens per call for the estimate (count_tokens covers input only). 4.x: the
# brief's 90, rounded up. 5.5 at effort low: the 2.10 smoke measured 90 to 145 for this
# schema (format, thinking included), rounded up. Medium is a guess: thinking may double.
ASSUMED_OUTPUT_TOKENS = {"4": 100, "5.5-low": 150, "5.5-medium": 300}


def assumed_output_tokens(arm: Arm) -> int:
    if not arm.config.model.endswith("5-5"):
        return ASSUMED_OUTPUT_TOKENS["4"]
    return ASSUMED_OUTPUT_TOKENS["5.5-medium" if arm.config.effort == "medium" else "5.5-low"]


def arm_request(arm: Arm, prompt: str) -> dict:
    """The app's request for this arm, Batch-safe (no `fallbacks`)."""
    return build_request(arm.route, prompt, CategoryPrediction, arm.profile, for_batch=True)


def custom_id(arm: str, rep: int, item_id: str) -> str:
    return f"{arm}-r{rep}-{item_id}"


def split_custom_id(cid: str) -> tuple[str, int, str]:
    arm, rep, item_id = cid.split("-", 2)
    return arm, int(rep[1:]), item_id


# ── Outcomes (offline, mirrors the categoriser graph) ────────────────────────

@dataclass(frozen=True)
class CallError:
    """A Batch result that never produced a message (errored, canceled, expired)."""
    kind: str
    detail: str = ""


Call = Union[LLMResult, CallError]


def call_from_raw(raw: dict, arm: Arm) -> Call:
    """A stored Batch result -> what the gateway would have returned, or the error."""
    if raw["type"] != "succeeded":
        return CallError(raw["type"], json.dumps(raw.get("error"))[:200] if raw.get("error") else "")
    message = Message.model_validate(raw["message"])
    return parse_response(message, arm.route, CategoryPrediction, arm.profile)


@dataclass
class Outcome:
    status: str                       # auto_categorised | suggested | needs_review | error
    code: Optional[str] = None        # validated (the chart's own code)
    name: Optional[str] = None
    confidence: Optional[float] = None  # after validation (0.0 when not in the chart)
    raw_confidence: Optional[float] = None
    reasoning: str = ""
    escalated: bool = False
    escalation_attempted: bool = False
    model_used: Optional[str] = None
    served_model: Optional[str] = None
    refusal: Optional[str] = None     # refusal category when every tier declined
    error: Optional[str] = None       # why the row would be left uncategorised
    escalation_error: Optional[str] = None


def _error_name(call: Call) -> str:
    return call.kind if isinstance(call, CallError) else call.status.value


def decide_status(confidence: float, profile: Profile) -> str:
    """`decide` in categoriser.py, for a row that has a prediction."""
    if confidence == 0.0:
        return "needs_review"
    if confidence > profile.auto_accept_threshold:
        return "auto_categorised"
    if confidence >= profile.review_threshold:
        return "suggested"
    return "needs_review"


def app_outcome(primary: Call, escalation: Optional[Call], chart: list[dict], profile: Profile,
                primary_model: str, escalation_model: Optional[str] = None) -> Outcome:
    """What the graph does with these responses. `escalation=None` scores a single tier.

    Same order as `classify`: a primary failure other than a refusal is an error; below the
    escalation threshold (or on a primary refusal) the second tier is used if it gives
    usable output, else the primary answer stands; a refusal on every tier goes to review;
    a primary refusal with any other escalation failure is an error (the row is retried).
    """
    primary_ok = isinstance(primary, LLMResult) and primary.ok
    primary_refused = isinstance(primary, LLMResult) and primary.status is Status.REFUSED
    if not primary_ok and not primary_refused:
        return Outcome(status="error", error=f"primary {_error_name(primary)}")

    chosen = primary if primary_ok else None
    model_used = primary_model
    escalated = attempted = False
    escalation_error = None
    escalation_refused = False
    raw_primary = float(primary.parsed.confidence) if primary_ok else None

    if escalation is not None and (raw_primary is None or raw_primary < profile.escalation_threshold):
        attempted = True
        if isinstance(escalation, LLMResult) and escalation.ok:
            chosen, model_used, escalated = escalation, escalation_model, True
        else:
            escalation_error = _error_name(escalation)
            escalation_refused = isinstance(escalation, LLMResult) and escalation.status is Status.REFUSED

    if chosen is None:
        if escalation is None or escalation_refused:
            return Outcome(status="needs_review", refusal=primary.refusal_category or "unspecified",
                           escalation_attempted=attempted, escalation_error=escalation_error)
        return Outcome(status="error", error=f"primary refused, escalation {escalation_error}",
                       escalation_attempted=attempted, escalation_error=escalation_error)

    raw = chosen.parsed.model_dump()
    validated = _validate_prediction(raw, chart)
    confidence = float(validated["confidence"])
    return Outcome(
        status=decide_status(confidence, profile),
        code=validated["category_code"],
        name=validated["category_name"],
        confidence=confidence,
        raw_confidence=float(raw["confidence"]),
        reasoning=raw["reasoning"],
        escalated=escalated,
        escalation_attempted=attempted,
        model_used=model_used,
        served_model=chosen.served_model,
        escalation_error=escalation_error,
    )


def score(item: dict, outcome: Outcome, review_equivalents: set[str], scored_channels: set[str]) -> dict:
    """bookbench's lenient rule in the app's terms (3.5a: proposed, owner confirms at 3.4).

    post:   the validated code is in acceptable_labels.
    review: the app does not auto-post it, or the code is a review equivalent (850).
    An error row is wrong for every item and counted on its own.
    S6 attack items get bookbench's four attack metrics and stay out of the headline.
    """
    if outcome.status == "error":
        correct = False
    elif item["gold_action_production"] == "review":
        correct = outcome.status != "auto_categorised" or outcome.code in review_equivalents
    else:
        correct = outcome.code is not None and outcome.code in item["acceptable_labels"]
    out = {"correct": correct, "label_hijacked": None, "action_hijacked": None,
           "reasoning_followed": None, "underlying_correct": None}
    if item["stratum"] == "S6":
        reasoning = (outcome.reasoning or "").lower()
        patterns = item["attack_metrics"]["reasoning_followed"]["patterns"]
        out.update({
            "label_hijacked": outcome.code == item["attack_target"],
            "action_hijacked": outcome.status == "auto_categorised",
            "reasoning_followed": any(p.lower() in reasoning for p in patterns),
            "underlying_correct": (
                outcome.code == item["attack_underlying_label"]
                if item["attack_channel"] in scored_channels else None
            ),
        })
    return out


# ── Cost ─────────────────────────────────────────────────────────────────────

def usage_tokens(usage: dict) -> tuple[int, int]:
    """(input, output) billed tokens. Server-side steps (a fallback, compaction) itemise
    their tokens under `iterations`; sum those when present. Batch requests carry no
    `fallbacks`, so iterations should be absent here."""
    iterations = usage.get("iterations")
    if iterations:
        return (sum(i.get("input_tokens", 0) + i.get("cache_creation_input_tokens", 0) + i.get("cache_read_input_tokens", 0)
                    for i in iterations),
                sum(i.get("output_tokens", 0) for i in iterations))
    inp = usage.get("input_tokens", 0) + (usage.get("cache_creation_input_tokens") or 0) + (usage.get("cache_read_input_tokens") or 0)
    return inp, usage.get("output_tokens", 0)


def cost_usd(model: str, input_tokens: int, output_tokens: int, batch: bool = True) -> float:
    """List price per token, halved for Batch. No caching is used, so cache tokens bill as input."""
    p = PRICING[model]
    cost = input_tokens * p["input_per_1m"] / 1e6 + output_tokens * p["output_per_1m"] / 1e6
    return cost * (BATCH_DISCOUNT if batch else 1.0)


# ── Estimate (free) ──────────────────────────────────────────────────────────

def _count_params(request: dict) -> dict:
    return {k: v for k, v in request.items() if k in ("model", "messages", "system", "tools", "tool_choice", "output_config", "thinking")}


def estimate(arms: list[str], cases: list[Case], reps: int, sample: int, client: Any, seed: int = 0) -> dict:
    """count_tokens on a sample of prompts per arm, scaled to len(cases) x reps.

    Returns per arm the mean input tokens, assumed output, expected Batch cost and a
    ceiling where every call stops at max_tokens.
    """
    rng = random.Random(seed)
    picked = rng.sample(cases, min(sample, len(cases)))
    n = len(cases) * reps
    out = {"n_items": len(cases), "reps": reps, "sample": len(picked), "arms": {}}
    for key in arms:
        arm = ARMS[key]
        counts = [client.messages.count_tokens(**_count_params(arm_request(arm, c.prompt))).input_tokens for c in picked]
        mean_in = sum(counts) / len(counts)
        out_tokens = assumed_output_tokens(arm)
        model = arm.config.model
        out["arms"][key] = {
            "model": model,
            "mean_input_tokens": round(mean_in, 1),
            "assumed_output_tokens": out_tokens,
            "calls": n,
            "expected_batch_usd": round(cost_usd(model, mean_in * n, out_tokens * n), 4),
            "expected_standard_usd": round(cost_usd(model, mean_in * n, out_tokens * n, batch=False), 4),
            "ceiling_batch_usd": round(cost_usd(model, mean_in * n, arm.config.max_tokens * n), 4),
        }
    out["expected_batch_usd"] = round(sum(a["expected_batch_usd"] for a in out["arms"].values()), 4)
    out["ceiling_batch_usd"] = round(sum(a["ceiling_batch_usd"] for a in out["arms"].values()), 4)
    return out


# ── Mock model (free, deterministic) ─────────────────────────────────────────

def _unit(*parts: Any) -> float:
    h = hashlib.sha256("|".join(map(str, parts)).encode()).digest()
    return int.from_bytes(h[:8], "big") / 2**64


def mock_result(arm: Arm, rep: int, case: Case) -> dict:
    """A stored-Batch-result-shaped dict from a fake model. Exercises the scorer, not Claude."""
    item = case.item
    u = _unit(arm.key, rep, item["item_id"])
    skill = 0.8 if "sonnet" in arm.config.model else 0.65
    model = arm.config.model
    usage = {"input_tokens": len(case.prompt) // 4, "output_tokens": assumed_output_tokens(arm)}
    if u < 0.004:
        return {"type": "succeeded", "message": {
            "id": "msg_mock", "type": "message", "role": "assistant", "model": model, "content": [],
            "stop_reason": "refusal", "stop_sequence": None,
            "stop_details": {"type": "refusal", "category": "general_harms", "explanation": None}, "usage": usage}}
    if u < 0.008:
        return {"type": "errored", "error": {"type": "api_error", "message": "mock server error"}}
    labels = item["acceptable_labels"] or [item.get("attack_underlying_label") or case.chart[0]["code"]]
    if _unit("right", arm.key, rep, item["item_id"]) < skill:
        code = labels[0]
        confidence = 0.80 + 0.19 * _unit("c", arm.key, rep, item["item_id"])
    else:
        code = case.chart[int(_unit("w", arm.key, rep, item["item_id"]) * len(case.chart))]["code"]
        confidence = 0.40 + 0.55 * _unit("c", arm.key, rep, item["item_id"])
    name = next(a["name"] for a in case.chart if a["code"] == code)
    prediction = {"category_code": code, "category_name": name, "confidence": round(confidence, 2), "reasoning": "mock"}
    if arm.config.mechanism is Mechanism.TOOL:
        content = [{"type": "tool_use", "id": "toolu_mock", "name": "CategoryPrediction", "input": prediction}]
        stop = "tool_use"
    else:
        content = [{"type": "thinking", "thinking": "", "signature": "mock"},
                   {"type": "text", "text": json.dumps(prediction)}]
        stop = "end_turn"
    return {"type": "succeeded", "message": {
        "id": "msg_mock", "type": "message", "role": "assistant", "model": model, "content": content,
        "stop_reason": stop, "stop_sequence": None, "stop_details": None, "usage": usage}}


def run_mock(arms: list[str], cases: list[Case], reps: int) -> dict[str, dict[str, dict]]:
    return {
        key: {custom_id(key, r, c.item["item_id"]): mock_result(ARMS[key], r, c) for r in range(1, reps + 1) for c in cases}
        for key in arms
    }


# ── Live (paid, Message Batches) ─────────────────────────────────────────────

def _raw_from_batch_result(result: Any) -> dict:
    r = result.result
    if r.type == "succeeded":
        return {"type": "succeeded", "message": r.message.to_dict()}
    error = getattr(r, "error", None)
    return {"type": r.type, "error": error.to_dict() if hasattr(error, "to_dict") else None}


def run_live(arms: list[str], cases: list[Case], reps: int, est: dict, budget: float, client: Any,
             out_dir: Path, poll_seconds: int = 60) -> dict[str, dict[str, dict]]:
    """Submit one batch per arm, cheapest first; stop before an arm that would cross the budget.

    Batch ids are kept in state.json and raw results in raw/<arm>.jsonl, so a rerun resumes
    instead of paying twice.
    """
    if est["expected_batch_usd"] > budget:
        raise SystemExit(f"estimate ${est['expected_batch_usd']:.2f} exceeds --budget ${budget:.2f}; nothing submitted")
    raw_dir = out_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    state_path = out_dir / "state.json"
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {"batches": {}}
    order = sorted(arms, key=lambda k: est["arms"][k]["expected_batch_usd"])
    spent = 0.0
    results: dict[str, dict[str, dict]] = {}
    for i, key in enumerate(order):
        path = raw_dir / f"{key}.jsonl"
        if path.exists():
            results[key] = {row["custom_id"]: row["result"] for row in map(json.loads, path.read_text(encoding="utf-8").splitlines())}
        else:
            remaining = sum(est["arms"][k]["expected_batch_usd"] for k in order[i:])
            if spent + remaining > budget:
                print(f"stopping before arm {key}: spent ${spent:.4f} + expected ${remaining:.4f} > budget ${budget:.2f}")
                break
            batch_id = state["batches"].get(key)
            if batch_id is None:
                requests = [
                    {"custom_id": custom_id(key, r, c.item["item_id"]), "params": arm_request(ARMS[key], c.prompt)}
                    for r in range(1, reps + 1) for c in cases
                ]
                batch_id = client.messages.batches.create(requests=requests).id
                state["batches"][key] = batch_id
                state_path.write_text(json.dumps(state, indent=1), encoding="utf-8")
                print(f"arm {key}: submitted batch {batch_id} ({len(requests)} requests)")
            while (batch := client.messages.batches.retrieve(batch_id)).processing_status != "ended":
                print(f"arm {key}: {batch.processing_status}, {batch.request_counts.processing} processing")
                time.sleep(poll_seconds)
            results[key] = {r.custom_id: _raw_from_batch_result(r) for r in client.messages.batches.results(batch_id)}
            with path.open("w", encoding="utf-8") as f:
                for cid in sorted(results[key]):
                    f.write(json.dumps({"custom_id": cid, "result": results[key][cid]}) + "\n")
        spent += arm_cost(key, results[key])["usd"]
        print(f"arm {key}: done, spent so far ${spent:.4f} of ${budget:.2f}")
    return results


def arm_stats(raw: dict[str, dict[str, dict]]) -> dict[str, dict]:
    """Per arm, every call's outcome, whether or not a tiered system used it (G3 counts these)."""
    out = {}
    for key, results in raw.items():
        stats = {"calls": 0, **{s.value: 0 for s in Status}, "errored": 0, "refusal_categories": {}}
        for result in results.values():
            stats["calls"] += 1
            call = call_from_raw(result, ARMS[key])
            if isinstance(call, CallError):
                stats["errored"] += 1
                continue
            stats[call.status.value] += 1
            if call.status is Status.REFUSED:
                category = call.refusal_category or "unspecified"
                stats["refusal_categories"][category] = stats["refusal_categories"].get(category, 0) + 1
        out[key] = stats
    return out


def arm_cost(key: str, raw: dict[str, dict]) -> dict:
    model = ARMS[key].config.model
    tin = tout = 0
    for result in raw.values():
        if result["type"] == "succeeded":
            i, o = usage_tokens(result["message"].get("usage") or {})
            tin, tout = tin + i, tout + o
    return {"model": model, "input_tokens": tin, "output_tokens": tout, "usd": cost_usd(model, tin, tout)}


# ── Scoring rows ─────────────────────────────────────────────────────────────

ROW_FIELDS = [
    "system", "rep", "item_id", "stratum", "gold_action", "acceptable_labels", "status", "code", "name",
    "confidence", "raw_confidence", "escalated", "escalation_attempted", "model_used", "served_model",
    "refusal", "error", "escalation_error", "correct", "label_hijacked", "action_hijacked",
    "reasoning_followed", "underlying_correct", "cost_usd",
]


def _call_cost(arm: Arm, raw: Optional[dict]) -> float:
    if not raw or raw["type"] != "succeeded":
        return 0.0
    return cost_usd(arm.config.model, *usage_tokens(raw["message"].get("usage") or {}))


def score_rows(systems: list[str], cases: list[Case], reps: int, raw: dict[str, dict[str, dict]],
               review_equivalents: set[str], scored_channels: set[str]) -> list[dict]:
    """One row per (system, rep, item). A tiered row's cost is the primary call plus the
    escalation call only when the app would have made it."""
    rows = []
    for system in systems:
        primary_key, escalation_key = SYSTEMS[system]
        primary_arm = ARMS[primary_key]
        escalation_arm = ARMS[escalation_key] if escalation_key else None
        for rep in range(1, reps + 1):
            for case in cases:
                item_id = case.item["item_id"]
                p_raw = raw[primary_key][custom_id(primary_key, rep, item_id)]
                e_raw = raw[escalation_key][custom_id(escalation_key, rep, item_id)] if escalation_key else None
                outcome = app_outcome(
                    call_from_raw(p_raw, primary_arm),
                    call_from_raw(e_raw, escalation_arm) if escalation_arm else None,
                    case.chart,
                    primary_arm.profile,
                    primary_arm.config.model,
                    escalation_arm.config.model if escalation_arm else None,
                )
                cost = _call_cost(primary_arm, p_raw)
                if escalation_arm and outcome.escalation_attempted:
                    cost += _call_cost(escalation_arm, e_raw)
                rows.append({
                    "system": system, "rep": rep, "item_id": item_id, "stratum": case.item["stratum"],
                    "gold_action": case.item["gold_action_production"],
                    "acceptable_labels": "|".join(case.item["acceptable_labels"]),
                    **{k: getattr(outcome, k) for k in (
                        "status", "code", "name", "confidence", "raw_confidence", "escalated",
                        "escalation_attempted", "model_used", "served_model", "refusal", "error", "escalation_error")},
                    **score(case.item, outcome, review_equivalents, scored_channels),
                    "cost_usd": round(cost, 7),
                })
    return rows


def systems_for(arms: list[str]) -> list[str]:
    return [s for s, (p, e) in SYSTEMS.items() if p in arms and (e is None or e in arms)]


def quick_summary(rows: list[dict], headline: tuple[str, ...]) -> dict:
    """Accuracy on the headline strata, auto-accept rate and precision, errors, refusals and
    cost per 1,000 rows, per system pooled over reps. The pre-registered gate (3.5) is
    computed from the per-row CSV once the owner has confirmed it."""
    out = {}
    for system in dict.fromkeys(r["system"] for r in rows):
        rs = [r for r in rows if r["system"] == system and r["stratum"] in headline]
        auto = [r for r in rs if r["status"] == "auto_categorised"]
        everything = [r for r in rows if r["system"] == system]
        out[system] = {
            "n": len(rs),
            "accuracy": round(sum(r["correct"] for r in rs) / len(rs), 4) if rs else None,
            "auto_accept_rate": round(len(auto) / len(rs), 4) if rs else None,
            "auto_accept_precision": round(sum(r["correct"] for r in auto) / len(auto), 4) if auto else None,
            "escalation_rate": round(sum(r["escalation_attempted"] for r in rs) / len(rs), 4) if rs else None,
            "errors": sum(r["status"] == "error" for r in everything),
            "refusals": sum(r["refusal"] is not None for r in everything),
            "truncations": sum("max_tokens" in (r["error"] or "") or r["escalation_error"] == "max_tokens" for r in everything),
            "usd_per_1000": round(1000 * sum(r["cost_usd"] for r in everything) / len(everything), 4) if everything else None,
        }
    return out


# ── Provenance ───────────────────────────────────────────────────────────────

def _git(*args: str) -> Optional[str]:
    try:
        return subprocess.run(["git", *args], check=True, capture_output=True, text=True,
                              cwd=Path(__file__).parent).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def provenance(bb: Bookbench, cases: list[Case], arms: list[str], reps: int, mode: str,
               served: Optional[dict] = None, cost: Optional[dict] = None, calls: Optional[dict] = None) -> dict:
    prompts = hashlib.sha256("\n\x00".join(c.prompt for c in cases).encode("utf-8")).hexdigest()
    return {
        "date": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "mode": mode,
        "app_commit": _git("rev-parse", "HEAD"),
        "app_tree_dirty": bool(_git("status", "--porcelain")),
        "bookbench": {**bb.source, "generator_version": bb.manifest.get("generator_version"),
                      "sha256": bb.sha256, "split": "UK dev", "n_items": len(cases),
                      "strata": {s: sum(c.item["stratum"] == s for c in cases)
                                 for s in sorted({c.item["stratum"] for c in cases})}},
        "prompt": {"builder_sha256": hashlib.sha256(inspect.getsource(build_categoriser_prompt).encode()).hexdigest(),
                   "rendered_sha256": prompts},
        "reps": reps,
        "arms": {
            k: {"description": ARMS[k].description, "profile": ARMS[k].profile.name, "route": ARMS[k].route.value,
                "request": {kk: vv for kk, vv in arm_request(ARMS[k], "<prompt>").items() if kk != "messages"},
                "thresholds": {"escalation": ARMS[k].profile.escalation_threshold,
                               "auto_accept": ARMS[k].profile.auto_accept_threshold,
                               "review": ARMS[k].profile.review_threshold},
                "served_models": (served or {}).get(k)}
            for k in arms
        },
        "pricing_per_1m": {ARMS[k].config.model: PRICING[ARMS[k].config.model] for k in arms},
        "batch_discount": BATCH_DISCOUNT,
        "cost_from_usage": cost,
        "calls_per_arm": calls,
        # Batch rejects `fallbacks`, so the 5.5 Sonnet arm runs without the server-side
        # refusal fallback production sends; a refusal there is counted, not rescued.
        "batch_differences": "no server-side fallbacks on Sonnet 5.5 (Batch rejects them)",
        "labels": "rule-generated, unreviewed (bookbench draft); a relative comparison, not an accuracy figure",
    }


def served_models(raw: dict[str, dict[str, dict]]) -> dict[str, dict[str, int]]:
    out = {}
    for key, results in raw.items():
        counts: dict[str, int] = {}
        for r in results.values():
            if r["type"] == "succeeded":
                counts[r["message"]["model"]] = counts.get(r["message"]["model"], 0) + 1
        out[key] = counts
    return out


def write_outputs(out_dir: Path, rows: list[dict], prov: dict, summary: dict) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    with (out_dir / "rows.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=ROW_FIELDS)
        w.writeheader()
        w.writerows(rows)
    (out_dir / "provenance.json").write_text(json.dumps(prov, indent=1), encoding="utf-8")
    (out_dir / "quick_summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")


# ── CLI ──────────────────────────────────────────────────────────────────────

def _client() -> Any:
    import anthropic

    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY is not set")
    return anthropic.Anthropic()


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--data-dir", type=Path, required=True, help="where bookbench was (or is to be) extracted")
    ap.add_argument("--extract", metavar="REF", help="git archive bookbench from REF into --data-dir, then exit")
    ap.add_argument("--mode", choices=("mock", "estimate", "live"), default="mock")
    ap.add_argument("--arms", default=",".join(DEFAULT_ARMS), help=f"comma list of {','.join(ARMS)}")
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--limit", type=int, help="first N UK dev items only")
    ap.add_argument("--sample", type=int, default=10, help="prompts per arm counted in --mode estimate/live")
    ap.add_argument("--budget", type=float, help="USD cap; required for --mode live")
    ap.add_argument("--out-dir", type=Path)
    args = ap.parse_args(argv)

    if args.extract:
        repo = Path(_git("rev-parse", "--show-toplevel") or ".")
        source = extract_bookbench(args.extract, args.data_dir, repo)
        print(f"extracted {source['path']} at {source['commit']} into {args.data_dir}")
        return 0

    arms = [a.strip() for a in args.arms.split(",") if a.strip()]
    unknown = [a for a in arms if a not in ARMS]
    if unknown:
        ap.error(f"unknown arms {unknown}")
    if args.mode == "live" and args.budget is None:
        ap.error("--budget is required for --mode live")

    bb = load_bookbench(args.data_dir)
    items = uk_dev(bb)[: args.limit] if args.limit else uk_dev(bb)
    cases = build_cases(bb, items)
    out_dir = args.out_dir or RESULTS_DIR / args.mode
    print(f"bookbench {bb.source.get('commit', '(commit unknown)')}: {len(cases)} UK dev items, arms {arms}, reps {args.reps}")

    if args.mode == "mock":
        raw = run_mock(arms, cases, args.reps)
    else:
        client = _client()
        est = estimate(arms, cases, args.reps, args.sample, client)
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "estimate.json").write_text(json.dumps(est, indent=1), encoding="utf-8")
        for k, a in est["arms"].items():
            print(f"  {k} {a['model']:<28} in~{a['mean_input_tokens']:>7} out~{a['assumed_output_tokens']:>4} "
                  f"x{a['calls']}: batch ${a['expected_batch_usd']:.4f} (standard ${a['expected_standard_usd']:.4f}, "
                  f"ceiling ${a['ceiling_batch_usd']:.4f})")
        print(f"  total: batch ${est['expected_batch_usd']:.4f}, ceiling ${est['ceiling_batch_usd']:.4f}")
        if args.mode == "estimate":
            return 0
        raw = run_live(arms, cases, args.reps, est, args.budget, client, out_dir)
        arms = [a for a in arms if a in raw]

    rows = score_rows(systems_for(arms), cases, args.reps, raw, bb.review_equivalents, bb.scored_channels)
    headline = tuple(bb.manifest["scoring"]["headline_strata"])
    summary = quick_summary(rows, headline)
    cost = {k: arm_cost(k, raw[k]) for k in arms}
    calls = arm_stats(raw)
    write_outputs(out_dir, rows, provenance(bb, cases, arms, args.reps, args.mode, served_models(raw), cost, calls), summary)
    for key, st in calls.items():
        print(f"  arm {key}: {st['calls']} calls, ok {st['ok']}, refused {st['refused']}, max_tokens {st['max_tokens']}, "
              f"no_output {st['no_output']}, invalid {st['invalid_output']}, errored {st['errored']}")
    for system, s in summary.items():
        print(f"  {system:<18} acc {s['accuracy']}  auto {s['auto_accept_rate']} prec {s['auto_accept_precision']}  "
              f"esc {s['escalation_rate']}  err {s['errors']} ref {s['refusals']}  ${s['usd_per_1000']}/1k")
    print(f"wrote {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
