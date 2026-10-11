"""Tests for Xero OAuth2 and data sync (Phase 2)."""
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, Response
from fastapi.testclient import TestClient

from app.main import app
from app.integrations.xero_adapter import XeroAdapter, _parse_xero_date
from app.core.config import settings


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_org(
    tenant_id: str = "test-tenant-id",
    access_token: str = "tok_access",
    refresh_token: str = "tok_refresh",
    expires_offset_seconds: int = 3600,
) -> MagicMock:
    org = MagicMock()
    org.id = uuid.uuid4()
    org.name = "Test Ltd"
    org.xero_tenant_id = tenant_id
    org.xero_access_token = access_token
    org.xero_refresh_token = refresh_token
    org.xero_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_offset_seconds)
    org.last_sync_at = None
    return org


# ---------------------------------------------------------------------------
# Unit tests — no DB, no HTTP
# ---------------------------------------------------------------------------

def test_get_auth_url_contains_required_params():
    url = XeroAdapter.get_auth_url()
    assert "login.xero.com" in url
    assert "client_id=" in url
    assert "offline_access" in url
    assert "redirect_uri=" in url
    assert "response_type=code" in url


def test_api_headers_no_since_omits_if_modified_since():
    """First sync (since=None) should not include If-Modified-Since header."""
    org = _make_org()
    adapter = XeroAdapter(org)
    headers = adapter._api_headers("tok_access")
    assert "If-Modified-Since" not in headers


def test_api_headers_with_since_includes_rfc1123_date():
    """Incremental sync should include a correctly formatted If-Modified-Since header."""
    org = _make_org()
    adapter = XeroAdapter(org)
    # 2026-04-12 15:30:00 UTC
    since = datetime(2026, 4, 12, 15, 30, 0, tzinfo=timezone.utc)
    headers = adapter._api_headers("tok_access", since=since)
    assert "If-Modified-Since" in headers
    assert headers["If-Modified-Since"] == "Sun, 12 Apr 2026 15:30:00 GMT"


def test_api_headers_naive_datetime_treated_as_utc():
    """Timezone-naive datetimes should be treated as UTC to avoid silent drift."""
    org = _make_org()
    adapter = XeroAdapter(org)
    since = datetime(2026, 4, 12, 15, 30, 0)  # naive
    headers = adapter._api_headers("tok_access", since=since)
    assert headers["If-Modified-Since"] == "Sun, 12 Apr 2026 15:30:00 GMT"


def test_parse_xero_date_ms_format():
    # 2021-01-01 00:00:00 UTC = 1609459200000 ms
    result = _parse_xero_date("/Date(1609459200000+0000)/")
    assert result is not None
    assert result.year == 2021
    assert result.month == 1
    assert result.day == 1


def test_parse_xero_date_iso_format():
    result = _parse_xero_date("2024-03-15T00:00:00")
    assert result is not None
    assert result.year == 2024
    assert result.month == 3
    assert result.day == 15


def test_parse_xero_date_none():
    assert _parse_xero_date(None) is None
    assert _parse_xero_date("") is None


# ---------------------------------------------------------------------------
# Test sync_accounts with mocked HTTP
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_sync_accounts_upserts_correctly():
    org = _make_org()

    mock_db = AsyncMock()

    # Mock select for Account lookup → returns None (new account)
    no_result = MagicMock()
    no_result.scalar_one_or_none.return_value = None
    mock_db.execute = AsyncMock(return_value=no_result)
    mock_db.commit = AsyncMock()

    xero_response = {
        "Accounts": [
            {
                "AccountID": "acc-001",
                "Code": "200",
                "Name": "Sales",
                "Type": "REVENUE",
                "TaxType": "OUTPUT2",
            }
        ]
    }

    with patch("app.integrations.xero_adapter.XeroAdapter._ensure_valid_token", return_value="tok_access"), \
         patch("app.integrations.xero_adapter.httpx.AsyncClient") as mock_client_cls:

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = xero_response
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        adapter = XeroAdapter(org)
        count = await adapter.sync_accounts(mock_db)

    assert count == 1
    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# Integration test — FastAPI routes (no real DB, mocked adapter)
# ---------------------------------------------------------------------------

def test_xero_connect_redirects():
    client = TestClient(app, follow_redirects=False)
    response = client.get("/auth/xero/connect")
    assert response.status_code in (302, 307)
    assert "login.xero.com" in response.headers["location"]


def test_dashboard_route_registered():
    """Confirm dashboard route is in the OpenAPI schema."""
    client = TestClient(app)
    response = client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/api/v1/dashboard/summary" in paths


def test_sync_status_route_registered():
    """Confirm sync routes appear in the OpenAPI schema."""
    client = TestClient(app)
    response = client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/api/v1/sync" in paths
    assert "/api/v1/sync/status" in paths
    assert "/api/v1/dashboard/summary" in paths


# ---------------------------------------------------------------------------
# Self-review fixes: SPEND subtypes and requested scopes
# ---------------------------------------------------------------------------

# Every BankTransaction type Xero documents; the SPEND family is money out.
_BANK_TX_TYPES = {
    "SPEND": Decimal("-10.00"),
    "SPEND-TRANSFER": Decimal("-20.00"),
    "SPEND-OVERPAYMENT": Decimal("-30.00"),
    "SPEND-PREPAYMENT": Decimal("-40.00"),
    "RECEIVE": Decimal("50.00"),
    "RECEIVE-TRANSFER": Decimal("60.00"),
    "RECEIVE-OVERPAYMENT": Decimal("70.00"),
    "RECEIVE-PREPAYMENT": Decimal("80.00"),
}


def _bank_tx_items() -> list[dict]:
    return [
        {
            "BankTransactionID": f"bt-{tx_type}",
            "Type": tx_type,
            "Status": "AUTHORISED",
            "Date": "/Date(1767225600000+0000)/",
            "Total": float(abs(expected)),
            "Reference": tx_type,
            "LineItems": [{"Description": tx_type}],
        }
        for tx_type, expected in _BANK_TX_TYPES.items()
    ]


def _mock_sync_db() -> AsyncMock:
    db = AsyncMock()
    no_result = MagicMock()
    no_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=no_result)
    db.commit = AsyncMock()
    db.add = MagicMock()
    return db


async def _fake_get(self, client, url, headers, params=None):
    if url.endswith("/BankTransactions") and params.get("page") == 1:
        return {"BankTransactions": _bank_tx_items()}
    return {}


@pytest.mark.asyncio
async def test_sync_transactions_stores_every_spend_subtype_negative():
    """SPEND-TRANSFER, SPEND-OVERPAYMENT and SPEND-PREPAYMENT are money out too (invariant 7)."""
    db = _mock_sync_db()
    with patch("app.integrations.xero_adapter.XeroAdapter._ensure_valid_token", return_value="tok"), \
         patch("app.integrations.xero_adapter.XeroAdapter._get_with_retry", new=_fake_get):
        await XeroAdapter(_make_org()).sync_transactions(db)

    stored = {call.args[0].reference: call.args[0].amount for call in db.add.call_args_list}
    assert stored == _BANK_TX_TYPES


@pytest.mark.asyncio
async def test_sync_bank_statements_stores_every_spend_subtype_negative():
    db = _mock_sync_db()
    with patch("app.integrations.xero_adapter.XeroAdapter._ensure_valid_token", return_value="tok"), \
         patch("app.integrations.xero_adapter.XeroAdapter._get_with_retry", new=_fake_get):
        await XeroAdapter(_make_org()).sync_bank_statements(db)

    stored = {call.args[0].reference: call.args[0].amount for call in db.add.call_args_list}
    assert stored == _BANK_TX_TYPES


def test_requested_scopes_are_read_only():
    """The app never writes to Xero, so it must not ask for write access."""
    from app.integrations.xero_adapter import XERO_SCOPES

    scopes = set(XERO_SCOPES.split())
    accounting = {s for s in scopes if s.startswith("accounting.")}
    assert accounting and all(s.endswith(".read") for s in accounting)
    assert {
        "accounting.banktransactions.read",
        "accounting.invoices.read",
        "accounting.contacts.read",
        "accounting.settings.read",
        "accounting.payments.read",
        "offline_access",
    } <= scopes
