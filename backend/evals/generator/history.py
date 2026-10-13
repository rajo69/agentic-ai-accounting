"""Per-firm history ledgers: earlier, confirmed transactions that carry the firm's policies into the prompt.

A ledger holds four kinds of row, each tagged in `source`:
- `entity`: owner, director, employee, subcontractor and landlord payments that show the entity type and roles;
- `policy`: rows that evidence each firm policy (vehicle method, phone, threshold, card, processors, CIS, ...),
  except the policies listed in the firm's `policy_gaps`;
- `background`: routine lines from single-purpose merchants that fit the firm's trade;
- `precedent`: the rows scored items rely on. A deciding precedent (`Prec.description` set) has an earlier date and
  either repeats the scored description (`precedent_form` `exact`, a recurring payee as in real books) or names the
  same payee another recognisable way (`varied`, A12 b): a catalogue contact, raw contact, narrative or other line of
  the same use, or for a person another form of the name. A varied row counts only if it ranks in the top 5 for the
  scored description under simulated retrieval (checked in a final pass when an embedder is given); otherwise the
  next candidate is tried, then the exact form (counted in `varied_fallbacks`). Other precedent rows are tagged
  from the data: `exact` when their description is a scored description of the firm, else `varied`.
Leakage rules (fix round 1, replacing the earlier "no scored description anywhere in history" rule):
- no history row equals a scored record (description, amount and date together);
- no row in a firm's history repeats the description of a NEEDS_REVIEW item of that firm;
- no row repeats a deciding precedent's description with a different account.
Added in fix round 2: no row other than an exact precedent repeats the scored description of a varied precedent
(otherwise the item would still find its own description in history), a varied candidate is never another scored
description of the firm, and precedent rows sharing a description share one account.
Amounts (F8) go through `Env.amount_for`, so `fixed` uses show one amount (plus at most one price step) across
history and scored items, and owner capital injections are round. Split rows (B5, B16) carry `lines` in the
`gold_lines` shape with `category_code` the primary line: UK processor payouts (UK-R019) and CIS receipts and
payments under deduction (UK-R067, UK-R069). Every row has `lines` and `precedent_form` (null when not applicable).
Memos never contain the account name (the old `account_name().lower()` fallback is gone).
"""

from __future__ import annotations

import datetime as dt
import random
from collections import Counter
from decimal import Decimal

from . import splits
from .charts import account_name, firm_accounts, in_chart
from .engine import Env, Prec
from .gold import Ctx, RuleNotApplicable
from .retrieval import TOP_K, doc_text, provisional_row_ids, rank_rows
from .templates import FEE_FORMATS, MONTHS, apply_style, derive_record, draw_amount, fill, money, render

# Memo words per account, written without the account's own name.
LABEL_MEMOS = {
    "461": ["printer paper", "toner", "envelopes"], "310": ["stock", "ingredients", "job materials"],
    "463": ["licence renewal"], "489": ["phone bill", "broadband"], "449": ["van fuel", "van costs"],
    "980": ["personal"], "835": ["director personal"], "3010": ["personal"],
    "670": ["shop consumables"], "645": ["paper and toner"], "605": ["truck fuel"],
}

BACKGROUND_PER_FIRM = 10
GAP_EXCLUDES = {"phone": {"telecom"}, "vehicle_method": {"fuel", "vehicle_parts_repair"}}
# Owner money paid in (UK 970, US 3000): round amounts (F8).
CAPITAL_CODES = {"970", "3000"}
# Marketplaces stay single-code 200 (UK-R066); every other UK payout use is split (UK-R019).
MARKETPLACES_UK = {"uk-b-etsy", "uk-b-amazon"}
# Bank-text abbreviations for payees that are only a bank token (payer:, payee:, atm, own:, check:): the varied form
# of "PAYMENT 3369" is "PMT 3369". Each pair works both ways.
ABBREV = {"PAYMENT": "PMT", "TRANSFER": "TFR", "DEPOSIT": "DEP", "CREDIT": "CR", "RECEIVED": "RCVD",
          "SAVINGS": "SAV", "BUSINESS": "BUS", "ONLINE": "ONLN", "MOBILE": "MOB", "LNK": "LINK", "CHECK": "CHK",
          "WITHDRAWAL": "WDL", "ACCOUNT": "ACCT", "FROM": "FRM"}
ABBREV.update({v: k for k, v in list(ABBREV.items())})
# Invented contractors paying a CIS subcontractor firm, used only when the catalogue has no CIS payer use.
CIS_CONTRACTORS = ("Ashcombe Contracting Ltd", "Marlstone Build Ltd", "Penhallow Construction Ltd")
_MONTH_WORDS = {m.casefold() for m in MONTHS}


def norm(text: str | None) -> str:
    return " ".join((text or "").casefold().split())


def form_key(text: str | None) -> str:
    """`norm` without the firm's memo styling (commas, slashes, a trailing month), so a styled copy of the scored
    line does not pass as a varied form."""
    words = norm(text).replace(" / ", " ").replace(",", "").split()
    if len(words) > 1 and words[-1] in _MONTH_WORDS:
        words = words[:-1]
    return " ".join(words)


def _swap_abbrev(text: str, first_only: bool) -> str:
    out, done = [], False
    for tok in text.split(" "):
        key = tok.upper()
        if key in ABBREV and not (first_only and done):
            new = ABBREV[key]
            out.append(new if tok.isupper() else new.title())
            done = True
        else:
            out.append(tok)
    return " ".join(out)


class HistoryBuilder:
    def __init__(self, env: Env, firm: dict, rng: random.Random, scored_records: set[tuple], embedder=None):
        self.env, self.firm, self.rng = env, firm, rng
        self.scored_records = scored_records  # (firm_id, description, amount, date) of scored items
        self.embedder = embedder  # retrieval.Embedder or None (retrieval off: the first valid candidate is kept)
        st = env.state[firm["firm_id"]]
        self.review_desc = st.review_desc
        self.required_desc = st.required_desc
        self.scored_desc = {d for f, d, _a, _t in scored_records if f == firm["firm_id"]}
        self.rows: list[dict] = []
        self.jur = env.jur
        self.blocked: set[str] = set()  # scored descriptions of varied precedents: no other row may repeat them
        self.prec_desc: dict[str, str] = {}  # description -> account of precedent rows written so far
        self.varied: list[dict] = []  # pending varied rows: {"row", "prec", "cands"}
        self.deciding: list[dict] = []  # deciding precedent rows, in the order written
        self.varied_fallbacks = 0
        self.deciding_forms: Counter = Counter()  # final form of each deciding precedent row

    def _allowed(self, desc: str, label: str, amount: str, date: str, source: str = "") -> bool:
        n = norm(desc)
        if n in self.review_desc or n in self.blocked:
            return False
        if self.required_desc.get(n, label) != label:
            return False
        if source == "precedent" and self.prec_desc.get(n, label) != label:
            return False
        return (self.firm["firm_id"], n, amount, date) not in self.scored_records

    # ------------------------------------------------------------------ row primitives
    def _row(self, rec: dict, label: str, merchant_id: str, source: str, rule_id: str | None, *,
             lines: list | None = None, form: str | None = None) -> dict:
        if not in_chart(self.firm, label):
            raise ValueError(f"{self.firm['firm_id']}: history row code {label} is not on the firm's chart")
        row = {
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
            "lines": lines,
            "precedent_form": form,
        }
        self.rows.append(row)
        if source == "precedent":
            self.prec_desc.setdefault(norm(rec["description"]), label)
        return row

    def _lines(self, lines) -> list[dict]:
        return splits.lines_json(lines, lambda c: account_name(self.firm, c))

    def merchant_row(self, m: dict, u: dict, label: str, source: str, *, sign: int | None = None,
                     amount: Decimal | None = None, rule_id: str | None = None) -> bool:
        rng = self.rng
        for _attempt in range(12):
            date = self.env.date_in(rng, self.env.hist_window)
            ctx = self.env.fill_ctx(self.firm, date)
            amt = amount if amount is not None else self.env.amount_for(rng, self.firm, m, u, date)
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
            if self._allowed(rec["description"], label, rec["amount"], rec["date"], source):
                self._row(rec, label, m["merchant_id"], source, rule_id)
                return True
        return False

    def person_row(self, name: str, label: str, ref: str, source: str, *, sign: int, lo: str, hi: str,
                   merchant_id: str | None = None, rule_id: str | None = None) -> None:
        rng = self.rng
        contact = name
        if norm(name) in self.blocked:
            # The name is the scored description of a varied precedent: show this payment as "Surname I".
            initial, _, surname = name.partition(" ")
            contact = f"{surname} {initial}" if surname else name
        mode = "round" if label in CAPITAL_CODES and sign > 0 else "range"
        pseudo_use = {"use": f"person:{label}", "amount_range": [lo, hi], "amount_mode": mode}
        for _attempt in range(6):
            date = self.env.date_in(rng, self.env.hist_window)
            ctx = self.env.fill_ctx(self.firm, date, name)
            amt = self.env.amount_for(rng, self.firm, None, pseudo_use, date)
            xero, _ = render(jurisdiction=self.jur, rng=rng, ctx=ctx, merchant=None, use=None, amount=amt * sign,
                             family="explicit", contact=contact, line="", ref=fill(ref, rng, ctx),
                             narrative=name.upper(), fmt="UK-FPO" if self.jur == "UK" else "US-XFER")
            rec = derive_record(xero)
            if self._allowed(rec["description"], label, rec["amount"], rec["date"], source):
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
        if self._allowed(rec["description"], label, rec["amount"], rec["date"], source):
            self._row(rec, label, "own:savings", source, None)

    # ------------------------------------------------------------------ split rows (B5, B16)
    def payout_row(self, m: dict, u: dict, source: str, rule_id: str = "UK-R019") -> bool:
        """A processor payout split 200 + 404: the statement text is the line, the amount is the net."""
        rng = self.rng
        for _attempt in range(8):
            date = self.env.date_in(rng, self.env.hist_window)
            gross = self.env.amount_for(rng, self.firm, m, u, date)
            try:
                pay = splits.processor_payout(rng, gross, m["merchant_id"], date, m["name"], u.get("facts"))
            except ValueError:
                continue
            ctx = self.env.fill_ctx(self.firm, date)
            xero, _ = render(jurisdiction=self.jur, rng=rng, ctx=ctx, merchant=m, use=u, amount=pay["net"],
                             family="explicit", contact=fill(rng.choice(m["contact_names"]), rng, ctx),
                             line=pay["text"])
            rec = derive_record(xero)
            if self._allowed(rec["description"], "200", rec["amount"], rec["date"], source):
                self._row(rec, "200", m["merchant_id"], source, rule_id, lines=self._lines(pay["lines"]))
                return True
        return False

    def _cis_payers(self) -> list[tuple[dict, dict]]:
        return self.uses(lambda m, u: u["direction"] == "receive"
                         and bool({"UK-R067", "UK-R068"} & set(u["rule_ids"])))

    def cis_receipt_row(self, rate: str, source: str, payer: tuple[dict, dict] | None = None) -> bool:
        """A CIS subcontractor paid by a contractor: split 200 + 625 under deduction, single 200 at gross status."""
        rng = self.rng
        payers = [payer] if payer else self._cis_payers()
        for _attempt in range(8):
            date = self.env.date_in(rng, self.env.hist_window)
            ctx = self.env.fill_ctx(self.firm, date)
            if payers:
                m, u = payers[rng.randrange(len(payers))]
                gross = self.env.amount_for(rng, self.firm, m, u, date)
                contact, mid, narrative = fill(rng.choice(m["contact_names"]), rng, ctx), m["merchant_id"], None
            else:
                m = u = None
                name = CIS_CONTRACTORS[rng.randrange(len(CIS_CONTRACTORS))]
                gross = draw_amount(rng, "600.00", "4800.00")
                contact, mid, narrative = name, f"cis:{self.firm['firm_id']}:{name}", name.upper()
            materials = Decimal(0) if rng.random() < 0.3 else (gross * Decimal(rng.randint(5, 40)) / 100).quantize(splits.Q)
            rec_cis = splits.cis_receipt(rng, gross, materials, rate, date)
            xero, _ = render(jurisdiction=self.jur, rng=rng, ctx=ctx, merchant=m, use=u, amount=rec_cis["net"],
                             family="explicit", contact=contact, line=rec_cis["text"], narrative=narrative,
                             ref=None if m else "", fmt=None if m else "UK-FPI")
            rec = derive_record(xero)
            if self._allowed(rec["description"], "200", rec["amount"], rec["date"], source):
                split = rec_cis["split_kind"] is not None
                self._row(rec, "200", mid, source, "UK-R067" if split else "UK-R068",
                          lines=self._lines(rec_cis["lines"]) if split else None)
                return True
        return False

    def cis_payment_row(self, name: str, source: str, rate: str = "20") -> bool:
        """A CIS contractor paying a subcontractor net of the deduction: split 321 + 827."""
        rng = self.rng
        for _attempt in range(8):
            date = self.env.date_in(rng, self.env.hist_window)
            ctx = self.env.fill_ctx(self.firm, date, name)
            gross = draw_amount(rng, "400.00", "3600.00")
            materials = Decimal(0) if rng.random() < 0.4 else (gross * Decimal(rng.randint(5, 35)) / 100).quantize(splits.Q)
            pay = splits.cis_payment(rng, gross, materials, rate, date, name)
            xero, _ = render(jurisdiction=self.jur, rng=rng, ctx=ctx, merchant=None, use=None, amount=pay["net"],
                             family="explicit", contact=name, line=pay["text"], ref=fill("CIS {MMM}", rng, ctx),
                             narrative=name.upper(), fmt="UK-FPO")
            rec = derive_record(xero)
            if self._allowed(rec["description"], "321", rec["amount"], rec["date"], source):
                split = pay["split_kind"] is not None
                self._row(rec, "321", f"person:{self.firm['firm_id']}:{name}", source,
                          "UK-R069" if split else "UK-R055", lines=self._lines(pay["lines"]) if split else None)
                return True
        return False

    def _runs_payroll(self) -> bool:
        """UK-R070: the history shows payroll through net pay to employees (477) or a director's salary (478)."""
        return bool(self.firm["people"]["employees"]) or self.firm["entity_type"] == "limited_company"

    def cis_hmrc_row(self) -> None:
        """A contractor paying withheld CIS to HMRC with its Accounts Office reference: 827, or 825 with payroll."""
        rng = self.rng
        label = "825" if self._runs_payroll() else "827"
        m = self.env.by_id["uk-g-hmrc-cumbernauld"]
        aoref = self.firm["tax"].get("paye_aoref")
        if not aoref:
            from .refs import fake_paye_aoref

            aoref = fake_paye_aoref(random.Random(f"{self.firm['firm_id']}:cis-aoref"))
        for _attempt in range(8):
            date = self.env.date_in(rng, self.env.hist_window)
            ctx = self.env.fill_ctx(self.firm, date)
            ref = aoref + (fill("{YYMM}", rng, ctx) if rng.random() < 0.5 else "")
            xero, _ = render(jurisdiction=self.jur, rng=rng, ctx=ctx, merchant=m, use=None,
                             amount=-draw_amount(rng, "120.00", "2400.00"), family="explicit",
                             contact=m["contact_names"][0], line="" if rng.random() < 0.6 else fill("CIS {MMM}", rng, ctx),
                             ref=ref, fmt="UK-FPO")
            rec = derive_record(xero)
            if self._allowed(rec["description"], label, rec["amount"], rec["date"], "policy"):
                self._row(rec, label, m["merchant_id"], "policy", "UK-R070")
                return

    # ------------------------------------------------------------------ deciding precedents (A12 b)
    def _catalogue_use(self, p: Prec) -> tuple[dict | None, dict | None]:
        m = self.env.by_id.get(p.merchant_id or "")
        u = next((x for x in m["uses"] if x["use"] == p.use), None) if m else None
        return m, u

    def _precedent_amount(self, p: Prec, m: dict | None, u: dict | None, date: dt.date) -> Decimal:
        """Unsigned amount of a deciding precedent row: the use's fixed (or round) amount when it has one (F8),
        else the scored amount times 0.7 to 1.3 and never equal to it."""
        if u is not None and u.get("amount_mode", "range") != "range":
            return self.env.amount_for(self.rng, self.firm, m, u, date)
        base = Decimal(p.amount or "100.00")
        amt = (base * Decimal(self.rng.randint(70, 130)) / 100).quantize(Decimal("0.01"))
        return amt + Decimal("1.00") if amt == base else amt

    def _usable(self, desc: str, p: Prec) -> bool:
        n = norm(desc)
        if not n or form_key(desc) == form_key(p.description) or n in self.scored_desc:
            return False
        if n in self.review_desc or n in self.blocked or self.required_desc.get(n, p.label) != p.label:
            return False
        if self.prec_desc.get(n, p.label) != p.label:
            return False
        low = desc.casefold()
        return not any(" " in a["name"] and a["name"].casefold() in low for a in firm_accounts(self.firm).values())

    def varied_candidates(self, p: Prec, date: dt.date) -> list[str]:
        """Other recognisable forms of the precedent's payee, in a fixed order, each filled once and filtered."""
        mid = p.merchant_id or p.person or ""
        rng = self.rng
        m, u = self._catalogue_use(p)
        if mid.startswith("person:"):
            name = mid.split(":", 2)[2]
            initial, _, surname = name.partition(" ")
            word = (p.reference or "").split(" ")[0]
            word = word if word.isalpha() and word.isupper() and len(word) <= 8 else ""
            prefix = ""
            at = (p.description or "").find(f"{initial} {surname[:3]}")
            if at > 0:
                prefix = p.description[:at]  # "Zelle Payment To ", "Cash App*"
            raw = [f"{prefix}{surname} {initial}" if prefix else "", name, f"{surname} {initial}",
                   f"{name} {word}" if word else "", f"{initial}. {surname}"]
        elif m is not None:
            ctx = dict(self.env.fill_ctx(self.firm, date), merchant_id=m["merchant_id"])
            pats = list(m["contact_names"]) + list(m["raw_contact_names"])
            pats += list((u or {}).get("narratives") or m["narratives"])
            raw = [fill(x, rng, ctx).strip() for x in pats if x and "{PERSON}" not in x]
            fmt = (u or {}).get("bank_format") or m.get("bank_format")
            for x in (u or {}).get("line_descriptions", []):
                if x and "{PERSON}" not in x:
                    line = fill(x, rng, ctx)
                    if fmt not in FEE_FORMATS:
                        line = apply_style(line, self.firm.get("memo_style", "plain"), date)
                    raw.append(line.strip())
        else:
            raw = [_swap_abbrev(p.description, False), _swap_abbrev(p.description, True)]
        seen, cands = set(), []
        for desc in raw:
            n = norm(desc)
            if n not in seen and self._usable(desc, p):
                seen.add(n)
                cands.append(desc)
        return cands

    def identical_row(self, p: Prec) -> None:
        """A deciding precedent: earlier date, the use's fixed amount or a different amount, and the scored
        description (`exact`) or another form of the same payee (`varied`, falling back to exact)."""
        rng = self.rng
        m, u = self._catalogue_use(p)
        mid = p.merchant_id or p.person
        want_varied = p.form == "varied"
        if want_varied and (p.lines or norm(p.description) not in self.blocked):
            # A split statement has one form; a description also placed exact for another item cannot vary.
            want_varied = False
            self.varied_fallbacks += 1
        for _attempt in range(10):
            date = self.env.date_in(rng, self.env.hist_window)
            if p.lines:
                amt = sum(Decimal(a) for _c, a, _r in p.lines)  # the statement figures fix the amount
                lines = self._lines(p.lines)
            else:
                amt, lines = self._precedent_amount(p, m, u, date) * p.sign, None
            rec = {"date": date.isoformat(), "amount": money(amt), "description": p.description,
                   "reference": p.reference}
            if want_varied:
                cands = self.varied_candidates(p, date)
                ref = None if norm(p.reference) == norm(p.description) else p.reference
                while cands:
                    desc = cands.pop(0)
                    if (self.firm["firm_id"], norm(desc), rec["amount"], rec["date"]) in self.scored_records:
                        continue
                    row = self._row(dict(rec, description=desc, reference=ref), p.label, mid, "precedent",
                                    p.rule_id, form="varied")
                    self.varied.append({"row": row, "prec": p, "cands": cands})
                    self.deciding.append(row)
                    return
                want_varied = False
                self.varied_fallbacks += 1
            if (self.firm["firm_id"], norm(rec["description"]), rec["amount"], rec["date"]) not in self.scored_records:
                self.deciding.append(self._row(rec, p.label, mid, "precedent", p.rule_id, lines=lines,
                                               form="exact"))
                return

    def _to_exact(self, entry: dict) -> None:
        row, p = entry["row"], entry["prec"]
        row.update(description=p.description, reference=p.reference, precedent_form="exact")
        self.varied_fallbacks += 1

    def check_varied(self) -> None:
        """Final pass (A12 b retrieval check): every varied row must rank in the top 5 for its scored description
        against the firm's full history, with ties broken by the row ids build.py will assign. A failing row takes
        its next candidate, then the exact form. Repeats until stable, since one change can move another row."""
        if self.embedder is None or not self.varied:
            return
        emb, active = self.embedder, list(self.varied)
        while active:
            ids = provisional_row_ids(self.rows, self.firm["firm_id"])
            ranked = [dict(r, row_id=i) for r, i in zip(self.rows, ids)]
            vecs = [emb.vector(doc_text(r)) for r in ranked]
            pos = {id(r): k for k, r in enumerate(self.rows)}
            failing = []
            for entry in active:
                order = rank_rows(emb.vector(entry["prec"].description), ranked, vecs)
                top = [i for i, _sim in order[:TOP_K]]
                if pos[id(entry["row"])] not in top:
                    failing.append(entry)
            if not failing:
                return
            for entry in failing:
                row = entry["row"]
                while entry["cands"]:
                    desc = entry["cands"].pop(0)
                    key = (self.firm["firm_id"], norm(desc), row["amount"], row["date"])
                    if key not in self.scored_records and self._usable(desc, entry["prec"]):
                        row["description"] = desc
                        self.prec_desc.setdefault(norm(desc), row["category_code"])
                        break
                else:
                    self._to_exact(entry)
                    active.remove(entry)

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
        cis = (f["tax"].get("cis") or {}) if uk else {}
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
            if not cis.get("contractor"):
                # A CIS contractor's subcontractor payments are the split rows in cis_rows.
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

    def cis_rows(self) -> None:
        """UK CIS (B16): a subcontractor's earlier receipts and a contractor's earlier payments and HMRC payment."""
        cis = self.firm["tax"].get("cis") or {}
        if "cis" in self.firm["policy_gaps"]:
            return
        if cis.get("subcontractor"):
            for _ in range(2):
                self.cis_receipt_row(cis["deduction_rate"], "policy")
        if cis.get("contractor"):
            subs = self.firm["people"]["subcontractors"]
            for k in range(2 if subs else 0):
                self.cis_payment_row(subs[k % len(subs)], "policy")
            self.cis_hmrc_row()

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
            if uk and m["merchant_id"] not in MARKETPLACES_UK:
                for _ in range(2):
                    self.payout_row(m, u, "policy")
                continue
            if uk:
                lab, rid = "200", "UK-R066"
            else:
                lab = "1100" if pol["sales_recording"] == "processor_gross" else "400"
                rid = "US-R120" if lab == "1100" else "US-R121"
            for _ in range(2):
                self.merchant_row(m, u, lab, "policy", rule_id=rid)
        if uk:
            self.cis_rows()
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
                # Guide v0.2 (US-R050, D62 P2): capital items under the election go to 720 (Part V), not 670.
                lab = "720" if pol["de_minimis_election"] else "1500"
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

    def _split_precedent(self, p: Prec, m: dict | None, u: dict | None) -> bool:
        """Earlier rows for a split scored item show the same split (UK-R019, UK-R067, UK-R069)."""
        cis = self.firm["tax"].get("cis") or {}
        if p.split_kind == "processor_payout" and m and u:
            return self.payout_row(m, u, "precedent")
        if p.split_kind == "cis_receipt" and cis.get("deduction_rate"):
            return self.cis_receipt_row(cis["deduction_rate"], "precedent", (m, u) if m and u else None)
        if p.split_kind == "cis_payment" and (p.person or p.merchant_id or "").startswith("person:"):
            return self.cis_payment_row((p.person or p.merchant_id).split(":", 2)[2], "precedent")
        return False

    def precedent_rows(self, precs: list[Prec]) -> None:
        for p in precs:
            if p.description:
                self.identical_row(p)
                continue
            for _ in range(p.count):
                m, u = self._catalogue_use(p)
                if p.split_kind and self._split_precedent(p, m, u):
                    continue
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
        exact = {norm(p.description) for p in precs if p.description and p.form != "varied"}
        self.blocked = {norm(p.description) for p in precs
                        if p.description and p.form == "varied" and not p.lines} - exact
        self.entity_rows()
        self.policy_rows()
        self.background_rows()
        self.precedent_rows(precs)
        self.check_varied()
        for r in self.rows:
            if r["source"] == "precedent" and r["precedent_form"] is None:
                r["precedent_form"] = "exact" if norm(r["description"]) in self.scored_desc else "varied"
        self.deciding_forms = Counter(r["precedent_form"] for r in self.deciding)
        return self.rows


__all__ = ["HistoryBuilder", "norm", "form_key", "RuleNotApplicable"]
