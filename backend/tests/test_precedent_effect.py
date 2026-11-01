"""S12 precedent-effect eval: the no-precedent prompt and the paired analysis. No network."""
import hashlib
import json

import pytest

from evals import migration_ab as ab
from evals import precedent_effect as pe
from tests.test_migration_ab import CHART_UK, HISTORY, _item


def _test_item(item_id, stratum, labels, solvable, action="post", cold=None, desc="none", **extra):
    return {**_item(item_id, stratum, labels, action=action, **extra), "split": "test", "solvable_with": solvable,
            "label_cold_start": cold if cold is not None else (labels[0] if labels else "NEEDS_REVIEW"),
            "description_in_history": desc}


ITEMS = [
    _test_item("bb-uk-0101", "S2", ["400"], "line+history", cold="NEEDS_REVIEW", desc="exact"),
    _test_item("bb-uk-0102", "S0", ["400"], "line+history", cold="NEEDS_REVIEW", desc="varied"),
    _test_item("bb-uk-0103", "S1", ["400"], "line"),
    _test_item("bb-uk-0104", "S5", [], "none", action="review"),
    _test_item("bb-uk-0105", "S6", [], "none", action="review", attack_target="200", attack_channel="payer_reference",
               attack_underlying_label="400", attack_metrics={"reasoning_followed": {"patterns": ["vat back"]}}),
]


@pytest.fixture
def bb(tmp_path):
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
    return ab.load_bookbench(tmp_path)


def _cases(bb):
    items = ab.uk_split(bb, "test")
    return ab.build_cases(bb, items, "top5"), ab.build_cases(bb, items, "none")


def _result(code, confidence):
    """A succeeded Batch result in the 5.5 (structured outputs) shape."""
    text = json.dumps({"category_code": code, "category_name": "x", "confidence": confidence, "reasoning": "r"})
    return {"type": "succeeded", "message": {
        "id": "m", "type": "message", "role": "assistant", "model": "claude-haiku-5-5",
        "content": [{"type": "text", "text": text}], "stop_reason": "end_turn", "stop_sequence": None,
        "usage": {"input_tokens": 1000, "output_tokens": 100}}}


def _raw(answers, reps=1, arms=("C", "D")):
    """answers: item_id -> (code, confidence), the same for every arm and rep."""
    return {arm: {ab.custom_id(arm, r, iid): _result(*ans) for r in range(1, reps + 1) for iid, ans in answers.items()}
            for arm in arms}


GOOD = {"bb-uk-0101": ("400", 0.95), "bb-uk-0102": ("400", 0.95), "bb-uk-0103": ("400", 0.95),
        "bb-uk-0104": ("850", 0.4), "bb-uk-0105": ("400", 0.6)}


def test_no_precedent_prompt_is_the_cold_start_prompt(bb):
    with_p, without_p = _cases(bb)
    assert "GOOGLE ADS MAY" in with_p[0].prompt
    assert "(none yet)" in without_p[0].prompt and "GOOGLE ADS MAY" not in without_p[0].prompt
    # Only the examples block differs.
    head = with_p[0].prompt.split("Similar transactions already categorised:")[0]
    assert without_p[0].prompt.startswith(head)
    with pytest.raises(ValueError):
        ab.build_cases(bb, ab.uk_split(bb, "test"), "random")


def test_subsets_follow_the_dataset_fields(bb):
    ids = pe.subsets(_cases(bb)[0])
    assert ids["history"] == {"bb-uk-0101", "bb-uk-0102"}
    assert ids["line"] == {"bb-uk-0103"}
    assert ids["review"] == {"bb-uk-0104"} and ids["attacks"] == {"bb-uk-0105"}
    assert "bb-uk-0105" not in ids["headline"] and len(ids["headline"]) == 4


def test_identical_runs_show_no_effect(bb):
    cw, cn = _cases(bb)
    raw = _raw(GOOD, reps=3)
    a = pe.analyse(bb, cw, cn, raw, raw, reps=3)
    assert a["primary"]["diff"] == 0 and not a["primary"]["claim_supported"]
    assert all(v == {"x_only": 0, "y_only": 0, "mcnemar_p": 1.0}
               for v in a["systems"]["new_tiered"]["subsets"]["history"]["flips"].values())


def test_losing_the_precedent_shows_as_an_effect_and_cold_start_is_scored(bb):
    cw, cn = _cases(bb)
    without = dict(GOOD, **{"bb-uk-0101": ("200", 0.95), "bb-uk-0102": ("200", 0.6)})
    a = pe.analyse(bb, cw, cn, _raw(GOOD, reps=3), _raw(without, reps=3), reps=3)
    hist = a["systems"]["new_tiered"]["subsets"]["history"]
    assert hist["with"] == 1.0 and hist["without"] == 0.0
    assert a["primary"]["diff"] == 1.0 and a["primary"]["claim_supported"]
    # Without history the gold is review: the confident wrong guess is auto-posted (disagrees),
    # the unconfident one is only suggested (agrees).
    assert hist["cold_start_without"] == 0.5
    assert hist["auto_without"]["wrong_auto_rate"] == 0.5
    # With precedents both rows were auto-posted, which the cold-start label calls wrong.
    assert hist["cold_start_with"] == 0.0
    line = a["systems"]["new_tiered"]["subsets"]["line"]
    assert line["difference"]["diff"] == 0


def test_drift_flags_a_moved_model_and_passes_a_steady_one(bb):
    cw, cn = _cases(bb)
    raw = _raw(GOOD, reps=3)
    steady = pe.analyse(bb, cw, cn, raw, raw, reps=3, raw_drift=_raw(GOOD, arms=("C",)))
    assert steady["drift"]["flagged"] is False
    moved = {k: ("200", 0.95) for k in GOOD}
    a = pe.analyse(bb, cw, cn, raw, raw, reps=3, raw_drift=_raw(moved, arms=("C",)))
    assert a["drift"]["flagged"] is True


def test_cli_writes_the_report(bb, tmp_path):
    data_dir = bb.root.parents[len(ab.BOOKBENCH_PATH.split("/")) - 1]
    for name, answers in (("with", GOOD), ("without", GOOD)):
        (tmp_path / name / "raw").mkdir(parents=True)
        for arm, results in _raw(answers, reps=3).items():
            (tmp_path / name / "raw" / f"{arm}.jsonl").write_text(
                "".join(json.dumps({"custom_id": k, "result": v}) + "\n" for k, v in results.items()), encoding="utf-8")
    out = tmp_path / "report"
    assert pe.main(["--data-dir", str(data_dir), "--with-dir", str(tmp_path / "with"),
                    "--without-dir", str(tmp_path / "without"), "--out-dir", str(out)]) == 0
    effect = json.loads((out / "effect.json").read_text(encoding="utf-8"))
    assert effect["n_items"]["history"] == 2 and "_rows" not in effect
    assert "## Results" in (out / "results.md").read_text(encoding="utf-8")


def test_cli_keeps_no_precedent_results_apart(bb, tmp_path, monkeypatch):
    monkeypatch.setattr(ab, "RESULTS_DIR", tmp_path / "results")
    data_dir = bb.root.parents[len(ab.BOOKBENCH_PATH.split("/")) - 1]
    assert ab.main(["--data-dir", str(data_dir), "--split", "test", "--precedents", "none",
                    "--arms", "C,D", "--reps", "1"]) == 0
    prov = json.loads((tmp_path / "results" / "mock-test-noprec" / "provenance.json").read_text(encoding="utf-8"))
    assert prov["bookbench"]["precedents"] == "none"
    assert not (tmp_path / "results" / "mock-test").exists()
