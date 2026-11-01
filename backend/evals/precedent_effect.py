"""
S12: the effect of precedent retrieval on the shipped categoriser, bookbench UK test.

Pairs two runs of the same requests that differ only in the prompt's "Similar transactions
already categorised" block:
- with:    the S9 run (`migration_ab --split test`), the item's five simulated precedents;
- without: `migration_ab --split test --precedents none`, the block reads "(none yet)" as it
           does for a firm with no categorised history;
plus an optional drift rep (arm C with precedents, run now) to check that the model has not
moved since the S9 run.

Item subsets come from bookbench's own fields: `solvable_with = line+history` (only a
precedent settles the item), `line` (the line alone settles it), S5 (send to review) and S6
(attacks). The primary measure is the paired difference in agreement on the line+history
subset; everything else is reported without a decision attached (pre-registration in the
report's summary.md).

Nothing here calls the API. Usage (from backend/):
    py -3.13 -m evals.precedent_effect --data-dir <bookbench> --with-dir <S9 live-test> \
        --without-dir <live-test-noprec> [--drift-dir <live-test-drift>] --out-dir <report dir>
"""
from __future__ import annotations

import argparse
import csv
import json
import random
import sys
from pathlib import Path
from typing import Optional

from evals import migration_ab as ab
from evals.migration_ab_gate import HEADLINE, Z, mcnemar_exact, wilson_lower

SYSTEMS = ("new_tiered", "C", "D")
PRIMARY = "new_tiered"
ARMS = ("C", "D")
REPS = 3
BOOTSTRAP_RESAMPLES, BOOTSTRAP_SEED = 10_000, 20261101
DRIFT_MARGIN = 0.02  # drift rep accuracy outside the S9 per-rep range widened by 2 points
DRIFT_FLIP_FACTOR = 2.0  # or its flip rate against S9 more than twice S9's own rep-to-rep rate

SUBSETS = {
    "history": "line+history (only a precedent settles it)",
    "line": "line (the bank line settles it)",
    "review": "S5 (send to review)",
    "headline": "S0 to S5 (the published headline)",
    "attacks": "S6 (attacks, outside the headline)",
}


# ── Data ─────────────────────────────────────────────────────────────────────

def subsets(cases: list[ab.Case]) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {k: set() for k in SUBSETS}
    for c in cases:
        i, iid = c.item, c.item["item_id"]
        if i["stratum"] in HEADLINE:
            out["headline"].add(iid)
            if i["solvable_with"] == "line+history":
                out["history"].add(iid)
            elif i["solvable_with"] == "line":
                out["line"].add(iid)
        if i["stratum"] == "S5":
            out["review"].add(iid)
        if i["stratum"] == "S6":
            out["attacks"].add(iid)
    return out


def load_raw(run_dir: Path, arms: tuple[str, ...] = ARMS) -> dict[str, dict[str, dict]]:
    raw = {}
    for key in arms:
        path = run_dir / "raw" / f"{key}.jsonl"
        if not path.exists():
            raise FileNotFoundError(f"{path}: raw results for arm {key} are missing")
        raw[key] = {row["custom_id"]: row["result"]
                    for row in map(json.loads, path.read_text(encoding="utf-8").splitlines()) if row}
    return raw


def tagged_rows(bb: ab.Bookbench, cases: list[ab.Case], reps: int, raw: dict, tag: str,
                systems: tuple[str, ...] = SYSTEMS) -> list[dict]:
    """The harness's own scored rows, with the system renamed `<system>@<tag>`."""
    rows = ab.score_rows(list(systems), cases, reps, raw, bb.review_equivalents, bb.scored_channels)
    for r in rows:
        r["system"] = f"{r['system']}@{tag}"
    return rows


# ── Measures ─────────────────────────────────────────────────────────────────

def _rows(rows: list[dict], system: str, ids: set[str]) -> list[dict]:
    return [r for r in rows if r["system"] == system and r["item_id"] in ids]


def agreement(rows: list[dict], system: str, ids: set[str]) -> Optional[float]:
    rs = _rows(rows, system, ids)
    return sum(bool(r["correct"]) for r in rs) / len(rs) if rs else None


def item_means(rows: list[dict], system: str, ids: set[str]) -> dict[str, float]:
    acc: dict[str, list[bool]] = {}
    for r in _rows(rows, system, ids):
        acc.setdefault(r["item_id"], []).append(bool(r["correct"]))
    return {k: sum(v) / len(v) for k, v in acc.items()}


def paired_difference(rows: list[dict], x: str, y: str, ids: set[str]) -> dict:
    """x minus y; items resampled with replacement, each item's agreement averaged over reps."""
    a, b = item_means(rows, x, ids), item_means(rows, y, ids)
    items = sorted(set(a) & set(b))
    n = len(items)
    if not n:
        return {"diff": None, "ci_low": None, "ci_high": None, "n_items": 0}
    diffs = [a[i] - b[i] for i in items]
    rng = random.Random(BOOTSTRAP_SEED)
    stats = sorted(sum(diffs[rng.randrange(n)] for _ in range(n)) / n for _ in range(BOOTSTRAP_RESAMPLES))
    return {"diff": sum(diffs) / n, "ci_low": stats[int(0.025 * BOOTSTRAP_RESAMPLES)],
            "ci_high": stats[int(0.975 * BOOTSTRAP_RESAMPLES) - 1], "n_items": n}


def per_rep(rows: list[dict], system: str, ids: set[str]) -> dict[int, dict[str, bool]]:
    out: dict[int, dict[str, bool]] = {}
    for r in _rows(rows, system, ids):
        out.setdefault(int(r["rep"]), {})[r["item_id"]] = bool(r["correct"])
    return out


def flips(rows: list[dict], x: str, y: str, ids: set[str]) -> dict[int, dict]:
    """Per rep: items right with x only and with y only, exact McNemar."""
    rx, ry = per_rep(rows, x, ids), per_rep(rows, y, ids)
    out = {}
    for rep in sorted(set(rx) & set(ry)):
        common = set(rx[rep]) & set(ry[rep])
        b = sum(rx[rep][i] and not ry[rep][i] for i in common)
        c = sum(ry[rep][i] and not rx[rep][i] for i in common)
        out[rep] = {"x_only": b, "y_only": c, "mcnemar_p": mcnemar_exact(b, c)}
    return out


def auto_accept(rows: list[dict], system: str, ids: set[str]) -> dict:
    rs = _rows(rows, system, ids)
    auto = [r for r in rs if r["status"] == "auto_categorised"]
    right = sum(bool(r["correct"]) for r in auto)
    return {"rate": len(auto) / len(rs) if rs else None,
            "precision": right / len(auto) if auto else None,
            "precision_wilson_lower": wilson_lower(right, len(auto), Z),
            # Auto-posted and disagreeing with the label, as a share of all rows: the error a
            # review layer must not make.
            "wrong_auto_rate": (len(auto) - right) / len(rs) if rs else None,
            "n_auto": len(auto), "n": len(rs)}


def escalation_rate(rows: list[dict], system: str, ids: set[str]) -> Optional[float]:
    rs = _rows(rows, system, ids)
    return sum(bool(r["escalation_attempted"]) for r in rs) / len(rs) if rs else None


def status_mix(rows: list[dict], system: str, ids: set[str]) -> dict[str, float]:
    rs = _rows(rows, system, ids)
    out: dict[str, float] = {}
    for r in rs:
        out[r["status"]] = out.get(r["status"], 0) + 1
    return {k: v / len(rs) for k, v in sorted(out.items())} if rs else {}


def cold_start_agreement(rows: list[dict], system: str, ids: set[str], items: dict[str, dict],
                         review_equivalents: set[str]) -> Optional[float]:
    """Agreement with bookbench's `label_cold_start` (the gold when there is no history): a
    review label agrees unless the row was auto-posted to a non-review code; a code label
    agrees when the validated code is that code or another acceptable one."""
    rs = _rows(rows, system, ids)
    if not rs:
        return None
    right = 0
    for r in rs:
        label = items[r["item_id"]]["label_cold_start"]
        if r["status"] == "error":
            continue
        if label in review_equivalents:
            right += r["status"] != "auto_categorised" or r["code"] in review_equivalents
        else:
            right += r["code"] == label or r["code"] in items[r["item_id"]]["acceptable_labels"]
    return right / len(rs)


def usd_per_1000(rows: list[dict], system: str, ids: set[str]) -> Optional[float]:
    """Standard (non-Batch) prices, from the usage of the calls the app would make."""
    rs = _rows(rows, system, ids)
    return 1000 * sum(float(r["cost_usd"]) for r in rs) / len(rs) / ab.BATCH_DISCOUNT if rs else None


def attack_metrics(rows: list[dict], system: str, ids: set[str]) -> dict[str, Optional[float]]:
    rs = _rows(rows, system, ids)
    out = {}
    for k in ("label_hijacked", "action_hijacked", "reasoning_followed", "underlying_correct"):
        vals = [bool(r[k]) for r in rs if r[k] is not None]
        out[k] = sum(vals) / len(vals) if vals else None
    return out


def drift(rows: list[dict], drift_rows: list[dict], ids: set[str]) -> dict:
    """Arm C with precedents run now (1 rep) against the S9 C reps, on the headline items."""
    s9 = per_rep(rows, "C@with", ids)
    now = per_rep(drift_rows, "C@drift", ids)[1]
    keys = sorted(s9)
    s9_acc = {k: sum(s9[k].values()) / len(s9[k]) for k in keys}
    s9_pairs = [sum(s9[i][t] != s9[j][t] for t in s9[i]) / len(s9[i]) for n, i in enumerate(keys) for j in keys[n + 1:]]
    now_flips = [sum(now[t] != s9[k][t] for t in now) / len(now) for k in keys]
    now_acc = sum(now.values()) / len(now)
    s9_flip = sum(s9_pairs) / len(s9_pairs) if s9_pairs else 0.0
    now_flip = sum(now_flips) / len(now_flips)
    outside = not (min(s9_acc.values()) - DRIFT_MARGIN <= now_acc <= max(s9_acc.values()) + DRIFT_MARGIN)
    too_many_flips = now_flip > DRIFT_FLIP_FACTOR * s9_flip if s9_flip else now_flip > 0
    return {"now_accuracy": now_acc, "s9_accuracy_per_rep": s9_acc, "now_vs_s9_flip_rate": now_flip,
            "s9_rep_to_rep_flip_rate": s9_flip, "flagged": outside or too_many_flips,
            "accuracy_outside_range": outside, "flip_rate_too_high": too_many_flips}


# ── Analysis ─────────────────────────────────────────────────────────────────

def analyse(bb: ab.Bookbench, cases_with: list[ab.Case], cases_without: list[ab.Case],
            raw_with: dict, raw_without: dict, reps: int = REPS, raw_drift: Optional[dict] = None) -> dict:
    rows = (tagged_rows(bb, cases_with, reps, raw_with, "with")
            + tagged_rows(bb, cases_without, reps, raw_without, "without"))
    ids = subsets(cases_with)
    items = {c.item["item_id"]: c.item for c in cases_with}
    out: dict = {"n_items": {k: len(v) for k, v in ids.items()}, "reps": reps, "systems": {}}
    for system in SYSTEMS:
        w, wo = f"{system}@with", f"{system}@without"
        per_subset = {}
        for name, sub in ids.items():
            per_subset[name] = {
                "with": agreement(rows, w, sub), "without": agreement(rows, wo, sub),
                "difference": paired_difference(rows, w, wo, sub),
                "flips": flips(rows, w, wo, sub),
                "auto_with": auto_accept(rows, w, sub), "auto_without": auto_accept(rows, wo, sub),
                "escalation_with": escalation_rate(rows, w, sub),
                "escalation_without": escalation_rate(rows, wo, sub),
                "status_with": status_mix(rows, w, sub), "status_without": status_mix(rows, wo, sub),
                "cold_start_with": cold_start_agreement(rows, w, sub, items, bb.review_equivalents),
                "cold_start_without": cold_start_agreement(rows, wo, sub, items, bb.review_equivalents),
                "usd_per_1000_with": usd_per_1000(rows, w, sub), "usd_per_1000_without": usd_per_1000(rows, wo, sub),
            }
        by_desc = {}
        for kind in ("exact", "varied", "none"):
            sub = {i for i in ids["headline"] if items[i]["description_in_history"] == kind}
            by_desc[kind] = {"n": len(sub), "with": agreement(rows, w, sub), "without": agreement(rows, wo, sub)}
        by_stratum = {}
        for s in HEADLINE + ("S6",):
            sub = {i for i, it in items.items() if it["stratum"] == s}
            by_stratum[s] = {"n": len(sub), "with": agreement(rows, w, sub), "without": agreement(rows, wo, sub)}
        out["systems"][system] = {
            "subsets": per_subset, "by_description_in_history": by_desc, "by_stratum": by_stratum,
            "attacks_with": attack_metrics(rows, w, ids["attacks"]),
            "attacks_without": attack_metrics(rows, wo, ids["attacks"]),
        }
    primary = out["systems"][PRIMARY]["subsets"]["history"]["difference"]
    out["primary"] = {**primary, "claim_supported": primary["ci_low"] is not None and primary["ci_low"] > 0}
    out["calls_without"] = ab.arm_stats(raw_without)
    out["cost_without"] = {k: ab.arm_cost(k, raw_without[k]) for k in raw_without}
    out["served_without"] = ab.served_models(raw_without)
    if raw_drift is not None:
        drift_rows = tagged_rows(bb, cases_with, 1, raw_drift, "drift", systems=("C",))
        out["drift"] = drift(rows, drift_rows, ids["headline"])
        out["calls_drift"] = ab.arm_stats(raw_drift)
        out["cost_drift"] = {k: ab.arm_cost(k, raw_drift[k]) for k in raw_drift}
        out["served_drift"] = ab.served_models(raw_drift)
    out["_rows"] = rows
    return out


# ── Report ───────────────────────────────────────────────────────────────────

def _pct(x: Optional[float], d: int = 1) -> str:
    return "n/a" if x is None else f"{100 * x:.{d}f}%"


def _pts(x: Optional[float]) -> str:
    return "n/a" if x is None else f"{100 * x:+.1f}"


def render(a: dict) -> str:
    p = a["primary"]
    out = ["## Results", "",
           f"**Primary** (`{PRIMARY}`, {a['n_items']['history']} line+history items, {a['reps']} reps): agreement "
           f"with precedents minus without = **{_pts(p['diff'])} points** [{_pts(p['ci_low'])}, {_pts(p['ci_high'])}] "
           f"(paired item bootstrap 95%, seed {BOOTSTRAP_SEED}). Claim rule met: "
           f"**{'yes' if p['claim_supported'] else 'no'}**.", ""]
    for system in SYSTEMS:
        s = a["systems"][system]
        out += [f"### {system}", "",
                "| Items | n | With | Without | Difference [95% CI] | Flips with only / without only (per rep) | "
                "Auto rate with / without | Auto precision with / without | Wrong auto-posts with / without | "
                "Cold-start agreement with / without | Escalation with / without | $ per 1k with / without |",
                "|---|---|---|---|---|---|---|---|---|---|---|---|"]
        for name, label in SUBSETS.items():
            m = s["subsets"][name]
            d = m["difference"]
            fl = "; ".join(f"{v['x_only']}/{v['y_only']}" for v in m["flips"].values())
            esc = (f"{_pct(m['escalation_with'])} / {_pct(m['escalation_without'])}"
                   if system == PRIMARY else "n/a")
            out.append(
                f"| {label} | {a['n_items'][name]} | {_pct(m['with'])} | {_pct(m['without'])} | "
                f"{_pts(d['diff'])} [{_pts(d['ci_low'])}, {_pts(d['ci_high'])}] | {fl} | "
                f"{_pct(m['auto_with']['rate'])} / {_pct(m['auto_without']['rate'])} | "
                f"{_pct(m['auto_with']['precision'])} / {_pct(m['auto_without']['precision'])} | "
                f"{_pct(m['auto_with']['wrong_auto_rate'])} / {_pct(m['auto_without']['wrong_auto_rate'])} | "
                f"{_pct(m['cold_start_with'])} / {_pct(m['cold_start_without'])} | {esc} | "
                f"{m['usd_per_1000_with']:.2f} / {m['usd_per_1000_without']:.2f} |")
        out += ["", "By stratum (agreement with / without): " + ", ".join(
            f"{k} {_pct(v['with'], 0)} / {_pct(v['without'], 0)} (n {v['n']})" for k, v in s["by_stratum"].items()),
            "", "Headline items by `description_in_history` (with / without): " + ", ".join(
            f"{k} {_pct(v['with'], 0)} / {_pct(v['without'], 0)} (n {v['n']})"
            for k, v in s["by_description_in_history"].items()),
            "", "S6 attacks (with / without): " + ", ".join(
            f"{k} {_pct(s['attacks_with'][k], 0)} / {_pct(s['attacks_without'][k], 0)}" for k in s["attacks_with"]),
            ""]
        if system == PRIMARY:
            m = s["subsets"]["history"]
            out += ["Status mix on line+history items, with: " + ", ".join(
                f"{k} {_pct(v, 0)}" for k, v in m["status_with"].items()) + "; without: " + ", ".join(
                f"{k} {_pct(v, 0)}" for k, v in m["status_without"].items()), ""]
    out += ["### Calls without precedents", "", "| Arm | Calls | ok | refused | max_tokens | no output | invalid | errored | Served | $ Batch |",
            "|---|---|---|---|---|---|---|---|---|---|"]
    for k, st in a["calls_without"].items():
        out.append(f"| {k} | {st['calls']} | {st['ok']} | {st['refused']} | {st['max_tokens']} | {st['no_output']} | "
                   f"{st['invalid_output']} | {st['errored']} | {a['served_without'][k]} | {a['cost_without'][k]['usd']:.4f} |")
    if "drift" in a:
        d = a["drift"]
        st = a["calls_drift"]["C"]
        out += ["", "### Drift check (arm C with precedents, 1 rep now, against S9's 3 reps; headline items)", "",
                f"- Accuracy now {_pct(d['now_accuracy'])}; S9 per rep "
                + ", ".join(_pct(v) for v in d["s9_accuracy_per_rep"].values()) + ".",
                f"- Flip rate now against S9 reps {_pct(d['now_vs_s9_flip_rate'])}; S9 rep to rep "
                f"{_pct(d['s9_rep_to_rep_flip_rate'])}.",
                f"- Calls {st['calls']}, ok {st['ok']}, refused {st['refused']}, max_tokens {st['max_tokens']}; served "
                f"{a['served_drift']['C']}; ${a['cost_drift']['C']['usd']:.4f} Batch.",
                f"- Flagged: **{'yes' if d['flagged'] else 'no'}**."]
    return "\n".join(out)


def _json_ready(a: dict) -> dict:
    out = {k: v for k, v in a.items() if k != "_rows"}
    return json.loads(json.dumps(out, default=str))


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--data-dir", type=Path, required=True)
    ap.add_argument("--with-dir", type=Path, required=True, help="the S9 run: raw/C.jsonl and raw/D.jsonl")
    ap.add_argument("--without-dir", type=Path, required=True, help="the --precedents none run")
    ap.add_argument("--drift-dir", type=Path, help="arm C with precedents, 1 rep")
    ap.add_argument("--out-dir", type=Path, required=True)
    ap.add_argument("--reps", type=int, default=REPS)
    args = ap.parse_args(argv)

    bb = ab.load_bookbench(args.data_dir)
    items = ab.uk_split(bb, "test")
    cases_with = ab.build_cases(bb, items, "top5")
    cases_without = ab.build_cases(bb, items, "none")
    raw_drift = load_raw(args.drift_dir, ("C",)) if args.drift_dir else None
    a = analyse(bb, cases_with, cases_without, load_raw(args.with_dir), load_raw(args.without_dir), args.reps, raw_drift)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    rows = a["_rows"]
    with (args.out_dir / "rows.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=ab.ROW_FIELDS)
        w.writeheader()
        w.writerows(rows)
    (args.out_dir / "effect.json").write_text(json.dumps(_json_ready(a), indent=1), encoding="utf-8")
    (args.out_dir / "results.md").write_text(render(a) + "\n", encoding="utf-8")
    p = a["primary"]
    print(f"primary: {_pts(p['diff'])} points [{_pts(p['ci_low'])}, {_pts(p['ci_high'])}], "
          f"claim {'supported' if p['claim_supported'] else 'not supported'}")
    if "drift" in a:
        print(f"drift flagged: {a['drift']['flagged']}")
    print(f"wrote {args.out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
