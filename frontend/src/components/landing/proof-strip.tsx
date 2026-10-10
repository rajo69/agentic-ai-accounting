import { Container } from "./section";

/**
 * Verified in the repository on 2026-10-10: 34 route decorators under backend/app, 93 test
 * functions under backend/tests (run by CI), one AuditLog row per AI and human decision,
 * claude-haiku-4-5 with claude-sonnet-4-6 escalation, pgvector and instructor in pyproject.
 * No accuracy, no hours saved (DESIGN.md section 9).
 */
const FACTS = [
  "34 endpoints",
  "93 tests in CI",
  "audit row per decision",
  "Haiku 4.5 → Sonnet 4.6 routing",
  "pgvector precedents",
  "Instructor structured outputs",
];

export function ProofStrip() {
  return (
    <section aria-label="Verified facts" className="relative z-10 mt-20 border-y border-border md:mt-28">
      <Container>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-3 py-5 font-mono text-xs text-muted-foreground sm:grid-cols-2 md:grid-cols-3 lg:flex lg:items-center lg:justify-between lg:gap-8">
          {FACTS.map((f) => (
            <li key={f} className="flex items-center gap-2.5 lg:whitespace-nowrap">
              <span aria-hidden className="size-1 shrink-0 rounded-full bg-border-strong" />
              {f}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
