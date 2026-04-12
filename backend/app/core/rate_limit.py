"""Per-organisation rate limiting for cost-sensitive endpoints.

Uses slowapi with in-memory storage (per-process). Keys requests by the
org_id extracted from the Bearer JWT, falling back to remote IP for
unauthenticated requests (e.g. the webhook endpoint).

Why per-org, not per-IP: multiple accountants in the same firm share an
office IP. Limiting by org means one firm's heavy usage doesn't starve
another firm on the same network.

Why in-memory, not Redis: single Railway replica at current scale. If we
later scale horizontally, switch the Limiter's `storage_uri` to Redis so
limits are shared across processes.
"""
import logging

from fastapi import Request
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.responses import JSONResponse

from app.core.session import decode_session_token

logger = logging.getLogger(__name__)


def _org_key(request: Request) -> str:
    """Derive the rate-limit key from the Bearer token's org_id.

    Falls back to the remote IP for unauthenticated requests so the
    webhook endpoint still gets some protection from flooding.
    """
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        try:
            payload = decode_session_token(auth[7:])
            org_id = payload.get("org_id")
            if org_id:
                return f"org:{org_id}"
        except ValueError:
            pass
    return f"ip:{get_remote_address(request)}"


# The limiter instance. Decorate endpoints with @limiter.limit("N/period").
limiter = Limiter(key_func=_org_key, default_limits=[])


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Return a clean 429 with a Retry-After header and helpful JSON body."""
    logger.warning(
        "Rate limit hit: key=%s limit=%s path=%s",
        _org_key(request), exc.detail, request.url.path,
    )
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Too many requests. Please slow down.",
            "limit": str(exc.detail),
        },
        headers={"Retry-After": "60"},
    )
