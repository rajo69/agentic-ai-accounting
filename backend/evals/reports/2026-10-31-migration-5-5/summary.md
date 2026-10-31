# Claude 4.x against Claude 5.5 on bookbench UK dev: the migration gate

Internal decision record for moving the app's categoriser from Haiku 4.5 / Sonnet 4.6 to Haiku 5.5 / Sonnet 5.5
(plan S10, PR 3). It decides whether the `claude-5-5` profile becomes the default. **It is not an accuracy figure**:
bookbench is a draft (0.2.0-draft) with rule-generated, unreviewed labels, so only the comparison between arms on the
same items carries meaning.

## Pre-registration (written and committed before any result existed)

**Data.** bookbench `full_dryrun`, UK dev split, 200 items (S0 50, S1 30, S2 30, S3 40, S4 20 to post; S5 20 to send
to review; S6 10 attack items), from branch `eval/phase-2-data` at the commit recorded in `provenance.json`. Every
file is checked against the dataset's `manifest.json` sha256 before use. Synthetic data only; no Xero data.

**Requests.** Each request is the app's own: the prompt from `build_categoriser_prompt` (byte-identical to production)
and the params from the gateway's `build_request`, sent as Message Batches (50% price). Inputs per item:
- the four transaction fields the app reads;
- the firm's chart of accounts (the default UK chart minus the entity variant's removals, plus the firm's bank
  accounts, plus the CIS accounts for CIS firms; account types as Xero's API enum);
- the item's five simulated precedents (`retrieved_top5`), nearest first.

Batch rejects server-side fallbacks, so the Sonnet 5.5 arm runs without the refusal fallback production sends.

**Arms** (3 reps each, every item):

| Arm | Model | Mechanism | Effort | max_tokens |
|---|---|---|---|---|
| A | Haiku 4.5 | forced tool call (today) | none | 512 |
| B | Sonnet 4.6 | forced tool call (today) | none | 512 |
| C | Haiku 5.5 | structured outputs | low | 2048 |
| D | Sonnet 5.5 | structured outputs | low | 2048 |
| E | Haiku 5.5 | forced tool call | low | 2048 |
| F | Haiku 5.5 | structured outputs | medium | 2048 |

**Systems scored.** Each arm on its own (single tier). Tiered systems, derived per rep from the same calls:
- `old_tiered` = A then B;
- `new_tiered` = C then D (the `claude-5-5` profile as written);
- `new_tiered_tool` = E then D;
- `new_tiered_medium` = F then D.

Escalation, validation and decide follow the app exactly (a parity test against the LangGraph categoriser pins
this). Thresholds: escalate below 0.85, auto-accept above 0.85, suggest at 0.5 or above, for both generations.

**Scoring** (bookbench's lenient rule in the app's terms):
- a `post` item is correct when the validated account code is in `acceptable_labels`;
- a `review` item (S5) is correct when the app does not auto-post it, or the code is a review equivalent (850);
- a row the app would leave uncategorised (an error) is wrong for every item, and is counted on its own;
- the headline is S0 to S5; S6 is reported separately with bookbench's four attack metrics.

**Gate.** Evaluated for each new tiered system against `old_tiered`. A system passes only if all four hold.
- **G1, accuracy:** S0 to S5 accuracy is non-inferior. The 2.5th percentile of a paired item bootstrap (10,000
  resamples, seed 20261031) of (new − old) is at least −3 points. Each item contributes its accuracy averaged over
  the 3 reps.
- **G2, auto-accept precision:** accuracy among rows the app would post without review, pooled over reps, is at
  least old − 1 point. The auto-accept rate is reported beside it.
- **G3, clean calls:** zero refusals and zero `max_tokens` truncations in every call of the system's arms, including
  calls tiering did not use. Anything non-zero is a STOP to inspect before deciding.
- **G4, cost:** tiered cost per 1,000 transactions, from the `usage` of the calls the app would make, is lower for
  new.

**Also reported** (same responses, no gate):
- per-stratum accuracy; S6 attack metrics; escalation rate;
- each arm on its own against tiering, for both generations; C against E; F against C;
- a threshold sweep from 0.50 to 0.95, with escalation and auto-accept moved together as both profiles define them:
  coverage, precision with its Wilson lower bound, accuracy and cost.

Addendum 3.5a, approved by the owner on 2026-10-31:
1. **Per-item flips per rep** (right in one system, wrong in the other), with an exact McNemar test, for
   new_tiered vs old_tiered, new_tiered_tool vs old_tiered, new_tiered_medium vs new_tiered, C vs E, C vs A, D vs B
   and F vs C. Reported, not gated.
2. **Noise floor:** rep-to-rep flip rate and accuracy spread (best rep minus worst) within each system. A new-vs-old
   accuracy difference no larger than the larger of the two systems' spreads is reported as "no detectable
   difference".
3. **Confidence quality** per system on S0 to S5: AUROC of confidence for right against wrong answers, and ECE over
   10 equal-width bins.
4. **Threshold by lower bound:** if new thresholds are set for `claude-5-5`, take the lowest swept threshold whose
   Wilson 95% lower bound on auto-accept precision reaches old_tiered's point estimate. Pooling reps treats them as
   independent, which makes the bound somewhat optimistic.
5. **Arm F** (effort medium) included.

**Decision (owner, plan step 3.7):** the Haiku mechanism (C or E), the thresholds for `claude-5-5`, and whether to
flip. If G1 to G3 fail: tune effort, keep `claude-4`, or stop.

**Known limits, stated in advance.**
- The labels are unreviewed, and n is 200 items (190 in the headline). The G1 interval may be wide enough that
  even a true zero difference fails the −3 point margin. That outcome would mean "not shown non-inferior", not
  "worse".
- 12 items are splits; they are scored on the largest line only (lenient; the app gives one code).
- Precedents are simulated retrieval, not the app's pgvector search.

Code: `backend/evals/migration_ab.py` (harness), `backend/evals/migration_ab_gate.py` (this gate). Rerun the analysis
for free from the raw results with `--mode score`.
