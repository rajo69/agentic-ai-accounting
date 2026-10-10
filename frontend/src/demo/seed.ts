// Shapes the generated seed into store rows. The only module allowed to import seed.generated.ts.
import type { Transaction } from "@/lib/api";
import { SEED, type SeedAccount, type SeedTransaction } from "./seed.generated";

export const SEED_VERSION = SEED.version;
export const PRIMARY_MODEL = SEED.primary_model;
export const ESCALATION_THRESHOLD = SEED.escalation_threshold;

// A synthetic organisation. The name appears on the dashboard and in `auth/me`.
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
export function seedTransactions(syncedAt: string): Transaction[] {
  const synced = new Date(syncedAt);
  const yesterday = Date.UTC(synced.getUTCFullYear(), synced.getUTCMonth(), synced.getUTCDate()) - DAY;
  const maxDate = Date.parse(`${SEED.max_date}T00:00:00Z`);
  const shift = Math.floor((yesterday - maxDate) / (7 * DAY)) * 7 * DAY;
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
