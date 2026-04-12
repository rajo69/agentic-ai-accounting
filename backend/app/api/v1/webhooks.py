"""Xero webhook receiver — validates signature and triggers background sync."""
import asyncio
import hashlib
import hmac
import logging

from fastapi import APIRouter, Request, Response
from sqlalchemy import select

from app.core.cache import cache_delete_pattern, cache_get, cache_set, dashboard_key
from app.core.config import settings
from app.core.database import async_session
from app.integrations.xero_adapter import XeroAdapter
from app.models.database import Organisation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["webhooks"])

# Debounce key prefix — prevents multiple syncs within 60s per org.
_DEBOUNCE_PREFIX = "webhook_debounce:"


def _verify_signature(payload: bytes, signature: str) -> bool:
    """Verify Xero's HMAC-SHA256 webhook signature."""
    if not settings.xero_webhook_key:
        return False
    expected = hmac.new(
        settings.xero_webhook_key.encode(),
        payload,
        hashlib.sha256,
    ).digest()
    import base64
    expected_b64 = base64.b64encode(expected).decode()
    return hmac.compare_digest(expected_b64, signature)


async def _background_sync(tenant_id: str) -> None:
    """Run a full sync for the given tenant in the background."""
    async with async_session() as db:
        result = await db.execute(
            select(Organisation).where(Organisation.xero_tenant_id == tenant_id)
        )
        org = result.scalar_one_or_none()
        if not org:
            logger.warning("Webhook for unknown tenant %s", tenant_id)
            return

        # Debounce: skip if we synced this org within the last 60s.
        debounce_key = f"{_DEBOUNCE_PREFIX}{org.id}"
        if await cache_get(debounce_key):
            logger.debug("Debounced webhook sync for org %s", org.id)
            return
        await cache_set(debounce_key, {"syncing": True}, ttl_seconds=60)

        try:
            adapter = XeroAdapter(org)
            result = await adapter.full_sync(db)
            await cache_delete_pattern(dashboard_key(org.id))
            logger.info(
                "Webhook sync complete for org %s: %d accounts, %d transactions, %d statements",
                org.id, result.synced_accounts, result.synced_transactions, result.synced_bank_statements,
            )
        except Exception:
            logger.exception("Webhook sync failed for org %s", org.id)


@router.post("/webhooks/xero")
async def xero_webhook(request: Request):
    """Receive Xero webhook events.

    Xero sends an intent-to-receive validation on first setup (expects 200
    with the correct response) and then real event payloads after that.
    See: https://developer.xero.com/documentation/guides/webhooks/overview
    """
    body = await request.body()
    signature = request.headers.get("x-xero-signature", "")

    if not _verify_signature(body, signature):
        # Xero requires 401 for bad signatures to confirm the webhook key.
        return Response(status_code=401)

    payload = await request.json()
    events = payload.get("events", [])

    # Extract unique tenant IDs from events and trigger background syncs.
    tenant_ids = {e.get("tenantId") for e in events if e.get("tenantId")}
    for tenant_id in tenant_ids:
        asyncio.create_task(_background_sync(tenant_id))

    return Response(status_code=200)
