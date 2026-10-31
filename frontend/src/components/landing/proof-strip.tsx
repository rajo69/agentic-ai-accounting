import { Container } from "./section";

/**
 * Verified in the repository on 2026-10-10 (re-checked 2026-10-31): 34 route decorators under backend/app, 244
 * tests collected under backend/tests (244 passed in CI on 2d0599b), one AuditLog row per AI and human decision,
 * confirmed and corrected categorisations stored as precedents, pgvector in pyproject,
 * structured outputs parsed with Pydantic in backend/app/services/llm_client.py. No accuracy, no
 * hours saved (DESIGN.md section 9). Sits above "How it is built";
 * the model names live in the Explain row and the architecture diagram only.
 */
const FACTS = [
  "Audit row per decision",
  "Corrections become precedents",
  "34 endpoints",
  "244 tests in CI",
  "pgvector precedent retrieval",
  "Pydantic-validated outputs",
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
