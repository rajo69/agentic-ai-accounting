# AI Accountant: Agentic AI for Accounting Workflows

A production-grade AI assistant for UK accountants built on top of **Xero**. It automates the three most time-consuming manual tasks in a small accounting practice: transaction categorisation, bank reconciliation, and management letter drafting. Every AI decision is transparent, auditable, and correctable by the human in the loop.

---

## The problem

UK accounting firms spend a significant portion of each working week on tasks that are mechanical but error-prone:

- **Transaction categorisation**: Matching hundreds of bank transactions to the right chart-of-accounts code. Every transaction must be correct because errors compound into the final accounts.
- **Bank reconciliation**: Cross-referencing bank statement lines with transaction records one by one, hunting for matching amounts and dates.
- **Management letters**: Writing quarterly commentary from scratch, turning raw figures into narrative that clients can act on.

These are exactly the tasks where AI can save hours, provided the AI is transparent enough that a professional accountant can trust and verify its decisions. An AI tool that says "category: Office Supplies" with no justification is not useful to someone with professional liability for the accounts they sign.

This project is a full-stack implementation of a solution to that problem: an agentic AI system that categorises, reconciles, and writes, but always shows its working.

---

## What it does

| Feature | How it works |
|---|---|
| **Transaction categorisation** | LangGraph agent classifies Xero transactions against the chart of accounts using Claude and pgvector few-shot examples drawn from the firm's own history. High-confidence results are applied automatically; uncertain results are surfaced for human review. |
| **Bank reconciliation** | Algorithmic LangGraph agent matches bank statement lines to transactions by scoring amount, date, and description similarity. Matching is deterministic (no LLM); Claude only writes the human-readable explanation after a match is found. |
| **Management letter generation** | RAG pipeline computes financial figures in pure Python (no LLM), retrieves relevant transaction context via pgvector, then uses Claude and Instructor to write structured narrative sections. WeasyPrint renders the result as a professional A4 PDF. |
| **Explainable AI** | Every AI decision stores feature importances (InterpretML EBM), a fuzzy logic risk score (Simpful), and the LLM's own reasoning; all in an immutable audit log. |
| **Xero integration** | Full OAuth2 flow, automatic token refresh, rate-limit backoff, and incremental sync of accounts, transactions, and bank statements. |
| **Few-shot learning from corrections** | When an accountant corrects a categorisation, the transaction is re-embedded and becomes a training example for future predictions. No fine-tuning required. |

---

## Architecture

```mermaid
flowchart TD
    Browser["Browser / API Client"]

    subgraph Vercel["Vercel"]
        Frontend["Next.js 14\nLanding · Dashboard · Transactions · Reconciliation · Documents"]
    end

    subgraph Railway["Railway"]
        subgraph FastAPI["FastAPI"]
            Routes["API Routes\n/auth · /sync · /categorise · /reconcile · /documents"]

            subgraph SvcLayer["Service Layer"]
                XA["XeroAdapter"]
                ES["EmbeddingService"]
                DS["DocumentService"]
            end

            subgraph AgentLayer["LangGraph Agents"]
                CA["CategoriserAgent"]
                RA["ReconcilerAgent"]
            end

            subgraph XAILayer["XAI Engine"]
                EBM["EBM Explainer"]
                Fuzzy["Simpful Fuzzy Risk Scorer"]
            end
        end

        DB[("PostgreSQL 16\n+ pgvector\nRedis")]
    end

    Claude["Anthropic Claude API"]
    Xero["Xero API\nOAuth2 + REST"]

    Browser -->|HTTPS| Frontend
    Frontend -->|REST / JSON| Routes
    Routes --> SvcLayer
    Routes --> AgentLayer
    Routes --> XAILayer
    FastAPI --> DB
    CA --> Claude
    RA --> Claude
    DS --> Claude
    XA --> Xero
```

---

### Data flow: transaction categorisation

```mermaid
flowchart TD
    XeroAPI["Xero API"]
    TxTable["transactions table\nstatus: uncategorised"]
    Agent["CategoriserAgent\nLangGraph"]
    pgv["pgvector\n5 nearest categorised examples\ncosine similarity"]
    ClaudeAPI["Claude API\nclassify + structured reasoning"]
    Audit["AuditLog\nevery decision\nfull XAI payload stored as JSONB"]
    Auto["auto_categorised\nwritten to DB immediately"]
    Suggested["suggested\nshown with Accept / Reject buttons"]
    Review["needs_review\nflagged for human\nno guess shown"]

    XeroAPI -->|sync| TxTable
    TxTable --> Agent
    Agent <-->|few-shot lookup| pgv
    Agent <-->|CategoryPrediction| ClaudeAPI
    Agent -->|always| Audit
    Agent -->|confidence above 0.85| Auto
    Agent -->|confidence 0.50 to 0.85| Suggested
    Agent -->|confidence below 0.50| Review
```

---

## How each feature works

### 1. Xero data sync

`integrations/xero_adapter.py` handles the entire Xero relationship:

- **OAuth2 flow**: Redirects the user to Xero, receives the auth code, exchanges it for access and refresh tokens, and stores them against the `Organisation` record.
- **Token lifecycle**: Access tokens expire after 30 minutes. `_ensure_valid_token()` detects expiry with a 60-second buffer and silently refreshes before every API call.
- **Three sync methods**: `sync_accounts()` (chart of accounts), `sync_transactions()` (bank transactions), `sync_bank_statements()`. Each upserts on `xero_id` so reruns are idempotent.
- **Rate-limit backoff**: Xero allows 60 requests per minute. `_get_with_retry()` catches HTTP 429 and waits 60 seconds before retrying, up to 3 attempts.
- **Date parsing**: Xero returns dates in two formats: `/Date(1234567890000+0000)/` (Unix ms with offset) and ISO 8601. Both are handled.

The adapter was built with raw `httpx` rather than the official `xero-python` SDK. The SDK wraps synchronous `requests` and requires additional adapters in an async context. Direct httpx is easier to test (mock `AsyncClient`), easier to debug, and gives full control over token management.

---

### 2. Transaction categorisation agent

`agents/categoriser.py`: a five-node LangGraph graph.

#### Graph structure

```mermaid
flowchart LR
    FC["fetch_context"] --> CL["classify"] --> VA["validate"] --> DE["decide"] --> EX["explain"]
```

**Node 1: fetch_context**

Loads the chart of accounts from the database and queries pgvector for the 5 most similar previously categorised transactions using cosine similarity:

```sql
ORDER BY embedding <=> $query_embedding LIMIT 5
```

These become the few-shot examples in the classification prompt.

**Node 2: classify**

Builds a structured prompt containing:
- The transaction to classify (date, amount, description, reference)
- The full chart of accounts (code and name)
- The 5 similar examples with their confirmed categories

Calls Claude via `instructor[anthropic]`, forcing output into:

```python
class CategoryPrediction(BaseModel):
    category_code: str
    category_name: str
    confidence: float      # range 0.0 to 1.0
    reasoning: str         # plain English explanation
```

Claude is never trusted to return parseable free text. Instructor uses Anthropic's tool-use feature to guarantee structured output, with automatic retry on Pydantic validation failure.

**Node 3: validate**

Checks two things:
1. Does `category_code` exist in the chart of accounts?
2. Is `confidence` in the range `[0.0, 1.0]`?

If either check fails, confidence is set to 0 and the reasoning is overwritten with "validation failed". The decision node will then flag this transaction for human review rather than making a bad auto-categorisation.

**Node 4: decide**

Applies confidence thresholds:

| Confidence | Status | What happens |
|---|---|---|
| Above 0.85 | `auto_categorised` | Written to DB immediately; no human needed |
| 0.50 to 0.85 | `suggested` | Shown to accountant with Accept/Reject buttons |
| Below 0.50 | `needs_review` | Flagged; no suggestion shown (a confusing low-confidence guess is worse than no guess) |

An `AuditLog` row is written in all cases.

**Node 5: explain**

Calls the XAI engine (see section 4) to compute feature importances and a fuzzy risk score. Both are appended to the `AuditLog.ai_decision_data` JSONB field.

#### Few-shot learning from corrections

When an accountant corrects a categorisation via `POST /transactions/{id}/correct`, the transaction is re-embedded and the new embedding is stored. The next time a similar transaction arrives, the corrected version appears in `similar_examples`; the vector store acts as the training set. No fine-tuning, no retraining, no separate pipeline.

#### Batch runner

`categorise_batch()` fetches all uncategorised transactions and processes them concurrently with `asyncio.Semaphore(5)`, keeping Claude API costs predictable and preventing runaway parallel requests.

---

### 3. Bank reconciliation agent

`agents/reconciler.py`: a five-node LangGraph graph. No LLM is used for the matching decision; only for the explanation.

#### Graph structure

```mermaid
flowchart LR
    FC["find_candidates"] --> SC["score_candidates"] --> DE["decide"] --> EX["explain"] --> SA["save"]
```

**Node 1: find_candidates**

Queries the transactions table for candidates where:
- Amount is within £0.01 of the bank statement amount (Decimal comparison, no float)
- Date is within 7 days of the bank statement date
- Same `organisation_id`

Returns up to 10 candidates.

**Node 2: score_candidates**

Scores each candidate on three signals:

```
combined_score = (amount_score × 0.5) + (date_score × 0.2) + (description_score × 0.3)

amount_score:
  1.0  <- exact Decimal match
  0.8  <- within 1%
  0.0  <- otherwise

date_score:
  1.0  <- same day
  max(0.0, 1.0 - days_difference × 0.15)

description_score:
  RapidFuzz.token_sort_ratio(a, b) / 100
```

**Why these weights**: Amount is the strongest signal in UK bank reconciliation. An exact match with a close date is nearly always correct. Date is down-weighted because Xero transactions are sometimes backdated. Description similarity is useful for disambiguation but unreliable alone because bank descriptions vary by institution.

**Why `token_sort_ratio`**: Bank descriptions often contain the same words in different order ("TESCO STORES UK" vs "UK STORES TESCO"). `token_sort_ratio` sorts tokens before comparing, making it robust to word-order variation.

**Node 3: decide**

Applies thresholds:

| Score | Status |
|---|---|
| Above 0.9 | `auto_matched` |
| 0.6 to 0.9 | `suggested` |
| Below 0.6 or two candidates within 0.05 of each other | `needs_review` |

**Node 4: explain**

Calls Claude to write one sentence: *"Matched to TESCO STORES on 14 Mar: amount matches exactly (£52.40), same day, description 87% similar."* This is the only LLM call in the reconciliation pipeline.

**Node 5: save**

Updates `BankStatement.matched_transaction_id`, `match_confidence`, and `match_status`. Writes `AuditLog`.

---

### 4. Explainable AI stack

`xai/explainer.py` and `xai/fuzzy_engine.py`

Every categorisation decision receives three layers of explanation, all stored in `AuditLog.ai_decision_data`:

#### Layer 1: LLM reasoning (always present)

Claude's `reasoning` field from the `CategoryPrediction` output. Plain English: *"This is likely a software subscription based on the ADOBE description, the £47.99 recurring amount, and the fact that 3 similar transactions have been categorised as Computer Equipment and Software."*

#### Layer 2: InterpretML EBM feature importances

Once 50 or more labelled transactions exist in the organisation, an Explainable Boosting Machine is trained on five features:

| Feature | How it is computed |
|---|---|
| `amount` | Absolute transaction value |
| `day_of_week` | Integer 0 to 6 |
| `description_length` | Character count of description |
| `vendor_frequency` | Count of transactions with a matching description prefix |
| `category_history_count` | Count of confirmed transactions in the predicted category |

EBM was chosen over a standard boosted tree because its predictions are additive by feature; each feature's contribution to the final score is directly readable and visualisable as a bar chart. It is a glass-box model.

Below 50 samples, the fallback is Layer 1 (the LLM's own reasoning text).

#### Layer 3: Simpful fuzzy risk score (always present)

A Mamdani-style fuzzy inference system with triangular membership functions and centroid defuzzification, implemented directly in `fuzzy_engine.py`.

**Three input variables** (all normalised to the range [0, 1]):

| Variable | What it measures |
|---|---|
| `amount_deviation` | How far the amount deviates from the category average (z-score normalised) |
| `vendor_frequency` | How often this vendor appears in transaction history |
| `time_pattern` | Whether the transaction date is a weekday (0.9) or weekend (0.3) |

**Eight rules**:

```
IF amount_deviation IS high AND vendor_frequency IS rare     -> risk IS high
IF amount_deviation IS high AND vendor_frequency IS frequent -> risk IS medium
IF amount_deviation IS low  AND vendor_frequency IS frequent -> risk IS low
IF amount_deviation IS low  AND vendor_frequency IS rare     -> risk IS medium
IF amount_deviation IS medium                                -> risk IS medium
IF time_pattern IS unusual  AND vendor_frequency IS rare     -> risk IS high
IF time_pattern IS normal   AND amount_deviation IS low      -> risk IS low
IF amount_deviation IS high AND time_pattern IS unusual      -> risk IS high
```

**Why fuzzy logic over a neural anomaly detector**: Fuzzy rules are human-readable, deterministic (same input produces same output always), and transparent. An accountant can review and challenge the rules directly. A neural anomaly detector would be a black box. For an accounting tool where professional trust is the product, interpretability beats marginal accuracy gains.

**Output**: `risk_score` in [0, 1], `risk_label` in {low, medium, high}, and the list of fired rules in plain English; shown directly in the UI so the accountant understands exactly why a transaction was flagged.

---

### 5. Document generation

`services/document_service.py`

Follows a strict separation between computation and language:

**Step 1: Calculate figures (pure Python, no LLM)**
```
total_income, total_expenses, net_profit_or_loss
top_5_expense_categories (by spend)
largest_5_transactions
transaction_count, period_start, period_end
```

**Step 2: Retrieve context (pgvector)**

Semantic search over transactions for the period to find patterns and notable items relevant to the narrative.

**Step 3: Generate narrative (Claude via Instructor)**

The prompt contains all computed figures and vector-retrieved context. Claude writes five structured sections:

```python
class DocumentNarrative(BaseModel):
    executive_summary: str
    income_analysis: str
    expense_analysis: str
    cash_flow_observations: str
    recommendations: str
```

The LLM never touches the numbers directly; it writes around figures that have already been computed and verified in Python.

**Step 4: Render PDF (Jinja2 and WeasyPrint)**

A Jinja2 HTML template is populated with figures and narrative, then rendered to A4 PDF with WeasyPrint. Includes page numbers, professional typography, and an "AI-Assisted Draft" watermark footer. WeasyPrint was chosen over Puppeteer (too heavy for a Python backend) and ReportLab (requires programmatic x/y layout; HTML/CSS is far more natural for structured documents).

---

## Tech stack

### Backend

| Component | Choice | Why |
|---|---|---|
| Framework | FastAPI 0.115 | Async-native from day one; automatic OpenAPI docs; Pydantic v2 on every boundary |
| ORM | SQLAlchemy 2.0 (async) | pgvector support; Alembic migrations; typed `mapped_column` style |
| Database | PostgreSQL 16 + pgvector | Single DB handles both relational and vector queries; no separate vector database needed at this scale |
| Migrations | Alembic | Schema versioning; production startup runs `alembic upgrade head` automatically |
| AI agents | LangGraph | Explicit state machine; each node is a pure function, testable in isolation, state transitions are auditable |
| LLM | Anthropic Claude | Strong instruction-following for structured output; Haiku is extremely cost-efficient for high-volume categorisation |
| Structured output | Instructor + Pydantic v2 | Guarantees typed LLM output via Anthropic tool-use; never parses free text |
| Embeddings | sentence-transformers/all-MiniLM-L6-v2 | 384-dim, runs locally, zero API cost; sufficient for semantic similarity on short transaction descriptions |
| XAI | InterpretML (EBM), Simpful (fuzzy) | Glass-box models; outputs are directly interpretable without post-hoc approximation |
| String matching | RapidFuzz | C-extension reimplementation of fuzzywuzzy; 10 to 100x faster, no GPL licence issues |
| PDF | WeasyPrint + Jinja2 | HTML/CSS authoring is natural for structured documents; pure Python, no Chromium dependency |
| HTTP client | httpx (async) | Async-native with identical sync API; HTTP/2 support; standard for modern async Python |
| Auth | JWT + Xero OAuth2 | Xero identity is the login identity in MVP; no separate user table |
| Cache | Redis | Optional; used for session state and future API response caching |

### Frontend

| Component | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS 3 |
| Components | shadcn/ui |
| Animation | Framer Motion |
| Notifications | Sonner (toast) |
| Icons | lucide-react |

### Infrastructure

| Component | Choice |
|---|---|
| Local dev | Docker Compose (PostgreSQL 16 + pgvector, Redis 7) |
| Backend hosting | Railway (Docker, auto-deploy on push) |
| Frontend hosting | Vercel (Next.js, auto-deploy on push) |
| Container | Python 3.12-slim multi-stage, WeasyPrint system deps pre-installed |

---

## Database schema

Seven tables. All data queries are scoped by `organisation_id`; there is no route that returns data across organisations.

```
organisations
  id (UUID PK)
  name, xero_tenant_id (UNIQUE)
  xero_access_token, xero_refresh_token, xero_token_expires_at
  last_sync_at, created_at, updated_at

accounts                           <- chart of accounts, synced from Xero
  id, organisation_id (FK)
  xero_id (UNIQUE), code, name, type, tax_type

transactions
  id, organisation_id (FK), account_id (FK nullable)
  xero_id (UNIQUE)
  date, amount (NUMERIC 12,2), description, reference
  category, category_confidence (NUMERIC 5,4)
  categorisation_status            <- uncategorised | auto_categorised | suggested | confirmed | rejected
  is_reconciled (BOOLEAN)
  embedding (Vector 384)           <- pgvector, used for few-shot lookup
  [INDEX: date, categorisation_status]

bank_statements
  id, organisation_id (FK)
  xero_id (UNIQUE)
  date, amount, description, reference
  matched_transaction_id (FK nullable)
  match_confidence (NUMERIC 5,4)
  match_status                     <- unmatched | auto_matched | suggested | confirmed
  [INDEX: match_status]

audit_logs                         <- append-only, no update or delete routes
  id, organisation_id (FK)
  action, entity_type, entity_id
  old_value, new_value (JSONB)     <- full entity snapshots before and after
  ai_model, ai_confidence, ai_explanation
  ai_decision_data (JSONB)         <- full XAI payload: features, risk score, fired rules
  created_at
  [INDEX: (entity_type, entity_id)]

generated_documents
  id, organisation_id (FK)
  template, period_start, period_end
  ai_model, figures (JSONB)
  generated_at
```

**Financial amounts are always `NUMERIC(12,2)` / Python `Decimal`.** IEEE 754 float cannot represent 0.1 exactly; a rounding error causing a penny discrepancy in a reconciliation match is a critical bug in an accounting tool. Float is never used for money.

**SPEND transactions are stored as negative amounts.** Consistent with double-entry accounting: the sum of all transactions equals the bank account balance.

**The audit log is append-only.** There is no DELETE or UPDATE route for `audit_logs`. It records the full XAI payload so any decision can be reconstructed, explained, and challenged after the fact; including for GDPR right-to-explanation requests.

---

## API reference

### Auth and data

```
GET  /auth/xero/connect                       Redirect to Xero OAuth2
GET  /auth/xero/callback?code=...             Exchange code for JWT session
GET  /api/v1/auth/me                          Current org (requires JWT)
POST /api/v1/auth/logout                      Clear session

POST /api/v1/sync                             Full Xero sync (accounts + transactions + statements)
GET  /api/v1/sync/status                      Last sync timestamp, row counts
GET  /api/v1/dashboard/summary                Aggregate stats
```

### Categorisation

```
POST /api/v1/categorise                       Batch-categorise all uncategorised transactions
GET  /api/v1/transactions                     List (paginated, filter by status/date/search)
GET  /api/v1/transactions/{id}                Single transaction + audit history
POST /api/v1/transactions/{id}/approve        Accept suggested category
POST /api/v1/transactions/{id}/correct        Override with correct category; re-embeds transaction
POST /api/v1/transactions/{id}/reject         Reject suggestion; reset to uncategorised
GET  /api/v1/transactions/{id}/explanation    Full XAI package
```

### Reconciliation

```
POST /api/v1/reconcile                        Batch-reconcile all unmatched bank statements
GET  /api/v1/bank-statements                  List (paginated, filter by match_status/date)
GET  /api/v1/bank-statements/{id}             Single statement + candidates + scores + audit
POST /api/v1/bank-statements/{id}/confirm     Accept suggested match
POST /api/v1/bank-statements/{id}/unmatch     Remove a match
POST /api/v1/bank-statements/{id}/match       Manually match to a specific transaction_id
```

### Documents

```
POST /api/v1/documents/generate               Generate PDF (body: template, period_start, period_end)
GET  /api/v1/documents                        List previously generated documents
```

### Explanations

```
GET  /api/v1/transactions/{id}/explanation

Response:
{
  "prediction": { "category_code", "category_name", "confidence", "reasoning" },
  "top_features": [{ "name", "value", "contribution" }],
  "model_type": "ebm" or "llm",
  "risk_score": 0.0 to 1.0,
  "risk_label": "low" or "medium" or "high",
  "fired_rules": ["IF amount deviation IS high AND...", ...],
  "input_values": { "amount_deviation", "vendor_frequency", "time_pattern" },
  "audit_trail": [{ "action", "created_at", "ai_model", "ai_confidence" }]
}
```

---

## Evaluation framework

`backend/evals/` contains a dedicated evaluation harness for the categorisation agent, independent of the application test suite.

### Fixture set

`fixtures/transactions.json` contains 50 labelled UK SME bank transactions:
- **24 easy**: Unambiguous (HMRC payments, well-known SaaS, payroll runs)
- **16 medium**: Require context (professional memberships, dual-category spends, inter-company transfers)
- **10 hard**: Industry-specific, balance-sheet vs P&L edge cases, unfamiliar vendors

`fixtures/accounts.json` contains 20 standard UK chart-of-accounts codes.

### Running evals

```bash
cd backend

# Dry run: rule-based mock, zero API cost
python -m evals.eval_runner --mode mock

# Live run with response caching (real API on first run, free on reruns)
python -m evals.eval_runner --mode live --budget 0.05

# Model comparison
python -m evals.eval_runner --mode live --model claude-haiku-4-5-20251001 --budget 0.05
python -m evals.eval_runner --mode live --model claude-sonnet-4-6 --budget 0.50

# Quick smoke test
python -m evals.eval_runner --mode live --limit 10 --budget 0.01
```

### Sample output

```
Overall accuracy: 88.0% (44/50)

By difficulty:
  easy   : 95.8% (23/24)  ████████████████████
  medium : 81.3% (13/16)  ████████████████
  hard   : 80.0% ( 8/10)  ████████████████

Confidence calibration:
  high   (>0.85) : acc=95.0% (40 transactions)  <- auto-accept threshold
  medium (0.5 to 0.85): acc=71.4% ( 7 transactions) <- shown to accountant
  low    (<0.5)  : acc=33.3% ( 3 transactions)  <- flagged for review

Per-category F1:
  404 Computer Equipment & Software : F1=0.95
  820 Tax & Statutory Payments      : F1=1.00
  ...
```

### Acceptance criteria

The agent must pass these thresholds before any deployment:

| Metric | Minimum | Target |
|---|---|---|
| Overall accuracy | 80% | 90%+ |
| Easy accuracy | 95% | 100% |
| Auto-accept accuracy (conf above 0.85) | 90% | 95% |
| Cost per transaction | below $0.01 | below $0.005 |
| F1 on core categories (HMRC, payroll, software) | 0.90 | 0.95+ |

### Cost controls

- `cost_tracker.py` counts tokens and enforces a `--budget` hard limit before the run starts
- `response_cache.py` caches responses to disk keyed by `SHA-256(model + prompt)`. All reruns against unchanged fixtures cost $0
- Default eval model is `claude-haiku-4-5-20251001` (approximately 10x cheaper than Sonnet). Switch to Sonnet only for pre-deployment quality checks

---

## Running locally

**Prerequisites**: Docker Desktop, Python 3.12, Node.js 18+

```bash
# 1. Clone and start the database
git clone <repo>
docker-compose up -d          # PostgreSQL 16 + pgvector, Redis

# 2. Backend
cd backend
cp .env.example .env
# Edit .env: fill in XERO_CLIENT_ID, XERO_CLIENT_SECRET, ANTHROPIC_API_KEY

pip install -e ".[dev,ai,docs]"
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 3. Frontend
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

Environment variables (`backend/.env`):

```
DATABASE_URL=postgresql+asyncpg://aiaccountant:localdev123@localhost:5432/aiaccountant
DATABASE_URL_SYNC=postgresql://aiaccountant:localdev123@localhost:5432/aiaccountant
REDIS_URL=redis://localhost:6379
SECRET_KEY=change-me-in-production
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
XERO_REDIRECT_URI=http://localhost:8000/auth/xero/callback
ANTHROPIC_API_KEY=
FRONTEND_URL=http://localhost:3000
```

---

## Tests

```bash
cd backend

pytest -x -v                          # full test suite
pytest tests/test_health.py           # health endpoint
pytest tests/test_xero_integration.py # OAuth mock, sync methods
pytest tests/test_categorise.py       # categorisation agent (mocked Claude)
pytest tests/test_reconcile.py        # reconciliation scoring + Decimal edge cases
pytest tests/test_documents.py        # document generation
pytest tests/test_xai.py              # fuzzy engine + EBM explainer

cd frontend
npm run lint
npx tsc --noEmit
```

The test suite mocks all external API calls (Xero, Anthropic) so tests run offline without credentials.

---

## Cost model

### Per-operation costs

| Operation | Model | Approx. cost |
|---|---|---|
| Transaction categorisation | Claude Haiku | ~$0.0013 |
| Transaction categorisation | Claude Sonnet | ~$0.0047 |
| Reconciliation explanation | Claude Haiku | ~$0.0002 |
| Management letter | Claude Sonnet | ~$0.011 |
| Embeddings | sentence-transformers (local) | $0.00 |

### At scale

| Customers | Transactions per month | API cost per month |
|---|---|---|
| 5 (beta) | 1,000 | ~$0.52 |
| 20 | 4,000 | ~$2.06 |
| 100 | 20,000 | ~$10.30 |

At 100 customers paying £49 per month, API cost is under 0.2% of revenue.

### Cost optimisation mechanisms

1. **Auto-categorisation reduces volume**: as the pgvector few-shot store grows, more transactions hit the above-0.85 threshold and are categorised without prompting. Cost per new transaction trends toward zero as patterns repeat.
2. **Reconciliation matching uses no LLM**: only the explanation sentence calls Claude.
3. **Eval caching**: `response_cache.py` makes all eval reruns free after the first run.
4. **Concurrency cap**: `asyncio.Semaphore(5)` in `categorise_batch()` prevents runaway parallel API calls.
5. **Embeddings computed once**: stored in the `embedding` column and reused until a correction triggers re-embedding.

---

## Deployment

### Backend to Railway

```
# Railway reads this from Procfile:
web: alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Railway auto-provisions PostgreSQL 16 with pgvector and Redis. Set `ANTHROPIC_API_KEY`, `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`, and `SECRET_KEY` in the Railway dashboard. `DATABASE_URL` and `REDIS_URL` are injected automatically.

### Frontend to Vercel

Connect the repository to Vercel, set `NEXT_PUBLIC_API_URL` to the Railway backend URL, and deploy. Auto-deploy on push to `main`.

After deploying, update `XERO_REDIRECT_URI` in Railway and in the Xero Developer Portal to `https://yourdomain.com/auth/xero/callback`.

### Migrations in production

Alembic runs as part of the startup command; the server will not start if there are pending migrations, which prevents schema drift between deployments.

---

## Limitations

These are genuine current limitations, not caveats to dismiss:

**Categorisation accuracy depends on history volume.** The few-shot pgvector lookup improves as the accountant corrects predictions and the vector store grows. A brand-new organisation with zero labelled transactions gets only chart-of-accounts context; accuracy will be lower until approximately 50 confirmed transactions exist. The eval framework's acceptance criteria account for this, but new users should expect a short calibration period.

**Confidence thresholds are not calibrated per client.** The 0.85 and 0.50 thresholds were chosen based on the evaluation fixture set. Different firms have different transaction patterns, and a threshold that works well for a retail client may be too aggressive for a construction firm with irregular payments. Threshold tuning per organisation is planned but not implemented.

**Fuzzy risk scoring uses heuristic input normalisation.** `vendor_frequency` is normalised by dividing raw count by 20 (i.e., 20 or more appearances = "frequent"). This cap is arbitrary and may not fit all organisation sizes. A firm with 5,000 transactions per month will have different frequency distributions than one with 200.

**Xero sync is full-page, not incremental.** `sync_transactions()` fetches all pages on every sync. This is acceptable for SMEs but will be slow for organisations with thousands of transactions. `If-Modified-Since` incremental sync is designed but not yet implemented.

**OAuth tokens are stored in plaintext.** Acceptable for local development and early beta, but must be encrypted at rest (application-level AES or Railway's encryption at rest) before handling production client data.

**Single tenant per Xero organisation.** One Xero firm equals one tenant. Multi-user access within a firm is not implemented. All queries are scoped to `organisation_id` only; user-level permissions within an organisation are post-beta.

**EBM requires 50 or more labelled samples.** Below this threshold, Layer 2 (feature importance) falls back to the LLM's reasoning text. New organisations will rely solely on Layers 1 and 3 (LLM reasoning and fuzzy risk) until sufficient data accumulates.

**PDF rendering is CPU-intensive.** WeasyPrint renders HTML to PDF synchronously. For large management letters it can take 2 to 5 seconds. This is acceptable for an on-demand operation but would block the event loop if called frequently. It should be moved to a background worker before scaling.

**No QuickBooks integration yet.** The XeroAdapter is the only accounting platform integration. The architecture is designed to accommodate additional adapters (the data models are platform-agnostic), but QuickBooks OAuth2 and API mapping is not implemented.

---

## Future work

Items scoped out of the current build, ordered by likely priority:

| Item | Reason not built yet |
|---|---|
| Incremental Xero sync (`If-Modified-Since`) | Not needed at MVP scale; adds complexity |
| Per-organisation confidence threshold tuning | Requires sufficient data to calibrate; post-beta |
| QuickBooks adapter | Second platform; same architecture, different OAuth2 flow |
| Token encryption at rest | Planned for pre-beta; currently plaintext in dev |
| Stripe billing integration | Post-beta; add when users confirm willingness to pay |
| Multi-user within an organisation | Post-beta; user table + RBAC middleware |
| Background PDF rendering | Needed at scale; move WeasyPrint to Celery worker |
| GDPR formal compliance | Planned after sufficient revenue; privacy policy in place |
| Additional document templates | Tax letters, VAT returns; build based on user requests |
| Fine-tuning on categorisation corrections | Potential accuracy improvement; expensive; evaluate after sufficient data |

---

## Absolute invariants

Rules that must survive refactoring and new contributors:

| Rule | Reason |
|---|---|
| `Decimal` for all money (`NUMERIC(12,2)` in DB) | Float rounding causes penny errors in reconciliation; a critical trust failure |
| Every AI decision writes to `AuditLog` | Professional accountability; GDPR right to explanation |
| LLM calls only in `services/` or `agents/` | Routes must never call Claude directly |
| Xero calls only via `XeroAdapter` | Centralised token refresh, rate limiting, retry logic |
| Structured LLM output via Instructor | Never parse free text from LLM |
| Tests before commit | Minimum: one happy-path test per new endpoint or service method |
| SPEND transactions stored as negative | Consistent with double-entry accounting |
| Confidence thresholds are not hardcoded | Will need tuning per customer; keep them configurable |

---

## Project structure

```
.
├── docker-compose.yml               PostgreSQL 16 + pgvector, Redis
├── docs/
│   └── ARCHITECTURE.md             Full design rationale and tech decisions
└── backend/
    ├── pyproject.toml
    ├── Dockerfile
    ├── Procfile                     Railway deployment command
    ├── alembic/                     4 migrations (schema, embedding resize, documents)
    └── app/
        ├── main.py                  FastAPI app, routers, CORS, lifespan
        ├── core/                    config, database, session/JWT
        ├── models/                  SQLAlchemy models + Pydantic v2 schemas
        ├── integrations/            xero_adapter.py
        ├── services/                embedding_service.py, document_service.py
        ├── agents/                  categoriser.py, reconciler.py (LangGraph)
        ├── xai/                     explainer.py (EBM), fuzzy_engine.py (Simpful)
        ├── api/v1/                  health, auth, sync, dashboard, categorise,
        │                            reconcile, documents, explanations
        ├── templates/               management_letter.html (Jinja2 + WeasyPrint)
        └── tests/ + evals/          test suite + evaluation harness
frontend/
    └── src/
        ├── app/                     page.tsx (landing), dashboard, transactions,
        │                            reconciliation, documents, auth/callback, privacy
        ├── components/              app-shell, sidebar, aurora, explanation-panel,
        │                            gradient-text, fluid-glass-button, shadcn/ui
        └── lib/                     api.ts (fetch wrapper + types), utils.ts
```

---

## Licence

MIT
