# Eval harness

Measures the categorisation prompt on a fixed set of synthetic UK transactions: accuracy by difficulty tier,
per-category F1, confidence calibration and API cost. It is a harness for the prompt, not a replay of the production
agent: it sends its own prompt with no precedent retrieval and no model routing. Parity with the production graph
is on the [roadmap](../../docs/PRODUCTION_ROADMAP.md).

## Quick start

```bash
cd backend

# Rule-based mock: no API calls, free. Exercises the harness itself.
python -m evals.eval_runner --mode mock

# Live run with a hard budget (USD). Responses are cached to disk, so reruns are free.
python -m evals.eval_runner --mode live --budget 0.10

# Compare models
python -m evals.eval_runner --mode live --model claude-haiku-4-5-20251001 --budget 0.10
python -m evals.eval_runner --mode live --model claude-sonnet-4-6 --budget 0.50

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

`fixtures/transactions.json`: 50 labelled synthetic UK SME bank transactions, written by hand (no Xero API data):

- 31 easy (unambiguous: HMRC, well-known SaaS, payroll)
- 15 medium (need context: memberships, dual-purpose spend, inter-account transfers)
- 4 hard (industry-specific, balance sheet versus P&L edge cases)

`fixtures/accounts.json`: 20 UK chart-of-accounts codes.

The hard tier is too small to support a claim on its own; treat the tier split as diagnostic.

## Cost

`cost_tracker.py` holds Anthropic list prices per million tokens (checked 2026-10-10): Haiku 4.5 at 1.00 in / 5.00
out, Sonnet 4.6 at 3.00 / 15.00, Opus 4.6 at 5.00 / 25.00. Sonnet is therefore 3x Haiku per token. Before a live run
the tracker prints an estimate from assumed token counts (800 in, 150 out per fixture, about USD 0.08 for 50 fixtures
on Haiku) and aborts if it exceeds `--budget`; recorded cost is the actual token usage after the run.

## Acceptance gates

The runner exits non-zero when one of the three accuracy gates is missed. Gates are enforced by the runner, not
yet in CI. The cost row is a target the report shows; it is not enforced.

| Metric | Minimum | Target | Enforced |
|---|---|---|---|
| Overall accuracy | 80% | 90% | yes |
| Easy tier accuracy | 95% | 100% | yes |
| Auto-accept tier accuracy (confidence above 0.85) | 90% | 95% | yes |
| Cost per transaction | under USD 0.01 | under USD 0.005 | no |

## Results and provenance

Result CSVs are written to `results/` (gitignored). No accuracy figure is published in this repository until a run is
committed together with its provenance: commit, fixture version, prompt version, model id and date. Earlier
README figures were removed on 2026-10-10 for that reason.

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
