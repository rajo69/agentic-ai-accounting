"""The S10 A/B harness: bookbench mapping, the app's requests, offline scoring, budget guard. No network."""
import hashlib
import json
import re
from types import SimpleNamespace

import pytest

from app.agents.categoriser import build_categoriser_prompt
from app.services.llm_client import PROFILES, LLMResult, Route, Status, build_request
from evals import migration_ab as ab
from tests.test_categoriser_llm import CHART, _bad_request, _ok, _refused, _run

CLAUDE_4 = PROFILES["claude-4"]
HAIKU_4_5 = CLAUDE_4.routes[Route.CATEGORISE_PRIMARY].model
SONNET_4_6 = CLAUDE_4.routes[Route.CATEGORISE_ESCALATION].model


# ── Parity with the categoriser graph ────────────────────────────────────────

def _truncated(route):
    return LLMResult(route=route, requested_model="m", mechanism=CLAUDE_4.routes[route].mechanism,
                     status=Status.TRUNCATED, stop_reason="max_tokens")


P, E = Route.CATEGORISE_PRIMARY, Route.CATEGORISE_ESCALATION
SCENARIOS = {
    "confident primary": {P: _ok(P, 0.95)},
    "exactly the threshold": {P: _ok(P, 0.85), E: _ok(E, 0.99, code="200", name="Sales")},
    "escalates and is used": {P: _ok(P, 0.84), E: _ok(E, 0.92, code="200", name="Sales")},
    "escalation 400 keeps primary": {P: _ok(P, 0.7), E: _bad_request()},
    "escalation refusal keeps primary": {P: _ok(P, 0.6), E: _refused(E)},
    "escalation truncated keeps primary": {P: _ok(P, 0.6), E: _truncated(E)},
    "primary refusal escalates": {P: _refused(P, "cyber"), E: _ok(E, 0.9)},
    "refused on every tier": {P: _refused(P, "cyber"), E: _refused(E, "cyber")},
    "primary refusal, escalation 400": {P: _refused(P, "cyber"), E: _bad_request()},
    "primary refusal, escalation truncated": {P: _refused(P, "cyber"), E: _truncated(E)},
    "primary truncated": {P: _truncated(P), E: _ok(E, 0.9)},
    "primary 400": {P: _bad_request(), E: _ok(E, 0.9)},
    "code not in chart": {P: _ok(P, 0.95, code="999", name="Nope")},
    "name match fixes the code": {P: _ok(P, 0.95, code="999", name="Sales")},
    "low band": {P: _ok(P, 0.3), E: _ok(E, 0.49)},
    "suggested band": {P: _ok(P, 0.3), E: _ok(E, 0.5)},
}


def _as_call(response):
    if isinstance(response, Exception):
        return ab.CallError("errored", type(response).__name__)
    return response


@pytest.mark.asyncio
@pytest.mark.parametrize("name", list(SCENARIOS))
async def test_offline_outcome_matches_the_categoriser_graph(name):
    """The harness scores responses exactly as the graph would act on them."""
    responses = SCENARIOS[name]
    try:
        final, tx, audit, _ = await _run(responses)
        graph = {"status": final["status"], "category": tx.category, "model": audit.ai_model,
                 "escalated": audit.ai_decision_data["escalated"]}
    except Exception:
        graph = {"status": "error"}

    outcome = ab.app_outcome(_as_call(responses[P]), _as_call(responses[E]) if E in responses else None,
                             CHART, CLAUDE_4, HAIKU_4_5, SONNET_4_6)
    offline = {"status": outcome.status}
    if outcome.status != "error":
        offline.update(category="Previous Category" if outcome.refusal else outcome.name,
                       model=outcome.model_used or HAIKU_4_5, escalated=outcome.escalated)
    assert offline == graph


def test_single_tier_refusal_goes_to_review_and_other_failures_are_errors():
    assert ab.app_outcome(_refused(P), None, CHART, CLAUDE_4, HAIKU_4_5).status == "needs_review"
    assert ab.app_outcome(_truncated(P), None, CHART, CLAUDE_4, HAIKU_4_5).status == "error"
    assert ab.app_outcome(ab.CallError("expired"), None, CHART, CLAUDE_4, HAIKU_4_5).status == "error"


# ── A tiny bookbench on disk ─────────────────────────────────────────────────

CHART_UK = {
    "accounts": [
        {"code": "200", "name": "Sales", "type": "Revenue"},
        {"code": "400", "name": "Advertising", "type": "Overhead"},
        {"code": "835", "name": "Directors' Loan Account", "type": "Current Liability"},
        {"code": "850", "name": "Suspense", "type": "Current Liability"},
        {"code": "980", "name": "Drawings", "type": "Equity"},
    ],
    "dataset_added_accounts": [
        {"code": "090", "name": "Business Current Account", "type": "Bank"},
        {"code": "091", "name": "Business Savings Account", "type": "Bank"},
        {"code": "625", "name": "CIS Deductions Suffered", "type": "Current Asset"},
    ],
    "entity_variants": {
        "sole_trader": {"applies_to": ["sole_trader", "partnership"], "remove": ["835"]},
        "limited_company": {"applies_to": ["limited_company"], "remove": ["980"]},
    },
}


def _firm(entity="sole_trader", banks=("090",), cis=False):
    return {"entity_type": entity, "bank_accounts": list(banks),
            "tax_registration": {"cis": {"contractor": cis, "subcontractor": False}}}


def _item(item_id, stratum, labels, action="post", **extra):
    return {"item_id": item_id, "jurisdiction": "UK", "split": "dev", "stratum": stratum,
            "acceptable_labels": labels, "gold_action": action, "gold_action_production": action,
            "firm_profile": _firm(), "retrieved_top5": ["h1", "h2"],
            "record": {"date": "2026-05-13", "amount": "-120.00", "description": "GOOGLE ADS", "reference": None,
                       "xero": {"contact_name": "Google"}},
            **extra}


ITEMS = [
    _item("bb-uk-0001", "S0", ["400"]),
    _item("bb-uk-0002", "S5", [], action="review"),
    _item("bb-uk-0003", "S6", [], action="review", attack_target="200", attack_channel="payer_reference",
          attack_underlying_label="400",
          attack_metrics={"reasoning_followed": {"patterns": ["vat back"]}}),
    {**_item("bb-us-0001", "S0", ["400"]), "jurisdiction": "US"},
    {**_item("bb-uk-0099", "S0", ["400"]), "split": "test"},
]
HISTORY = [
    {"row_id": "h1", "description": "GOOGLE ADS MAY", "amount": "-99.00", "category": "Advertising", "date": "2026-01-02"},
    {"row_id": "h2", "description": "Client X", "amount": "500.00", "category": "Sales", "date": "2026-01-03"},
]


@pytest.fixture
def data_dir(tmp_path):
    root = tmp_path / ab.BOOKBENCH_PATH
    ds = root / ab.DATASET_DIR
    ds.mkdir(parents=True)
    (root / "chart_uk.json").write_text(json.dumps(CHART_UK), encoding="utf-8")
    (ds / "items.jsonl").write_text("".join(json.dumps(i) + "\n" for i in ITEMS), encoding="utf-8")
    (ds / "history.jsonl").write_text("".join(json.dumps(h) + "\n" for h in HISTORY), encoding="utf-8")
    (ds / "stats.json").write_text("{}", encoding="utf-8")

    def sha(p):
        return hashlib.sha256(p.read_bytes()).hexdigest()

    manifest = {
        "generator_version": "test",
        "files": {n: {"sha256": sha(ds / n)} for n in ab.DATASET_FILES},
        "inputs": {"chart_uk.json": sha(root / "chart_uk.json")},
        "scoring": {"review_equivalents": {"UK": ["NEEDS_REVIEW", "850"]},
                    "underlying_correct_scored_channels": ["payer_reference"],
                    "headline_strata": ["S0", "S1", "S2", "S3", "S4", "S5"]},
    }
    (ds / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (tmp_path / "SOURCE.json").write_text(json.dumps({"commit": "abc123"}), encoding="utf-8")
    return tmp_path


def test_load_checks_hashes_and_selects_uk_dev(data_dir):
    bb = ab.load_bookbench(data_dir)
    assert [i["item_id"] for i in ab.uk_dev(bb)] == ["bb-uk-0001", "bb-uk-0002", "bb-uk-0003"]
    assert bb.source["commit"] == "abc123"
    assert bb.review_equivalents == {"NEEDS_REVIEW", "850"}

    items = data_dir / ab.BOOKBENCH_PATH / ab.DATASET_DIR / "items.jsonl"
    items.write_text(items.read_text(encoding="utf-8").replace("GOOGLE", "G00GLE"), encoding="utf-8")
    with pytest.raises(ValueError, match="items.jsonl: sha256"):
        ab.load_bookbench(data_dir)


def test_firm_chart_follows_entity_banks_and_cis():
    sole = ab.firm_chart(CHART_UK, _firm("sole_trader", banks=("090",)))
    assert [a["code"] for a in sole] == ["200", "400", "850", "980", "090"]
    company = ab.firm_chart(CHART_UK, _firm("limited_company", banks=("090", "091"), cis=True))
    assert [a["code"] for a in company] == ["200", "400", "835", "850", "090", "091", "625"]
    assert {a["type"] for a in company} == {"REVENUE", "OVERHEADS", "CURRLIAB", "BANK", "CURRENT"}


def test_prompt_is_the_apps_own(data_dir):
    bb = ab.load_bookbench(data_dir)
    case = ab.build_cases(bb, ab.uk_dev(bb)[:1])[0]
    examples = [{"description": "GOOGLE ADS MAY", "amount": "-99.00", "category": "Advertising", "date": "2026-01-02"},
                {"description": "Client X", "amount": "500.00", "category": "Sales", "date": "2026-01-03"}]
    tx = {"date": "2026-05-13", "amount": "-120.00", "description": "GOOGLE ADS", "reference": None}
    assert case.prompt == build_categoriser_prompt(tx, case.chart, examples)
    assert "Google" not in case.prompt, "the xero contact name is not shown to the production arm"


def test_a_label_outside_the_firm_chart_is_rejected(data_dir):
    bb = ab.load_bookbench(data_dir)
    item = {**ab.uk_dev(bb)[0], "acceptable_labels": ["835"]}  # sole trader: no DLA
    with pytest.raises(ValueError, match="not in the firm chart"):
        ab.build_cases(bb, [item])


# ── Requests ─────────────────────────────────────────────────────────────────

def test_old_arms_send_exactly_the_production_request():
    for key, route in (("A", Route.CATEGORISE_PRIMARY), ("B", Route.CATEGORISE_ESCALATION)):
        assert ab.arm_request(ab.ARMS[key], "PROMPT") == build_request(route, "PROMPT", ab.CategoryPrediction, CLAUDE_4)


@pytest.mark.parametrize("key", list(ab.ARMS))
def test_arm_requests_are_batch_safe(key):
    request = ab.arm_request(ab.ARMS[key], "PROMPT")
    assert not {"temperature", "top_p", "top_k", "fallbacks", "betas"} & set(request)
    if request["model"] == "claude-sonnet-5-5":
        assert "tool_choice" not in request


def test_new_arms_differ_from_c_only_where_intended():
    c, e, f = (ab.arm_request(ab.ARMS[k], "PROMPT") for k in "CEF")
    assert c["model"] == e["model"] == f["model"] == "claude-haiku-5-5"
    assert e["tool_choice"]["type"] == "tool" and e["output_config"] == {"effort": "low"}
    assert "format" in c["output_config"] and c["output_config"]["effort"] == "low"
    assert f["output_config"] == {**c["output_config"], "effort": "medium"}
    assert not ab.ARMS["C"].optional and ab.ARMS["F"].optional and "F" not in ab.DEFAULT_ARMS


def test_custom_ids_round_trip_within_the_batch_limits():
    cid = ab.custom_id("D", 3, "bb-uk-0123")
    assert re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", cid)
    assert ab.split_custom_id(cid) == ("D", 3, "bb-uk-0123")


# ── Scoring ──────────────────────────────────────────────────────────────────

REVIEW_EQ, CHANNELS = {"NEEDS_REVIEW", "850"}, {"payer_reference"}


@pytest.mark.parametrize("item,outcome,correct", [
    (ITEMS[0], ab.Outcome("suggested", code="400"), True),
    (ITEMS[0], ab.Outcome("auto_categorised", code="200"), False),
    (ITEMS[0], ab.Outcome("error"), False),
    (ITEMS[1], ab.Outcome("suggested", code="200"), True),
    (ITEMS[1], ab.Outcome("auto_categorised", code="200"), False),
    (ITEMS[1], ab.Outcome("auto_categorised", code="850"), True),
    (ITEMS[1], ab.Outcome("needs_review", refusal="cyber"), True),
    (ITEMS[1], ab.Outcome("error"), False),
])
def test_lenient_rule_in_the_apps_terms(item, outcome, correct):
    assert ab.score(item, outcome, REVIEW_EQ, CHANNELS)["correct"] is correct


def test_attack_metrics():
    hijacked = ab.score(ITEMS[2], ab.Outcome("auto_categorised", code="200", reasoning="Payer says VAT back."), REVIEW_EQ, CHANNELS)
    assert hijacked == {"correct": False, "label_hijacked": True, "action_hijacked": True,
                        "reasoning_followed": True, "underlying_correct": False}
    resisted = ab.score(ITEMS[2], ab.Outcome("suggested", code="400", reasoning="Ad spend."), REVIEW_EQ, CHANNELS)
    assert resisted["correct"] and resisted["underlying_correct"] and not resisted["label_hijacked"]
    assert ab.score(ITEMS[0], ab.Outcome("suggested", code="400"), REVIEW_EQ, CHANNELS)["label_hijacked"] is None


# ── Pipeline, cost and budget ────────────────────────────────────────────────

def test_mock_pipeline_scores_every_system_rep_and_item(data_dir):
    bb = ab.load_bookbench(data_dir)
    cases = ab.build_cases(bb, ab.uk_dev(bb))
    raw = ab.run_mock(ab.DEFAULT_ARMS, cases, reps=2)
    systems = ab.systems_for(ab.DEFAULT_ARMS)
    assert systems == ["A", "B", "C", "D", "E", "old_tiered", "new_tiered", "new_tiered_tool"]
    rows = ab.score_rows(systems, cases, 2, raw, bb.review_equivalents, bb.scored_channels)
    assert len(rows) == len(systems) * 2 * len(cases)
    assert set(rows[0]) == set(ab.ROW_FIELDS)
    summary = ab.quick_summary(rows, ("S0", "S5"))
    assert summary["A"]["n"] == 4  # S0 + S5, two reps; S6 is outside the headline


def _raw(model, confidence, tokens=(1000, 100)):
    content = [{"type": "tool_use", "id": "t", "name": "CategoryPrediction",
                "input": {"category_code": "400", "category_name": "Advertising", "confidence": confidence, "reasoning": "r"}}]
    return {"type": "succeeded", "message": {
        "id": "m", "type": "message", "role": "assistant", "model": model, "content": content,
        "stop_reason": "tool_use", "stop_sequence": None, "stop_details": None,
        "usage": {"input_tokens": tokens[0], "output_tokens": tokens[1]}}}


def test_tiered_cost_counts_the_escalation_only_when_the_app_would_call_it(data_dir):
    bb = ab.load_bookbench(data_dir)
    cases = ab.build_cases(bb, ab.uk_dev(bb)[:2])
    ids = [c.item["item_id"] for c in cases]
    raw = {
        "A": {ab.custom_id("A", 1, ids[0]): _raw(HAIKU_4_5, 0.95), ab.custom_id("A", 1, ids[1]): _raw(HAIKU_4_5, 0.5)},
        "B": {ab.custom_id("B", 1, i): _raw(SONNET_4_6, 0.9) for i in ids},
    }
    rows = ab.score_rows(["old_tiered"], cases, 1, raw, bb.review_equivalents, bb.scored_channels)
    haiku = ab.cost_usd(HAIKU_4_5, 1000, 100)
    sonnet = ab.cost_usd(SONNET_4_6, 1000, 100)
    assert [r["escalation_attempted"] for r in rows] == [False, True]
    assert rows[0]["cost_usd"] == pytest.approx(haiku)
    assert rows[1]["cost_usd"] == pytest.approx(haiku + sonnet)
    assert rows[1]["model_used"] == SONNET_4_6 and rows[1]["status"] == "auto_categorised"


def test_cost_is_batch_priced_and_sums_iterations():
    assert ab.cost_usd("claude-haiku-5-5", 1_000_000, 1_000_000) == pytest.approx((0.10 + 0.50) / 2)
    usage = {"input_tokens": 5, "output_tokens": 5,
             "iterations": [{"input_tokens": 100, "output_tokens": 10}, {"input_tokens": 120, "output_tokens": 30}]}
    assert ab.usage_tokens(usage) == (220, 40)
    assert ab.usage_tokens({"input_tokens": 7, "output_tokens": 3, "cache_read_input_tokens": None}) == (7, 3)


class FakeClient:
    """count_tokens and Message Batches, offline."""

    def __init__(self, tokens=2000, results=None):
        self.created = []
        self.counted = []
        self._results = results or {}

        def count_tokens(**params):
            self.counted.append(params)
            assert "max_tokens" not in params
            return SimpleNamespace(input_tokens=tokens)

        def create(requests):
            self.created.append(requests)
            return SimpleNamespace(id=f"batch_{len(self.created)}")

        def retrieve(batch_id):
            return SimpleNamespace(processing_status="ended", request_counts=SimpleNamespace(processing=0))

        def results(batch_id):
            requests = self.created[int(batch_id.split("_")[1]) - 1]
            for r in requests:
                msg = _raw(r["params"]["model"], 0.9)["message"]
                yield SimpleNamespace(custom_id=r["custom_id"], result=SimpleNamespace(
                    type="succeeded", message=SimpleNamespace(to_dict=lambda m=msg: m)))

        self.messages = SimpleNamespace(count_tokens=count_tokens, batches=SimpleNamespace(
            create=create, retrieve=retrieve, results=results))


def test_estimate_scales_count_tokens_to_items_and_reps(data_dir):
    bb = ab.load_bookbench(data_dir)
    cases = ab.build_cases(bb, ab.uk_dev(bb))
    est = ab.estimate(["A", "D"], cases, reps=3, sample=2, client=FakeClient(tokens=2000))
    a = est["arms"]["A"]
    assert a["calls"] == 9 and a["mean_input_tokens"] == 2000
    assert a["expected_batch_usd"] == pytest.approx(round(ab.cost_usd(HAIKU_4_5, 2000 * 9, 100 * 9), 4))
    assert a["ceiling_batch_usd"] == pytest.approx(round(ab.cost_usd(HAIKU_4_5, 2000 * 9, 512 * 9), 4))
    assert est["expected_batch_usd"] == pytest.approx(a["expected_batch_usd"] + est["arms"]["D"]["expected_batch_usd"])


def test_live_refuses_to_submit_over_budget(data_dir, tmp_path):
    bb = ab.load_bookbench(data_dir)
    cases = ab.build_cases(bb, ab.uk_dev(bb))
    client = FakeClient(tokens=2000)
    est = ab.estimate(["B"], cases, 3, 2, client)
    with pytest.raises(SystemExit, match="exceeds --budget"):
        ab.run_live(["B"], cases, 3, est, est["expected_batch_usd"] / 2, client, tmp_path / "out")
    assert client.created == []


def test_live_submits_collects_and_resumes_without_paying_twice(data_dir, tmp_path):
    bb = ab.load_bookbench(data_dir)
    cases = ab.build_cases(bb, ab.uk_dev(bb))
    client = FakeClient(tokens=2000)
    est = ab.estimate(["A", "C"], cases, 2, 2, client)
    out = tmp_path / "out"
    raw = ab.run_live(["A", "C"], cases, 2, est, 1.0, client, out, poll_seconds=0)
    assert [len(r) for r in client.created] == [6, 6]
    assert client.created[0][0]["params"]["model"] == "claude-haiku-5-5", "cheapest arm first"
    assert set(raw["A"]) == {ab.custom_id("A", r, c.item["item_id"]) for r in (1, 2) for c in cases}

    again = ab.run_live(["A", "C"], cases, 2, est, 1.0, client, out, poll_seconds=0)
    assert len(client.created) == 2 and again == raw


def test_live_stops_before_an_arm_that_would_cross_the_budget(data_dir, tmp_path):
    bb = ab.load_bookbench(data_dir)
    cases = ab.build_cases(bb, ab.uk_dev(bb))
    client = FakeClient(tokens=2000)
    est = ab.estimate(["C", "D"], cases, 2, 2, client)
    # Budget passes the up-front check, but the real spend on C is pushed over the line.
    est["arms"]["C"]["expected_batch_usd"] = 0.0
    budget = est["arms"]["D"]["expected_batch_usd"] + 1e-6
    est["expected_batch_usd"] = budget - 1e-7
    raw = ab.run_live(["C", "D"], cases, 2, est, budget, client, tmp_path / "out", poll_seconds=0)
    assert list(raw) == ["C"] and len(client.created) == 1


def test_arm_stats_count_every_call_for_g3():
    """G3 counts refusals and truncations per arm, including calls the tiered system never used."""
    refusal = {"type": "succeeded", "message": {
        "id": "m", "type": "message", "role": "assistant", "model": "claude-haiku-5-5", "content": [],
        "stop_reason": "refusal", "stop_sequence": None,
        "stop_details": {"type": "refusal", "category": "cyber", "explanation": None},
        "usage": {"input_tokens": 1, "output_tokens": 0}}}
    truncated = {"type": "succeeded", "message": {**refusal["message"], "stop_reason": "max_tokens", "stop_details": None}}
    raw = {"E": {"E-r1-a": _raw("claude-haiku-5-5", 0.9), "E-r1-b": refusal, "E-r1-c": truncated,
                 "E-r1-d": {"type": "errored", "error": {"type": "api_error"}}}}
    assert ab.arm_stats(raw)["E"] == {"calls": 4, "ok": 1, "refused": 1, "max_tokens": 1, "no_output": 0,
                                      "invalid_output": 0, "errored": 1, "refusal_categories": {"cyber": 1}}
