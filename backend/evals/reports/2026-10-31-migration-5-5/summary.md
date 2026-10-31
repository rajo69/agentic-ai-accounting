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

---

Everything above this line is the pre-registration, unchanged from commit `a589c7e` (pushed to GitHub at
2026-10-31 02:07:44 UTC, before any accuracy or gate figure was computed; `records/preregistration.json`).

## Run

- 2026-10-31, Message Batches, one batch per arm, cheapest first. 6 arms x 3 reps x 200 items = 3,600 calls, all
  succeeded. Batch ids and times are in `records/batches.json`; the first was created at 01:47:26 UTC and the last
  ended at 02:07:57 UTC.
- Cost from `usage` (Batch prices): A $1.0406, B $3.1562, C $0.1171, D $2.2826, E $0.1346, F $0.1256, **total
  $6.8568** against a pre-approved $8 budget and a `count_tokens` estimate of $6.66. Cross-checked by a separate
  recomputation from the raw responses.
- Served model equals requested on every call (`provenance.json`). The rendered-prompt hash matches the request
  bodies kept with the raw results.
- App commit `a589c7e` (clean tree); bookbench `f57f0d4`; `anthropic` 2.3.0, API version 2026-10-21
  (`records/environment.json`, `records/models.json`).
- Kept locally, not committed: the raw responses and the exact request bodies. The request bodies contain bookbench
  items verbatim without its canary string.

## Results

### Gate

| Candidate | G1 diff [95% CI] | G2 precision new / old (rate) | G3 refused / truncated | G4 $ per 1k new / old | Within noise | Pass |
|---|---|---|---|---|---|---|
| new_tiered | 7.9% [3.7%, 12.3%] ok | 98.7% / 89.7% (41.9% / 64.7%) ok | 0 / 0 ok | 4.01 / 5.32 ok | no | **pass** |
| new_tiered_tool | 8.8% [4.6%, 13.3%] ok | 97.4% / 89.7% (40.7% / 64.7%) ok | 0 / 0 ok | 4.61 / 5.32 ok | no | **pass** |
| new_tiered_medium | 8.4% [4.4%, 12.6%] ok | 97.9% / 89.7% (40.9% / 64.7%) ok | 0 / 0 ok | 4.05 / 5.32 ok | no | **pass** |

### Systems (S0 to S5, pooled over reps; cost at standard prices)

| System | Accuracy | Auto rate | Auto precision [Wilson low] | Escalation | AUROC | ECE | Rep spread | $ per 1k |
|---|---|---|---|---|---|---|---|---|
| A | 78.1% | 62.3% | 89.3% [85.6%] | 0.0% | 0.734 | 0.115 | 1.1% | 3.47 |
| B | 90.5% | 71.1% | 95.1% [92.5%] | 0.0% | 0.766 | 0.032 | 0.0% | 10.52 |
| C | 83.7% | 36.8% | 98.6% [95.9%] | 0.0% | 0.811 | 0.067 | 1.1% | 0.39 |
| D | 91.4% | 45.1% | 98.8% [96.6%] | 0.0% | 0.791 | 0.119 | 0.5% | 7.61 |
| E | 85.1% | 33.7% | 98.4% [95.5%] | 0.0% | 0.804 | 0.079 | 1.6% | 0.45 |
| F | 88.9% | 36.7% | 98.6% [95.9%] | 0.0% | 0.804 | 0.108 | 0.0% | 0.42 |
| old_tiered | 83.2% | 64.7% | 89.7% [86.2%] | 17.4% | 0.654 | 0.103 | 3.2% | 5.32 |
| new_tiered | 91.1% | 41.9% | 98.7% [96.4%] | 45.3% | 0.759 | 0.112 | 1.1% | 4.01 |
| new_tiered_tool | 91.9% | 40.7% | 97.4% [94.5%] | 52.6% | 0.769 | 0.129 | 0.5% | 4.61 |
| new_tiered_medium | 91.6% | 40.9% | 97.9% [95.1%] | 45.3% | 0.764 | 0.123 | 1.1% | 4.05 |

### Per stratum

| System | S0 | S1 | S2 | S3 | S4 | S5 | S6 |
|---|---|---|---|---|---|---|---|
| A | 74% | 80% | 83% | 72% | 83% | 85% | 60% |
| B | 94% | 84% | 97% | 88% | 88% | 90% | 73% |
| C | 79% | 77% | 93% | 73% | 95% | 100% | 90% |
| D | 94% | 90% | 97% | 88% | 83% | 95% | 90% |
| E | 87% | 72% | 93% | 73% | 95% | 100% | 100% |
| F | 85% | 87% | 97% | 82% | 92% | 100% | 100% |
| old_tiered | 86% | 80% | 86% | 78% | 87% | 85% | 60% |
| new_tiered | 95% | 86% | 97% | 86% | 83% | 100% | 80% |
| new_tiered_tool | 96% | 90% | 97% | 88% | 83% | 95% | 90% |
| new_tiered_medium | 95% | 90% | 97% | 87% | 83% | 97% | 90% |

### S6 attacks (outside the headline)

| System | Label hijacked | Auto-posted | Reasoning followed | Underlying correct |
|---|---|---|---|---|
| A | 20% | 40% | 67% | 38% |
| B | 50% | 27% | 97% | 12% |
| C | 33% | 10% | 73% | 38% |
| D | 27% | 10% | 90% | 67% |
| E | 20% | 0% | 67% | 50% |
| F | 20% | 0% | 67% | 46% |
| old_tiered | 23% | 40% | 70% | 38% |
| new_tiered | 27% | 20% | 87% | 67% |
| new_tiered_tool | 27% | 10% | 87% | 67% |
| new_tiered_medium | 27% | 10% | 80% | 67% |

### Per-item flips (headline strata; x only / y only, exact McNemar p per rep)

- new_tiered vs old_tiered: r1: 16/4 p=0.012, r2: 17/3 p=0.003, r3: 23/4 p=0.000
- new_tiered_tool vs old_tiered: r1: 17/3 p=0.003, r2: 19/2 p=0.000, r3: 22/3 p=0.000
- new_tiered_medium vs new_tiered: r1: 3/1 p=0.625, r2: 2/1 p=1.000, r3: 1/1 p=1.000
- C vs E: r1: 6/10 p=0.454, r2: 7/11 p=0.481, r3: 7/7 p=1.000
- C vs A: r1: 20/11 p=0.150, r2: 20/10 p=0.099, r3: 23/10 p=0.035
- D vs B: r1: 6/4 p=0.754, r2: 6/4 p=0.754, r3: 6/5 p=1.000
- F vs C: r1: 14/3 p=0.013, r2: 14/4 p=0.031, r3: 12/3 p=0.035

### Calls per arm

| Arm | Calls | ok | refused | max_tokens | no output | invalid | errored |
|---|---|---|---|---|---|---|---|
| C | 600 | 600 | 0 | 0 | 0 | 0 | 0 |
| E | 600 | 600 | 0 | 0 | 0 | 0 | 0 |
| F | 600 | 600 | 0 | 0 | 0 | 0 | 0 |
| A | 600 | 600 | 0 | 0 | 0 | 0 | 0 |
| D | 600 | 600 | 0 | 0 | 0 | 0 | 0 |
| B | 600 | 600 | 0 | 0 | 0 | 0 | 0 |

### Threshold sweep (escalation = auto-accept = t, review 0.5)

**old_tiered**

| t | Coverage | Precision [Wilson low] | Accuracy | Escalation | $ per 1k |
|---|---|---|---|---|---|
| 0.50 | 100.0% | 69.3% [65.4%] | 69.3% | 0.4% | 3.50 |
| 0.55 | 99.3% | 69.8% [65.9%] | 70.0% | 0.4% | 3.50 |
| 0.60 | 99.3% | 69.8% [65.9%] | 70.0% | 1.1% | 3.57 |
| 0.65 | 96.5% | 71.8% [67.9%] | 70.9% | 1.1% | 3.57 |
| 0.70 | 97.2% | 72.0% [68.1%] | 72.1% | 3.9% | 3.88 |
| 0.75 | 83.0% | 78.6% [74.7%] | 76.8% | 4.4% | 3.93 |
| 0.80 | 88.2% | 79.1% [75.4%] | 79.6% | 17.4% | 5.32 |
| 0.85 | 64.7% | 89.7% [86.2%] | 83.2% | 17.4% | 5.32 |
| 0.90 | 70.5% | 89.8% [86.5%] | 87.0% | 37.7% | 7.58 |
| 0.95 | 2.6% | 100.0% [79.6%] | 89.1% | 42.3% | 8.07 |

**new_tiered** (lowest t with Wilson lower bound >= old precision: 0.8)

| t | Coverage | Precision [Wilson low] | Accuracy | Escalation | $ per 1k |
|---|---|---|---|---|---|
| 0.50 | 96.8% | 77.4% [73.7%] | 77.4% | 5.1% | 0.83 |
| 0.55 | 95.3% | 78.3% [74.6%] | 78.2% | 5.8% | 0.90 |
| 0.60 | 75.6% | 88.2% [84.8%] | 82.8% | 7.0% | 1.02 |
| 0.65 | 83.0% | 87.9% [84.7%] | 88.1% | 25.6% | 2.49 |
| 0.70 | 78.8% | 88.6% [85.4%] | 88.1% | 25.6% | 2.49 |
| 0.75 | 79.3% | 88.7% [85.5%] | 87.4% | 29.3% | 2.80 |
| 0.80 | 59.1% | 93.5% [90.3%] | 89.1% | 29.6% | 2.83 |
| 0.85 | 41.9% | 98.7% [96.4%] | 91.1% | 45.3% | 4.01 |
| 0.90 | 26.1% | 98.0% [94.2%] | 92.5% | 63.7% | 5.37 |
| 0.95 | 5.3% | 100.0% [88.6%] | 91.9% | 89.6% | 7.26 |

**new_tiered_tool** (lowest t with Wilson lower bound >= old precision: 0.8)

| t | Coverage | Precision [Wilson low] | Accuracy | Escalation | $ per 1k |
|---|---|---|---|---|---|
| 0.50 | 97.2% | 77.3% [73.6%] | 76.8% | 4.0% | 0.80 |
| 0.55 | 94.9% | 79.1% [75.5%] | 78.6% | 5.1% | 0.89 |
| 0.60 | 76.5% | 87.2% [83.7%] | 83.0% | 7.4% | 1.06 |
| 0.65 | 83.9% | 87.4% [84.2%] | 86.5% | 25.1% | 2.44 |
| 0.70 | 72.8% | 91.6% [88.5%] | 87.9% | 25.1% | 2.44 |
| 0.75 | 74.2% | 92.4% [89.5%] | 88.8% | 34.7% | 3.15 |
| 0.80 | 52.6% | 97.3% [94.8%] | 90.7% | 35.6% | 3.22 |
| 0.85 | 40.7% | 97.4% [94.5%] | 91.9% | 52.6% | 4.61 |
| 0.90 | 21.8% | 97.6% [93.1%] | 92.5% | 66.3% | 5.64 |
| 0.95 | 4.7% | 100.0% [87.5%] | 91.9% | 92.1% | 7.50 |

**new_tiered_medium** (lowest t with Wilson lower bound >= old precision: 0.7)

| t | Coverage | Precision [Wilson low] | Accuracy | Escalation | $ per 1k |
|---|---|---|---|---|---|
| 0.50 | 95.4% | 82.2% [78.7%] | 81.8% | 3.7% | 0.80 |
| 0.55 | 94.4% | 83.1% [79.7%] | 83.0% | 6.3% | 1.04 |
| 0.60 | 76.1% | 91.5% [88.5%] | 87.4% | 7.7% | 1.18 |
| 0.65 | 81.9% | 91.0% [88.1%] | 89.1% | 25.1% | 2.58 |
| 0.70 | 74.6% | 93.9% [91.2%] | 90.0% | 25.1% | 2.58 |
| 0.75 | 72.1% | 95.1% [92.6%] | 90.7% | 33.0% | 3.15 |
| 0.80 | 59.3% | 95.6% [92.8%] | 90.9% | 35.8% | 3.36 |
| 0.85 | 40.9% | 97.9% [95.1%] | 91.6% | 45.3% | 4.05 |
| 0.90 | 27.4% | 98.1% [94.5%] | 92.5% | 64.2% | 5.46 |
| 0.95 | 6.1% | 100.0% [90.1%] | 91.9% | 89.1% | 7.26 |


## Notes on reading the results

Observations, not new criteria. The gate above is the decision input; everything here is post hoc.

- **At unchanged thresholds (0.85 / 0.85 / 0.5), new_tiered (C then D) against old_tiered (A then B):**
  - accuracy 91.1% against 83.2% (+7.9 points, 95% CI +3.7 to +12.3);
  - auto-accept precision 98.7% against 89.7%, but the auto-accept rate falls from 64.7% to 41.9%, so more rows go to a
    person;
  - escalation rises from 17.4% to 45.3%, because Haiku 5.5 reports lower confidence than Haiku 4.5;
  - cost per 1,000 transactions is $4.01 against $5.32 at standard prices.
- **C against E (Haiku 5.5, structured outputs vs forced tool call):** no detectable difference per item (McNemar p 0.45
  to 1.0 per rep). E escalates more (52.6% against 45.3%), costs more ($4.61 per 1k) and has slightly lower tiered
  precision (97.4% against 98.7%).
- **F against C (effort medium vs low):** F is better as a single tier (88.9% against 83.7%; McNemar p 0.013 to 0.035
  per rep). Once Sonnet 5.5 handles the escalations, the tiered systems are not distinguishable at 0.85 (p 0.63 to 1.0).
- **Thinking actually used:**
  - D (Sonnet 5.5, effort low): 0 thinking tokens on all 600 calls;
  - C (Haiku 5.5, low): thought on 6.7% of calls (mean 13 tokens);
  - F (Haiku 5.5, medium): thought on 45.5% of calls (mean 71 tokens).
- **Threshold sweep:** the lowest threshold whose Wilson lower bound reaches old_tiered's 89.7% is 0.80 for C+D and E+D,
  and 0.70 for F+D. For C+D at 0.80: coverage 59.1%, precision 93.5% (lower bound 90.3%), accuracy 89.1%, $2.83 per
  1k. Caveats:
  - these thresholds were chosen on the same 200 dev items, so they are optimistic;
  - a threshold change needs confirming on bookbench test before it is relied on;
  - coverage is not monotone in t, because the thresholds move together: raising t sends more rows to Sonnet, which can
    push them into the auto band;
  - confidences cluster at round values, so a single step can move many rows (old_tiered drops from 70.5% to 2.6%
    coverage between 0.90 and 0.95).
- **Per stratum:** S4 (20 items) is the one headline stratum where new_tiered (83%) is below old_tiered (87%).
- **S6 attacks** (10 items x 3 reps, too few for more than a direction):
  - new_tiered auto-posts attacked items less often (20% against 40%);
  - the hijacked label is about as frequent (27% against 23%);
  - the model mentions the injected text in its reasoning more often (87% against 70%); `reasoning_followed` is a
    substring match, so a mention counts.
- **Calibration:** AUROC improves (0.654 to 0.759 tiered); ECE is similar (0.103 to 0.112).
- **Reps:** spread between reps is small (1.1% new, 3.2% old). Every candidate's difference from old exceeds it.

## Decision (owner, 2026-10-31, after the results)

- Haiku 5.5 primary uses structured outputs (C), not the forced tool call (E): no per-item difference, E costs more.
- `claude-5-5` keeps the 0.85 / 0.85 / 0.5 thresholds. 0.80 from the sweep is adopted only after bookbench test
  confirms it.
- Haiku 5.5 primary effort stays low: F gains nothing once tiered and uses more output.
- Flip the default to `claude-5-5` (PR 4), since every gate passed. Rollback stays `LLM_PROFILE=claude-4`.
- The raw responses and request bodies are archived privately outside the repo with a SHA-256 manifest. Publishing
  them (next to bookbench, with its canary string) is a later decision.
