import { Container } from "./section";

/**
 * Verified in the repository on 2026-10-10: 34 route decorators under backend/app, 93 test
 * functions under backend/tests (run by CI), one AuditLog row per AI and human decision,
 * confirmed and corrected categorisations stored as precedents, pgvector and instructor in
 * pyproject. No accuracy, no hours saved (DESIGN.md section 9). Sits above "How it is built";
 * the model names live in the Explain row and the architecture diagram only.
 */
const FACTS = [
  "Audit row per decision",
  "Corrections become precedents",
  "34 endpoints",
  "93 tests in CI",
  "pgvector precedent retrieval",
  "Structured outputs via Instructor",
];

export function ProofStrip() {
  return (
    <section aria-label="Verified facts" className="relative z-10 border-y border-border">
      <Container>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-3 py-5 font-mono text-xs text-muted-foreground md:grid-cols-3 lg:flex lg:gap-0 lg:divide-x lg:divide-border lg:py-0">
          {FACTS.map((f) => (
            <li key={f} className="lg:flex-1 lg:whitespace-nowrap lg:px-6 lg:py-5 lg:text-center lg:first:pl-0 lg:last:pr-0">
              {f}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
