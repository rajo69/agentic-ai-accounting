// Document figures for the demo, ported from `backend/app/services/document_service.py`
// (`_calculate_figures`, `_calculate_pnl_figures`) with one deliberate change for the VAT summary:
// VAT is taken out of the gross bank amount (20/120) and a short list of account codes is treated
// as exempt or outside the scope of VAT, instead of adding 20% on top of every row as the backend
// does today (MASTER_PLAN Appendix A.1). `scripts/build-demo-pdfs.py` carries the same arithmetic;
// keep the two in step.
import type { GeneratedDocument, Transaction } from "@/lib/api";
import { accountByName } from "./seed";

export type DemoFigures = GeneratedDocument["figures"] & Record<string, unknown>;

const pence = (amount: string | number) => Math.round(Number(amount) * 100);
const pounds = (p: number) => p / 100;
const UNCATEGORISED = "Uncategorised";

/** Rows dated within the period, inclusive (ISO dates compare as strings). */
export function inPeriod(rows: Transaction[], periodStart: string, periodEnd: string): Transaction[] {
  return rows.filter((t) => t.date >= periodStart && t.date <= periodEnd);
}

export function managementLetterFigures(rows: Transaction[], periodStart: string, periodEnd: string): DemoFigures {
  const income = rows.filter((t) => pence(t.amount) > 0);
  const expenses = rows.filter((t) => pence(t.amount) < 0);
  const totalIncome = income.reduce((s, t) => s + pence(t.amount), 0);
  const totalExpenses = expenses.reduce((s, t) => s + pence(t.amount), 0);
  const totalExpensesAbs = Math.abs(totalExpenses);

  const byCategory = new Map<string, number>();
  for (const t of expenses) {
    const cat = t.category ?? UNCATEGORISED;
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + pence(t.amount));
  }
  const topExpenseCategories = Array.from(byCategory.entries())
    .sort((a, b) => a[1] - b[1])
    .slice(0, 5)
    .map(([name, total]) => ({
      name,
      total_abs: pounds(Math.abs(total)),
      pct: totalExpensesAbs ? (Math.abs(total) / totalExpensesAbs) * 100 : 0,
    }));

  const largest = [...rows]
    .sort((a, b) => Math.abs(pence(b.amount)) - Math.abs(pence(a.amount)))
    .slice(0, 5)
    .map((t) => ({ date: t.date, description: t.description.slice(0, 60), amount: Number(t.amount) }));

  return {
    total_income: pounds(totalIncome),
    total_expenses: pounds(totalExpenses),
    total_expenses_abs: pounds(totalExpensesAbs),
    net: pounds(totalIncome + totalExpenses),
    transaction_count: rows.length,
    top_expense_categories: topExpenseCategories,
    largest_transactions: largest,
    period_start: periodStart,
    period_end: periodEnd,
  };
}

export function profitLossFigures(rows: Transaction[], periodStart: string, periodEnd: string): DemoFigures {
  const base = managementLetterFigures(rows, periodStart, periodEnd);
  const incomeByCat = new Map<string, number>();
  const expenseByCat = new Map<string, number>();
  for (const t of rows) {
    const cat = t.category ?? UNCATEGORISED;
    const p = pence(t.amount);
    if (p > 0) incomeByCat.set(cat, (incomeByCat.get(cat) ?? 0) + p);
    else if (p < 0) expenseByCat.set(cat, (expenseByCat.get(cat) ?? 0) + Math.abs(p));
  }
  const sorted = (m: Map<string, number>) =>
    Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount: pounds(amount) }));
  return {
    ...base,
    income_categories: sorted(incomeByCat),
    expense_categories: sorted(expenseByCat),
    // The backend's P&L carries expenses as a positive total; the letter carries them negative.
    total_expenses: base.total_expenses_abs,
  };
}

/** Account codes whose rows carry no VAT in the demo: tax and statutory payments (incl. loans), grants, insurance, rates, wages, professional subscriptions. */
const NO_VAT_CODES = new Set(["820", "260", "462", "469", "477", "461"]);

/** Account code behind a row's category; every demo category is an account in the chart. */
function codeFor(t: Transaction): string | undefined {
  return t.category ? accountByName(t.category)?.code : undefined;
}

function vatRateFor(t: Transaction): "20%" | "0%" {
  const code = codeFor(t);
  return code && NO_VAT_CODES.has(code) ? "0%" : "20%";
}

export function vatSummaryFigures(rows: Transaction[], periodStart: string, periodEnd: string): DemoFigures {
  const base = managementLetterFigures(rows, periodStart, periodEnd);
  const byRate = new Map<string, { net_sales: number; net_purchases: number; output_vat: number; input_vat: number }>();
  let outputVat = 0;
  let inputVat = 0;
  for (const t of rows) {
    const p = pence(t.amount);
    if (p === 0) continue;
    const rate = vatRateFor(t);
    const bucket = byRate.get(rate) ?? { net_sales: 0, net_purchases: 0, output_vat: 0, input_vat: 0 };
    const gross = Math.abs(p);
    const vat = rate === "20%" ? Math.floor((gross * 20) / 120 + 0.5) : 0;
    if (p > 0) {
      bucket.net_sales += gross - vat;
      bucket.output_vat += vat;
      outputVat += vat;
    } else {
      bucket.net_purchases += gross - vat;
      bucket.input_vat += vat;
      inputVat += vat;
    }
    byRate.set(rate, bucket);
  }
  const netVat = outputVat - inputVat;
  return {
    ...base,
    output_vat: pounds(outputVat),
    input_vat: pounds(inputVat),
    net_vat: pounds(netVat),
    net_vat_label: netVat >= 0 ? "owed to HMRC" : "reclaimable from HMRC",
    rate_breakdown: Array.from(byRate.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
      .map(([rate, v]) => ({
        rate,
        net_sales: pounds(v.net_sales),
        net_purchases: pounds(v.net_purchases),
        output_vat: pounds(v.output_vat),
        input_vat: pounds(v.input_vat),
      })),
  };
}

export const FIGURES_FOR: Record<string, (rows: Transaction[], start: string, end: string) => DemoFigures> = {
  management_letter: managementLetterFigures,
  profit_loss: profitLossFigures,
  vat_summary: vatSummaryFigures,
};
