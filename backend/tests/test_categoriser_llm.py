"""Categoriser behaviour through the LLM gateway: prompt, tiering, refusals, audit rows. No network."""
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx2
import pytest
from anthropic import BadRequestError

from app.agents.categoriser import (
    CategoryPrediction,
    build_categoriser_graph,
    build_categoriser_prompt,
)
from app.models.database import AuditLog
from app.services.llm_client import PROFILES, LLMResult, Route, Status

FIXTURES = Path(__file__).parent / "fixtures"
CLAUDE_4 = PROFILES["claude-4"]
CHART = [
    {"code": "400", "name": "Advertising", "type": "EXPENSE"},
    {"code": None, "name": "Office Expenses", "type": "EXPENSE"},
    {"code": "200", "name": "Sales", "type": "REVENUE"},
]


def test_prompt_snapshot():
    """The prompt is byte-identical to the one the app sent before the gateway."""
    tx = {"organisation_id": "x", "date": "2026-01-15", "amount": "-250.00",
          "description": "OFFICE SUPPLIES LTD", "reference": None}
    examples = [{"description": f"STAPLES {i}", "amount": "-12.50", "category": "Office Expenses", "date": "2026-01-01"}
                for i in range(7)]
    expected = (FIXTURES / "categoriser_prompt.txt").read_text(encoding="utf-8")
    assert build_categoriser_prompt(tx, CHART, examples) == expected


def _ok(route, confidence, code="400", name="Advertising", served=None):
    cfg = CLAUDE_4.routes[route]
    return LLMResult(
        route=route, requested_model=cfg.model, mechanism=cfg.mechanism, status=Status.OK,
        parsed=CategoryPrediction(category_code=code, category_name=name, confidence=confidence, reasoning="r"),
        stop_reason="tool_use", served_model=served or cfg.model,
    )


def _refused(route, category="general_harms"):
    cfg = CLAUDE_4.routes[route]
    return LLMResult(route=route, requested_model=cfg.model, mechanism=cfg.mechanism,
                     status=Status.REFUSED, stop_reason="refusal", refusal_category=category)


def _bad_request():
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    return BadRequestError("tool_choice not supported", response=httpx2.Response(400, request=request), body=None)


async def _run(responses: dict, profile=CLAUDE_4):
    """Run the graph for one transaction. `responses` maps route -> LLMResult or exception."""
    tx = MagicMock()
    tx.category = "Previous Category"
    tx.categorisation_status = "uncategorised"
    accounts = [MagicMock(code=a["code"], name=a["name"], type=a["type"]) for a in CHART]
    for m, a in zip(accounts, CHART):
        m.name = a["name"]

    result = MagicMock()
    result.scalars.return_value.all.return_value = accounts
    result.scalar_one_or_none.return_value = tx
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    db.add = MagicMock()

    calls = []

    async def fake_call(route, prompt, schema, profile_arg):
        calls.append(route)
        outcome = responses[route]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    org_id = uuid.uuid4()
    state = {
        "transaction_id": str(uuid.uuid4()),
        "transaction_data": {"organisation_id": str(org_id), "date": "2026-01-15", "amount": "-250.00",
                             "description": "GOOGLE ADS", "reference": None},
        "chart_of_accounts": [], "similar_examples": [], "prediction": None,
        "status": "pending", "audit_log_id": None, "refusal": None,
    }
    with patch("app.agents.categoriser.structured_call", side_effect=fake_call), \
         patch("app.agents.categoriser.find_similar_transactions", AsyncMock(return_value=[])), \
         patch("app.agents.categoriser.embed_transaction", AsyncMock(return_value=[0.0] * 384)), \
         patch("app.agents.categoriser.explain_categorisation", AsyncMock(return_value={})), \
         patch("app.agents.categoriser.compute_fuzzy_inputs", AsyncMock(side_effect=RuntimeError("skip"))):
        final = await build_categoriser_graph(db, profile).ainvoke(state)

    audits = [c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], AuditLog)]
    assert len(audits) == 1, "every decision writes exactly one AuditLog row"
    return final, tx, audits[0], calls


@pytest.mark.asyncio
async def test_confident_primary_is_not_escalated():
    final, tx, audit, calls = await _run({Route.CATEGORISE_PRIMARY: _ok(Route.CATEGORISE_PRIMARY, 0.95)})
    assert calls == [Route.CATEGORISE_PRIMARY]
    assert final["status"] == "auto_categorised"
    assert tx.category == "Advertising"
    assert audit.ai_model == "claude-haiku-4-5-20251001"
    assert audit.ai_decision_data["primary_model"] == "claude-haiku-4-5-20251001"
    assert audit.ai_decision_data["escalated"] is False


@pytest.mark.asyncio
async def test_escalation_fires_below_the_threshold():
    final, tx, audit, calls = await _run({
        Route.CATEGORISE_PRIMARY: _ok(Route.CATEGORISE_PRIMARY, 0.84),
        Route.CATEGORISE_ESCALATION: _ok(Route.CATEGORISE_ESCALATION, 0.92, code="200", name="Sales"),
    })
    assert calls == [Route.CATEGORISE_PRIMARY, Route.CATEGORISE_ESCALATION]
    assert final["status"] == "auto_categorised"
    assert tx.category == "Sales"
    assert audit.ai_model == "claude-sonnet-4-6"
    assert audit.ai_decision_data["escalated"] is True
    assert audit.ai_decision_data["primary_confidence"] == 0.84
    assert audit.ai_decision_data["escalation_threshold"] == 0.85
    assert audit.ai_decision_data["escalation_error"] is None


@pytest.mark.asyncio
async def test_audit_model_is_the_model_that_served_after_a_server_side_fallback():
    final, tx, audit, calls = await _run({
        Route.CATEGORISE_PRIMARY: _ok(Route.CATEGORISE_PRIMARY, 0.84),
        Route.CATEGORISE_ESCALATION: _ok(Route.CATEGORISE_ESCALATION, 0.92, served="fallback-model-id"),
    })
    assert audit.ai_model == "fallback-model-id"
    assert audit.ai_decision_data["served_model"] == "fallback-model-id"


@pytest.mark.asyncio
async def test_audit_model_is_the_requested_model_when_the_response_names_none():
    primary = _ok(Route.CATEGORISE_PRIMARY, 0.95)
    primary.served_model = None
    final, tx, audit, calls = await _run({Route.CATEGORISE_PRIMARY: primary})
    assert audit.ai_model == "claude-haiku-4-5-20251001"


@pytest.mark.asyncio
async def test_escalation_400_keeps_the_primary_answer_and_records_the_error():
    """The failure mode Sonnet 5.5 + a forced tool call would cause: no longer silent."""
    final, tx, audit, _ = await _run({
        Route.CATEGORISE_PRIMARY: _ok(Route.CATEGORISE_PRIMARY, 0.7),
        Route.CATEGORISE_ESCALATION: _bad_request(),
    })
    assert final["status"] == "suggested"
    assert tx.category == "Advertising"
    assert audit.ai_model == "claude-haiku-4-5-20251001"
    assert audit.ai_decision_data["escalated"] is False
    assert audit.ai_decision_data["escalation_error"] == "BadRequestError"


@pytest.mark.asyncio
async def test_escalation_refusal_keeps_the_primary_answer():
    final, _, audit, _ = await _run({
        Route.CATEGORISE_PRIMARY: _ok(Route.CATEGORISE_PRIMARY, 0.6),
        Route.CATEGORISE_ESCALATION: _refused(Route.CATEGORISE_ESCALATION),
    })
    assert final["status"] == "suggested"
    assert audit.ai_decision_data["escalation_error"] == "refused"


@pytest.mark.asyncio
async def test_primary_refusal_still_escalates():
    final, tx, audit, calls = await _run({
        Route.CATEGORISE_PRIMARY: _refused(Route.CATEGORISE_PRIMARY, "cyber"),
        Route.CATEGORISE_ESCALATION: _ok(Route.CATEGORISE_ESCALATION, 0.9),
    })
    assert calls == [Route.CATEGORISE_PRIMARY, Route.CATEGORISE_ESCALATION]
    assert final["status"] == "auto_categorised"
    assert audit.ai_model == "claude-sonnet-4-6"
    assert audit.ai_decision_data["primary_confidence"] is None


@pytest.mark.asyncio
async def test_refusal_on_every_tier_goes_to_review_with_an_audit_row():
    final, tx, audit, _ = await _run({
        Route.CATEGORISE_PRIMARY: _refused(Route.CATEGORISE_PRIMARY, "cyber"),
        Route.CATEGORISE_ESCALATION: _refused(Route.CATEGORISE_ESCALATION, "cyber"),
    })
    assert final["status"] == "needs_review"
    assert tx.category == "Previous Category", "a refusal never changes the category"
    assert tx.categorisation_status == "needs_review"
    assert audit.ai_model == "claude-haiku-4-5-20251001"
    assert audit.ai_confidence is None
    assert audit.ai_decision_data["refusal"]["category"] == "cyber"
    assert audit.ai_decision_data["refusal"]["model"] == "claude-haiku-4-5-20251001"
    assert audit.ai_decision_data["escalation_error"] == "refused"


@pytest.mark.asyncio
async def test_primary_output_failure_still_raises():
    truncated = LLMResult(route=Route.CATEGORISE_PRIMARY, requested_model="m", mechanism=CLAUDE_4.routes[Route.CATEGORISE_PRIMARY].mechanism,
                          status=Status.TRUNCATED, stop_reason="max_tokens")
    with pytest.raises(Exception, match="token limit"):
        await _run({Route.CATEGORISE_PRIMARY: truncated})


@pytest.mark.asyncio
@pytest.mark.parametrize("confidence,status", [(0.86, "auto_categorised"), (0.85, "suggested"), (0.5, "suggested"), (0.49, "needs_review")])
async def test_decide_bands_match_the_old_constants(confidence, status):
    responses = {
        Route.CATEGORISE_PRIMARY: _ok(Route.CATEGORISE_PRIMARY, confidence),
        Route.CATEGORISE_ESCALATION: _ok(Route.CATEGORISE_ESCALATION, confidence),
    }
    final, *_ = await _run(responses)
    assert final["status"] == status


@pytest.mark.asyncio
async def test_no_escalation_at_exactly_the_threshold():
    """Escalation is strictly below 0.85: at 0.85 the primary answer stands and only one call is made."""
    final, tx, audit, calls = await _run({
        Route.CATEGORISE_PRIMARY: _ok(Route.CATEGORISE_PRIMARY, 0.85),
        Route.CATEGORISE_ESCALATION: _ok(Route.CATEGORISE_ESCALATION, 0.99, code="200", name="Sales"),
    })
    assert calls == [Route.CATEGORISE_PRIMARY]
    assert final["status"] == "suggested"
    assert tx.category == "Advertising"
    assert audit.ai_decision_data["escalated"] is False


@pytest.mark.asyncio
async def test_primary_api_error_propagates_without_escalating():
    """An API error on the primary raises (the batch counts it as an error), as before the gateway."""
    with pytest.raises(BadRequestError):
        await _run({
            Route.CATEGORISE_PRIMARY: _bad_request(),
            Route.CATEGORISE_ESCALATION: _ok(Route.CATEGORISE_ESCALATION, 0.9),
        })


@pytest.mark.asyncio
async def test_primary_refusal_then_escalation_api_error_raises_so_the_row_is_retried():
    """A transient escalation failure must not park the row in review with a 'declined' note."""
    with pytest.raises(BadRequestError):
        await _run({
            Route.CATEGORISE_PRIMARY: _refused(Route.CATEGORISE_PRIMARY, "cyber"),
            Route.CATEGORISE_ESCALATION: _bad_request(),
        })


@pytest.mark.asyncio
async def test_primary_refusal_then_truncated_escalation_raises():
    truncated = LLMResult(route=Route.CATEGORISE_ESCALATION, requested_model="m",
                          mechanism=CLAUDE_4.routes[Route.CATEGORISE_ESCALATION].mechanism,
                          status=Status.TRUNCATED, stop_reason="max_tokens")
    with pytest.raises(Exception, match="token limit"):
        await _run({
            Route.CATEGORISE_PRIMARY: _refused(Route.CATEGORISE_PRIMARY, "cyber"),
            Route.CATEGORISE_ESCALATION: truncated,
        })


@pytest.mark.asyncio
async def test_refusal_on_every_tier_records_both_categories():
    _, _, audit, _ = await _run({
        Route.CATEGORISE_PRIMARY: _refused(Route.CATEGORISE_PRIMARY, "cyber"),
        Route.CATEGORISE_ESCALATION: _refused(Route.CATEGORISE_ESCALATION, "general_harms"),
    })
    assert audit.ai_decision_data["refusal"]["category"] == "cyber"
    assert audit.ai_decision_data["refusal"]["escalation_category"] == "general_harms"
