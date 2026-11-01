"""Error responses and document labels after the 2026-11-01 owner decisions (DR-113, DR-117).

DR-117: /docs stays public, so a 5xx must not carry raw exception text (database, WeasyPrint or Xero
strings). The gateway's own messages (refusal, truncation) are written for the user and stay.
DR-113: the VAT document calls itself an indicative estimate, not a VAT return.
"""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.session import get_current_org
from app.main import app

_INTERNAL = "connection to server at 10.0.0.5 failed: FATAL password authentication failed for user app"


def _org():
    org = MagicMock()
    org.id = uuid.uuid4()
    return org


@pytest.mark.asyncio
async def test_generate_document_hides_internal_error_text():
    from app.core.rate_limit import limiter

    limiter.reset()
    app.dependency_overrides[get_current_org] = _org
    try:
        with patch(
            "app.services.document_service.generate_vat_summary",
            new=AsyncMock(side_effect=RuntimeError(_INTERNAL)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/documents/generate",
                    json={"template": "vat_summary", "period_start": "2026-01-01", "period_end": "2026-03-31"},
                )
    finally:
        app.dependency_overrides.pop(get_current_org, None)
    assert response.status_code == 500
    detail = response.json()["detail"]
    assert "10.0.0.5" not in detail and "password" not in detail
    assert detail.startswith("Document generation failed")


@pytest.mark.asyncio
async def test_sync_hides_internal_error_text():
    from app.core.rate_limit import limiter

    limiter.reset()
    adapter = MagicMock()
    adapter.full_sync = AsyncMock(side_effect=RuntimeError(_INTERNAL))
    app.dependency_overrides[get_current_org] = _org
    try:
        with patch("app.api.v1.sync.XeroAdapter", return_value=adapter):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post("/api/v1/sync")
    finally:
        app.dependency_overrides.pop(get_current_org, None)
    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "10.0.0.5" not in detail and "password" not in detail
    assert detail.startswith("Xero sync failed")


def test_vat_document_is_labelled_an_indicative_estimate():
    from app.services.document_service import _template_env

    narrative = MagicMock()
    for field in ("overview", "output_vat_commentary", "input_vat_commentary", "recommendations"):
        setattr(narrative, field, "ok")
    figures = {
        "rate_breakdown": [], "output_vat": 0.0, "input_vat": 0.0, "net_vat": 0.0, "net_vat_label": "owed to HMRC",
    }
    html = _template_env().get_template("vat_summary.html").render(
        figures=figures, narrative=narrative, fmt_money=lambda v: f"£{v}",
        organisation_name="Test Ltd", period_start="1 January 2026", period_end="31 March 2026",
        generated_at="now",
    )
    assert "VAT Return Summary" not in html
    assert "indicative estimate" in html
    assert "not for filing" in html
