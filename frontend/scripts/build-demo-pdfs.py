"""Render the three demo PDFs from the real document templates on the demo seed.

    py -3.13 frontend/scripts/build-demo-pdfs.py [--out frontend/public/demo] [--figures-out path.json]

Reads `backend/app/templates/*.html` with Jinja2 (it does not import the backend app) and the
figures from `frontend/src/demo/seed.generated.ts`, shifted to the week the demo shows today
(same rule as `src/demo/seed.ts`). The arithmetic mirrors `src/demo/figures.ts`; keep the two in
step. Narrative sections are pre-written here, labelled indicative in the templates themselves.

PDF engine: WeasyPrint when importable (the backend's engine), otherwise headless Chrome's
print-to-PDF (Chrome ignores the templates' @page footer boxes; everything else renders alike).
"""
from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
TEMPLATES = ROOT / "backend" / "app" / "templates"
SEED_TS = HERE.parent / "src" / "demo" / "seed.generated.ts"
ORG_NAME = "Harlow & Finch Ltd"  # src/demo/seed.ts ORG_NAME
NO_VAT_CODES = {"820", "260", "462", "469", "477", "461"}  # src/demo/figures.ts
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]

# ── Seed ─────────────────────────────────────────────────────────────────────

def load_seed() -> dict:
    src = SEED_TS.read_text(encoding="utf8")
    marker = "export const SEED: GeneratedSeed = "
    body = src[src.index(marker) + len(marker):].rstrip().rstrip(";")
    return json.loads(body)


MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
MONTH_TOKEN = re.compile(r"\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b")


def retime(text: str | None, d: date) -> str | None:
    """Port of seed.ts `retime`: month/year tokens follow the row's shifted date."""
    if not text:
        return text
    mon = MONTHS[d.month - 1]
    yyyy = str(d.year)
    text = MONTH_TOKEN.sub(mon, text)
    text = re.sub(r"\b2024\b", yyyy, text)
    text = re.sub(r"\b2023\b", str(d.year - 1), text)
    text = re.sub(r"\b(" + mon + r")([ -]?)24\b", lambda m: m.group(1) + m.group(2) + yyyy[2:], text)
    return text


def quarter_shift_days(max_date: date, today: date) -> int:
    """Port of seed.ts `quarterShift`: whole weeks so `max_date` lands within the last week."""
    yesterday = today - timedelta(days=1)
    return ((yesterday - max_date).days // 7) * 7


def shifted_rows(seed: dict, today: date) -> list[dict]:
    shift = quarter_shift_days(date.fromisoformat(seed["max_date"]), today)
    rows = []
    for t in seed["transactions"]:
        d = date.fromisoformat(t["date"]) + timedelta(days=shift)
        rows.append(
            {
                "date": d.isoformat(),
                "amount": t["amount"],
                "description": retime(t["description"], d) or t["description"],
                "category": t["plan"]["category"],
                "code": t["plan"]["category_code"],
            }
        )
    return rows


# ── Figures (mirror of src/demo/figures.ts) ──────────────────────────────────

def pence(amount: str) -> int:
    return int(round(float(amount) * 100))


def pounds(p: int) -> float:
    return p / 100


def management_letter_figures(rows: list[dict], start: str, end: str) -> dict:
    income = [r for r in rows if pence(r["amount"]) > 0]
    expenses = [r for r in rows if pence(r["amount"]) < 0]
    total_income = sum(pence(r["amount"]) for r in income)
    total_expenses = sum(pence(r["amount"]) for r in expenses)
    total_expenses_abs = abs(total_expenses)
    by_cat: dict[str, int] = {}
    for r in expenses:
        cat = r["category"] or "Uncategorised"
        by_cat[cat] = by_cat.get(cat, 0) + pence(r["amount"])
    top = [
        {
            "name": name,
            "total_abs": pounds(abs(total)),
            "pct": (abs(total) / total_expenses_abs * 100) if total_expenses_abs else 0,
        }
        for name, total in sorted(by_cat.items(), key=lambda kv: kv[1])[:5]
    ]
    largest = [
        {"date": r["date"], "description": r["description"][:60], "amount": float(r["amount"])}
        for r in sorted(rows, key=lambda r: abs(pence(r["amount"])), reverse=True)[:5]
    ]
    return {
        "total_income": pounds(total_income),
        "total_expenses": pounds(total_expenses),
        "total_expenses_abs": pounds(total_expenses_abs),
        "net": pounds(total_income + total_expenses),
        "transaction_count": len(rows),
        "top_expense_categories": top,
        "largest_transactions": largest,
        "period_start": start,
        "period_end": end,
    }


def profit_loss_figures(rows: list[dict], start: str, end: str) -> dict:
    base = management_letter_figures(rows, start, end)
    income_by: dict[str, int] = {}
    expense_by: dict[str, int] = {}
    for r in rows:
        cat = r["category"] or "Uncategorised"
        p = pence(r["amount"])
        if p > 0:
            income_by[cat] = income_by.get(cat, 0) + p
        elif p < 0:
            expense_by[cat] = expense_by.get(cat, 0) + abs(p)

    def sorted_cats(d: dict[str, int]) -> list[dict]:
        return [{"name": k, "amount": pounds(v)} for k, v in sorted(d.items(), key=lambda kv: kv[1], reverse=True)]

    return {
        **base,
        "income_categories": sorted_cats(income_by),
        "expense_categories": sorted_cats(expense_by),
        "total_expenses": base["total_expenses_abs"],
    }


def vat_summary_figures(rows: list[dict], start: str, end: str) -> dict:
    base = management_letter_figures(rows, start, end)
    by_rate: dict[str, dict[str, int]] = {}
    output_vat = input_vat = 0
    for r in rows:
        p = pence(r["amount"])
        if p == 0:
            continue
        rate = "0%" if r["code"] in NO_VAT_CODES else "20%"
        bucket = by_rate.setdefault(rate, {"net_sales": 0, "net_purchases": 0, "output_vat": 0, "input_vat": 0})
        gross = abs(p)
        vat = math.floor(gross * 20 / 120 + 0.5) if rate == "20%" else 0
        if p > 0:
            bucket["net_sales"] += gross - vat
            bucket["output_vat"] += vat
            output_vat += vat
        else:
            bucket["net_purchases"] += gross - vat
            bucket["input_vat"] += vat
            input_vat += vat
    net_vat = output_vat - input_vat
    return {
        **base,
        "output_vat": pounds(output_vat),
        "input_vat": pounds(input_vat),
        "net_vat": pounds(net_vat),
        "net_vat_label": "owed to HMRC" if net_vat >= 0 else "reclaimable from HMRC",
        "rate_breakdown": [
            {
                "rate": k,
                "net_sales": pounds(v["net_sales"]),
                "net_purchases": pounds(v["net_purchases"]),
                "output_vat": pounds(v["output_vat"]),
                "input_vat": pounds(v["input_vat"]),
            }
            for k, v in sorted(by_rate.items(), reverse=True)
        ],
    }


# ── Narrative (pre-written; the real app drafts these with the model) ───────

class Narrative(dict):
    """Attribute access so the templates' `narrative.section` works."""

    def __getattr__(self, name: str) -> str:
        return self[name]


MANAGEMENT_LETTER = Narrative(
    executive_summary=(
        "Cash movements for the quarter show receipts well below payments, but the headline is not an operating "
        "loss: receipts include a revolving credit drawdown and an Innovate UK grant, and payments include the "
        "PAYE, employer NIC and VAT settlements for the previous period together with a loan instalment. "
        "Stripping those out, trading activity is modest and broadly in line with a small professional practice "
        "between client billing cycles."
    ),
    income_analysis=(
        "Trading income rests on a single client settlement, which leaves the quarter exposed to the timing of one "
        "invoice. The grant receipt is non-recurring and should be ring-fenced against the project it funds. "
        "The facility drawdown is financing rather than income and will need to be presented as such in the "
        "statutory accounts."
    ),
    expense_analysis=(
        "Staff costs and the related HMRC settlements are the largest outflows, as expected for a people-led "
        "business. Legal and audit fees are concentrated in this quarter and should fall away next period. "
        "The remaining spend is a long tail of software subscriptions, insurance, premises and travel, none of "
        "which looks out of line, though two of the larger supplier payments were coded to general expenses "
        "and are worth a second look before sign-off."
    ),
    cash_flow_observations=(
        "Working capital was supported by the credit facility this quarter; without it the closing cash position "
        "would have been negative. Payroll and HMRC liabilities fall on fixed dates, so the practice should hold "
        "at least one month of those commitments in cash. The reconciliation shows a small number of statement "
        "lines without a matching record, which should be cleared before the quarter is filed."
    ),
    recommendations=(
        "Agree a billing schedule with the main client so that receipts arrive monthly rather than in one "
        "settlement.\nReview the two general-expense payments and the contractor invoice flagged for review, and "
        "record the reasoning in the audit trail.\nPresent the facility drawdown and the grant separately from "
        "trading income in the management accounts, and set aside the VAT element of the quarter's sales as it "
        "is invoiced."
    ),
)

PROFIT_LOSS = Narrative(
    overview=(
        "On a cash basis the period shows a deficit, driven by financing and tax settlements rather than by "
        "trading. Once the credit drawdown, the grant and the HMRC payments are set aside, the underlying "
        "picture is a small practice covering its running costs with limited headroom."
    ),
    income_commentary=(
        "Sales come from one client settlement and other revenue from a grant, so the income line is lumpy by "
        "construction. Neither item recurs on a monthly cycle, and the loan receipt sits in the income total only "
        "because the categoriser places it there; it is financing and should be reclassified."
    ),
    expense_commentary=(
        "Wages and the employer NIC and PAYE settlements dominate, followed by legal, accountancy and audit fees "
        "that are seasonal. Software, insurance, premises and travel make up a stable base. Two payments coded "
        "to general expenses and one contractor invoice await reviewer confirmation."
    ),
    outlook=(
        "The next quarter should carry lower professional fees and no audit charge. The main risks are the "
        "timing of client receipts against fixed payroll and HMRC dates, and the repayment profile of the "
        "facility. A monthly billing rhythm would remove most of the volatility seen here."
    ),
)

VAT_SUMMARY = Narrative(
    overview=(
        "Input VAT on purchases exceeds output VAT on sales for the period, so the return would show an amount "
        "reclaimable from HMRC. The figures are indicative: they are derived from bank movements with the VAT "
        "fraction applied to standard-rated lines, not from VAT invoices."
    ),
    output_vat_commentary=(
        "Output VAT arises from a single client settlement. If that invoice was raised in the previous period "
        "the tax point may already have been accounted for, which the reviewer should confirm against the sales "
        "ledger before filing."
    ),
    input_vat_commentary=(
        "Input VAT is spread across software, professional fees, courier, cleaning and premises costs. Insurance, "
        "business rates, wages, professional subscriptions and the HMRC and loan payments carry no VAT and are "
        "shown at the zero line. Entertainment and hospitality lines are included in the estimate but input VAT "
        "on client entertaining is not recoverable and should be removed."
    ),
    recommendations=(
        "Reconcile the estimate to VAT invoices before submitting through Making Tax Digital.\nRemove any input "
        "VAT on client entertaining and check the tax point of the client settlement.\nKeep the digital links "
        "from the bank feed to the return intact so the figures can be evidenced if HMRC asks."
    ),
)

TEMPLATE_SPECS = {
    "management_letter": (management_letter_figures, MANAGEMENT_LETTER),
    "profit_loss": (profit_loss_figures, PROFIT_LOSS),
    "vat_summary": (vat_summary_figures, VAT_SUMMARY),
}


# ── Rendering ────────────────────────────────────────────────────────────────

def fmt_money(value: float) -> str:
    return f"£{abs(value):,.2f}"


def fmt_pct(value: float) -> str:
    return f"{value:.1f}%"


def render_html(template: str, figures: dict, narrative: Narrative, start: date, end: date) -> str:
    env = Environment(loader=FileSystemLoader(str(TEMPLATES)), autoescape=False)
    context = {
        "figures": figures,
        "narrative": narrative,
        "fmt_money": fmt_money,
        "fmt_pct": fmt_pct,
        "organisation_name": ORG_NAME,
        "period_start": start.strftime("%d %B %Y"),
        "period_end": end.strftime("%d %B %Y"),
        "generated_at": datetime.now().strftime("%d %B %Y at %H:%M"),
    }
    if template == "management_letter":
        context["net_label"] = "Profit" if figures["net"] >= 0 else "Loss"
    if template in ("management_letter", "profit_loss"):
        context["net_positive"] = figures["net"] >= 0
    return env.get_template(f"{template}.html").render(**context)


def pdf_with_weasyprint(html: str) -> bytes | None:
    import contextlib
    import io

    # WeasyPrint prints an installation lecture to stderr when its GTK libraries are missing.
    with contextlib.redirect_stderr(io.StringIO()):
        try:
            from weasyprint import HTML  # type: ignore
        except Exception:
            return None
    return HTML(string=html).write_pdf()


def find_chrome() -> str | None:
    for name in ("chrome", "google-chrome", "chromium"):
        found = shutil.which(name)
        if found:
            return found
    for candidate in CHROME_CANDIDATES:
        if Path(candidate).exists():
            return candidate
    return None


def pdf_with_chrome(html: str, chrome: str, workdir: Path, name: str) -> bytes:
    html_path = workdir / f"{name}.html"
    pdf_path = workdir / f"{name}.pdf"
    html_path.write_text(html, encoding="utf8")
    cmd = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--no-pdf-header-footer",
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=3000",
        f"--user-data-dir={workdir / 'profile'}",
        f"--print-to-pdf={pdf_path}",
        html_path.as_uri(),
    ]
    subprocess.run(cmd, check=True, capture_output=True, timeout=120)
    return pdf_path.read_bytes()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(HERE.parent / "public" / "demo"))
    ap.add_argument("--figures-out", default=None, help="also write the computed figures as JSON")
    ap.add_argument("--today", default=None, help="ISO date to shift the seed to (default: today)")
    args = ap.parse_args()

    today = date.fromisoformat(args.today) if args.today else date.today()
    seed = load_seed()
    rows = shifted_rows(seed, today)
    dates = sorted(r["date"] for r in rows)
    start, end = date.fromisoformat(dates[0]), date.fromisoformat(dates[-1])

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    chrome = find_chrome()
    engine = None
    all_figures: dict[str, dict] = {}

    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        for name, (compute, narrative) in TEMPLATE_SPECS.items():
            figures = compute(rows, start.isoformat(), end.isoformat())
            all_figures[name] = figures
            html = render_html(name, figures, narrative, start, end)
            pdf = pdf_with_weasyprint(html)
            if pdf is not None:
                engine = "weasyprint"
            else:
                if not chrome:
                    print("neither WeasyPrint nor Chrome is available; cannot render PDFs", file=sys.stderr)
                    return 1
                engine = "chrome"
                pdf = pdf_with_chrome(html, chrome, workdir, name)
            if not pdf.startswith(b"%PDF"):
                print(f"{name}: output is not a PDF", file=sys.stderr)
                return 1
            target = out / f"{name}.pdf"
            target.write_bytes(pdf)
            print(f"wrote {target} ({len(pdf) / 1024:.0f} kB, {engine})")

    if args.figures_out:
        Path(args.figures_out).write_text(
            json.dumps({"today": today.isoformat(), "period": [start.isoformat(), end.isoformat()], "figures": all_figures}, indent=2),
            encoding="utf8",
        )
    print(f"period {start} to {end}; net {all_figures['management_letter']['net']:.2f}; "
          f"VAT net {all_figures['vat_summary']['net_vat']:.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
