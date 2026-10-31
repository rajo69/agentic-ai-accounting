"""The one place the app calls Claude.

Every structured LLM call goes through `structured_call`. A profile maps each
route to {model, mechanism, effort, max_tokens} and carries the categoriser
thresholds, so moving the app to new models is a settings change
(`LLM_PROFILE`) and rolling back is setting it to the old profile.

Two mechanisms produce structured output:
- `tool`: one forced, non-strict tool call. This reproduces the request
  Instructor 1.17.0 sent (tests/fixtures/instructor_requests.json), so the
  `claude-4` profile behaves as the app did before the gateway.
- `format`: structured outputs (`output_config.format`). Required on
  Claude Sonnet 5.5, which rejects a forced `tool_choice` with a 400.

`build_request` is pure and is the single source of request params, for live
calls and for Message Batches requests (`for_batch=True`).
"""
import json
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

from anthropic import AsyncAnthropic, transform_schema
from pydantic import BaseModel, ValidationError

from app.core.config import settings

logger = logging.getLogger(__name__)


class Route(str, Enum):
    CATEGORISE_PRIMARY = "categorise_primary"
    CATEGORISE_ESCALATION = "categorise_escalation"
    DOC_MANAGEMENT_LETTER = "doc_management_letter"
    DOC_PROFIT_LOSS = "doc_profit_loss"
    DOC_VAT_SUMMARY = "doc_vat_summary"


class Mechanism(str, Enum):
    TOOL = "tool"
    FORMAT = "format"


# Models that return a 400 on a forced tool_choice (`any` / `tool`).
FORCED_TOOL_UNSUPPORTED = {"claude-sonnet-5-5"}
# Models with no server-side refusal fallback: never send `fallbacks`.
NO_SERVER_FALLBACK = {"claude-haiku-5-5"}
FALLBACK_BETA = "server-side-fallback-2026-07-01"


@dataclass(frozen=True)
class RouteConfig:
    model: str
    mechanism: Mechanism
    max_tokens: int
    effort: Optional[str] = None
    # Server-side refusal fallback (`fallbacks: "default"`), Claude API only;
    # left out of Batch requests, which reject it.
    fallbacks: bool = False


@dataclass(frozen=True)
class Profile:
    name: str
    routes: dict[Route, RouteConfig]
    # Escalate to the second tier when primary confidence is below this.
    escalation_threshold: float
    # `decide`: confidence above this auto-accepts; at or above review, suggests.
    auto_accept_threshold: float
    review_threshold: float

    def __post_init__(self) -> None:
        missing = set(Route) - set(self.routes)
        if missing:
            raise ValueError(f"profile {self.name} has no config for {sorted(r.value for r in missing)}")
        for route, cfg in self.routes.items():
            if cfg.mechanism is Mechanism.TOOL and cfg.model in FORCED_TOOL_UNSUPPORTED:
                raise ValueError(f"{route.value}: {cfg.model} rejects a forced tool call; use format")
            if cfg.fallbacks and cfg.model in NO_SERVER_FALLBACK:
                raise ValueError(f"{route.value}: {cfg.model} has no server-side fallback")


_HAIKU_4_5 = "claude-haiku-4-5-20251001"
_SONNET_4_6 = "claude-sonnet-4-6"
_HAIKU_5_5 = "claude-haiku-5-5"
_SONNET_5_5 = "claude-sonnet-5-5"

PROFILES: dict[str, Profile] = {
    # Exactly what production ran before the gateway; the rollback profile.
    "claude-4": Profile(
        name="claude-4",
        routes={
            Route.CATEGORISE_PRIMARY: RouteConfig(_HAIKU_4_5, Mechanism.TOOL, 512),
            Route.CATEGORISE_ESCALATION: RouteConfig(_SONNET_4_6, Mechanism.TOOL, 512),
            Route.DOC_MANAGEMENT_LETTER: RouteConfig(_SONNET_4_6, Mechanism.TOOL, 1500),
            Route.DOC_PROFIT_LOSS: RouteConfig(_SONNET_4_6, Mechanism.TOOL, 1200),
            Route.DOC_VAT_SUMMARY: RouteConfig(_SONNET_4_6, Mechanism.TOOL, 1200),
        },
        escalation_threshold=0.85,
        auto_accept_threshold=0.85,
        review_threshold=0.5,
    ),
    # The default since the 2026-10-31 A/B (evals/reports/2026-10-31-migration-5-5):
    # structured outputs on the primary (no per-item difference from a forced
    # tool call, which cost more), effort low, thresholds unchanged. Thinking
    # counts toward max_tokens, so the caps are higher.
    "claude-5-5": Profile(
        name="claude-5-5",
        routes={
            Route.CATEGORISE_PRIMARY: RouteConfig(_HAIKU_5_5, Mechanism.FORMAT, 2048, effort="low"),
            Route.CATEGORISE_ESCALATION: RouteConfig(
                _SONNET_5_5, Mechanism.FORMAT, 2048, effort="low", fallbacks=True
            ),
            Route.DOC_MANAGEMENT_LETTER: RouteConfig(
                _SONNET_5_5, Mechanism.FORMAT, 4096, effort="low", fallbacks=True
            ),
            Route.DOC_PROFIT_LOSS: RouteConfig(
                _SONNET_5_5, Mechanism.FORMAT, 4096, effort="low", fallbacks=True
            ),
            Route.DOC_VAT_SUMMARY: RouteConfig(
                _SONNET_5_5, Mechanism.FORMAT, 4096, effort="low", fallbacks=True
            ),
        },
        escalation_threshold=0.85,
        auto_accept_threshold=0.85,
        review_threshold=0.5,
    ),
}


def get_profile(name: Optional[str] = None) -> Profile:
    """Return the named profile, or the one `LLM_PROFILE` selects."""
    name = name or settings.llm_profile
    try:
        return PROFILES[name]
    except KeyError:
        raise ValueError(f"unknown LLM_PROFILE {name!r}; expected one of {sorted(PROFILES)}") from None


# ── Requests ─────────────────────────────────────────────────────────────────

def tool_definition(schema: type[BaseModel]) -> dict:
    """The tool Instructor 1.17.0 built for a docstring-less pydantic model."""
    name = schema.__name__
    return {
        "name": name,
        "description": f"Correctly extracted `{name}` with all the required parameters with correct types",
        "input_schema": schema.model_json_schema(),
    }


def build_request(
    route: Route,
    prompt: str,
    schema: type[BaseModel],
    profile: Profile,
    *,
    for_batch: bool = False,
) -> dict:
    """Request params for one structured call. Never carries sampling params."""
    cfg = profile.routes[route]
    request: dict[str, Any] = {
        "model": cfg.model,
        "max_tokens": cfg.max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    output_config: dict[str, Any] = {}
    if cfg.mechanism is Mechanism.TOOL:
        request["tools"] = [tool_definition(schema)]
        request["tool_choice"] = {
            "type": "tool",
            "name": schema.__name__,
            "disable_parallel_tool_use": True,
        }
    else:
        output_config["format"] = {
            "type": "json_schema",
            "schema": transform_schema(schema.model_json_schema()),
        }
    if cfg.effort:
        output_config["effort"] = cfg.effort
    if output_config:
        request["output_config"] = output_config
    if cfg.fallbacks and not for_batch:
        request["betas"] = [FALLBACK_BETA]
        request["fallbacks"] = "default"
    return request


# ── Responses ────────────────────────────────────────────────────────────────

class Status(str, Enum):
    OK = "ok"
    REFUSED = "refused"
    TRUNCATED = "max_tokens"
    NO_OUTPUT = "no_output"
    INVALID = "invalid_output"


class LLMUnavailableError(Exception):
    """A call returned no usable structured output (refusal, truncation, bad output)."""

    def __init__(self, message: str, result: Optional["LLMResult"] = None):
        super().__init__(message)
        self.result = result


@dataclass
class LLMResult:
    route: Route
    requested_model: str
    mechanism: Mechanism
    status: Status
    parsed: Optional[BaseModel] = None
    stop_reason: Optional[str] = None
    # Model that produced the response: differs from requested_model after a
    # server-side fallback.
    served_model: Optional[str] = None
    refusal_category: Optional[str] = None
    usage: dict = field(default_factory=dict)
    detail: Optional[str] = None

    @property
    def ok(self) -> bool:
        return self.status is Status.OK

    def require(self) -> BaseModel:
        """Return the parsed output or raise LLMUnavailableError with a readable reason."""
        if self.ok and self.parsed is not None:
            return self.parsed
        if self.status is Status.REFUSED:
            message = f"the model declined the request (category: {self.refusal_category or 'unspecified'})"
        elif self.status is Status.TRUNCATED:
            message = "the model's output was cut off at the token limit"
        else:
            message = f"the model returned no valid structured output ({self.detail or self.status.value})"
        raise LLMUnavailableError(message, self)


def parse_response(response: Any, route: Route, schema: type[BaseModel], profile: Profile) -> LLMResult:
    """Turn a Messages API response into an LLMResult.

    Checks run in order: refusal, max_tokens, missing output, validation.
    Content blocks are read by type: a response can start with thinking blocks.
    """
    cfg = profile.routes[route]
    usage = response.usage.model_dump(exclude_none=True) if getattr(response, "usage", None) else {}
    result = LLMResult(
        route=route,
        requested_model=cfg.model,
        mechanism=cfg.mechanism,
        status=Status.OK,
        stop_reason=response.stop_reason,
        served_model=getattr(response, "model", None),
        usage=usage,
    )

    if response.stop_reason == "refusal":
        details = getattr(response, "stop_details", None)
        result.status = Status.REFUSED
        result.refusal_category = getattr(details, "category", None) if details else None
        return result
    if response.stop_reason == "max_tokens":
        result.status = Status.TRUNCATED
        return result

    blocks = response.content or []
    try:
        if cfg.mechanism is Mechanism.TOOL:
            call = next(
                (b for b in blocks if b.type == "tool_use" and b.name == schema.__name__), None
            )
            if call is None:
                result.status = Status.NO_OUTPUT
                result.detail = "no tool call in the response"
                return result
            result.parsed = schema.model_validate(call.input)
        else:
            texts = [b.text for b in blocks if b.type == "text"]
            if not texts:
                result.status = Status.NO_OUTPUT
                result.detail = "no text block in the response"
                return result
            result.parsed = schema.model_validate(json.loads("".join(texts)))
    except (ValidationError, json.JSONDecodeError) as exc:
        result.status = Status.INVALID
        result.detail = type(exc).__name__
    return result


# ── Client ───────────────────────────────────────────────────────────────────

_client: Optional[AsyncAnthropic] = None


def get_client() -> AsyncAnthropic:
    """One lazily created client with the SDK's default retries and timeouts."""
    global _client
    if _client is None:
        _client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


def set_client(client: Optional[AsyncAnthropic]) -> None:
    """Swap the client (tests); None resets to lazy creation."""
    global _client
    _client = client


async def structured_call(
    route: Route,
    prompt: str,
    schema: type[BaseModel],
    profile: Optional[Profile] = None,
) -> LLMResult:
    """Make one structured call. API errors propagate; output problems are in the result."""
    profile = profile or get_profile()
    request = build_request(route, prompt, schema, profile)
    client = get_client()
    if "fallbacks" in request:
        response = await client.beta.messages.create(**request)
    else:
        response = await client.messages.create(**request)
    result = parse_response(response, route, schema, profile)
    if result.served_model and result.served_model != result.requested_model:
        logger.info("%s served by %s (requested %s)", route.value, result.served_model, result.requested_model)
    return result
