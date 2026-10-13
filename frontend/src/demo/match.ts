// Bank reconciliation scoring, ported line for line from `backend/app/agents/reconciler.py` so the
// demo's candidate scores and statuses are the ones the product would compute for the same rows.
// Pure functions over primitives; no imports.

export const AMOUNT_TOLERANCE = 0.01;
export const DATE_WINDOW_DAYS = 7;
export const AUTO_MATCH_THRESHOLD = 0.9;
export const SUGGEST_THRESHOLD = 0.6;

const DAY = 86_400_000;

export function daysBetween(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY));
}

/** 1.0 for an exact match, 0.8 within 1%, else 0.0. */
export function amountScore(txAmount: number, bsAmount: number): number {
  const diff = Math.abs(txAmount - bsAmount);
  if (diff <= 0.001) return 1.0;
  if (bsAmount !== 0 && diff / Math.abs(bsAmount) <= 0.01) return 0.8;
  return 0.0;
}

/** 1.0 for the same day, minus 0.15 per day, floor 0.0. */
export function dateScore(txDate: string, bsDate: string): number {
  return Math.max(0, 1 - daysBetween(txDate, bsDate) * 0.15);
}

function lcsLength(a: string, b: string): number {
  // Classic two-row dynamic programme; strings here are under 80 characters.
  let prev = new Array<number>(b.length + 1).fill(0);
  let cur = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/**
 * RapidFuzz `fuzz.token_sort_ratio` normalised to 0..1: tokens split on whitespace, sorted and
 * re-joined with single spaces, then the normalised Indel similarity 1 - (|a| + |b| - 2 LCS) / (|a| + |b|).
 * The backend lower-cases both sides before calling it; so does this.
 */
export function tokenSortRatio(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().trim().split(/\s+/).filter(Boolean).sort().join(" ");
  const na = norm(a);
  const nb = norm(b);
  const total = na.length + nb.length;
  if (total === 0) return 1;
  const distance = total - 2 * lcsLength(na, nb);
  return 1 - distance / total;
}

export function descriptionScore(txDesc: string, bsDesc: string): number {
  return tokenSortRatio(txDesc ?? "", bsDesc ?? "");
}

/** Amount 50%, date 20%, description 30%. */
export function combinedScore(amount: number, date: number, description: number): number {
  return amount * 0.5 + date * 0.2 + description * 0.3;
}

export const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export interface ScoredCandidate {
  transaction_id: string;
  description: string;
  date: string;
  amount: string;
  amount_score: number;
  date_score: number;
  description_score: number;
  combined_score: number;
}

export interface CandidateInput {
  id: string;
  description: string;
  date: string;
  amount: string;
}

/** Scores candidates against a statement line, best first (ties keep input order, as the backend's stable sort does). */
export function scoreCandidates(
  bs: { date: string; amount: string; description: string },
  candidates: CandidateInput[],
): ScoredCandidate[] {
  const bsAmount = Number(bs.amount);
  return candidates
    .map((c) => {
      const a = amountScore(Number(c.amount), bsAmount);
      const d = dateScore(c.date, bs.date);
      const s = descriptionScore(c.description, bs.description);
      return {
        transaction_id: c.id,
        description: c.description,
        date: c.date,
        amount: c.amount,
        amount_score: round4(a),
        date_score: round4(d),
        description_score: round4(s),
        combined_score: round4(combinedScore(a, d, s)),
      };
    })
    .sort((x, y) => y.combined_score - x.combined_score);
}

/** The agent's `find_candidates` window: amount within a penny, date within the window. */
export function inWindow(
  bs: { date: string; amount: string },
  tx: { date: string; amount: string },
): boolean {
  return (
    Math.abs(Number(tx.amount) - Number(bs.amount)) <= AMOUNT_TOLERANCE + 1e-9 &&
    daysBetween(tx.date, bs.date) <= DATE_WINDOW_DAYS
  );
}

export type MatchDecision = {
  status: "auto_matched" | "suggested" | "needs_review";
  best: ScoredCandidate | null;
  confidence: number;
};

/** The agent's `decide` node. */
export function decide(scored: ScoredCandidate[]): MatchDecision {
  if (scored.length === 0) return { status: "needs_review", best: null, confidence: 0 };
  const top = scored[0];
  const topScore = top.combined_score;
  const closeCount = scored.filter((c) => topScore - c.combined_score <= 0.05).length;
  if (topScore >= AUTO_MATCH_THRESHOLD && closeCount === 1) {
    return { status: "auto_matched", best: top, confidence: topScore };
  }
  if (topScore >= SUGGEST_THRESHOLD) {
    return { status: closeCount > 1 ? "needs_review" : "suggested", best: top, confidence: topScore };
  }
  return { status: "needs_review", best: null, confidence: topScore };
}

/** The agent's `explain` node, verbatim wording. */
export function explainMatch(bs: { date: string }, best: ScoredCandidate | null): string {
  if (!best) return "No suitable match found; manual review required.";
  const days = daysBetween(best.date, bs.date);
  const amountQualifier = best.amount_score >= 1 ? "exactly" : "within 1%";
  const descPct = Math.floor(best.description_score * 100);
  const dayText = `${days} day${days !== 1 ? "s" : ""}`;
  const amount = Math.abs(Number(best.amount)).toFixed(2);
  return (
    `Matched to '${best.description}' on ${best.date}: amount matches ${amountQualifier} ` +
    `(£${amount}), dated ${dayText} apart, description ${descPct}% similar.`
  );
}
