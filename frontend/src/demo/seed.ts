// Shapes the generated seed into store rows. The only module allowed to import seed.generated.ts.
import type { BankStatement, TeamMember, Transaction } from "@/lib/api";
import { SEED, type SeedAccount, type SeedTransaction } from "./seed.generated";

export const SEED_VERSION = SEED.version;
export const PRIMARY_MODEL = SEED.primary_model;
export const ESCALATION_MODEL = SEED.escalation_model;
export const DOCUMENT_MODEL = SEED.document_model;
export const ESCALATION_THRESHOLD = SEED.escalation_threshold;
export const RULE_COUNT = SEED.rules.length;

// The demo organisation. The name appears on the dashboard and in `auth/me`.
export const ORG_ID = "5d1c7a2e-9b3f-4c6e-a8d2-0f4e6b1c9a73";
export const ORG_NAME = "Harlow & Finch Ltd";
export const DEMO_USER = {
  id: "c2f4e8a1-6b7d-4e3a-9c1f-2a5b8d7e6f40",
  name: "Demo reviewer",
  email: "reviewer@demo.invalid",
};
// The bank account the transactions were imported from (not in the chart of accounts list).
export const BANK_ACCOUNT_ID = "7e9a3c1b-2d4f-4a6e-b8c0-1f3e5d7a9b2c";

export type DemoAccount = SeedAccount;

const byId = new Map<string, SeedTransaction>(SEED.transactions.map((t) => [t.id, t]));

/** Static per-transaction knowledge: the categorisation plan, reasoning and risk. */
export function seedRow(id: string): SeedTransaction | undefined {
  return byId.get(id);
}

/** Transactions in the order categorisation processes them (easy first, hard last). */
export function planOrder(): SeedTransaction[] {
  return [...SEED.transactions].sort((a, b) => a.plan.position - b.plan.position);
}

export function accountByCode(code: string): DemoAccount | undefined {
  return SEED.accounts.find((a) => a.code === code);
}

export function accountByName(name: string): DemoAccount | undefined {
  const needle = name.trim().toLowerCase();
  return SEED.accounts.find((a) => a.name.toLowerCase() === needle);
}

export function seedAccounts(): DemoAccount[] {
  return SEED.accounts.map((a) => ({ ...a }));
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DAY = 86_400_000;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTH_TOKEN = /\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/g;

/**
 * The fixtures were written for Jan to Mar 2024 and 23 of 50 descriptions or references carry
 * that month or year ("BROADBAND JAN24", "SLACK-2024-FEB"). Rewrite those tokens to the date the
 * row now carries, so the text and the date column agree.
 */
function retime(text: string | null, d: Date): string | null {
  if (!text) return text;
  const mon = MONTHS[d.getUTCMonth()];
  const yyyy = String(d.getUTCFullYear());
  return text
    .replace(MONTH_TOKEN, mon)
    .replace(/\b2024\b/g, yyyy)
    .replace(/\b2023\b/g, String(d.getUTCFullYear() - 1))
    .replace(new RegExp(`(?<=\\b${mon}[ -]?)24\\b`, "g"), yyyy.slice(2));
}

/**
 * Uncategorised transaction rows with current dates. The fixture quarter is shifted forward by a
 * whole number of weeks so that its most recent day lands within the last week: weekdays are
 * preserved, which keeps the seed's "time pattern" risk inputs true for the dates shown.
 */
export function quarterShift(syncedAt: string): number {
  const synced = new Date(syncedAt);
  const yesterday = Date.UTC(synced.getUTCFullYear(), synced.getUTCMonth(), synced.getUTCDate()) - DAY;
  const maxDate = Date.parse(`${SEED.max_date}T00:00:00Z`);
  return Math.floor((yesterday - maxDate) / (7 * DAY)) * 7 * DAY;
}

export function seedTransactions(syncedAt: string): Transaction[] {
  const shift = quarterShift(syncedAt);
  return SEED.transactions.map((t) => {
    const d = new Date(Date.parse(`${t.date}T00:00:00Z`) + shift);
    return {
      id: t.id,
      organisation_id: ORG_ID,
      account_id: BANK_ACCOUNT_ID,
      xero_id: t.xero_id,
      date: isoDate(d),
      amount: t.amount,
      description: retime(t.description, d) ?? t.description,
      reference: retime(t.reference, d),
      category: null,
      category_confidence: null,
      categorisation_status: "uncategorised",
      is_reconciled: false,
      created_at: syncedAt,
      updated_at: syncedAt,
    };
  });
}

// ── Bank statement lines ─────────────────────────────────────────────────────
//
// 32 lines a bank feed would carry for this quarter, each derived from one transaction: the same
// amount, a feed-style description (BACS/DD/CARD prefixes, truncated names, references) and a
// posting offset of 0 to 6 days. Scored with the reconciler port in `match.ts` these give
// 14 auto-matched, 13 suggested and 3 needing review, plus two lines (bank charges, interest)
// with no matching record at all. No month tokens here, so the mix does not change with the shift.

interface StatementSeed {
  fixture_id: string | null;
  description: string;
  /** Days after the transaction date the line posted. */
  offset: number;
  reference: string | null;
  /** Only for lines without a transaction. */
  amount?: string;
  /** Fixture date for lines without a transaction. */
  date?: string;
}

const STATEMENTS: StatementSeed[] = [
  { fixture_id: "t015", description: "BACS CLIENT PAYMENT JOHNSON CO", offset: 0, reference: "INV-003" },
  { fixture_id: "t003", description: "DD HMRC PAYE", offset: 0, reference: "123PA00045678" },
  { fixture_id: "t048", description: "HMRC NIC EMPLOYER", offset: 1, reference: null },
  { fixture_id: "t017", description: "BACS HMRC VAT PAYMENT", offset: 0, reference: "VAT-Q3" },
  { fixture_id: "t045", description: "DD ZURICH BUSINESS INSURANCE", offset: 0, reference: "POL-7781" },
  { fixture_id: "t002", description: "CARD PAYMENT TO ADOBE SYSTEMS", offset: 1, reference: "CARD 4921" },
  { fixture_id: "t035", description: "DD BT BUSINESS BROADBAND", offset: 1, reference: null },
  { fixture_id: "t010", description: "DD BRITISH GAS BUSINESS", offset: 0, reference: "ACC 8877" },
  { fixture_id: "t018", description: "XERO LIMITED SUBSCRIPTION", offset: 0, reference: null },
  { fixture_id: "t005", description: "MICROSOFT*365 BUSINESS", offset: 1, reference: "CARD 4921" },
  { fixture_id: "t039", description: "STAPLES OFFICE SUPPLIES 0222", offset: 0, reference: "CARD 4921" },
  { fixture_id: "t030", description: "AMAZON WEB SERVICES EMEA SARL", offset: 1, reference: "CARD 4921" },
  { fixture_id: "t027", description: "DD LB HACKNEY RATES", offset: 0, reference: null },
  { fixture_id: "t050", description: "FPO PAYROLL RUN", offset: 0, reference: null },
  { fixture_id: "t036", description: "BACS KNIGHTS SOLICITORS LLP", offset: 1, reference: "LEGAL-0219" },
  { fixture_id: "t026", description: "CARD PAYMENT TO SLACK TECHNOLOGIES", offset: 2, reference: "CARD 4921" },
  { fixture_id: "t019", description: "DD LLOYDS BANK INSURANCE PREM", offset: 0, reference: null },
  { fixture_id: "t009", description: "GOOGLE*ADS 5551234", offset: 1, reference: "CARD 4921" },
  { fixture_id: "t040", description: "CITYSPRINT UK LTD 7712", offset: 2, reference: null },
  { fixture_id: "t016", description: "RM FRANKING 445566", offset: 3, reference: null },
  { fixture_id: "t025", description: "DPD GROUP UK LTD", offset: 3, reference: "ACC 2024-001" },
  { fixture_id: "t034", description: "FPO PHOENIX CLEANING", offset: 2, reference: null },
  { fixture_id: "t004", description: "SO REGUS MANAGEMENT UK LTD", offset: 1, reference: null },
  { fixture_id: "t032", description: "LOAN REPAYMENT 55442", offset: 0, reference: null },
  { fixture_id: "t011", description: "BACS ACME CONSULTING", offset: 3, reference: "1045" },
  { fixture_id: "t029", description: "UKRI INNOVATE UK GRANT", offset: 2, reference: null },
  { fixture_id: "t022", description: "REED SPECIALIST RECRUITMENT", offset: 2, reference: "7788" },
  { fixture_id: "t041", description: "TFR FROM 20-44-71 71234567", offset: 6, reference: null },
  { fixture_id: "t024", description: "CHQ 000231", offset: 6, reference: null },
  { fixture_id: "t028", description: "CHQ 000230", offset: 6, reference: null },
  { fixture_id: null, description: "BANK CHARGES", offset: 0, reference: null, amount: "-12.50", date: "2024-01-31" },
  { fixture_id: null, description: "INTEREST PAID", offset: 0, reference: null, amount: "-43.18", date: "2024-02-29" },
];

/** Small deterministic hash so statement ids are stable across resets (UUID-shaped, not a real UUID). */
function stableId(label: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < label.length; i++) {
    const c = label.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, "0");
  const a = hex(h1);
  const b = hex(h2);
  const c = hex(Math.imul(h1, 0x9e3779b1) >>> 0);
  const d = hex(Math.imul(h2, 0x85ebca6b) >>> 0);
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-a${c.slice(1, 4)}-${c.slice(4)}${d}`;
}

/**
 * Statement rows for a synced quarter, dated relative to the (already shifted) transactions.
 * Every line starts `unmatched`; the reconcile job and the detail view score them live.
 */
export function seedStatements(transactions: Transaction[], syncedAt: string): BankStatement[] {
  const byFixture = new Map<string, Transaction>();
  const fixtureOf = new Map(SEED.transactions.map((t) => [t.id, t.fixture_id]));
  for (const tx of transactions) {
    const fid = fixtureOf.get(tx.id);
    if (fid) byFixture.set(fid, tx);
  }
  const shift = quarterShift(syncedAt);

  const rows: BankStatement[] = [];
  STATEMENTS.forEach((s, i) => {
    let date: string;
    let amount: string;
    if (s.fixture_id) {
      const tx = byFixture.get(s.fixture_id);
      if (!tx) return;
      date = isoDate(new Date(Date.parse(`${tx.date}T00:00:00Z`) + s.offset * DAY));
      amount = tx.amount;
    } else {
      date = isoDate(new Date(Date.parse(`${s.date}T00:00:00Z`) + shift));
      amount = s.amount ?? "0.00";
    }
    rows.push({
      id: stableId(`bank-statement:${s.fixture_id ?? s.description}:${i}`),
      organisation_id: ORG_ID,
      xero_id: `bs-${String(i + 1).padStart(4, "0")}`,
      date,
      amount,
      description: s.description,
      reference: s.reference,
      matched_transaction_id: null,
      match_confidence: null,
      match_status: "unmatched",
      created_at: syncedAt,
      updated_at: syncedAt,
    });
  });
  return rows;
}

export const STATEMENT_COUNT = STATEMENTS.length;

// ── Team ─────────────────────────────────────────────────────────────────────

export function seedTeam(createdAt: string): TeamMember[] {
  const joined = new Date(Date.parse(createdAt) - 41 * DAY).toISOString();
  return [
    {
      id: DEMO_USER.id,
      organisation_id: ORG_ID,
      email: DEMO_USER.email,
      name: DEMO_USER.name,
      role: "owner",
      created_at: new Date(Date.parse(createdAt) - 63 * DAY).toISOString(),
    },
    {
      id: "a7c1d3e5-2f4b-4a6c-8d9e-0b1c2d3e4f5a",
      organisation_id: ORG_ID,
      email: "priya.shah@demo.invalid",
      name: "Priya Shah",
      role: "member",
      created_at: joined,
    },
  ];
}
