/**
 * Hard-coded data for the landing product frame. A UK demo company, GBP, codes from the
 * eval fixtures' chart of accounts. Independent of the S3 demo seed on purpose.
 * Risk rule wording follows the eight rules in the fuzzy engine (amount deviation, vendor
 * frequency, time pattern).
 */

export const ORG = {
  name: "Harbourline Consulting Ltd",
  period: "6 Apr to 5 Jul 2026",
  periodLabel: "Quarter 1 · 2026/27",
};

export type CategorisationStatus = "auto_categorised" | "suggested" | "needs_review" | "confirmed";

export interface CategoriseRow {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: number;
  code: string;
  category: string;
  confidence: number;
  status: CategorisationStatus;
}

export const CATEGORISE_ROWS: CategoriseRow[] = [
  { id: "t1", date: "14 Apr", description: "ADOBE SYSTEMS INC", reference: "INV-2026-0414", amount: -999, code: "404", category: "Computer Equipment & Software", confidence: 0.97, status: "auto_categorised" },
  { id: "t2", date: "16 Apr", description: "REGUS FLEET STREET", reference: "DD", amount: -1200, code: "401", category: "Rent", confidence: 0.96, status: "auto_categorised" },
  { id: "t3", date: "21 Apr", description: "PREMIER INN MANCHESTER", reference: "BOOKING-78123", amount: -85, code: "493", category: "Travel", confidence: 0.91, status: "auto_categorised" },
  { id: "t4", date: "28 Apr", description: "BARKER SCAFFOLD HIRE LTD", reference: "SCAFFOLD-INV-112", amount: -3450, code: "416", category: "General Expenses", confidence: 0.62, status: "needs_review" },
  { id: "t5", date: "02 May", description: "COSTA COFFEE CANARY WHARF", reference: "CARD/0502", amount: -34.5, code: "429", category: "Entertainment & Hospitality", confidence: 0.88, status: "auto_categorised" },
  { id: "t6", date: "06 May", description: "ACME CONSULTING LTD INV 1045", reference: "INV-1045", amount: -3200, code: "411", category: "Consultants & Contractors", confidence: 0.74, status: "suggested" },
  { id: "t7", date: "09 May", description: "HMRC PAYE", reference: "REF123456789", amount: -2500, code: "820", category: "Tax & Statutory Payments", confidence: 0.99, status: "auto_categorised" },
];

export interface RiskRule {
  /** Antecedents, in the engine's vocabulary. */
  when: string;
  /** Consequent risk term. */
  then: "high" | "medium" | "low";
  /** Firing strength 0 to 1. */
  strength: number;
}

export interface Explanation {
  code: string;
  category: string;
  confidence: number;
  status: CategorisationStatus;
  model: "Haiku 4.5" | "Sonnet 4.6";
  escalatedFrom?: "Haiku 4.5";
  reasoning: [string, string];
  risk: { score: number; label: "high" | "medium" | "low"; rules: RiskRule[] };
}

/** The Categorise scene's reviewed row (t4) and the Explain capability crop. */
export const SCAFFOLD_EXPLANATION: Explanation = {
  code: "416",
  category: "General Expenses",
  confidence: 0.62,
  status: "needs_review",
  model: "Sonnet 4.6",
  escalatedFrom: "Haiku 4.5",
  reasoning: [
    "Barker Scaffold Hire has no confirmed precedent for this organisation, and scaffold hire can be a direct project cost or a general expense depending on the trade.",
    "The nearest confirmed precedent is Travis Perkins, coded to 416 General Expenses, so 416 is proposed at reduced confidence and the amount is flagged.",
  ],
  risk: {
    score: 0.74,
    label: "high",
    rules: [
      { when: "amount deviation is high · vendor frequency is rare", then: "high", strength: 0.78 },
      { when: "time pattern is unusual · vendor frequency is rare", then: "high", strength: 0.41 },
      { when: "amount deviation is medium", then: "medium", strength: 0.22 },
    ],
  },
};

/** The Explain scene: a suggested row the reviewer approves. */
export const ACME_TRANSACTION = {
  description: "ACME CONSULTING LTD INV 1045",
  date: "06 May 2026",
  amount: -3200,
  reference: "INV-1045",
};

export const ACME_EXPLANATION: Explanation = {
  code: "411",
  category: "Consultants & Contractors",
  confidence: 0.74,
  status: "suggested",
  model: "Haiku 4.5",
  reasoning: [
    "The description names an invoice from a consulting company, and two earlier payments to ACME Consulting were confirmed to 411 Consultants & Contractors.",
    "Confidence stays below the auto-accept threshold because the invoice number is new and the amount is 14% above the two earlier payments.",
  ],
  risk: {
    score: 0.31,
    label: "low",
    rules: [
      { when: "amount deviation is low · vendor frequency is frequent", then: "low", strength: 0.61 },
      { when: "amount deviation is medium", then: "medium", strength: 0.38 },
    ],
  },
};

export interface HistoryItem {
  action: "ai_categorise" | "human_approve";
  title: string;
  detail: string;
  at: string;
}

export const ACME_HISTORY: HistoryItem[] = [
  { action: "ai_categorise", title: "AI proposed 411 Consultants & Contractors", detail: "Haiku 4.5 · confidence 0.74 · risk low", at: "06 May · 09:14" },
  { action: "human_approve", title: "Approved by the reviewer", detail: "Recorded in the audit log · now a precedent", at: "14 May · 10:42" },
];

export type MatchStatus = "unmatched" | "auto_matched" | "suggested" | "needs_review" | "confirmed";

export interface StatementLine {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: MatchStatus;
}

export const STATEMENT_LINES: StatementLine[] = [
  { id: "s1", date: "12 May", description: "BACS JOHNSON & CO INV 2026-003", amount: 12500, status: "suggested" },
  { id: "s2", date: "11 May", description: "DD BRITISH GAS BUSINESS", amount: -245, status: "auto_matched" },
  { id: "s3", date: "11 May", description: "CARD TESCO STORES 3526", amount: -52.4, status: "auto_matched" },
  { id: "s4", date: "08 May", description: "FPS ACME CONSULTING LTD", amount: -3200, status: "auto_matched" },
  { id: "s5", date: "07 May", description: "FPS REED RECRUITMENT SERVICES", amount: -750, status: "auto_matched" },
  { id: "s6", date: "05 May", description: "DD ZURICH BUSINESS INSURANCE", amount: -1100, status: "needs_review" },
  { id: "s7", date: "03 May", description: "DD BT BUSINESS BROADBAND", amount: -390, status: "auto_matched" },
  { id: "s8", date: "01 May", description: "BGC INNOVATE UK GRANT", amount: 4200, status: "unmatched" },
];

export interface Candidate {
  id: string;
  record: string;
  party: string;
  amount: number;
  date: string;
  scores: { amount: number; date: number; description: number; combined: number };
}

export const CANDIDATES: Candidate[] = [
  { id: "c1", record: "INV-2026-003", party: "Johnson & Co", amount: 12500, date: "Due 10 May", scores: { amount: 1, date: 0.92, description: 0.88, combined: 0.94 } },
  { id: "c2", record: "INV-2026-007", party: "Johnson & Co", amount: 12000, date: "Due 28 May", scores: { amount: 0.62, date: 0.7, description: 0.88, combined: 0.71 } },
  { id: "c3", record: "PAY-0118", party: "Johnston Ltd", amount: 12500, date: "22 Apr", scores: { amount: 1, date: 0.4, description: 0.55, combined: 0.66 } },
];

export interface GeneratedDocument {
  id: string;
  template: string;
  period: string;
  generatedAt: string;
}

export const EXISTING_DOCUMENTS: GeneratedDocument[] = [
  { id: "d2", template: "Management letter", period: "6 Jan to 5 Apr 2026", generatedAt: "07 Apr 2026 · 09:12" },
  { id: "d1", template: "Management letter", period: "6 Oct 2025 to 5 Jan 2026", generatedAt: "08 Jan 2026 · 16:40" },
];

export const NEW_DOCUMENT: GeneratedDocument = {
  id: "d3",
  template: "Management letter",
  period: ORG.period,
  generatedAt: "10 Jul 2026 · 10:43",
};

export const LETTER = {
  title: "Management letter",
  subtitle: `${ORG.name} · quarter to 5 Jul 2026`,
  figures: [
    { label: "Revenue", value: 48700 },
    { label: "Expenses", value: 31245.6 },
    { label: "Net", value: 17454.4 },
  ],
  paragraphs: [
    "Revenue for the quarter was GBP 48,700.00 across four client invoices, with Johnson & Co accounting for about half.",
    "Expenses of GBP 31,245.60 were led by payroll and rent. Two transactions remain in review and are excluded from these indicative figures.",
  ],
};
