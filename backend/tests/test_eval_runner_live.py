"""Live-mode eval runner plumbing: no silent mock fallback, cache keyed by the full request. No network."""
import dataclasses
import sys
from unittest.mock import AsyncMock, patch

import pytest

from app.agents.categoriser import CategoryPrediction
from app.services import llm_client
from app.services.llm_client import PROFILES, LLMResult, Mechanism, Route, Status
from evals.cost_tracker import CostTracker
from evals.eval_runner import EvalTransaction, _live_categorise
from evals.response_cache import ResponseCache

HAIKU_4_5 = PROFILES["claude-4"].routes[Route.CATEGORISE_PRIMARY].model
ACCOUNTS = [{"code": "400", "name": "Advertising", "type": "EXPENSE"}]
TX = EvalTransaction(id="t1", date="2026-01-15", amount="-250.00", description="GOOGLE ADS",
                     reference="", expected_category_code="400", expected_category_name="Advertising",
                     difficulty="easy", notes="")


def _result():
    cfg = PROFILES["claude-4"].routes[Route.CATEGORISE_PRIMARY]
    return LLMResult(
        route=Route.CATEGORISE_PRIMARY, requested_model=cfg.model, mechanism=cfg.mechanism, status=Status.OK,
        parsed=CategoryPrediction(category_code="400", category_name="Advertising", confidence=0.9, reasoning="r"),
        served_model=cfg.model, usage={"input_tokens": 10, "output_tokens": 5},
    )


@pytest.mark.asyncio
async def test_live_mode_does_not_fall_back_to_mock_when_the_gateway_cannot_import(tmp_path):
    """A broken import must stop a live run, not turn it into $0 mock predictions."""
    cache = ResponseCache(cache_dir=tmp_path, enabled=True)
    with patch.dict(sys.modules, {"app.services.llm_client": None}):
        with pytest.raises(ImportError):
            await _live_categorise(TX, ACCOUNTS, HAIKU_4_5, CostTracker(), cache)


@pytest.mark.asyncio
async def test_cache_misses_when_the_request_params_change_for_the_same_model(tmp_path, monkeypatch):
    """The cache key covers mechanism, effort and max_tokens, not just the model id."""
    cache = ResponseCache(cache_dir=tmp_path, enabled=True)
    call = AsyncMock(return_value=_result())
    monkeypatch.setattr(llm_client, "structured_call", call)

    _, cached = await _live_categorise(TX, ACCOUNTS, HAIKU_4_5, CostTracker(), cache)
    assert not cached
    _, cached = await _live_categorise(TX, ACCOUNTS, HAIKU_4_5, CostTracker(), cache)
    assert cached and call.await_count == 1

    old = PROFILES["claude-4"]
    routes = {**old.routes, Route.CATEGORISE_PRIMARY: dataclasses.replace(old.routes[Route.CATEGORISE_PRIMARY], mechanism=Mechanism.FORMAT)}
    monkeypatch.setitem(PROFILES, "claude-4", dataclasses.replace(old, routes=routes))
    _, cached = await _live_categorise(TX, ACCOUNTS, HAIKU_4_5, CostTracker(), cache)
    assert not cached and call.await_count == 2
