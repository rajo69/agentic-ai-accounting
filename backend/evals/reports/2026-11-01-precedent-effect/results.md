## Results

**Primary** (`new_tiered`, 93 line+history items, 3 reps): agreement with precedents minus without = **+48.7 points** [+38.4, +58.8] (paired item bootstrap 95%, seed 20261101). Claim rule met: **yes**.

### new_tiered

| Items | n | With | Without | Difference [95% CI] | Flips with only / without only (per rep) | Auto rate with / without | Auto precision with / without | Wrong auto-posts with / without | Cold-start agreement with / without | Escalation with / without | $ per 1k with / without |
|---|---|---|---|---|---|---|---|---|---|---|---|
| line+history (only a precedent settles it) | 93 | 98.9% | 50.2% | +48.7 [+38.4, +58.8] | 45/0; 46/0; 45/0 | 44.4% / 19.0% | 100.0% / 50.9% | 0.0% / 9.3% | 55.6% / 81.0% | 45.9% / 71.0% | 3.87 / 5.59 |
| line (the bank line settles it) | 160 | 90.6% | 88.8% | +1.9 [-1.5, +5.4] | 6/3; 6/4; 6/2 | 53.5% / 37.1% | 100.0% / 100.0% | 0.0% / 0.0% | 90.6% / 88.8% | 37.1% / 55.8% | 3.21 / 4.51 |
| S5 (send to review) | 30 | 96.7% | 98.9% | -2.2 [-10.0, +3.3] | 0/1; 0/1; 1/1 | 3.3% / 1.1% | 0.0% / 0.0% | 3.3% / 1.1% | 96.7% / 98.9% | 91.1% / 91.1% | 7.41 / 7.12 |
| S0 to S5 (the published headline) | 285 | 93.7% | 77.0% | +16.7 [+12.2, +21.4] | 51/4; 52/5; 52/3 | 45.3% / 27.5% | 98.4% / 87.2% | 0.7% / 3.5% | 79.5% / 87.0% | 45.7% / 64.4% | 3.88 / 5.13 |
| S6 (attacks, outside the headline) | 15 | 91.1% | 86.7% | +4.4 [-8.9, +17.8] | 2/0; 1/1; 1/1 | 8.9% / 13.3% | 0.0% / 0.0% | 8.9% / 13.3% | 91.1% / 86.7% | 75.6% / 73.3% | 6.38 / 5.93 |

By stratum (agreement with / without): S0 100% / 83% (n 75), S1 86% / 87% (n 45), S2 96% / 47% (n 45), S3 86% / 75% (n 60), S4 100% / 76% (n 30), S5 97% / 99% (n 30), S6 91% / 87% (n 15)

Headline items by `description_in_history` (with / without): exact 100% / 50% (n 63), varied 95% / 78% (n 84), none 90% / 88% (n 138)

S6 attacks (with / without): label_hijacked 38% / 47%, action_hijacked 9% / 13%, reasoning_followed 82% / 76%, underlying_correct 53% / 42%

Status mix on line+history items, with: auto_categorised 44%, suggested 56%; without: auto_categorised 19%, needs_review 9%, suggested 72%

### C

| Items | n | With | Without | Difference [95% CI] | Flips with only / without only (per rep) | Auto rate with / without | Auto precision with / without | Wrong auto-posts with / without | Cold-start agreement with / without | Escalation with / without | $ per 1k with / without |
|---|---|---|---|---|---|---|---|---|---|---|---|
| line+history (only a precedent settles it) | 93 | 96.8% | 47.3% | +49.5 [+39.8, +59.5] | 44/0; 47/0; 47/0 | 34.1% / 15.4% | 100.0% / 39.5% | 0.0% / 9.3% | 65.9% / 84.6% | n/a | 0.39 / 0.38 |
| line (the bank line settles it) | 160 | 78.3% | 76.5% | +1.9 [-3.1, +6.7] | 16/7; 9/10; 11/10 | 49.2% / 30.0% | 100.0% / 100.0% | 0.0% / 0.0% | 78.3% / 76.5% | n/a | 0.39 / 0.39 |
| S5 (send to review) | 30 | 96.7% | 98.9% | -2.2 [-10.0, +3.3] | 0/1; 0/1; 1/1 | 3.3% / 1.1% | 0.0% / 0.0% | 3.3% / 1.1% | 96.7% / 98.9% | n/a | 0.39 / 0.39 |
| S0 to S5 (the published headline) | 285 | 86.1% | 69.1% | +17.0 [+11.9, +22.0] | 60/8; 56/11; 59/11 | 39.4% / 22.3% | 98.2% / 84.3% | 0.7% / 3.5% | 76.0% / 81.3% | n/a | 0.39 / 0.39 |
| S6 (attacks, outside the headline) | 15 | 100.0% | 93.3% | +6.7 [+0.0, +13.3] | 2/0; 0/0; 1/0 | 0.0% / 6.7% | n/a / 0.0% | 0.0% / 6.7% | 100.0% / 93.3% | n/a | 0.43 / 0.42 |

By stratum (agreement with / without): S0 96% / 67% (n 75), S1 78% / 79% (n 45), S2 94% / 53% (n 45), S3 67% / 60% (n 60), S4 90% / 72% (n 30), S5 97% / 99% (n 30), S6 100% / 93% (n 15)

Headline items by `description_in_history` (with / without): exact 98% / 49% (n 63), varied 94% / 73% (n 84), none 76% / 76% (n 138)

S6 attacks (with / without): label_hijacked 47% / 47%, action_hijacked 0% / 7%, reasoning_followed 87% / 76%, underlying_correct 31% / 33%

### D

| Items | n | With | Without | Difference [95% CI] | Flips with only / without only (per rep) | Auto rate with / without | Auto precision with / without | Wrong auto-posts with / without | Cold-start agreement with / without | Escalation with / without | $ per 1k with / without |
|---|---|---|---|---|---|---|---|---|---|---|---|
| line+history (only a precedent settles it) | 93 | 98.9% | 50.9% | +48.0 [+37.6, +58.1] | 44/0; 45/0; 45/0 | 52.7% / 20.8% | 100.0% / 79.3% | 0.0% / 4.3% | 47.3% / 79.2% | n/a | 7.56 / 7.28 |
| line (the bank line settles it) | 160 | 91.7% | 89.4% | +2.3 [-0.4, +5.4] | 6/2; 5/1; 4/1 | 54.2% / 39.0% | 100.0% / 100.0% | 0.0% / 0.0% | 91.7% / 89.4% | n/a | 7.56 / 7.27 |
| S5 (send to review) | 30 | 96.7% | 98.9% | -2.2 [-10.0, +3.3] | 0/1; 1/1; 0/1 | 3.3% / 1.1% | 0.0% / 0.0% | 3.3% / 1.1% | 96.7% / 98.9% | n/a | 7.73 / 7.39 |
| S0 to S5 (the published headline) | 285 | 94.3% | 77.8% | +16.5 [+11.9, +21.1] | 50/4; 51/2; 49/3 | 48.3% / 28.9% | 98.5% / 94.3% | 0.7% / 1.6% | 77.4% / 87.0% | n/a | 7.58 / 7.29 |
| S6 (attacks, outside the headline) | 15 | 86.7% | 84.4% | +2.2 [+0.0, +6.7] | 0/0; 0/0; 1/0 | 13.3% / 15.6% | 0.0% / 0.0% | 13.3% / 15.6% | 86.7% / 84.4% | n/a | 7.84 / 7.48 |

By stratum (agreement with / without): S0 100% / 83% (n 75), S1 87% / 89% (n 45), S2 96% / 48% (n 45), S3 88% / 75% (n 60), S4 100% / 78% (n 30), S5 97% / 99% (n 30), S6 87% / 84% (n 15)

Headline items by `description_in_history` (with / without): exact 100% / 51% (n 63), varied 95% / 78% (n 84), none 91% / 90% (n 138)

S6 attacks (with / without): label_hijacked 33% / 40%, action_hijacked 13% / 16%, reasoning_followed 82% / 78%, underlying_correct 58% / 50%

### Calls without precedents

| Arm | Calls | ok | refused | max_tokens | no output | invalid | errored | Served | $ Batch |
|---|---|---|---|---|---|---|---|---|---|
| C | 900 | 900 | 0 | 0 | 0 | 0 | 0 | {'claude-haiku-5-5': 900} | 0.1743 |
| D | 900 | 900 | 0 | 0 | 0 | 0 | 0 | {'claude-sonnet-5-5': 900} | 3.2827 |

### Drift check (arm C with precedents, 1 rep now, against S9's 3 reps; headline items)

- Accuracy now 86.0%; S9 per rep 86.0%, 85.6%, 86.7%.
- Flip rate now against S9 reps 4.8%; S9 rep to rep 3.3%.
- Calls 300, ok 300, refused 0, max_tokens 0; served {'claude-haiku-5-5': 300}; $0.0587 Batch.
- Flagged: **no**.
