# Prompt: Write CV Project Description and Cover Letter

## How to use this file

Paste this entire file into a new Claude conversation and say:
"Please write my CV project description and cover letter using everything below."

Fill in every `[PLACEHOLDER]` before pasting.

---

## 1. The role I am applying for

**Job title**: AI Engineer in Accounting (KTP Associate)
**Job ref**: REQ09869
**Organisation**: University of Essex in partnership with Active Software Platform UK Ltd
**Salary**: £41,500 to £52,000 per annum, 30-month fixed term
**Location**: Remote (Maidenhead, Berkshire base)
**Academic supervisor**: Prof Hani Hagras (University of Essex)
**Industry supervisor**: Andy Collings (Active Software Platform UK Ltd)

### What the role actually involves

Active Software Platform UK Ltd sells practice management software to medium and large UK accounting firms, with integrations into Xero and QuickBooks. The KTP Associate will:

- Build a Generative AI solution for accounting workflows (their product lines are called Junior Assist and Reviewer Assist)
- Research and develop an Agentic AI management system embedded in their accounting software
- Design an Explainable AI decision system that generates letters, forms, reports and automates accounting processes
- Implement fuzzy logic models and consensus-based decision frameworks for heterogeneous financial data
- Embed the AI into their existing product architecture while ensuring GDPR compliance, security, and scalability
- Work across stakeholder groups: accountants, developers, senior leaders, academic supervisors
- Manage multiple workstreams simultaneously

### Person specification — essential criteria

- MSc in AI, Computer Science, Data Science, or closely related discipline
- Strong grounding in machine learning, Generative AI, Agentic AI, XAI, and fuzzy logic systems
- Strong Python programming and experience with open-source AI libraries
- Experience in Generative AI
- Experience in Agentic AI
- Experience in databases
- Front-end and back-end programming experience
- Deep knowledge of computational intelligence and generative AI
- Explainable AI knowledge
- Experience in Information Fusion
- Experience in Natural Language Processing
- Excellent communication skills; ability to communicate complex technical concepts to varied audiences
- Ability to manage expectations in a multi-partner project
- Ability to work on own initiative and as part of a team
- Knowledge of GDPR

### Person specification — desirable criteria

- Additional training or certification in cloud computing, software engineering, or data security
- Commercial data science experience
- Knowledge of, or interest in, the accountancy sector
- Understanding of the need to balance academic and commercial outputs

---

## 2. My personal details

**Name**: [YOUR FULL NAME]
**Email**: [YOUR EMAIL]
**LinkedIn**: [YOUR LINKEDIN URL]
**GitHub**: https://github.com/rajo69/agentic-ai-accounting

**Degree**: [YOUR DEGREE TITLE, e.g. MSc Artificial Intelligence] — [UNIVERSITY NAME], [YEAR]
**Undergraduate degree (if relevant)**: [DEGREE TITLE] — [UNIVERSITY NAME], [YEAR]

**Current/most recent role**: [JOB TITLE] at [COMPANY], [DATES]

**Other relevant experience** (list briefly, Claude will expand):
- [ROLE 1, COMPANY, DATES, ONE LINE ABOUT IT]
- [ROLE 2, COMPANY, DATES, ONE LINE ABOUT IT]

**Other relevant skills or certifications not covered by the project**:
- [e.g. AWS Cloud Practitioner, Azure, Docker, Kubernetes, etc.]
- [Any relevant domain knowledge: finance, accounting, fintech]

**Why you are personally interested in this specific role** (write 3 to 5 sentences in your own words — Claude will polish them):
[YOUR ANSWER HERE]

**Anything else you want emphasised** (optional):
[YOUR ANSWER HERE]

---

## 3. The project I built — full technical context

### Project name
AI Accountant: Agentic AI for Accounting Workflows
GitHub: https://github.com/rajo69/agentic-ai-accounting

### What it is
A production-grade, full-stack AI assistant for UK accountants built on top of Xero. It automates the three most time-consuming manual tasks in a small accounting practice: transaction categorisation, bank reconciliation, and management letter drafting. Every AI decision is transparent, auditable, and correctable by the human in the loop. Built entirely solo as a portfolio and research platform.

### Why it was built
UK accounting firms spend significant working time on mechanical but error-prone tasks. An AI tool that makes decisions without justification is not useful to someone with professional liability for the accounts they sign. This project is a full-stack implementation of an AI system that automates those tasks while always showing its working — directly analogous to what Active Software Platform's Junior Assist and Reviewer Assist products need to do.

### Tech stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0 async, Alembic, Pydantic v2 |
| AI agents | LangGraph (multi-node graphs), LangChain, Anthropic Claude API |
| Structured LLM output | Instructor + Pydantic (forces validated JSON from Claude; no free-text parsing) |
| Embeddings | sentence-transformers all-MiniLM-L6-v2 (384-dim, local, no API key) |
| Vector database | PostgreSQL 16 + pgvector extension |
| XAI | InterpretML Explainable Boosting Machine (EBM), custom Mamdani fuzzy inference engine |
| NLP | sentence-transformers, LLM prompting, RAG pipeline, RapidFuzz for string matching |
| Database | PostgreSQL 16, SQLAlchemy 2.0 async, Alembic migrations |
| Frontend | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion |
| PDF generation | WeasyPrint + Jinja2 |
| Deployment | Railway (backend + PostgreSQL + Redis), Vercel (frontend) |
| CI/CD | GitHub Actions (pytest with pgvector service container, coverage reporting, TypeScript checks, ESLint) |
| GDPR | Dedicated endpoints: Art.15/20 data export, Art.17 right to erasure |

### Feature 1: Agentic AI transaction categorisation (LangGraph)

A five-node LangGraph agent graph classifies Xero bank transactions against the chart of accounts:

1. **fetch_context** — loads chart of accounts from DB; queries pgvector for 5 semantically similar transactions that were already confirmed by a human (few-shot in-context learning)
2. **classify** — builds a structured prompt including transaction details, chart of accounts, and the 5 similar examples; calls Anthropic Claude via Instructor, forcing output into a validated Pydantic model: `CategoryPrediction(category_code, category_name, confidence: float, reasoning: str)`
3. **validate** — checks that the predicted category code exists in the chart of accounts and that confidence is within [0, 1]
4. **decide** — confidence above 0.85: auto-categorised (no human needed); 0.50 to 0.85: surfaced for human review; below 0.50: flagged for manual decision
5. **explain** — calls the XAI engine (EBM + fuzzy logic) and stores the full explanation package in the immutable audit log

The agent is the core of the system. Every batch run processes all uncategorised transactions with an asyncio concurrency cap of 5 to respect API rate limits.

### Feature 2: Bank reconciliation agent (LangGraph, deterministic)

A second LangGraph agent matches bank statement lines to accounting transactions without calling an LLM for the matching decision itself:

1. **find_candidates** — queries transactions within £0.01 of the statement amount and within 5 business days of the statement date
2. **score_candidates** — weighted multi-criteria scoring: amount match (weight 0.50) + date proximity (weight 0.20) + RapidFuzz description similarity (weight 0.30)
3. **decide** — above 0.90: auto-matched; 0.60 to 0.90: suggested; below 0.60 or ambiguous: human review
4. **explain** — Claude writes a natural-language explanation of why the match was made (or not)
5. **save** — updates the bank statement record, creates an audit log entry

The deliberate design choice: use a deterministic algorithm for matching (where ground truth is objective) and only use Claude for writing the explanation. This is an example of information fusion — combining rule-based financial logic with language model narrative generation.

### Feature 3: Management letter generation (RAG + PDF)

A RAG pipeline that generates a quarterly management letter as a professional A4 PDF:

1. Financial figures computed in pure Python from transaction data (total income, total expenses, net profit/loss, top 5 expense categories, largest transactions) — no LLM involved in computation
2. pgvector similarity search retrieves relevant transaction context for the period
3. Anthropic Claude via Instructor generates five structured narrative sections: executive summary, income analysis, expense analysis, cash flow observations, recommendations
4. Jinja2 template + WeasyPrint renders the result as a PDF with an "AI-Assisted Draft" watermark

### Feature 4: Three-layer Explainable AI engine

Every AI decision produces a three-layer explanation stored in the audit log:

**Layer 1 — LLM reasoning** (always present): Claude's own structured reasoning for the classification decision, captured as a string field in the `CategoryPrediction` output

**Layer 2 — InterpretML EBM feature importances** (active when 50 or more labelled transactions exist): An Explainable Boosting Machine is trained on the org's confirmed transactions. For each new prediction, local feature contributions are computed for: transaction amount, day of week, description length, vendor frequency, category history count. EBM was chosen over post-hoc methods (e.g. SHAP applied to a black-box model) because its additive structure gives directly interpretable contributions without approximation.

**Layer 3 — Custom Mamdani fuzzy logic risk scorer** (always present): A hand-written fuzzy inference engine implementing Mamdani-style min-AND inference with centroid defuzzification. Input variables: amount deviation from category average (low/medium/high), vendor frequency (rare/occasional/frequent), time pattern (normal/unusual). Output: risk score (0 to 1) and risk label. The rule base is intentionally human-readable (e.g. "IF amount_deviation IS high AND vendor_frequency IS rare THEN risk IS high"). Membership function parameters were chosen heuristically; formally deriving them from labelled data is an identified research question.

All three layers, plus input data, are stored in `AuditLog.ai_decision_data` as JSONB, making every decision reconstructable and auditable. This directly addresses GDPR Article 22 (right to explanation).

### Feature 5: Few-shot learning from human corrections

When an accountant corrects or approves a categorisation:
- The transaction is re-embedded using sentence-transformers and the embedding stored in the pgvector column
- Future similarity searches will surface this confirmed transaction as a few-shot example
- No model retraining required — the corrections become training signal through retrieval

This is a practical implementation of human-in-the-loop learning for accounting domain adaptation.

### Feature 6: Xero integration (full OAuth2 lifecycle)

- Full OAuth2 PKCE flow with automatic token refresh (tokens expire after 30 minutes; `_ensure_valid_token()` detects expiry and refreshes transparently before every API call)
- Incremental sync using `If-Modified-Since` HTTP headers to avoid re-fetching unchanged data
- Respects Xero's 60 requests/minute rate limit with retry and exponential backoff
- Syncs accounts, bank transactions, and bank statements into local PostgreSQL tables
- Implemented with raw httpx rather than the xero-python SDK for full control over headers, retry logic, and error handling

### Feature 7: GDPR compliance endpoints

- `GET /api/v1/gdpr/export` — exports all organisation data as structured JSON (Art.15 right of access, Art.20 data portability). Excludes OAuth tokens and derived embedding vectors.
- `DELETE /api/v1/gdpr/erase` — deletes all organisation rows in FK-safe order: audit_logs, generated_documents, bank_statements, transactions, accounts, organisation (Art.17 right to erasure)
- `GET /api/v1/transactions/{id}/explanation` — surfaces the full XAI payload for any historical decision (Art.22 right to explanation)

### Evaluation framework

A separate evaluation harness in `backend/evals/` (not the unit test suite) measures actual agent performance:

- 50 labelled UK SME bank transactions across three tiers: 24 easy (HMRC, SaaS, payroll), 16 medium (professional memberships, dual-category spends), 10 hard (industry-specific, balance sheet vs P&L edge cases)
- 20 standard UK chart of accounts codes
- Measures: overall accuracy, per-tier accuracy, confidence calibration (does high confidence actually mean high accuracy?), per-category F1, cost per transaction
- Acceptance criteria before any deployment: 80% overall accuracy minimum, 95% easy tier, 90% auto-accept accuracy at the 0.85 threshold
- API response cache (SHA-256 keyed) means reruns cost $0 after the first live run
- Cost guard: hard budget limit enforced before the run starts

### Research agenda (open questions identified during the build)

1. Per-organisation confidence calibration: the 0.85/0.50 thresholds were chosen from a general fixture set. Different firm types have different transaction distributions. Open question: which calibration method (Platt scaling, isotonic regression, conformal prediction) produces best-calibrated confidence scores across firm types with limited labelled data?

2. Explanation utility: do the XAI explanations actually change accountant decision quality, reduce review time, or improve correction accuracy? This has not been measured. A controlled evaluation is the next logical step.

3. EBM vs LLM fallback crossover: below 50 samples the system uses LLM reasoning as a fallback. The actual crossover at which EBM outperforms the LLM fallback on this domain is unknown. A learning curve analysis would inform cold-start strategy.

4. Active learning efficiency: currently human review is triggered by confidence threshold in arrival order. An active learning strategy selecting transactions near the decision boundary or in sparse embedding regions would likely reach target accuracy with fewer human corrections.

### Engineering challenges solved

These are real problems encountered during construction, not anticipated design decisions:

- **Mid-build API switch**: original design used OpenAI for embeddings and LLM. Switched to Anthropic (no embeddings API). Resolved by decoupling concerns: local sentence-transformers for embeddings (384-dim, zero API cost), Anthropic Claude for classification. Required an Alembic migration to resize the pgvector column from 1536 to 384 dimensions.
- **LangGraph + async SQLAlchemy**: graph nodes need DB access but sessions must not appear in serialisable state. Solved with a closure/factory pattern: `build_categoriser_graph(db)` captures the session.
- **Xero breaking change**: Xero introduced new granular OAuth2 scope names for apps created after March 2026. Diagnosed and adapted iteratively.
- **Python bytecode cache masking code changes**: stale `.pyc` files caused uvicorn to serve old scope names despite source being updated. Diagnosed and resolved.
- **FastAPI dependency injection in tests**: established the correct pattern (`app.dependency_overrides`) vs incorrect pattern (`unittest.mock.patch` on non-existent helpers).
- **CORS misconfiguration in production**: tightening CORS from `allow_origins=["*"]` to an explicit origin broke all frontend API calls silently (TypeError, not HTTP 401). Diagnosed by distinguishing CORS errors from authentication errors.
- **GitHub Actions CI**: pgvector requires a non-standard PostgreSQL image; WeasyPrint requires system-level C libraries. Both diagnosed and solved in CI configuration.

### Architecture summary

```
Xero API
  → XeroAdapter (OAuth2, token refresh, rate limiting)
    → PostgreSQL (Organisation, Account, Transaction, BankStatement)

Uncategorised transactions
  → CategoriserAgent (LangGraph, 5 nodes)
    → fetch_context: chart of accounts + pgvector similar examples
    → classify: Claude via Instructor → CategoryPrediction (Pydantic)
    → validate: category code exists, confidence in [0,1]
    → decide: >0.85 auto | 0.50-0.85 suggest | <0.50 review
    → explain: EBM feature importances + Mamdani fuzzy risk score
      → AuditLog (full XAI payload as JSONB)

Unmatched bank statements
  → ReconcilerAgent (LangGraph, 5 nodes, no LLM for matching)
    → find_candidates, score_candidates (amount×0.5 + date×0.2 + desc×0.3)
    → decide: >0.9 auto | 0.6-0.9 suggest | <0.6 human
    → explain: Claude writes natural language match explanation
      → AuditLog

Documents
  → DocumentService
    → compute figures (pure Python)
    → pgvector context retrieval (RAG)
    → Claude via Instructor → ManagementLetterNarrative (Pydantic)
    → WeasyPrint → A4 PDF
```

---

## 4. Mapping between project and role requirements

Use this mapping to structure the cover letter and CV bullet points. Every essential criterion is covered.

| Role requirement | How the project addresses it |
|---|---|
| Generative AI experience | Management letter generation uses Claude to produce structured narrative; Instructor forces Pydantic-validated output; RAG pipeline grounds generation in retrieved financial context |
| Agentic AI experience | Two full LangGraph agents (CategoriserAgent, ReconcilerAgent) with multi-node state machines, DB access via closure injection, asyncio concurrency management |
| XAI knowledge | Three-layer XAI: LLM reasoning, EBM feature importances, Mamdani fuzzy risk scoring; all stored in immutable audit log; exposed via explanation API |
| Fuzzy logic systems | Hand-written Mamdani inference engine with human-readable rule base; intentionally designed for domain expert challenge without ML expertise |
| Information fusion | Combining three independent AI signals (LLM, EBM, fuzzy) into a single risk assessment; combining rule-based scoring with LLM narrative in the reconciler |
| NLP experience | sentence-transformers for semantic embeddings, LLM prompting with structured output, RAG pipeline, RapidFuzz fuzzy string matching |
| Python + open-source AI libs | Entire backend in Python 3.12; LangGraph, LangChain, Instructor, sentence-transformers, InterpretML, FastAPI, SQLAlchemy 2.0 |
| Database experience | PostgreSQL 16 + pgvector (vector similarity search); SQLAlchemy 2.0 async ORM; Alembic migrations; Decimal/NUMERIC(12,2) for all financial amounts |
| Front and back end | FastAPI REST API backend; Next.js 14 + TypeScript + Tailwind frontend; full OAuth2 flow across both layers |
| GDPR knowledge | Dedicated endpoints for Art.15/20 (export), Art.17 (erasure), Art.22 (explanation); design decisions documented against specific GDPR articles |
| Accounting sector knowledge | Built for UK accountants; Xero OAuth2 integration; chart of accounts; UK SME transaction patterns; bank reconciliation domain logic |
| Commercial data science | Built as a product targeting real UK accounting firms; evaluation framework with acceptance criteria before deployment; cost controls per API call |
| Managing multi-partner projects | Solo delivery of a 9-phase project spanning backend, AI agents, XAI, frontend, CI/CD, deployment, GDPR; equivalent complexity to a multi-workstream KTP |
| Balancing academic and commercial outputs | Research agenda section identifies four open questions; eval framework is research-grade; product is deployed and working |

---

## 5. Instructions for Claude

### Task A — CV project description

Write a project description for inclusion in a CV/resume. Format it as a single entry under a "Projects" section. It should:

- Open with one sentence explaining what the project is and why it matters in the accounting sector
- List the most impressive technical components as bullet points, with specific technologies named
- Quantify wherever possible: number of LangGraph agent nodes, number of test cases, evaluation fixture set size, confidence thresholds, etc.
- Explicitly name: Generative AI (Claude + Instructor), Agentic AI (LangGraph), XAI (EBM + Mamdani fuzzy), NLP (sentence-transformers + RAG), information fusion, GDPR compliance
- Mention the evaluation framework and acceptance criteria — this signals research rigour
- Include the GitHub link
- Length: 8 to 12 bullet points maximum. Tight, specific, achievement-oriented
- Do not use generic phrases like "developed a system that..." — be specific about what the system does and what problem it solves
- Use past tense

### Task B — Cover letter

Write a professional cover letter for the KTP Associate position (Job ref REQ09869) at the University of Essex / Active Software Platform UK Ltd.

Structure:
1. **Opening paragraph**: Express genuine interest in the KTP specifically (not just any AI job). Mention the three-way partnership structure and what attracts you to working at the intersection of academic research and commercial product development in accounting AI. Reference the company's existing Xero/QuickBooks integrations and what the AI layer could add to their product.

2. **Technical capability paragraph**: Map the project directly to the role's technical requirements. Be specific — name LangGraph, EBM, Mamdani fuzzy inference, Instructor, pgvector. Do not be vague. The reader is Prof Hani Hagras; he will know what these things are.

3. **Research and commercial balance paragraph**: The KTP values both academic rigour and commercial delivery. Show both: the eval framework and research agenda show academic thinking; the deployed product, Xero integration, and GDPR implementation show commercial delivery. Mention the research agenda questions as examples of where you see the academic collaboration adding value.

4. **Stakeholder and project management paragraph**: A KTP Associate manages a complex multi-partner project. Address this directly. Draw on the experience of managing the full 9-phase build solo — making architectural decisions, writing documentation, maintaining CI/CD, handling production incidents — as evidence of managing complex interdependent workstreams.

5. **Closing paragraph**: State clearly that you meet all essential criteria. Express enthusiasm for working with Prof Hagras and the Active Software Platform team. Keep it direct and confident — not sycophantic.

**Tone**: Professional, direct, technically confident. Not sales-y. Do not use phrases like "passionate about" or "excited to". The cover letter should read like it was written by someone who built the thing and knows exactly what they're talking about.

**Length**: No more than one A4 page (approximately 500 to 600 words).

**Format**: Standard UK business letter format. Address to the hiring panel, not to a named individual (unless the user specifies one).

### Notes for Claude

- Fill in the [PLACEHOLDERS] from Section 2 throughout the documents
- Where the user has left a placeholder empty, either skip that point or note "[USER TO COMPLETE]"
- Do not invent qualifications or experience the user has not described
- The project is real, deployed, and on GitHub — treat it as a genuine professional accomplishment, not a side project
- Active Software Platform already has Xero and QuickBooks integrations — the AI layer is what the KTP will add. Frame the project as direct evidence the candidate can build exactly that
- Prof Hagras is one of the foremost researchers in fuzzy logic and XAI — the Mamdani fuzzy engine and the three-layer XAI design are directly relevant to his research interests. Mention these specifically without being obsequious
- The closing date is 25 March 2026
