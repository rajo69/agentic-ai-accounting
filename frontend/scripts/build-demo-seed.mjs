// Builds src/demo/seed.generated.ts from the backend's eval fixtures.
//
//   node scripts/build-demo-seed.mjs
//
// Inputs (read, never modified):
//   ../backend/evals/fixtures/transactions.json   50 labelled UK transactions
//   ../backend/evals/fixtures/accounts.json       20 chart-of-accounts rows
//   ../backend/app/xai/fuzzy_engine.py            the eight risk rules (copied verbatim)
//
// Everything derived here is deterministic: the same inputs always produce the same file,
// so SEED_VERSION (a hash of the inputs and of this script) only changes when something real changed.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const fixtures = resolve(root, "backend", "evals", "fixtures");
const fuzzyPath = resolve(root, "backend", "app", "xai", "fuzzy_engine.py");
const outPath = resolve(here, "..", "src", "demo", "seed.generated.ts");

const SCRIPT_VERSION = "5";

const txRaw = readFileSync(resolve(fixtures, "transactions.json"), "utf8");
const accRaw = readFileSync(resolve(fixtures, "accounts.json"), "utf8");
const fuzzyRaw = readFileSync(fuzzyPath, "utf8");

/** @type {Array<{id:string,date:string,amount:string,description:string,reference:string,expected_category_code:string,expected_category_name:string,expected_category_alt?:string,expected_category_alt_name?:string,difficulty:"easy"|"medium"|"hard",notes:string}>} */
const transactions = JSON.parse(txRaw);
/** @type {Array<{code:string,name:string,type:string}>} */
const accounts = JSON.parse(accRaw);

// ── Deterministic helpers ─────────────────────────────────────────────────────

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable, UUID-shaped id derived from a label (not a real v4; only the shape matters). */
function stableUuid(label) {
  const hex = createHash("sha1").update(label).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

// ── Fuzzy rules, copied verbatim from the engine ─────────────────────────────

const ruleTexts = [...fuzzyRaw.matchAll(/"(IF .+? THEN risk IS (?:low|medium|high))"/g)].map((m) => m[1]);
if (ruleTexts.length !== 8) {
  throw new Error(`expected 8 fuzzy rules in fuzzy_engine.py, found ${ruleTexts.length}`);
}
const rules = ruleTexts.map((text) => {
  const m = text.match(/^IF (.+) THEN risk IS (low|medium|high)$/);
  const antecedents = m[1].split(" AND ").map((clause) => {
    const [, variable, term] = clause.match(/^(.+) IS (\w+)$/);
    return { variable: variable.replace(/ /g, "_"), term };
  });
  return { text, antecedents, consequent: m[2] };
});

// ── Risk inputs, derived from the data itself ─────────────────────────────────

const vendorKey = (d) => d.toLowerCase().replace(/[^a-z ]/g, " ").trim().split(/\s+/)[0] || "unknown";
const vendorCounts = new Map();
for (const t of transactions) vendorCounts.set(vendorKey(t.description), (vendorCounts.get(vendorKey(t.description)) ?? 0) + 1);

const categoryCounts = new Map();
for (const t of transactions) categoryCounts.set(t.expected_category_code, (categoryCounts.get(t.expected_category_code) ?? 0) + 1);

const categoryMean = new Map();
for (const code of new Set(transactions.map((t) => t.expected_category_code))) {
  const amounts = transactions.filter((t) => t.expected_category_code === code).map((t) => Math.abs(parseFloat(t.amount)));
  categoryMean.set(code, amounts.reduce((a, b) => a + b, 0) / amounts.length);
}

const RISK_CENTRE = { low: 0.15, medium: 0.5, high: 0.85 };

function riskFor(t) {
  const abs = Math.abs(parseFloat(t.amount));
  const mean = categoryMean.get(t.expected_category_code) ?? abs;
  // Log ratio against the category mean: 2x away = 0.5, 4x away = 1.0.
  const amountDeviation = round(Math.min(1, Math.abs(Math.log(Math.max(abs, 0.01) / Math.max(mean, 0.01))) / Math.log(4)), 3);
  // A vendor seen before, or a kind of spend that recurs in the quarter, counts as a known pattern.
  const seen = vendorCounts.get(vendorKey(t.description)) ?? 1;
  const kind = categoryCounts.get(t.expected_category_code) ?? 1;
  const vendorFrequency = seen >= 2 || kind >= 4 ? 0.8 : kind >= 2 ? 0.55 : 0.2;
  const day = new Date(`${t.date}T00:00:00Z`).getUTCDay();
  const timePattern = day === 0 || day === 6 ? 0.7 : 0.2;

  const terms = {
    amount_deviation: amountDeviation < 0.35 ? "low" : amountDeviation < 0.65 ? "medium" : "high",
    vendor_frequency: vendorFrequency >= 0.5 ? "frequent" : "rare",
    time_pattern: timePattern >= 0.5 ? "unusual" : "normal",
  };
  const fired = rules.filter((r) => r.antecedents.every((a) => terms[a.variable] === a.term));
  const score = fired.length
    ? round(fired.reduce((s, r) => s + RISK_CENTRE[r.consequent], 0) / fired.length, 3)
    : 0.15;
  const label = score < 0.35 ? "low" : score < 0.65 ? "medium" : "high";
  return {
    risk_score: score,
    risk_label: label,
    fired_rules: fired.map((r) => r.text),
    input_values: { amount_deviation: amountDeviation, vendor_frequency: vendorFrequency, time_pattern: timePattern },
  };
}

// ── Reasoning: the fixture note rewritten as one or two sentences ────────────

function sentence(note) {
  let s = note.trim().replace(/\s*[\u2014\u2013]\s*/g, ", ").replace(/\s+/g, " ");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s.replace(/[.!]+$/, "");
}

function reasoningFor(t) {
  const name = t.expected_category_name;
  const code = t.expected_category_code;
  const abs = Math.abs(parseFloat(t.amount));
  const gbp = `GBP ${abs.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const note = sentence(t.notes);
  if (t.difficulty === "easy") {
    return `${note}. Coded to ${name} (${code}) on the vendor and reference pattern; ${gbp} is in the usual range for this account.`;
  }
  if (t.difficulty === "medium") {
    return `${note}. ${name} (${code}) is the closest match, but the description leaves some doubt, so this is a suggestion rather than an automatic code.`;
  }
  if (t.expected_category_alt && t.expected_category_alt_name) {
    return `${note}. ${name} (${code}) and ${t.expected_category_alt_name} (${t.expected_category_alt}) are both plausible from the description alone, so this needs a human decision.`;
  }
  return `${note}. The description is too generic to code ${name} (${code}) with confidence, so this needs a human decision.`;
}

// ── Categorisation plan: tiers, confidences, order ───────────────────────────
// 60% auto_categorised (0.86-0.98), 25% suggested (0.50-0.85), 15% needs_review (< 0.50).
// Order: easy, then medium, then hard (hard fixtures last), shuffled within each class.

const PRIMARY_MODEL = "claude-haiku-4-5-20251001";
const ESCALATION_MODEL = "claude-sonnet-4-5-20250929";
const ESCALATION_THRESHOLD = 0.85;

const order = ["easy", "medium", "hard"].flatMap((difficulty) => {
  const rows = transactions.filter((t) => t.difficulty === difficulty);
  const rnd = mulberry32(fnv1a(`order:${difficulty}`));
  return rows
    .map((t) => ({ t, k: rnd() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.t);
});

const total = order.length;
const autoCount = Math.round(total * 0.6);
const suggestedCount = Math.round(total * 0.25);

const maxDate = transactions.map((t) => t.date).sort().at(-1);

// Escalated rows (3-4): the fast model was unsure, the stronger model decided.
const escalatedPositions = new Set([autoCount + 1, autoCount + 6, autoCount + suggestedCount + 3, total - 1]);

const seedTransactions = order.map((t, position) => {
  const rnd = mulberry32(fnv1a(`tx:${t.id}`));
  let tier;
  let confidence;
  if (position < autoCount) {
    tier = "auto_categorised";
    confidence = 0.86 + rnd() * 0.12;
  } else if (position < autoCount + suggestedCount) {
    tier = "suggested";
    confidence = 0.5 + rnd() * 0.35;
  } else {
    tier = "needs_review";
    confidence = 0.2 + rnd() * 0.29;
  }
  const escalated = escalatedPositions.has(position);
  const decision = escalated
    ? {
        escalated: true,
        tier,
        primary_model: PRIMARY_MODEL,
        primary_confidence: round(0.55 + rnd() * 0.25, 2),
        escalation_threshold: ESCALATION_THRESHOLD,
      }
    : { escalated: false, tier };
  return {
    id: stableUuid(`demo-transaction:${t.id}`),
    fixture_id: t.id,
    xero_id: stableUuid(`demo-xero:${t.id}`),
    date: t.date,
    amount: t.amount,
    description: t.description,
    reference: t.reference || null,
    difficulty: t.difficulty,
    plan: {
      position,
      category: t.expected_category_name,
      category_code: t.expected_category_code,
      tier,
      confidence: round(confidence, 2),
      model: escalated ? ESCALATION_MODEL : PRIMARY_MODEL,
      decision,
    },
    reasoning: reasoningFor(t),
    risk: riskFor(t),
  };
});

const seedAccounts = accounts.map((a) => ({
  id: stableUuid(`demo-account:${a.code}`),
  code: a.code,
  name: a.name,
  type: a.type,
}));

const SEED_VERSION = createHash("sha1")
  .update(SCRIPT_VERSION)
  .update(txRaw)
  .update(accRaw)
  .update(ruleTexts.join("\n"))
  .digest("hex")
  .slice(0, 12);

// ── Emit ──────────────────────────────────────────────────────────────────────

const header = `// GENERATED by scripts/build-demo-seed.mjs from backend/evals/fixtures and the fuzzy rule base.
// Do not edit by hand; run \`node scripts/build-demo-seed.mjs\` instead.
// Generated from the eval fixtures; no Xero data. Dates are the fixture dates; seed.ts shifts them forward by whole weeks.

export type SeedTier = "auto_categorised" | "suggested" | "needs_review";

export interface SeedAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

export interface SeedDecision {
  escalated: boolean;
  tier: SeedTier;
  primary_model?: string;
  primary_confidence?: number;
  escalation_threshold?: number;
}

export interface SeedRisk {
  risk_score: number;
  risk_label: "low" | "medium" | "high";
  fired_rules: string[];
  input_values: Record<string, number>;
}

export interface SeedTransaction {
  id: string;
  fixture_id: string;
  xero_id: string;
  date: string;
  amount: string;
  description: string;
  reference: string | null;
  difficulty: "easy" | "medium" | "hard";
  plan: {
    position: number;
    category: string;
    category_code: string;
    tier: SeedTier;
    confidence: number;
    model: string;
    decision: SeedDecision;
  };
  reasoning: string;
  risk: SeedRisk;
}

export interface GeneratedSeed {
  version: string;
  primary_model: string;
  escalation_model: string;
  escalation_threshold: number;
  /** Most recent fixture date; seed.ts shifts every date so this lands within the last week. */
  max_date: string;
  rules: string[];
  accounts: SeedAccount[];
  transactions: SeedTransaction[];
}

`;

const seed = {
  version: SEED_VERSION,
  primary_model: PRIMARY_MODEL,
  escalation_model: ESCALATION_MODEL,
  escalation_threshold: ESCALATION_THRESHOLD,
  max_date: maxDate,
  rules: ruleTexts,
  accounts: seedAccounts,
  transactions: seedTransactions,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${header}export const SEED: GeneratedSeed = ${JSON.stringify(seed, null, 2)};\n`);

const tiers = seedTransactions.reduce((m, t) => ((m[t.plan.tier] = (m[t.plan.tier] ?? 0) + 1), m), {});
const risks = seedTransactions.reduce((m, t) => ((m[t.risk.risk_label] = (m[t.risk.risk_label] ?? 0) + 1), m), {});
console.log(
  `wrote ${outPath}\n  version ${SEED_VERSION}; ${seedAccounts.length} accounts, ${seedTransactions.length} transactions\n  tiers ${JSON.stringify(tiers)}; risk ${JSON.stringify(risks)}; escalated ${seedTransactions.filter((t) => t.plan.decision.escalated).length}; rules ${ruleTexts.length}`,
);
