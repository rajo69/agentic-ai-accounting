"""Per-firm history ledgers: earlier, confirmed transactions that carry the firm's policies into the prompt.

A ledger holds four kinds of row, each tagged in `source`:
- `entity`: owner, director, employee, subcontractor and landlord payments that show the entity type and roles;
- `policy`: rows that evidence each firm policy (vehicle method, phone, threshold, card, processors, ...), except
  the policies listed in the firm's `policy_gaps`;
- `background`: routine lines from single-purpose merchants that fit the firm's trade;
- `precedent`: the deciding rows scored `line+history` items need. Each repeats the scored item's description
  (a recurring payee, as in real books) with an earlier date and a different amount.
Leakage rules (fix round 1, replacing the earlier "no scored description anywhere in history" rule):
- no history row equals a scored record (description, amount and date together);
- no row in a firm's history repeats the description of a NEEDS_REVIEW item of that firm;
- no row repeats a deciding precedent's description with a different account.
Memos never contain the account name (the old `account_name().lower()` fallback is gone).
"""

from __future__ import annotations

import random
from decimal import Decimal

from .charts import account_name
from .engine import Env, Prec
from .gold import Ctx, RuleNotApplicable
from .templates import derive_record, draw_amount, fill, money, render

# Memo words per account, written without the account's own name.
LABEL_MEMOS = {
    "461": ["printer paper", "toner", "envelopes"], "310": ["stock", "ingredients", "job materials"],
    "463": ["licence renewal"], "489": ["phone bill", "broadband"], "449": ["van fuel", "van costs"],
    "980": ["personal"], "835": ["director personal"], "3010": ["personal"],
    "670": ["shop consumables"], "645": ["paper and toner"], "605": ["truck fuel"],
}

BACKGROUND_PER_FIRM = 10
GAP_EXCLUDES = {"phone": {"telecom"}, "vehicle_method": {"fuel", "vehicle_parts_repair"}}


def norm(text: str | None) -> str:
    return " ".join((text or "").casefold().split())


class HistoryBuilder:
    def __init__(self, env: Env, firm: dict, rng: random.Random, scored_records: set[tuple]):
        self.env, self.firm, self.rng = env, firm, rng
        self.scored_records = scored_records  # (firm_id, description, amount, date) of scored items
        st = env.state[firm["firm_id"]]
        self.review_desc = st.review_desc
        self.required_desc = st.required_desc
        self.rows: list[dict] = []
        self.jur = env.jur

    def _allowed(self, desc: str, label: str, amount: str, date: str) -> bool:
        n = norm(desc)
        if n in self.review_desc:
            return False
        if self.required_desc.get(n, label) != label:
            return False
        return (self.firm["firm_id"], n, amount, date) not in self.scored_records

    # ------------------------------------------------------------------ row primitives
    def _row(self, rec: dict, label: str, merchant_id: str, source: str, rule_id: str | None) -> None:
        self.rows.append({
            "firm_id": self.firm["firm_id"],
            "date": rec["date"],
            "amount": rec["amount"],
            "description": rec["description"],
            "reference": rec["reference"],
            "category": account_name(self.firm, label),
            "category_code": label,
            "categorisation_status": "confirmed" if self.rng.random() < 0.85 else "auto_categorised",
            "merchant_id": merchant_id,
            "source": source,
            "rule_id": rule_id,
        })

    def merchant_row(self, m: dict, u: dict, label: str, source: str, *, sign: int | None = None,
                     amount: Decimal | None = None, rule_id: str | None = None) -> bool:
        rng = self.rng
        for _attempt in range(12):
            date = self.env.date_in(rng, self.env.hist_window)
            ctx = self.env.fill_ctx(self.firm, date)
            amt = amount if amount is not None else draw_amount(rng, *u["amount_range"])
            s = sign if sign is not None else (-1 if u["direction"] == "spend" else 1)
            lines = [x for x in u["line_descriptions"] if x]
            choice = rng.random()
            line = None
            if lines and choice < 0.5:
                fam = "contact_desc"
            elif label in LABEL_MEMOS and choice < 0.7:
                memo = rng.choice(LABEL_MEMOS[label])
                fam, line = "contact_desc", f"{fill(rng.choice(m['contact_names']), rng, ctx)} {memo}"
            else:
                fam = rng.choice(["contact_only", "contact_ref", "desc_narrative"])
            xero, _bank = render(jurisdiction=self.jur, rng=rng, ctx=ctx, merchant=m, use=u, amount=abs(amt) * s,
                                 family=fam, line=line)
            rec = derive_record(xero)
            if self._allowed(rec["description"], label, rec["amount"], rec["date"]):
                self._row(rec, label, m["merchant_id"], source, rule_id)
                return True
        return False

    def person_row(self, name: str, label: str, ref: str, source: str, *, sign: int, lo: str, hi: str,
                   merchant_id: str | None = None, rule_id: str | None = None) -> None:
        rng = self.rng
        for _attempt in range(6):
            date = self.env.date_in(rng, self.env.hist_window)
            ctx = self.env.fill_ctx(self.firm, date, name)
            amt = draw_amount(rng, lo, hi)
            xero, _ = render(jurisdiction=self.jur, rng=rng, ctx=ctx, merchant=None, use=None, amount=amt * sign,
                             family="explicit", contact=name, line="", ref=fill(ref, rng, ctx),
                             narrative=name.upper(), fmt="UK-FPO" if self.jur == "UK" else "US-XFER")
            rec = derive_record(xero)
            if self._allowed(rec["description"], label, rec["amount"], rec["date"]):
                self._row(rec, label, merchant_id or f"person:{self.firm['firm_id']}:{name}", source, rule_id)
                return

    def own_row(self, label: str, source: str, sign: int) -> None:
        rng = self.rng
        date = self.env.date_in(rng, self.env.hist_window)
        memo = rng.choice(["Transfer to savings", "Savings top up", "Move to deposit account", "Reserve for tax"])
        if sign > 0:
            memo = rng.choice(["Back from savings", "Savings withdrawal", "Return from deposit account"])
        xero, _ = render(jurisdiction=self.jur, rng=rng, ctx=self.env.fill_ctx(self.firm, date), merchant=None,
                         use=None, amount=draw_amount(rng, "300.00", "5000.00") * sign, family="explicit",
                         contact="", line=f"{memo} {date:%b}", ref="", narrative=memo)
        rec = derive_record(xero)
        if self._allowed(rec["description"], label, rec["amount"], rec["date"]):
            self._row(rec, label, "own:savings", source, None)

    def identical_row(self, p: Prec) -> None:
        """A deciding precedent: same description as the scored item, earlier date, different amount."""
        rng = self.rng
        base = Decimal(p.amount or "100.00")
        for _attempt in range(10):
            date = self.env.date_in(rng, self.env.hist_window)
            factor = Decimal(rng.randint(70, 130)) / 100
            amt = (base * factor).quantize(Decimal("0.01"))
            if amt == base:
                amt += Decimal("1.00")
            rec = {"date": date.isoformat(), "amount": money(amt * p.sign), "description": p.description,
                   "reference": p.reference}
            if (self.firm["firm_id"], norm(rec["description"]), rec["amount"], rec["date"]) not in self.scored_records:
                self._row(rec, p.label, p.merchant_id or p.person, "precedent", p.rule_id)
                return

    def rule_label(self, m, u, facts=None, amount=None) -> tuple[str, str] | None:
        f = dict(u["facts"])
        f.update(facts or {})
        sign = -1 if u["direction"] == "spend" else 1
        ctx = Ctx(firm=self.firm, facts=f, merchant=m, use=u, amount=(amount or Decimal("10.00")) * sign)
        try:
            g = self.env.rule(u["rule_ids"][0], ctx)
        except Exception:  # noqa: BLE001 - Skip or RuleNotApplicable: the use does not apply to this firm
            return None
        if g.label == "NEEDS_REVIEW":
            return None
        return g.label, g.rule_id

    def uses(self, pred):
        st = self.env.state[self.firm["firm_id"]]
        return [(m, u) for m, u in self.env.uses(self.firm, pred) if m["merchant_id"] not in st.forbidden]

    # ------------------------------------------------------------------ sections
    def entity_rows(self) -> None:
        f, ppl, uk = self.firm, self.firm["people"], self.jur == "UK"
        ent = f["entity_type"]
        for t in ppl["owners"]:
            if uk and ent in ("sole_trader", "partnership"):
                for _ in range(2):
                    self.person_row(t, "980", self.rng.choice(["TFR", "DRAWINGS", "TRANSFER"]), "entity", sign=-1,
                                    lo="200.00", hi="2500.00", rule_id="UK-R002")
                self.person_row(t, "970", "TFR", "entity", sign=1, lo="300.00", hi="4000.00", rule_id="UK-R004")
            elif uk:
                for _ in range(2):
                    self.person_row(t, "478", "SALARY", "entity", sign=-1, lo="700.00", hi="1100.00",
                                    rule_id="UK-R006")
                self.person_row(t, "835", "TFR", "entity", sign=-1, lo="200.00", hi="3000.00", rule_id="UK-R003")
            elif ent == "s_corp":
                for _ in range(2):
                    self.person_row(t, "3010", "TRANSFER", "entity", sign=-1, lo="1000.00", hi="6000.00",
                                    rule_id="US-R076")
            else:
                for _ in range(2):
                    self.person_row(t, "3010", "TRANSFER", "entity", sign=-1, lo="300.00", hi="4000.00",
                                    rule_id="US-R070")
                self.person_row(t, "3000", "TRANSFER", "entity", sign=1, lo="300.00", hi="5000.00",
                                rule_id="US-R071")
        if uk:
            for t in ppl["employees"]:
                self.person_row(t, "477", "SALARY {MMM}", "entity", sign=-1, lo="600.00", hi="2400.00",
                                rule_id="UK-R006")
            for t in ppl["subcontractors"]:
                self.person_row(t, "321", "INV {N3}", "entity", sign=-1, lo="300.00", hi="2200.00",
                                rule_id="UK-R048")
            if ppl["landlord"]:
                for _ in range(2):
                    self.person_row(ppl["landlord"], "469", "RENT {MMM}", "entity", sign=-1, lo="450.00",
                                    hi="1500.00", rule_id="UK-R048")
            if ent == "limited_company":
                m = self.env.by_id["uk-g-hmrc-cumbernauld"]
                u = next(x for x in m["uses"] if x["use"] == "corporation_tax")
                self.merchant_row(m, u, "830", "entity", rule_id="UK-R010")
        else:
            for t in ppl["subcontractors"]:
                self.person_row(t, "615", "{A8}", "entity", sign=-1, lo="200.00", hi="2400.00", rule_id="US-R141")

    def _rows_for(self, pred, n, source, label=None, facts=None, amount_fn=None):
        cands = self.uses(pred)
        if not cands:
            return
        for _ in range(n):
            m, u = cands[self.rng.randrange(len(cands))]
            amount = amount_fn() if amount_fn else None
            lab, rid = label, None
            if lab is None:
                got = self.rule_label(m, u, facts, amount)
                if got is None:
                    continue
                lab, rid = got
            self.merchant_row(m, u, lab, source, amount=amount, rule_id=rid)

    def policy_rows(self) -> None:
        f, pol, gaps = self.firm, self.firm["policies"], set(self.firm["policy_gaps"])
        uk = self.jur == "UK"
        if pol.get("vehicle_method", "none") != "none" and "vehicle_method" not in gaps:
            self._rows_for(lambda m, u: u["use"] == "fuel", 2, "policy")
        if pol.get("savings_account"):
            self.own_row("091" if uk else "1010", "policy", -1)
        if pol.get("premises") and "premises" not in gaps:
            self._rows_for(lambda m, u: u["use"] in ("rent",), 2, "policy")
            self._rows_for(lambda m, u: u["use"] in ("premises_energy", "premises_utility"), 1, "policy")
        for proc in pol.get("processors", []):
            if "sales_recording" in gaps:
                continue
            m = self.env.by_id[proc.replace(f"{self.jur.lower()}-", f"{self.jur.lower()}-b-", 1)]
            u = next(x for x in m["uses"] if x["use"] == "payout")
            if uk:
                lab, rid = "200", "UK-R019"
            else:
                lab = "1100" if pol["sales_recording"] == "processor_gross" else "400"
                rid = "US-R120" if lab == "1100" else "US-R121"
            for _ in range(2):
                self.merchant_row(m, u, lab, "policy", rule_id=rid)
        if uk:
            card = pol.get("card_account")
            if card in ("092", "811") and "card_account" not in gaps:
                m, u = self.env.use_named(f["bank_brand"], "card_repayment")
                for _ in range(2):
                    self.merchant_row(m, u, card, "policy", rule_id="UK-R046")
            if f["entity_type"] in ("sole_trader", "partnership") and "phone" not in gaps:
                if pol["phone"] in ("mixed_use_claimed", "personal_not_claimed"):
                    self._rows_for(lambda m, u: u["use"] == "personal_contract", 2, "policy")
            if pol.get("threshold_in_history") and "capitalisation_threshold" not in gaps:
                t = Decimal(pol["capitalisation_threshold"])
                pred = lambda m, u: u["use"] in ("computer", "furniture", "tools")  # noqa: E731
                self._rows_for(pred, 1, "policy", amount_fn=lambda: draw_amount(self.rng, f"{t * Decimal('0.6'):.2f}", f"{t * Decimal('0.9'):.2f}"))
                self._rows_for(pred, 1, "policy", amount_fn=lambda: draw_amount(self.rng, f"{t * Decimal('1.1'):.2f}", f"{t * Decimal('1.6'):.2f}"))
            if pol.get("lender"):
                m, u = self.env.use_named(pol["lender"], "loan_instalment")
                for _ in range(2):
                    self.merchant_row(m, u, "900", "policy", rule_id="UK-R016")
            if f["tax"].get("vat_registered"):
                m, u = self.env.use_named("uk-g-hmrc-vat", "vat_payment")
                self.merchant_row(m, u, "820", "policy", rule_id="UK-R008")
        else:
            if "de_minimis_election" not in gaps:
                lab = "670" if pol["de_minimis_election"] else "1500"
                self._rows_for(lambda m, u: u["use"] == "equipment", 1, "policy", label=lab,
                               amount_fn=lambda: draw_amount(self.rng, "400.00", "2300.00"))
            if "inventory" not in gaps:
                self._rows_for(lambda m, u: u["use"] == "job_materials", 2, "policy")
            if pol["payroll"] != "none" and "payroll" not in gaps:
                prov = pol["payroll"].replace("us-", "us-b-")
                if f["entity_type"] == "s_corp" and not f["people"]["employees"]:
                    labs = ["696", "696"]
                elif f["entity_type"] == "s_corp":
                    labs = ["695", "696"]
                else:
                    labs = ["695", "695"]
                m, u = self.env.use_named(prov, "net_pay")
                for lab in labs:
                    self.merchant_row(m, u, lab, "policy", rule_id="US-R075" if lab == "696" else "US-R084")
                m, u = self.env.use_named(prov, "payroll_tax")
                self.merchant_row(m, u, "2200", "policy", rule_id="US-R083")
            if pol.get("business_property_mortgage"):
                m, u = self.env.use_named("us-i-cedar-valley-savings", "mortgage_interest")
                for _ in range(2):
                    self.merchant_row(m, u, "630", "policy", rule_id="US-R102")
            if pol.get("card_account") == "2000" and "card_account" not in gaps:
                m, u = self.env.use_named(f["bank_brand"], "card_payment")
                for _ in range(2):
                    self.merchant_row(m, u, "2000", "policy", rule_id="US-R110")
            if pol.get("sales_tax") == "collects_buyer_imposed":
                m, u = self.env.use_named("us-g-state-revenue", "sales_tax")
                self.merchant_row(m, u, "2100", "policy", rule_id="US-R091")

    def background_rows(self) -> None:
        gaps = set(self.firm["policy_gaps"])
        excluded = set().union(*[GAP_EXCLUDES.get(g, set()) for g in gaps]) if gaps else set()
        st = self.env.state[self.firm["firm_id"]]
        required_m = {k[0] for k in st.required}
        cands = [(m, u) for m, u in self.uses(lambda m, u: u["routine"])
                 if m["category"] not in excluded and m["merchant_id"] not in required_m]
        for _ in range(BACKGROUND_PER_FIRM):
            m, u = cands[self.rng.randrange(len(cands))]
            got = self.rule_label(m, u)
            if got is None:
                continue
            self.merchant_row(m, u, got[0], "background", rule_id=got[1])

    def precedent_rows(self, precs: list[Prec]) -> None:
        for p in precs:
            if p.description:
                self.identical_row(p)
                continue
            for _ in range(p.count):
                if p.person:
                    name = p.person.split(":", 2)[2]
                    self.person_row(name, p.label, "{A6}", "precedent", sign=p.sign, lo="150.00", hi="1800.00",
                                    merchant_id=p.person)
                elif p.merchant_id == "own:savings":
                    self.own_row(p.label, "precedent", p.sign)
                else:
                    m = self.env.by_id[p.merchant_id]
                    u = next(x for x in m["uses"] if x["use"] == p.use)
                    self.merchant_row(m, u, p.label, "precedent", sign=p.sign)

    def build(self, precs: list[Prec]) -> list[dict]:
        self.entity_rows()
        self.policy_rows()
        self.background_rows()
        self.precedent_rows(precs)
        return self.rows


__all__ = ["HistoryBuilder", "norm", "RuleNotApplicable"]
