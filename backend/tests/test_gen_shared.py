"""Tests for the shared generator foundation of fix round 2 (SCHEMA_v0.2): split gold, chart variants, fixed and round
amounts, constant references, contacts, precedent forms, the history tag and the manifest scoring block."""

from __future__ import annotations

import datetime as dt
import json
import random
from decimal import Decimal

import pytest

from evals.generator import build as B
from evals.generator import splits
from evals.generator.charts import chart_id_for, firm_accounts, in_chart, is_gold_eligible
from evals.generator.constants import MODES, NEEDS_REVIEW, ROLE_WORDS
from evals.generator.engine import Draft, Env, Prec
from evals.generator.firms import all_firms, profile_view
from evals.generator.gold import Ctx, Gold, RuleNotApplicable, make_split
from evals.generator.templates import fill, has_role_word, payee_token, render

FIRMS = all_firms()
UK_ST = next(f for f in FIRMS.values() if f["jurisdiction"] == "UK" and f["entity_type"] == "sole_trader")
UK_CO = next(f for f in FIRMS.values() if f["jurisdiction"] == "UK" and f["entity_type"] == "limited_company")
US_SP = next(f for f in FIRMS.values() if f["jurisdiction"] == "US" and f["entity_type"] == "sole_prop")


# ---------------------------------------------------------------- split gold


def test_make_split_primary_line_and_serialised_amounts():
    ctx = Ctx(firm=UK_ST, amount=Decimal("1482.37"))
    g = make_split(ctx, "UK-R019", [("200", Decimal("1520.00"), "gross_sales"), ("404", Decimal("-37.63"), "processor_fee")],
                   "processor_payout")
    assert g.label == "200" and g.acceptable_labels == ("200",) and g.gold_action == "post"
    assert g.lines == (("200", "1520.00", "gross_sales"), ("404", "-37.63", "processor_fee"))
    assert g.split_kind == "processor_payout" and g.solvable_with == "line"


def test_make_split_ties_break_on_lower_code():
    g = make_split(Ctx(firm=UK_ST, amount=Decimal("-50.00")), "UK-R019",
                   [("404", Decimal("-100.00"), "processor_fee"), ("200", Decimal("50.00"), "gross_sales")],
                   "processor_payout")
    assert g.label == "404"  # largest absolute amount wins
    g = make_split(Ctx(firm=UK_ST, amount=Decimal("0.00")), "UK-R019",
                   [("404", Decimal("-50.00"), "processor_fee"), ("200", Decimal("50.00"), "gross_sales")],
                   "processor_payout")
    assert g.label == "200"  # tie on |amount|: lower code


@pytest.mark.parametrize("lines,kind", [
    ([("200", Decimal("100.00"), "gross_sales")], "processor_payout"),  # one line
    ([("200", Decimal("100.00"), "gross_sales"), ("200", Decimal("-2.00"), "processor_fee")], "processor_payout"),
    ([("200", Decimal("100.00"), "gross_sales"), ("404", Decimal("-3.00"), "processor_fee")], "processor_payout"),  # sum
    ([("200", Decimal("100.00"), "gross_sales"), ("404", Decimal("-2.00"), "bad_role")], "processor_payout"),
    ([("200", Decimal("100.00"), "gross_sales"), ("404", Decimal("-2.00"), "processor_fee")], "bad_kind"),
])
def test_make_split_rejects_bad_splits(lines, kind):
    with pytest.raises(ValueError):
        make_split(Ctx(firm=UK_ST, amount=Decimal("98.00")), "UK-R019", lines, kind)


def test_make_split_checks_chart_eligibility():
    # 835 is not on a sole trader's chart (F12)
    with pytest.raises(RuleNotApplicable):
        make_split(Ctx(firm=UK_ST, amount=Decimal("90.00")), "UK-R019",
                   [("200", Decimal("100.00"), "gross_sales"), ("835", Decimal("-10.00"), "processor_fee")],
                   "processor_payout")


def test_one_line_gold_has_no_lines():
    assert Gold("200", ("200",), "post", "line", "UK-R019", "convention", "x").lines is None


# ---------------------------------------------------------------- statement figures


def test_processor_payout_figures_sum_and_text():
    rng = random.Random(1)
    p = splits.processor_payout(rng, Decimal("1520.00"), "uk-b-stripe", dt.date(2026, 8, 14), "Stripe")
    assert p["fee"] == Decimal("23.00")  # 1.5% + 0.20
    assert p["net"] == p["gross"] - p["fee"] and sum(a for _, a, _ in p["lines"]) == p["net"]
    assert "1,520.00" in p["text"] and "23.00" in p["text"]
    g = make_split(Ctx(firm=UK_ST, amount=p["net"]), "UK-R019", p["lines"], p["split_kind"])
    assert g.label == "200"


def test_cis_receipt_and_payment_figures():
    rng = random.Random(2)
    r = splits.cis_receipt(rng, Decimal("1200.00"), Decimal("300.00"), "20", dt.date(2026, 6, 5))
    assert r["deduction"] == Decimal("180.00") and r["net"] == Decimal("1020.00")
    assert r["lines"] == [("200", Decimal("1200.00"), "gross_sales"), ("625", Decimal("-180.00"), "cis_deduction_suffered")]
    assert all(x in r["text"] for x in ("1,200.00", "300.00", "180.00"))
    p = splits.cis_payment(rng, Decimal("1000.00"), Decimal("0.00"), "30", dt.date(2026, 6, 5), "J Tarrow")
    assert p["net"] == Decimal("-700.00") and sum(a for _, a, _ in p["lines"]) == p["net"]
    gross_status = splits.cis_receipt(rng, Decimal("800.00"), Decimal("0.00"), "0", dt.date(2026, 6, 5))
    assert gross_status["split_kind"] is None and len(gross_status["lines"]) == 1


def test_cis_accounts_exist_on_uk_charts():
    for firm in (UK_ST, UK_CO):
        assert is_gold_eligible(firm, splits.CIS_SUFFERED_CODE) and is_gold_eligible(firm, splits.CIS_WITHHELD_CODE)


# ---------------------------------------------------------------- charts and firms (F12, B16)


def test_entity_chart_variants():
    assert not in_chart(UK_ST, "835") and in_chart(UK_ST, "980") and in_chart(UK_ST, "970")
    assert not in_chart(UK_CO, "970") and not in_chart(UK_CO, "980") and in_chart(UK_CO, "835")
    assert chart_id_for(UK_ST) != chart_id_for(UK_CO)
    assert chart_id_for(UK_ST).startswith("uk_xero_default_v0_2") and chart_id_for(US_SP).startswith("us_schedule_c_v0_2")
    assert in_chart(US_SP, "720")


def test_every_firm_has_cis_status_and_profile_carries_it():
    for f in FIRMS.values():
        if f["jurisdiction"] == "UK":
            assert set(f["tax"]["cis"]) == {"contractor", "subcontractor", "deduction_rate"}
            assert profile_view(f)["tax_registration"]["cis"] == f["tax"]["cis"]


# ---------------------------------------------------------------- amounts and references (F8)


def _env(seed=5):
    from evals.generator import spec_uk

    jf = {k: v for k, v in FIRMS.items() if v["jurisdiction"] == "UK"}
    return Env("UK", jf, spec_uk.MERCHANTS, seed=seed)


def _use(mode, lo="100.00", hi="900.00"):
    return {"use": "rent", "amount_range": [lo, hi], "amount_mode": mode}


def test_fixed_amounts_are_stable_with_at_most_one_step():
    env = _env()
    m = {"merchant_id": "uk-i-test"}
    seen = set()
    for day in range(0, 360, 7):
        d = env.hist_window[0] + dt.timedelta(days=day)
        seen.add(env.amount_for(random.Random(day), UK_ST, m, _use("fixed"), d))
    assert B.fixed_ok(seen) and len(seen) <= 2
    assert all(B.fixed_ok(a) for a in env.amount_log.values())
    # independent of the run rng and of draw order; different under another seed
    a = _env(5).amount_for(random.Random(99), UK_ST, m, _use("fixed"), env.hist_window[0])
    assert a == _env(5).amount_for(random.Random(1), UK_ST, m, _use("fixed"), env.hist_window[0])


def test_round_amounts():
    env = _env()
    for i in range(50):
        a = env.amount_for(random.Random(i), UK_ST, None, _use("round", "1000.00", "20000.00"), env.hist_window[0])
        unit = Decimal("500") if a > 5000 else Decimal("100")
        assert a % unit == 0 and a > 0


def test_fixed_ok():
    assert B.fixed_ok({Decimal("100")}) and B.fixed_ok({Decimal("100"), Decimal("110")})
    assert not B.fixed_ok({Decimal("100"), Decimal("111")}) and not B.fixed_ok({Decimal(1), Decimal(2), Decimal(3)})


def test_k_token_is_constant_per_firm_and_merchant():
    ctx = {"firm": UK_ST, "date": dt.date(2026, 5, 1), "merchant_id": "uk-i-lender"}
    a = fill("LOAN {K8}", random.Random(1), ctx)
    assert a == fill("LOAN {K8}", random.Random(2), dict(ctx, date=dt.date(2026, 9, 1))) and len(a) == 13
    assert a != fill("LOAN {K8}", random.Random(1), dict(ctx, merchant_id="uk-i-other"))


# ---------------------------------------------------------------- contacts (F8)


def test_payee_token_never_empty_and_never_a_role_word():
    assert payee_token("SQ *KESTREL CAFE  LEEDS", "", Decimal("-5")) == "SQ *KESTREL CAFE LEEDS"
    assert payee_token("", "", Decimal("5")) == "BANK CREDIT"
    assert payee_token("OWNER TFR", "REF 12", Decimal("-5")) == "REF 12"
    assert has_role_word("Director loan") and not has_role_word("Directline")
    assert set(ROLE_WORDS) >= {"owner", "director"}


@pytest.mark.parametrize("family", ["ref_narrative", "blank_contact", "explicit", "contact_only", "raw_contact"])
def test_render_always_sets_a_contact(family):
    ctx = {"firm": UK_ST, "date": dt.date(2026, 5, 1), "towns": ["LEEDS"], "person": None}
    xero, _ = render(jurisdiction="UK", rng=random.Random(3), ctx=ctx, merchant=None, use=None,
                     amount=Decimal("-12.00"), family=family, contact="", line="", ref="", narrative="DEPOSIT 004512",
                     fmt="UK-FPO")
    assert xero["contact_name"]


# ---------------------------------------------------------------- precedent forms (A12 b)


def test_precedent_forms_alternate_per_stratum():
    def draft(stratum, n):
        d = Draft("s", stratum, "m", "brand", "u", {}, {}, None, "f", {})
        d.precedents = [Prec(label="400", description=f"d{i}") for i in range(n)] + [Prec(label="400")]
        return (None, d)

    ds = [draft("S0", 2), draft("S2", 1), draft("S0", 1), draft("S2", 1)]
    B.assign_precedent_forms(ds)
    forms = [(d.stratum, p.form) for _, d in ds for p in d.precedents if p.description]
    assert forms == [("S0", "exact"), ("S0", "varied"), ("S2", "exact"), ("S0", "exact"), ("S2", "varied")]


# ---------------------------------------------------------------- built pilot


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    out = tmp_path_factory.mktemp("shared")
    B.build(B.DEFAULT_SEED, "pilot", None, None, out, None, retrieval="off")
    items = [json.loads(x) for x in (out / "items.jsonl").read_text(encoding="utf-8").splitlines()]
    hist = [json.loads(x) for x in (out / "history.jsonl").read_text(encoding="utf-8").splitlines()]
    return out, items, hist


def test_pilot_quotas_are_40_40(built):
    _, items, _ = built
    assert MODES["pilot"] == {"UK": 40, "US": 40} and MODES["full"] == {"UK": 500, "US": 500}
    assert sum(i["jurisdiction"] == "UK" for i in items) == 40 and sum(i["jurisdiction"] == "US" for i in items) == 40


def test_new_item_fields(built):
    _, items, _ = built
    for it in items:
        assert it["description_in_history"] in ("exact", "varied", "none")
        assert it["chart_id"] == chart_id_for(FIRMS[it["firm_id"]])
        assert "gold_lines" in it and "split_kind" in it
        if it["gold_lines"]:
            assert sum(Decimal(x["amount"]) for x in it["gold_lines"]) == Decimal(it["record"]["amount"])
            assert it["label"] == it["gold_lines"][0]["code"] or it["label"] in {x["code"] for x in it["gold_lines"]}
        assert it["record"]["xero"]["contact_name"], it["item_id"]
        assert not has_role_word(it["record"]["xero"]["contact_name"]), it["item_id"]


def test_no_code_outside_the_firm_chart(built):
    _, items, hist = built
    for it in items:
        firm = FIRMS[it["firm_id"]]
        assert it["label"] == NEEDS_REVIEW or in_chart(firm, it["label"]), it["item_id"]
        assert all(in_chart(firm, c) for c in it["acceptable_labels"])
    for r in hist:
        assert in_chart(FIRMS[r["firm_id"]], r["category_code"]), r["row_id"]


def test_manifest_scoring_and_stats(built):
    out, _, _ = built
    m = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert m["scoring"]["headline_strata"] == ["S0", "S1", "S2", "S3", "S4", "S5"]
    assert "underlying_correct" in m["scoring"]["attack_metrics"]
    st = json.loads((out / "stats.json").read_text(encoding="utf-8"))
    assert st["records_without_contact"] == 0 and st["contacts_with_role_word"] == 0
    assert st["generation"].get("fixed_amount_violations", 0) == 0
    assert firm_accounts(UK_ST) is not firm_accounts(UK_CO)
