# Self-review, October 2026

In October 2026 I ran six parallel review passes over the repository: security and tenancy, backend correctness, AI
engineering, frontend, documentation honesty, and toolchain. All six used one evidence standard: file and line, quoted
code, severity, and whether the plan already knew. Every high finding was re-read in source, and the numerical ones
were reproduced. The pass produced 106 findings, 14 high and none critical, about 70% of them not previously known. A
66-row claim ledger graded every public statement TRUE, PARTLY, FALSE or UNVERIFIABLE; the README rewrite of
2026-10-10 resolved every FALSE and PARTLY row.

## Top findings and where they stand (2026-10-10)

| Finding | Status |
|---|---|
| VAT summary arithmetic wrong by construction (rate applied to gross; unknown tax types default to 20%) | Open; figures labelled indicative; fix in roadmap phases 0 and 5 |
| `SPEND-TRANSFER`, `-OVERPAYMENT`, `-PREPAYMENT` stored positive (only exact `SPEND` is negated) | Open; roadmap phase 0 characterisation test and hotfix |
| One `AsyncSession` shared by five concurrent graph tasks in both batch runners | Open; roadmap phase 3 |
| Categoriser persists the model's category name string; validation passes on code or name | Open; roadmap phase 4 (chart-constrained structured outputs) |
| Fuzzy membership returns zero at the clamped extremes, so saturated inputs default to "medium" | Open; roadmap phase 0 test and phase 8 |
| EBM explanations never executed for three or more categories; placeholder bars were shown | UI gated on the real model type; EBM retirement in roadmap phase 8 |
| Identity: any Xero login to a tenant gets the owner session; invited members cannot sign in | Open; roadmap phase 2 |
| Public numbers unverifiable and mutually inconsistent; privacy notice denied a data flow that happens | Fixed in the README, PORTFOLIO.md, the evals README and the privacy page (2026-10-10) |

## Reading the findings as a whole

The plumbing held up: tenancy scoping (all 29 authenticated operations take the organisation from the session), the audit trail, money types, the adapter boundary, migrations and CI. The
defects sat in the product's own differentiators, the parts least exercised by tests, which is where I would
least have wanted them and where a reviewer should look first. The unit tests mock the database session, so the
tenant-isolation, batch-concurrency and VAT-arithmetic findings were invisible to them; a database-backed test layer is
the first phase of the [production roadmap](PRODUCTION_ROADMAP.md).

The full finding list is private working material. The headline items are summarised in the roadmap, and the story of
the review is in the [engineering record](ENGINEERING_RECORD.md#a-six-lens-review-of-my-own-repository).
