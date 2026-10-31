"""The pre-registered gate and analyses of the S10 A/B: known values and an end-to-end mock run. No network."""
import pytest

from evals import migration_ab as ab
from evals import migration_ab_gate as gate
from tests.test_migration_ab import data_dir  # noqa: F401  (fixture)


def test_wilson_lower_bound():
    assert gate.wilson_lower(8, 10) == pytest.approx(0.4902, abs=1e-4)
    assert gate.wilson_lower(0, 0) is None
    assert gate.wilson_lower(100, 100) < 1.0


def test_exact_mcnemar():
    assert gate.mcnemar_exact(0, 5) == pytest.approx(0.0625)
    assert gate.mcnemar_exact(3, 3) == 1.0
    assert gate.mcnemar_exact(0, 0) == 1.0


def test_auroc_and_ece():
    assert gate.auroc([0.9, 0.8], [0.1, 0.2]) == 1.0
    assert gate.auroc([0.1], [0.9]) == 0.0
    assert gate.auroc([0.5], [0.5]) == 0.5
    assert gate.ece([(1.0, True), (1.0, True)]) == 0.0
    assert gate.ece([(0.8, True), (0.8, False)]) == pytest.approx(0.3)


def _rows(system, correct_by_rep, stratum="S0"):
    return [{"system": system, "rep": rep, "item_id": f"i{k}", "stratum": stratum, "correct": c,
             "status": "auto_categorised", "cost_usd": 0.001, "escalation_attempted": False,
             "code": "400", "confidence": 0.9}
            for rep, cs in correct_by_rep.items() for k, c in enumerate(cs)]


def test_paired_bootstrap_and_flips():
    same = _rows("new", {1: [True, False, True, False]}) + _rows("old", {1: [True, False, True, False]})
    b = gate.paired_bootstrap(same, "new", "old")
    assert b["diff"] == 0 and b["ci_low"] == 0 and b["ci_high"] == 0

    better = _rows("new", {1: [True] * 4}) + _rows("old", {1: [False] * 4})
    b = gate.paired_bootstrap(better, "new", "old")
    assert b["diff"] == 1 and b["ci_low"] == 1
    assert gate.flips(better, "new", "old") == {1: {"x_only": 4, "y_only": 0, "mcnemar_p": 0.125}}


def test_noise_floor_and_s6_kept_out_of_the_headline():
    rows = _rows("A", {1: [True, True, False, False], 2: [True, False, False, False]})
    rows += _rows("A", {1: [False] * 4, 2: [False] * 4}, stratum="S6")
    n = gate.noise_floor(rows, "A")
    assert n["flip_rate"] == {"r1-r2": 0.25}
    assert n["accuracy_spread"] == pytest.approx(0.25)
    assert gate.accuracy(rows, "A") == pytest.approx(3 / 8)


def test_gate_end_to_end_on_mock(data_dir):  # noqa: F811
    bb = ab.load_bookbench(data_dir)
    cases = ab.build_cases(bb, ab.uk_dev(bb))
    arms = list(ab.ARMS)
    raw = ab.run_mock(arms, cases, reps=3)
    rows = ab.score_rows(ab.systems_for(arms), cases, 3, raw, bb.review_equivalents, bb.scored_channels)
    g = gate.gate(rows, cases, 3, raw, bb)
    assert set(g["candidates"]) == {"new_tiered", "new_tiered_tool", "new_tiered_medium"}
    for c in g["candidates"].values():
        assert set(c) >= {"G1", "G2", "G3", "G4", "difference_within_noise", "suggested_threshold"}
    # At t = 0.85 the sweep is the profile itself.
    at_085 = next(p for p in g["sweep"]["new_tiered"] if p["threshold"] == 0.85)
    assert at_085["coverage"] == g["systems"]["new_tiered"]["auto_accept"]["rate"]
    assert at_085["precision"] == g["systems"]["new_tiered"]["auto_accept"]["precision"]
    md = gate.render(g)
    assert md.startswith("## Results") and "| new_tiered |" in md


def test_lowest_threshold_uses_the_lower_bound():
    points = [{"threshold": 0.6, "precision_wilson_lower": 0.80}, {"threshold": 0.7, "precision_wilson_lower": 0.86},
              {"threshold": 0.8, "precision_wilson_lower": 0.90}]
    assert gate.lowest_threshold(points, 0.85) == 0.7
    assert gate.lowest_threshold(points, 0.95) is None
