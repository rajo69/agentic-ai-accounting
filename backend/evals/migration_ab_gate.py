"""
Pre-registered gate and analyses for the S10 migration A/B (brief 3.5 and addendum 3.5a).

Reads the scored rows and raw Batch results of `evals.migration_ab` and computes:
- G1  tiered-new accuracy on S0 to S5 non-inferior to tiered-old: lower bound of the paired
      item bootstrap 95% CI of (new - old) is at least -3 points
- G2  auto-accept precision of new at least old - 1 point (auto-accept rate beside it)
- G3  zero refusals and zero max_tokens truncations in every call of the system's arms
- G4  tiered cost per 1,000 transactions, from usage, lower for new
plus per-stratum accuracy, S6 attack metrics, escalation rate, single-tier against tiered,
C against E, a threshold sweep, per-item flips with exact McNemar tests, the rep-to-rep
noise floor, AUROC and ECE, and the lowest threshold whose Wilson lower bound clears the
old profile's auto-accept precision.

Nothing here calls the API.
"""
from __future__ import annotations

import dataclasses
import math
import random
from typing import Optional

from evals import migration_ab as ab

HEADLINE = ("S0", "S1", "S2", "S3", "S4", "S5")
OLD = "old_tiered"
CANDIDATES = ("new_tiered", "new_tiered_tool", "new_tiered_medium")
FLIP_PAIRS = (("new_tiered", "old_tiered"), ("new_tiered_tool", "old_tiered"), ("new_tiered_medium", "new_tiered"),
              ("C", "E"), ("C", "A"), ("D", "B"), ("F", "C"))
G1_MARGIN, G2_MARGIN = -0.03, -0.01
BOOTSTRAP_RESAMPLES, BOOTSTRAP_SEED = 10_000, 20261031
SWEEP = [round(0.50 + 0.05 * i, 2) for i in range(10)]  # 0.50 .. 0.95
Z = 1.959964


# ── Small statistics ─────────────────────────────────────────────────────────

def wilson_lower(successes: int, n: int, z: float = Z) -> Optional[float]:
    if n == 0:
        return None
    p = successes / n
    centre = p + z * z / (2 * n)
    margin = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (centre - margin) / (1 + z * z / n)


def mcnemar_exact(b: int, c: int) -> float:
    """Two-sided exact McNemar p-value from the discordant counts."""
    n = b + c
    if n == 0:
        return 1.0
    tail = sum(math.comb(n, k) for k in range(min(b, c) + 1)) / 2 ** n
    return min(1.0, 2 * tail)


def auroc(scores_pos: list[float], scores_neg: list[float]) -> Optional[float]:
    """P(a right answer's confidence > a wrong one's), ties counted half."""
    if not scores_pos or not scores_neg:
        return None
    wins = 0.0
    for p in scores_pos:
        for n in scores_neg:
            wins += 1.0 if p > n else 0.5 if p == n else 0.0
    return wins / (len(scores_pos) * len(scores_neg))


def ece(pairs: list[tuple[float, bool]], bins: int = 10) -> Optional[float]:
    """Expected calibration error, equal-width bins on [0, 1]."""
    if not pairs:
        return None
    total = 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        group = [(c, y) for c, y in pairs if lo <= c < hi or (b == bins - 1 and c == 1.0)]
        if group:
            conf = sum(c for c, _ in group) / len(group)
            acc = sum(y for _, y in group) / len(group)
            total += len(group) / len(pairs) * abs(conf - acc)
    return total


# ── Row helpers ──────────────────────────────────────────────────────────────

def _by(rows: list[dict], system: str, headline: bool = True) -> list[dict]:
    return [r for r in rows if r["system"] == system and (not headline or r["stratum"] in HEADLINE)]


def _item_means(rows: list[dict], system: str) -> dict[str, float]:
    """Per item, correctness averaged over reps (headline strata)."""
    acc: dict[str, list[bool]] = {}
    for r in _by(rows, system):
        acc.setdefault(r["item_id"], []).append(bool(r["correct"]))
    return {k: sum(v) / len(v) for k, v in acc.items()}


def accuracy(rows: list[dict], system: str) -> Optional[float]:
    rs = _by(rows, system)
    return sum(bool(r["correct"]) for r in rs) / len(rs) if rs else None


def auto_accept(rows: list[dict], system: str) -> dict:
    rs = _by(rows, system)
    auto = [r for r in rs if r["status"] == "auto_categorised"]
    right = sum(bool(r["correct"]) for r in auto)
    return {"rate": len(auto) / len(rs) if rs else None, "precision": right / len(auto) if auto else None,
            "n_auto": len(auto), "n": len(rs), "precision_wilson_lower": wilson_lower(right, len(auto))}


def paired_bootstrap(rows: list[dict], new: str, old: str) -> dict:
    """Resample items with replacement; each item counts its accuracy averaged over reps."""
    a, b = _item_means(rows, new), _item_means(rows, old)
    items = sorted(set(a) & set(b))
    diffs = [a[i] - b[i] for i in items]
    rng = random.Random(BOOTSTRAP_SEED)
    n = len(diffs)
    stats = sorted(sum(diffs[rng.randrange(n)] for _ in range(n)) / n for _ in range(BOOTSTRAP_RESAMPLES))
    return {"diff": sum(diffs) / n, "ci_low": stats[int(0.025 * BOOTSTRAP_RESAMPLES)],
            "ci_high": stats[int(0.975 * BOOTSTRAP_RESAMPLES) - 1], "n_items": n}


def per_rep(rows: list[dict], system: str) -> dict[int, dict[str, bool]]:
    out: dict[int, dict[str, bool]] = {}
    for r in _by(rows, system):
        out.setdefault(int(r["rep"]), {})[r["item_id"]] = bool(r["correct"])
    return out


def flips(rows: list[dict], x: str, y: str) -> dict:
    """Per rep: items right in x only (b) and in y only (c), with exact McNemar."""
    rx, ry = per_rep(rows, x), per_rep(rows, y)
    out = {}
    for rep in sorted(set(rx) & set(ry)):
        b = sum(rx[rep][i] and not ry[rep][i] for i in rx[rep])
        c = sum(ry[rep][i] and not rx[rep][i] for i in rx[rep])
        out[rep] = {"x_only": b, "y_only": c, "mcnemar_p": mcnemar_exact(b, c)}
    return out


def noise_floor(rows: list[dict], system: str) -> dict:
    """Rep-to-rep: share of items whose correctness flips, and the accuracy spread."""
    reps = per_rep(rows, system)
    keys = sorted(reps)
    pairs = [(i, j) for k, i in enumerate(keys) for j in keys[k + 1:]]
    flip_rates = {f"r{i}-r{j}": sum(reps[i][t] != reps[j][t] for t in reps[i]) / len(reps[i]) for i, j in pairs}
    accs = [sum(reps[k].values()) / len(reps[k]) for k in keys]
    return {"flip_rate": flip_rates, "accuracy_per_rep": accs,
            "accuracy_spread": (max(accs) - min(accs)) if accs else None}


def confidence_quality(rows: list[dict], system: str) -> dict:
    rs = [r for r in _by(rows, system) if r["code"] not in (None, "") and r["confidence"] not in (None, "")]
    pairs = [(float(r["confidence"]), bool(r["correct"])) for r in rs]
    return {"n": len(pairs), "auroc": auroc([c for c, y in pairs if y], [c for c, y in pairs if not y]),
            "ece": ece(pairs)}


def per_stratum(rows: list[dict], system: str) -> dict[str, Optional[float]]:
    out = {}
    for s in HEADLINE + ("S6",):
        rs = [r for r in rows if r["system"] == system and r["stratum"] == s]
        out[s] = sum(bool(r["correct"]) for r in rs) / len(rs) if rs else None
    return out


def attack_metrics(rows: list[dict], system: str) -> dict[str, Optional[float]]:
    rs = [r for r in rows if r["system"] == system and r["stratum"] == "S6"]
    out = {}
    for k in ("label_hijacked", "action_hijacked", "reasoning_followed", "underlying_correct"):
        vals = [bool(r[k]) for r in rs if r[k] is not None]
        out[k] = sum(vals) / len(vals) if vals else None
    return out


def usd_per_1000(rows: list[dict], system: str, standard: bool = True) -> Optional[float]:
    rs = [r for r in rows if r["system"] == system]
    if not rs:
        return None
    batch = 1000 * sum(float(r["cost_usd"]) for r in rs) / len(rs)
    return batch / ab.BATCH_DISCOUNT if standard else batch


def escalation_rate(rows: list[dict], system: str) -> Optional[float]:
    rs = _by(rows, system)
    return sum(bool(r["escalation_attempted"]) for r in rs) / len(rs) if rs else None


# ── Sweep (rescored from the raw calls) ──────────────────────────────────────

def sweep(cases: list[ab.Case], reps: int, raw: dict, bb: ab.Bookbench, system: str) -> list[dict]:
    """Escalation and auto-accept thresholds moved together (as in both profiles), review at 0.5.
    The escalation arm answered every item, so any threshold can be replayed."""
    profile = ab.ARMS[ab.SYSTEMS[system][0]].profile
    out = []
    for t in SWEEP:
        swept = dataclasses.replace(profile, escalation_threshold=t, auto_accept_threshold=t)
        rows = ab.score_rows([system], cases, reps, raw, bb.review_equivalents, bb.scored_channels,
                             thresholds={system: swept})
        aa = auto_accept(rows, system)
        out.append({"threshold": t, "coverage": aa["rate"], "precision": aa["precision"],
                    "precision_wilson_lower": aa["precision_wilson_lower"], "accuracy": accuracy(rows, system),
                    "escalation_rate": escalation_rate(rows, system), "usd_per_1000": usd_per_1000(rows, system)})
    return out


def lowest_threshold(points: list[dict], target: Optional[float]) -> Optional[float]:
    """3.5a item 4: the lowest threshold whose Wilson lower bound reaches the target."""
    if target is None:
        return None
    ok = [p["threshold"] for p in points if p["precision_wilson_lower"] is not None and p["precision_wilson_lower"] >= target]
    return min(ok) if ok else None


# ── Gate ─────────────────────────────────────────────────────────────────────

def system_calls(stats: dict, system: str) -> dict:
    primary, escalation = ab.SYSTEMS[system]
    arms = [a for a in (primary, escalation) if a]
    return {"refused": sum(stats[a]["refused"] for a in arms), "max_tokens": sum(stats[a]["max_tokens"] for a in arms),
            "errored": sum(stats[a]["errored"] for a in arms),
            "no_output_or_invalid": sum(stats[a]["no_output"] + stats[a]["invalid_output"] for a in arms)}


def gate(rows: list[dict], cases: list[ab.Case], reps: int, raw: dict, bb: ab.Bookbench) -> dict:
    systems = list(dict.fromkeys(r["system"] for r in rows))
    stats = ab.arm_stats(raw)
    has_old = OLD in systems
    old_aa = auto_accept(rows, OLD) if has_old else None
    old_cost = usd_per_1000(rows, OLD) if has_old else None
    old_noise = noise_floor(rows, OLD) if has_old else None
    result: dict = {"candidates": {}, "systems": {}, "flips": {}, "arm_calls": stats, "sweep": {}}
    for system in systems:
        result["systems"][system] = {
            "accuracy": accuracy(rows, system), "per_stratum": per_stratum(rows, system),
            "auto_accept": auto_accept(rows, system), "escalation_rate": escalation_rate(rows, system),
            "usd_per_1000_standard": usd_per_1000(rows, system), "attack": attack_metrics(rows, system),
            "noise_floor": noise_floor(rows, system), "confidence": confidence_quality(rows, system),
        }
    for x, y in FLIP_PAIRS:
        if x in systems and y in systems:
            result["flips"][f"{x} vs {y}"] = flips(rows, x, y)
    for system in [s for s in systems if ab.SYSTEMS[s][1]]:
        result["sweep"][system] = sweep(cases, reps, raw, bb, system)
    # The gate compares against old_tiered; a run without it (e.g. claude-5-5 only on test)
    # reports the systems and the sweep, no candidates.
    for new in [c for c in CANDIDATES if c in systems and has_old]:
        boot = paired_bootstrap(rows, new, OLD)
        new_aa = auto_accept(rows, new)
        calls = system_calls(stats, new)
        new_cost = usd_per_1000(rows, new)
        spread = max(old_noise["accuracy_spread"] or 0, result["systems"][new]["noise_floor"]["accuracy_spread"] or 0)
        result["candidates"][new] = {
            "G1": {**boot, "pass": boot["ci_low"] >= G1_MARGIN},
            "G2": {"new_precision": new_aa["precision"], "old_precision": old_aa["precision"],
                   "new_rate": new_aa["rate"], "old_rate": old_aa["rate"],
                   "pass": (new_aa["precision"] is not None and old_aa["precision"] is not None
                            and new_aa["precision"] >= old_aa["precision"] + G2_MARGIN)},
            "G3": {**calls, "pass": calls["refused"] == 0 and calls["max_tokens"] == 0},
            "G4": {"new_usd_per_1000": new_cost, "old_usd_per_1000": old_cost,
                   "pass": new_cost is not None and old_cost is not None and new_cost < old_cost},
            "difference_within_noise": abs(boot["diff"]) <= spread,
            "suggested_threshold": lowest_threshold(result["sweep"].get(new, []), old_aa["precision"]),
        }
    return result


# ── Markdown ─────────────────────────────────────────────────────────────────

def _pct(x: Optional[float], d: int = 1) -> str:
    return "n/a" if x is None else f"{100 * x:.{d}f}%"


def _num(x: Optional[float], d: int = 3) -> str:
    return "n/a" if x is None else f"{x:.{d}f}"


def render(g: dict) -> str:
    out = ["## Results", ""]
    out += ["### Gate", "", "| Candidate | G1 diff [95% CI] | G2 precision new / old (rate) | G3 refused / truncated | "
            "G4 $ per 1k new / old | Within noise | Pass |", "|---|---|---|---|---|---|---|"]
    for name, c in g["candidates"].items():
        g1, g2, g3, g4 = c["G1"], c["G2"], c["G3"], c["G4"]
        passed = all(c[k]["pass"] for k in ("G1", "G2", "G3", "G4"))
        out.append(
            f"| {name} | {_pct(g1['diff'])} [{_pct(g1['ci_low'])}, {_pct(g1['ci_high'])}] {'ok' if g1['pass'] else 'FAIL'} "
            f"| {_pct(g2['new_precision'])} / {_pct(g2['old_precision'])} ({_pct(g2['new_rate'])} / {_pct(g2['old_rate'])}) "
            f"{'ok' if g2['pass'] else 'FAIL'} | {g3['refused']} / {g3['max_tokens']} {'ok' if g3['pass'] else 'STOP'} "
            f"| {_num(g4['new_usd_per_1000'], 2)} / {_num(g4['old_usd_per_1000'], 2)} {'ok' if g4['pass'] else 'FAIL'} "
            f"| {'yes' if c['difference_within_noise'] else 'no'} | {'**pass**' if passed else '**fail**'} |")
    out += ["", "### Systems (S0 to S5, pooled over reps; cost at standard prices)", "",
            "| System | Accuracy | Auto rate | Auto precision [Wilson low] | Escalation | AUROC | ECE | Rep spread | $ per 1k |",
            "|---|---|---|---|---|---|---|---|---|"]
    for name, s in g["systems"].items():
        aa = s["auto_accept"]
        out.append(f"| {name} | {_pct(s['accuracy'])} | {_pct(aa['rate'])} | {_pct(aa['precision'])} "
                   f"[{_pct(aa['precision_wilson_lower'])}] | {_pct(s['escalation_rate'])} | {_num(s['confidence']['auroc'])} "
                   f"| {_num(s['confidence']['ece'])} | {_pct(s['noise_floor']['accuracy_spread'])} "
                   f"| {_num(s['usd_per_1000_standard'], 2)} |")
    out += ["", "### Per stratum", "", "| System | " + " | ".join(HEADLINE + ("S6",)) + " |",
            "|---|" + "---|" * (len(HEADLINE) + 1)]
    for name, s in g["systems"].items():
        out.append(f"| {name} | " + " | ".join(_pct(s["per_stratum"][k], 0) for k in HEADLINE + ("S6",)) + " |")
    out += ["", "### S6 attacks (outside the headline)", "",
            "| System | Label hijacked | Auto-posted | Reasoning followed | Underlying correct |", "|---|---|---|---|---|"]
    for name, s in g["systems"].items():
        a = s["attack"]
        out.append(f"| {name} | {_pct(a['label_hijacked'], 0)} | {_pct(a['action_hijacked'], 0)} "
                   f"| {_pct(a['reasoning_followed'], 0)} | {_pct(a['underlying_correct'], 0)} |")
    out += ["", "### Per-item flips (headline strata; x only / y only, exact McNemar p per rep)", ""]
    for pair, reps in g["flips"].items():
        cells = ", ".join(f"r{r}: {v['x_only']}/{v['y_only']} p={v['mcnemar_p']:.3f}" for r, v in reps.items())
        out.append(f"- {pair}: {cells}")
    out += ["", "### Calls per arm", "", "| Arm | Calls | ok | refused | max_tokens | no output | invalid | errored |",
            "|---|---|---|---|---|---|---|---|"]
    for arm, s in g["arm_calls"].items():
        out.append(f"| {arm} | {s['calls']} | {s['ok']} | {s['refused']} | {s['max_tokens']} | {s['no_output']} "
                   f"| {s['invalid_output']} | {s['errored']} |")
    out += ["", "### Threshold sweep (escalation = auto-accept = t, review 0.5)", ""]
    for name, points in g["sweep"].items():
        suggested = g["candidates"].get(name, {}).get("suggested_threshold")
        out += [f"**{name}**" + (f" (lowest t with Wilson lower bound >= old precision: {suggested})" if name in g["candidates"] else ""),
                "", "| t | Coverage | Precision [Wilson low] | Accuracy | Escalation | $ per 1k |", "|---|---|---|---|---|---|"]
        for p in points:
            out.append(f"| {p['threshold']:.2f} | {_pct(p['coverage'])} | {_pct(p['precision'])} "
                       f"[{_pct(p['precision_wilson_lower'])}] | {_pct(p['accuracy'])} | {_pct(p['escalation_rate'])} "
                       f"| {_num(p['usd_per_1000'], 2)} |")
        out.append("")
    return "\n".join(out)
