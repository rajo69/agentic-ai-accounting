"""Tests for the LLM gateway: request shapes per profile and response parsing. No network."""
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from anthropic.types import Message
from anthropic.types.beta import BetaMessage
from pydantic import BaseModel

from app.agents.categoriser import CategoryPrediction
from app.services import llm_client
from app.services.document_service import (
    ManagementLetterNarrative,
    ProfitLossNarrative,
    VatSummaryNarrative,
)
from app.services.llm_client import (
    PROFILES,
    LLMUnavailableError,
    Mechanism,
    Profile,
    Route,
    RouteConfig,
    Status,
    build_request,
    get_profile,
    parse_response,
    structured_call,
)

FIXTURES = Path(__file__).parent / "fixtures"
CLAUDE_4 = PROFILES["claude-4"]
CLAUDE_5_5 = PROFILES["claude-5-5"]
PREDICTION = {"category_code": "400", "category_name": "Advertising", "confidence": 0.91, "reasoning": "Ad spend."}


def _message(content, stop_reason="end_turn", model="claude-haiku-5-5", stop_details=None, beta=False):
    cls = BetaMessage if beta else Message
    return cls.model_validate({
        "id": "msg_test", "type": "message", "role": "assistant", "model": model,
        "content": content, "stop_reason": stop_reason, "stop_sequence": None,
        "stop_details": stop_details, "usage": {"input_tokens": 120, "output_tokens": 30},
    })


def _tool_use(name="CategoryPrediction", payload=None):
    return {"type": "tool_use", "id": "toolu_1", "name": name, "input": payload or PREDICTION}


def _thinking():
    return {"type": "thinking", "thinking": "", "signature": "sig"}


# ── Requests ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("schema", [CategoryPrediction, ManagementLetterNarrative, ProfitLossNarrative, VatSummaryNarrative])
def test_tool_mechanism_matches_instructor_request(schema):
    """claude-4 sends what Instructor 1.17.0 sent (fixture captured before Instructor was removed)."""
    fixture = json.loads((FIXTURES / "instructor_requests.json").read_text(encoding="utf-8"))
    expected = fixture["requests"][schema.__name__]
    route = {
        CategoryPrediction: Route.CATEGORISE_PRIMARY,
        ManagementLetterNarrative: Route.DOC_MANAGEMENT_LETTER,
        ProfitLossNarrative: Route.DOC_PROFIT_LOSS,
        VatSummaryNarrative: Route.DOC_VAT_SUMMARY,
    }[schema]
    assert build_request(route, "PROMPT", schema, CLAUDE_4) == expected


def test_claude_4_escalation_request_matches_old_call():
    request = build_request(Route.CATEGORISE_ESCALATION, "PROMPT", CategoryPrediction, CLAUDE_4)
    assert request["model"] == "claude-sonnet-4-6"
    assert request["max_tokens"] == 512
    assert request["tool_choice"] == {"type": "tool", "name": "CategoryPrediction", "disable_parallel_tool_use": True}


@pytest.mark.parametrize("profile", list(PROFILES.values()), ids=list(PROFILES))
@pytest.mark.parametrize("route", list(Route))
def test_build_request_follows_profile_and_never_sends_sampling_params(profile, route):
    cfg = profile.routes[route]
    request = build_request(route, "p", CategoryPrediction, profile)
    assert request["model"] == cfg.model
    assert request["max_tokens"] == cfg.max_tokens
    assert request["messages"] == [{"role": "user", "content": "p"}]
    assert not {"temperature", "top_p", "top_k"} & set(request)
    if cfg.mechanism is Mechanism.FORMAT:
        assert request["output_config"]["format"]["type"] == "json_schema"
        assert "tool_choice" not in request and "tools" not in request
    else:
        assert request["tool_choice"]["type"] == "tool"
    assert request.get("output_config", {}).get("effort") == cfg.effort
    if cfg.model == "claude-sonnet-5-5":
        assert "tool_choice" not in request
    if cfg.model == "claude-haiku-5-5":
        assert "fallbacks" not in request


def test_format_schema_is_strict():
    schema = build_request(Route.CATEGORISE_PRIMARY, "p", CategoryPrediction, CLAUDE_5_5)["output_config"]["format"]["schema"]
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(CategoryPrediction.model_fields)


def test_fallbacks_only_on_live_sonnet_5_5_requests():
    live = build_request(Route.DOC_PROFIT_LOSS, "p", ProfitLossNarrative, CLAUDE_5_5)
    batch = build_request(Route.DOC_PROFIT_LOSS, "p", ProfitLossNarrative, CLAUDE_5_5, for_batch=True)
    assert live["fallbacks"] == "default" and live["betas"] == ["server-side-fallback-2026-07-01"]
    assert "fallbacks" not in batch and "betas" not in batch


def test_profile_rejects_forced_tool_on_sonnet_5_5_and_fallbacks_on_haiku_5_5():
    routes = dict(CLAUDE_5_5.routes)
    with pytest.raises(ValueError, match="forced tool"):
        Profile("x", {**routes, Route.DOC_VAT_SUMMARY: RouteConfig("claude-sonnet-5-5", Mechanism.TOOL, 4096)}, 0.85, 0.85, 0.5)
    with pytest.raises(ValueError, match="fallback"):
        Profile("x", {**routes, Route.CATEGORISE_PRIMARY: RouteConfig("claude-haiku-5-5", Mechanism.FORMAT, 2048, fallbacks=True)}, 0.85, 0.85, 0.5)


def test_profile_comes_from_settings(monkeypatch):
    monkeypatch.setattr(llm_client.settings, "llm_profile", "claude-5-5")
    assert get_profile().name == "claude-5-5"
    monkeypatch.setattr(llm_client.settings, "llm_profile", "claude-4")
    assert get_profile().name == "claude-4"
    with pytest.raises(ValueError, match="unknown LLM_PROFILE"):
        get_profile("gpt")


def test_default_profile_is_claude_4_with_the_old_thresholds(monkeypatch):
    from app.core.config import Settings
    monkeypatch.delenv("LLM_PROFILE", raising=False)
    assert Settings(_env_file=None).llm_profile == "claude-4"
    assert (CLAUDE_4.escalation_threshold, CLAUDE_4.auto_accept_threshold, CLAUDE_4.review_threshold) == (0.85, 0.85, 0.5)


# ── Responses ────────────────────────────────────────────────────────────────

def test_parse_tool_response():
    result = parse_response(_message([_tool_use()], stop_reason="tool_use", model="claude-haiku-4-5-20251001"),
                            Route.CATEGORISE_PRIMARY, CategoryPrediction, CLAUDE_4)
    assert result.ok and result.parsed == CategoryPrediction(**PREDICTION)
    assert result.served_model == "claude-haiku-4-5-20251001"
    assert result.usage == {"input_tokens": 120, "output_tokens": 30}


def test_parse_format_response_that_starts_with_thinking():
    response = _message([_thinking(), {"type": "text", "text": json.dumps(PREDICTION)}])
    result = parse_response(response, Route.CATEGORISE_PRIMARY, CategoryPrediction, CLAUDE_5_5)
    assert result.ok and result.parsed.category_code == "400"


def test_parse_tool_response_that_starts_with_thinking():
    response = _message([_thinking(), _tool_use()], stop_reason="tool_use")
    result = parse_response(response, Route.CATEGORISE_PRIMARY, CategoryPrediction, CLAUDE_4)
    assert result.ok


def test_refusal_is_checked_before_content():
    response = _message([{"type": "text", "text": json.dumps(PREDICTION)}], stop_reason="refusal",
                        stop_details={"type": "refusal", "category": "cyber", "explanation": None})
    result = parse_response(response, Route.CATEGORISE_PRIMARY, CategoryPrediction, CLAUDE_5_5)
    assert result.status is Status.REFUSED and result.refusal_category == "cyber" and result.parsed is None
    with pytest.raises(LLMUnavailableError, match="declined.*cyber"):
        result.require()


def test_refusal_without_details():
    result = parse_response(_message([], stop_reason="refusal"), Route.CATEGORISE_PRIMARY, CategoryPrediction, CLAUDE_5_5)
    assert result.status is Status.REFUSED and result.refusal_category is None


def test_max_tokens_is_checked_before_a_partial_tool_call():
    response = _message([_tool_use()], stop_reason="max_tokens")
    result = parse_response(response, Route.CATEGORISE_PRIMARY, CategoryPrediction, CLAUDE_4)
    assert result.status is Status.TRUNCATED
    with pytest.raises(LLMUnavailableError, match="token limit"):
        result.require()


def test_missing_tool_call():
    response = _message([{"type": "text", "text": "I think it is advertising."}])
    result = parse_response(response, Route.CATEGORISE_PRIMARY, CategoryPrediction, CLAUDE_4)
    assert result.status is Status.NO_OUTPUT


def test_missing_text_block_in_format_mode():
    result = parse_response(_message([_thinking()]), Route.CATEGORISE_PRIMARY, CategoryPrediction, CLAUDE_5_5)
    assert result.status is Status.NO_OUTPUT


@pytest.mark.parametrize("content,profile", [
    ([_tool_use(payload={"category_code": "400"})], CLAUDE_4),
    ([{"type": "text", "text": "{not json"}], CLAUDE_5_5),
])
def test_invalid_output(content, profile):
    result = parse_response(_message(content, stop_reason="tool_use"), Route.CATEGORISE_PRIMARY, CategoryPrediction, profile)
    assert result.status is Status.INVALID
    with pytest.raises(LLMUnavailableError):
        result.require()


# ── Client ───────────────────────────────────────────────────────────────────

def _fake_client(response, beta_response=None):
    return SimpleNamespace(
        messages=SimpleNamespace(create=AsyncMock(return_value=response)),
        beta=SimpleNamespace(messages=SimpleNamespace(create=AsyncMock(return_value=beta_response or response))),
    )


@pytest.fixture
def fake_client():
    def install(response, beta_response=None):
        client = _fake_client(response, beta_response)
        llm_client.set_client(client)
        return client

    yield install
    llm_client.set_client(None)


@pytest.mark.asyncio
async def test_structured_call_sends_build_request_to_messages(fake_client):
    client = fake_client(_message([_tool_use()], stop_reason="tool_use"))
    result = await structured_call(Route.CATEGORISE_PRIMARY, "p", CategoryPrediction, CLAUDE_4)
    assert result.ok
    client.messages.create.assert_awaited_once_with(**build_request(Route.CATEGORISE_PRIMARY, "p", CategoryPrediction, CLAUDE_4))
    client.beta.messages.create.assert_not_awaited()


@pytest.mark.asyncio
async def test_structured_call_uses_beta_messages_for_fallbacks_and_records_served_model(fake_client):
    served = _message([{"type": "text", "text": json.dumps(PREDICTION)}], model="claude-sonnet-5", beta=True)
    client = fake_client(None, served)
    result = await structured_call(Route.CATEGORISE_ESCALATION, "p", CategoryPrediction, CLAUDE_5_5)
    assert result.ok
    assert result.requested_model == "claude-sonnet-5-5" and result.served_model == "claude-sonnet-5"
    client.messages.create.assert_not_awaited()
    assert client.beta.messages.create.await_args.kwargs["fallbacks"] == "default"


class _Narrow(BaseModel):
    value: int


def test_require_on_ok_result_returns_parsed():
    result = parse_response(_message([{"type": "text", "text": '{"value": 3}'}]), Route.DOC_VAT_SUMMARY, _Narrow, CLAUDE_5_5)
    assert result.require() == _Narrow(value=3)
