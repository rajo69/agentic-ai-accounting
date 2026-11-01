# Eval harness

Measures the categorisation prompt on a fixed set of labelled UK transactions generated with Claude, none taken
from Xero: accuracy by difficulty tier, per-category F1, confidence calibration and API cost. It is a harness for the
prompt: it sends its own prompt with no precedent retrieval and no model routing, so a result measures the prompt
alone.

The benchmark built for the production categoriser, with precedents, is
[bookbench](https://github.com/rajo69/bookbench), published as a draft. The production categoriser's requests were scored on its UK dev split for the move from Claude
4.x to 5.5 (`migration_ab.py`, report in [`reports/2026-10-31-migration-5-5/`](reports/2026-10-31-migration-5-5/summary.md)):
a pre-registered relative comparison on unreviewed labels, not an accuracy figure. The shipped `claude-5-5` system was
then run once on the held-out UK test split (`migration_ab.py --split test`, report in
[`reports/2026-10-31-bookbench-test-5-5/`](reports/2026-10-31-bookbench-test-5-5/summary.md)): 93.7% agreement with
bookbench's draft labels at commit `f57f0d4` (285 items, 3 reps, interval 90.9% to 96.3%), auto-accept precision
98.4% at 45.3% coverage, $4.00 per 1,000 transactions. The same test requests were then sent with no precedents
(`migration_ab.py --split test --precedents none`, paired by `precedent_effect.py`, report in
[`reports/2026-11-01-precedent-effect/`](reports/2026-11-01-precedent-effect/summary.md)): on the 93 items only
history can settle, agreement fell from 98.9% to 50.2% (+48.7 points, interval +38.4 to +58.8), with no measurable
change on items the bank line settles. This runner still defaults to
Haiku 4.5 so its cached responses stay valid; pass `--model claude-haiku-5-5` to run the current primary.

## Quick start

```bash
cd backend

# Rule-based mock: no API calls, free. Exercises the harness itself.
python -m evals.eval_runner --mode mock

# Live run with a budget cap (USD). Responses are cached to disk, so reruns are free.
python -m evals.eval_runner --mode live --budget 0.10

# Compare models (any model a profile in app/services/llm_client.py routes to)
python -m evals.eval_runner --mode live --model claude-haiku-4-5-20251001 --budget 0.10
python -m evals.eval_runner --mode live --model claude-sonnet-4-6 --budget 0.50
python -m evals.eval_runner --mode live --model claude-haiku-5-5 --budget 0.05

# Smoke test on 10 fixtures
python -m evals.eval_runner --mode live --limit 10 --budget 0.02

# Clear the cache
python -c "from evals.response_cache import ResponseCache; print(ResponseCache().clear(), 'files deleted')"
```

Set `PYTHONIOENCODING=utf-8` on Windows consoles; the report uses block characters.

## Modes

| Mode | API calls | Cost | Use |
|---|---|---|---|
| `mock` | none | 0 | testing the harness |
| `live`, cache hit | none | 0 | reruns on unchanged fixtures and prompt |
| `live`, cache miss | yes | see below | first run, or after a prompt change |

The runner also accepts `--mode cached`; it behaves as `mock` and is kept only for backwards compatibility.

## Fixtures

`fixtures/transactions.json`: 50 labelled UK SME bank transactions, generated with Claude, none taken from Xero:

- 31 easy (unambiguous: HMRC, well-known SaaS, payroll)
- 15 medium (need context: memberships, dual-purpose spend, inter-account transfers)
- 4 hard (industry-specific, balance sheet versus P&L edge cases)

`fixtures/accounts.json`: 20 UK chart-of-accounts codes.

The tier split is diagnostic: the hard tier has four items, so its rate is read alongside the overall figure.

## Cost

`cost_tracker.py` holds Anthropic list prices per million tokens: Haiku 5.5 at 0.10 in / 0.50 out and Sonnet 5.5 at
2.00 / 10.00 (checked 2026-10-28), Haiku 4.5 at 1.00 / 5.00, Sonnet 4.6 at 3.00 / 15.00 and Opus 4.6 at 5.00 / 25.00
(checked 2026-10-10). Sonnet is 20x Haiku per token on 5.5 and 3x on 4.x. Before a live run
the tracker prints an estimate from assumed token counts (800 in, 150 out per fixture, about USD 0.08 for 50 fixtures
on Haiku). During the run it adds up the cost of every recorded call and stops the run as soon as the total passes
`--budget`.

## Acceptance gates

The runner exits non-zero when one of the three accuracy gates is missed. Gates are enforced by the runner.
The cost row is a target the report shows.

| Metric | Minimum | Target | Enforced |
|---|---|---|---|
| Overall accuracy | 80% | 90% | yes |
| Easy tier accuracy | 95% | 100% | yes |
| Auto-accept tier accuracy (confidence above 0.85) | 90% | 95% | yes |
| Cost per transaction | under USD 0.01 | under USD 0.005 | no |

## Results and provenance

Result CSVs are written to `results/` (gitignored). An accuracy figure is published only together with
its provenance: commit, fixture version, prompt version, model id and date.

## Files

```
evals/
├── README.md
├── cost_tracker.py       token counting, price table, budget guard
├── response_cache.py     disk cache keyed by SHA-256(model + prompt)
├── eval_runner.py        loads fixtures, calls the model, prints metrics, enforces gates
├── fixtures/             transactions.json (50), accounts.json (20)
├── results/              CSV per run (gitignored)
└── .cache/               cached responses (gitignored)
```
