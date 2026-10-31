"""LangGraph transaction categorisation agent.

Flow: fetch_context → classify → validate → decide
"""
import asyncio
import logging
from decimal import Decimal
from typing import Optional, TypedDict
from uuid import UUID

from langgraph.graph import END, StateGraph
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Account, AuditLog, Transaction
from app.models.schemas import BatchCategoriseResponse
from app.services.embedding_service import embed_transaction, find_similar_transactions
from app.services.llm_client import (
    LLMResult,
    LLMUnavailableError,
    Profile,
    Route,
    Status,
    get_profile,
    structured_call,
)
from app.xai.explainer import explain_categorisation
from app.xai.fuzzy_engine import compute_fuzzy_inputs, compute_risk_score

logger = logging.getLogger(__name__)

# Models, max_tokens and the escalation / auto-accept / review thresholds come
# from the LLM profile (app/services/llm_client.py). Escalation fires when the
# primary can't auto-accept, so the second tier gets a chance to push the
# decision into the auto-accept band instead of leaving it for human review.


class CategoriserState(TypedDict):
    transaction_id: str
    transaction_data: dict
    chart_of_accounts: list[dict]
    similar_examples: list[dict]
    prediction: Optional[dict]
    status: str
    audit_log_id: Optional[str]
    # Set when every tier declined: {"category", "model", "route", "escalation_error"}
    refusal: Optional[dict]


class CategoryPrediction(BaseModel):
    category_code: str
    category_name: str
    confidence: float
    reasoning: str


def _validate_prediction(prediction: dict, chart_of_accounts: list[dict]) -> dict:
    """Check a prediction against the chart and return it in the chart's own terms.

    The model may return a valid code with a paraphrased name, or a valid name
    with a wrong code. A match on either is accepted (the code wins when both
    match different accounts), and the stored code and name are the chart's,
    so `Transaction.category` always holds a real account name. No match, or a
    confidence outside [0, 1], zeroes the confidence so `decide` routes the
    transaction to human review.
    """
    confidence = prediction.get("confidence", 0.0)
    by_code = {a["code"]: a for a in chart_of_accounts if a.get("code")}
    by_name = {a["name"]: a for a in chart_of_accounts}
    account = by_code.get(prediction["category_code"]) or by_name.get(prediction["category_name"])

    if account is None or not 0.0 <= confidence <= 1.0:
        return {
            **prediction,
            "confidence": 0.0,
            "reasoning": "validation failed: predicted account not in chart of accounts",
        }
    return {
        **prediction,
        "category_code": account.get("code") or prediction["category_code"],
        "category_name": account["name"],
    }


def build_categoriser_prompt(tx: dict, chart_of_accounts: list[dict], similar_examples: list[dict]) -> str:
    """The categorisation prompt. Pinned by a snapshot test: changing it changes the eval baseline."""
    accounts_text = "\n".join(
        f"  - Code: {a['code'] or 'N/A'}, Name: {a['name']}, Type: {a['type']}"
        for a in chart_of_accounts
    )
    examples_text = "\n".join(
        f"  - '{e['description']}' (£{e['amount']}) → {e['category']}"
        for e in similar_examples[:5]
    ) or "  (none yet)"

    amount = Decimal(str(tx["amount"]))
    direction = "debit (expense)" if amount < 0 else "credit (income)"

    return (
        "You are an expert UK accountant using Xero.\n\n"
        "Categorise this bank transaction into the correct account from the chart of accounts.\n\n"
        f"Transaction:\n"
        f"- Date: {tx['date']}\n"
        f"- Amount: £{abs(amount):.2f} ({direction})\n"
        f"- Description: {tx['description']}\n"
        f"- Reference: {tx.get('reference') or 'N/A'}\n\n"
        f"Chart of Accounts (pick ONE):\n{accounts_text}\n\n"
        f"Similar transactions already categorised:\n{examples_text}\n\n"
        "Return the exact account code and name from the chart, confidence (0.0-1.0), "
        "and brief reasoning (1-2 sentences)."
    )


def build_categoriser_graph(db: AsyncSession, profile: Optional[Profile] = None):
    """Build and compile a LangGraph categorisation workflow with DB injected via closure."""
    profile = profile or get_profile()
    primary_model = profile.routes[Route.CATEGORISE_PRIMARY].model
    escalation_model = profile.routes[Route.CATEGORISE_ESCALATION].model

    async def fetch_context(state: CategoriserState) -> dict:
        org_id = UUID(state["transaction_data"]["organisation_id"])

        result = await db.execute(
            select(Account).where(Account.organisation_id == org_id)
        )
        accounts = list(result.scalars().all())
        chart = [
            {"code": a.code, "name": a.name, "type": a.type}
            for a in accounts
        ]

        description = state["transaction_data"].get("description", "")
        similar = await find_similar_transactions(description, org_id, db=db)
        examples = [
            {
                "description": t.description,
                "amount": str(t.amount),
                "category": t.category,
                "date": str(t.date),
            }
            for t in similar
            if t.category
        ]

        return {"chart_of_accounts": chart, "similar_examples": examples}

    async def classify(state: CategoriserState) -> dict:
        if not state["chart_of_accounts"]:
            return {
                "prediction": None,
                "status": "classified",
            }

        prompt = build_categoriser_prompt(
            state["transaction_data"], state["chart_of_accounts"], state["similar_examples"]
        )

        # Primary call: the cheap, fast tier, sufficient for the majority of
        # transactions where the few-shot RAG context is strong. A failure
        # other than a refusal raises, as before the gateway.
        primary = await structured_call(
            Route.CATEGORISE_PRIMARY, prompt, CategoryPrediction, profile
        )
        if primary.status is not Status.REFUSED:
            primary.require()

        chosen: Optional[LLMResult] = primary if primary.ok else None
        escalated = False
        escalation_error: Optional[str] = None
        escalation_exc: Optional[Exception] = None
        primary_confidence = float(primary.parsed.confidence) if primary.ok else None

        # Tiered routing: if the primary isn't confident enough to auto-accept,
        # or declined, give the second tier a chance before surfacing the
        # result. On failure there, keep the primary's answer (we never lose a
        # prediction) and record why, so a broken escalation is not silent.
        if primary_confidence is None or primary_confidence < profile.escalation_threshold:
            try:
                second = await structured_call(
                    Route.CATEGORISE_ESCALATION, prompt, CategoryPrediction, profile
                )
                second.require()
                chosen = second
                escalated = True
            except LLMUnavailableError as exc:
                escalation_exc = exc
                escalation_error = exc.result.status.value if exc.result else type(exc).__name__
                logger.warning(
                    "Escalation to %s gave no usable output (%s), keeping primary prediction",
                    escalation_model, escalation_error,
                )
            except Exception as exc:
                escalation_exc = exc
                escalation_error = type(exc).__name__
                logger.exception(
                    "Escalation to %s failed, keeping primary prediction",
                    escalation_model,
                )

        if chosen is None:
            escalation_result = getattr(escalation_exc, "result", None)
            if escalation_result is None or escalation_result.status is not Status.REFUSED:
                # The primary declined and the escalation failed for another
                # reason (API error, truncation, bad output): raise, so the row
                # stays uncategorised and the next batch retries it.
                raise escalation_exc
            # Every tier declined: no prediction, so the row goes to review.
            return {
                "prediction": None,
                "refusal": {
                    "category": primary.refusal_category,
                    "model": primary_model,
                    "route": Route.CATEGORISE_PRIMARY.value,
                    "escalation_category": escalation_result.refusal_category,
                    "escalation_error": escalation_error,
                },
                "status": "classified",
            }

        return {
            "prediction": {
                "category_code": chosen.parsed.category_code,
                "category_name": chosen.parsed.category_name,
                "confidence": float(chosen.parsed.confidence),
                "reasoning": chosen.parsed.reasoning,
                # A server-side fallback can serve a different model than requested.
                "model_used": chosen.served_model or (escalation_model if escalated else primary_model),
                "served_model": chosen.served_model,
                "escalated": escalated,
                "primary_confidence": primary_confidence if escalated else None,
                "primary_refusal": primary.refusal_category if not primary.ok else None,
                "escalation_error": escalation_error,
            },
            "status": "classified",
        }

    async def validate(state: CategoriserState) -> dict:
        prediction = state.get("prediction")
        if not prediction:
            return {"status": "validated"}

        return {
            "prediction": _validate_prediction(prediction, state["chart_of_accounts"]),
            "status": "validated",
        }

    async def decide(state: CategoriserState) -> dict:
        prediction = state.get("prediction")
        tx_data = state["transaction_data"]
        tx_id = UUID(state["transaction_id"])
        org_id = UUID(tx_data["organisation_id"])

        refusal = state.get("refusal")
        confidence = prediction["confidence"] if prediction else 0.0

        if not prediction or confidence == 0.0:
            final_status = "needs_review"
        elif confidence > profile.auto_accept_threshold:
            final_status = "auto_categorised"
        elif confidence >= profile.review_threshold:
            final_status = "suggested"
        else:
            final_status = "needs_review"

        result = await db.execute(select(Transaction).where(Transaction.id == tx_id))
        tx = result.scalar_one_or_none()

        if tx and prediction:
            tx.category = prediction["category_name"]
            tx.category_confidence = Decimal(str(round(confidence, 4)))
            tx.categorisation_status = final_status
            tx.embedding = await embed_transaction(tx)
        elif tx and refusal:
            # A decline sends the row to review; the category stays as it was.
            tx.categorisation_status = final_status

        # Record the model that actually produced the final prediction
        # (may be the escalation model if tiered routing fired).
        audit_model = (
            prediction.get("model_used", primary_model) if prediction else primary_model
        )

        audit = AuditLog(
            organisation_id=org_id,
            action="ai_categorise",
            entity_type="transaction",
            entity_id=tx_id,
            new_value={
                "category": prediction["category_name"] if prediction else None,
                "status": final_status,
            },
            ai_model=audit_model,
            ai_confidence=Decimal(str(round(confidence, 4))) if prediction else None,
            ai_explanation=(
                prediction["reasoning"] if prediction
                else "Model declined to categorise; sent to review" if refusal
                else "No prediction generated"
            ),
            ai_decision_data={
                "category_code": prediction["category_code"] if prediction else None,
                "similar_examples_count": len(state.get("similar_examples", [])),
                "escalated": prediction.get("escalated", False) if prediction else False,
                "primary_model": primary_model,
                "primary_confidence": (
                    prediction.get("primary_confidence") if prediction else None
                ),
                "escalation_threshold": profile.escalation_threshold,
                "llm_profile": profile.name,
                "served_model": prediction.get("served_model") if prediction else None,
                "escalation_error": (
                    prediction.get("escalation_error") if prediction
                    else refusal.get("escalation_error") if refusal else None
                ),
                "refusal": refusal,
            },
        )
        db.add(audit)
        await db.flush()  # get audit.id without closing the session
        audit_log_id = str(audit.id)
        await db.commit()

        return {"status": final_status, "audit_log_id": audit_log_id}

    async def explain(state: CategoriserState) -> dict:
        """Generate XAI explanation and append it to the AuditLog ai_decision_data."""
        prediction = state.get("prediction")
        audit_log_id = state.get("audit_log_id")
        if not prediction or not audit_log_id:
            return {}

        tx_data = state["transaction_data"]
        org_id = UUID(tx_data["organisation_id"])

        try:
            xai_result = await explain_categorisation(
                transaction=tx_data,
                prediction=prediction,
                similar_examples=state.get("similar_examples", []),
                org_id=org_id,
                db=db,
            )
        except Exception:
            logger.exception("XAI explain_categorisation failed")
            xai_result = {"top_features": [], "explanation_text": prediction.get("reasoning", ""), "model_type": "llm"}

        try:
            fuzzy_inputs = await compute_fuzzy_inputs(tx_data, prediction, org_id, db)
            risk_result = compute_risk_score(**fuzzy_inputs)
        except Exception:
            logger.exception("Fuzzy risk scoring failed")
            risk_result = {"risk_score": 0.5, "risk_label": "medium", "fired_rules": [], "input_values": {}}

        # Update the AuditLog with XAI data
        try:
            res = await db.execute(
                select(AuditLog).where(AuditLog.id == UUID(audit_log_id))
            )
            audit = res.scalar_one_or_none()
            if audit:
                existing = dict(audit.ai_decision_data or {})
                existing["xai"] = xai_result
                existing["risk"] = risk_result
                audit.ai_decision_data = existing
                await db.commit()
        except Exception:
            logger.exception("Failed to update AuditLog with XAI data")

        return {}

    workflow = StateGraph(CategoriserState)
    workflow.add_node("fetch_context", fetch_context)
    workflow.add_node("classify", classify)
    workflow.add_node("validate", validate)
    workflow.add_node("decide", decide)
    workflow.add_node("explain", explain)

    workflow.set_entry_point("fetch_context")
    workflow.add_edge("fetch_context", "classify")
    workflow.add_edge("classify", "validate")
    workflow.add_edge("validate", "decide")
    workflow.add_edge("decide", "explain")
    workflow.add_edge("explain", END)

    return workflow.compile()


async def categorise_batch(org_id: UUID, db: AsyncSession) -> BatchCategoriseResponse:
    """Categorise all uncategorised transactions for an organisation."""
    result = await db.execute(
        select(Transaction).where(
            Transaction.organisation_id == org_id,
            Transaction.categorisation_status == "uncategorised",
        )
    )
    transactions = list(result.scalars().all())

    graph = build_categoriser_graph(db)
    semaphore = asyncio.Semaphore(5)
    counts: dict[str, int] = {
        "auto_categorised": 0,
        "suggested": 0,
        "needs_review": 0,
        "errors": 0,
    }

    async def process_one(tx: Transaction) -> None:
        async with semaphore:
            try:
                initial_state: CategoriserState = {
                    "transaction_id": str(tx.id),
                    "transaction_data": {
                        "organisation_id": str(tx.organisation_id),
                        "date": str(tx.date),
                        "amount": str(tx.amount),
                        "description": tx.description,
                        "reference": tx.reference,
                    },
                    "chart_of_accounts": [],
                    "similar_examples": [],
                    "prediction": None,
                    "status": "pending",
                    "audit_log_id": None,
                    "refusal": None,
                }
                final = await graph.ainvoke(initial_state)
                status = final.get("status", "errors")
                if status in counts:
                    counts[status] += 1
                else:
                    counts["errors"] += 1
            except Exception:
                logger.exception("Error categorising transaction %s", tx.id)
                counts["errors"] += 1

    await asyncio.gather(*[process_one(tx) for tx in transactions])

    return BatchCategoriseResponse(
        auto_categorised=counts["auto_categorised"],
        suggested=counts["suggested"],
        needs_review=counts["needs_review"],
        errors=counts["errors"],
        total_processed=len(transactions),
    )
