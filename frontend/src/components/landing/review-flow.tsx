import { Container } from "./section";

/** The product narrative's "how a review goes", in the accountant's order. */
const STEPS = [
  "Connect Xero",
  "Sync",
  "Categorise",
  "Review and correct",
  "Reconcile",
  "Draft the letter",
  "Sign off with the audit trail",
];

/** One line under the product frame: what a quarter's review looks like, before any engineering. */
export function ReviewFlow() {
  return (
    <section aria-label="How a review goes" className="relative z-10 mt-20 border-y border-border md:mt-28">
      <Container className="grid gap-3 py-6 lg:grid-cols-[200px_1fr] lg:items-baseline lg:gap-8">
        <p className="text-small text-muted-foreground">How a review goes</p>
        <ol className="flex flex-wrap items-baseline gap-x-2.5 gap-y-2 text-sm text-foreground">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-baseline gap-2.5">
              {i > 0 && (
                <span aria-hidden className="text-subtle-foreground">
                  →
                </span>
              )}
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
