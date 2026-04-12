"""Thin Redis cache layer. Falls back gracefully if Redis is unavailable."""
import json
import logging
from typing import Any, Optional
from uuid import UUID

from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    import redis.asyncio as aioredis
except ImportError:
    aioredis = None  # type: ignore[assignment]

_pool: Optional[Any] = None


async def _get_redis() -> Optional[Any]:
    """Lazy-connect to Redis. Returns None if unavailable."""
    global _pool
    if aioredis is None:
        return None
    if _pool is not None:
        return _pool
    try:
        _pool = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
        )
        await _pool.ping()
        return _pool
    except Exception:
        logger.debug("Redis unavailable — caching disabled")
        _pool = None
        return None


async def cache_get(key: str) -> Optional[dict]:
    """Return cached JSON value or None."""
    r = await _get_redis()
    if r is None:
        return None
    try:
        raw = await r.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def cache_set(key: str, value: dict, ttl_seconds: int = 60) -> None:
    """Store a JSON-serialisable dict with TTL."""
    r = await _get_redis()
    if r is None:
        return
    try:
        await r.set(key, json.dumps(value, default=str), ex=ttl_seconds)
    except Exception:
        pass


async def cache_delete_pattern(pattern: str) -> None:
    """Delete all keys matching a glob pattern."""
    r = await _get_redis()
    if r is None:
        return
    try:
        cursor = None
        while cursor != 0:
            cursor, keys = await r.scan(cursor=cursor or 0, match=pattern, count=100)
            if keys:
                await r.delete(*keys)
    except Exception:
        pass


def dashboard_key(org_id: UUID) -> str:
    return f"dashboard:{org_id}"
