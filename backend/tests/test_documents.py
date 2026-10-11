"""Tests for document generation endpoints and service helpers."""
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.session import get_current_org
from app.main import app
from app.services.document_service import (
    ManagementLetterNarrative,
    _calculate_figures,
    _render_html,
)


# ── Unit tests: financial calculations (no DB, no LLM) ───────────────────────

class _FakeTx:
    def __init__(self, amount, description="desc", cat=None, date_val=date(2026, 1, 15)):
        self.amount = Decimal(str(amount))
        self.description = description
        self.category = cat
        self.date = date_val
        self.reference = None


def test_calculate_figures_basic():
    transactions = [
        _FakeTx(1000.00, cat="Sales"),
        _FakeTx(500.00, cat="Sales"),
        _FakeTx(-200.00, cat="Office Supplies"),
        _FakeTx(-100.00, cat="Travel"),
    ]
    figures = _calculate_figures(transactions, date(2026, 1, 1), date(2026, 1, 31))

    assert figures["total_income"] == pytest.approx(1500.00)
    assert figures["total_expenses_abs"] == pytest.approx(300.00)
    assert figures["net"] == pytest.approx(1200.00)
    assert figures["transaction_count"] == 4
    assert len(figures["top_expense_categories"]) == 2
    assert len(figures["largest_transactions"]) == 4


def test_calculate_figures_empty():
    figures = _calculate_figures([], date(2026, 1, 1), date(2026, 1, 31))
    assert figures["total_income"] == 0.0
    assert figures["total_expenses_abs"] == 0.0
    assert figures["net"] == 0.0
    assert figures["transaction_count"] == 0


def test_calculate_figures_net_loss():
    transactions = [_FakeTx(-500.00, cat="Rent"), _FakeTx(100.00, cat="Sales")]
    figures = _calculate_figures(transactions, date(2026, 1, 1), date(2026, 1, 31))
    assert figures["net"] == pytest.approx(-400.00)


def test_calculate_figures_top_categories_limit():
    """Only top 5 expense categories should be returned."""
    transactions = [_FakeTx(-10.00, cat=f"Cat{i}") for i in range(10)]
    figures = _calculate_figures(transactions, date(2026, 1, 1), date(2026, 1, 31))
    assert len(figures["top_expense_categories"]) == 5


def test_calculate_figures_uncategorised_grouping():
    """Uncategorised transactions should be grouped under 'Uncategorised'."""
    transactions = [_FakeTx(-100.00, cat=None), _FakeTx(-200.00, cat=None)]
    figures = _calculate_figures(transactions, date(2026, 1, 1), date(2026, 1, 31))
    names = [c["name"] for c in figures["top_expense_categories"]]
    assert "Uncategorised" in names


# ── Unit test: HTML rendering (no LLM, no PDF) ───────────────────────────────

def test_render_html_produces_html():
    figures = _calculate_figures(
        [_FakeTx(1000.00, cat="Sales"), _FakeTx(-300.00, cat="Rent")],
        date(2026, 1, 1),
        date(2026, 3, 31),
    )
    narrative = ManagementLetterNarrative(
        executive_summary="Good quarter overall.",
        income_analysis="Income steady.",
        expense_analysis="Rent is the top expense.",
        cash_flow_observations="Cash flow positive.",
        recommendations="Consider reducing office costs.",
    )
    html = _render_html(figures, narrative, "ACME Ltd", date(2026, 1, 1), date(2026, 3, 31))
    assert "<!DOCTYPE html>" in html
    assert "ACME Ltd" in html
    assert "Management Letter" in html
    assert "Good quarter overall." in html
    assert "AI-Assisted Draft" in html


# ── Integration tests: API endpoints (no DB, no LLM, no PDF) ─────────────────

@pytest.mark.asyncio
async def test_list_documents_no_org():
    """Without a connected org, GET /api/v1/documents should return 401."""
    from fastapi import HTTPException

    def raise_401():
        raise HTTPException(status_code=401, detail="Not authenticated")

    app.dependency_overrides[get_current_org] = raise_401
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/documents")
    finally:
        app.dependency_overrides.pop(get_current_org, None)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_generate_document_unsupported_template():
    """Requesting an unsupported template should return 400."""
    fake_org = MagicMock()
    fake_org.id = uuid.uuid4()
    fake_org.name = "Test Org"

    app.dependency_overrides[get_current_org] = lambda: fake_org
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/documents/generate",
                json={"template": "unknown_template", "period_start": "2026-01-01", "period_end": "2026-03-31"},
            )
    finally:
        app.dependency_overrides.pop(get_current_org, None)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_generate_document_invalid_period():
    """period_start after period_end should return 400."""
    fake_org = MagicMock()
    fake_org.id = uuid.uuid4()

    app.dependency_overrides[get_current_org] = lambda: fake_org
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/documents/generate",
                json={"template": "management_letter", "period_start": "2026-03-31", "period_end": "2026-01-01"},
            )
    finally:
        app.dependency_overrides.pop(get_current_org, None)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_generate_document_happy_path():
    """With mocked LLM and WeasyPrint, POST /api/v1/documents/generate should return a PDF."""
    fake_org = MagicMock()
    fake_org.id = uuid.uuid4()
    fake_org.name = "Test Org"

    fake_pdf = b"%PDF-1.4 fake pdf content"

    app.dependency_overrides[get_current_org] = lambda: fake_org
    try:
        with patch.object(
            __import__("app.services.document_service", fromlist=["generate_management_letter"]),
            "generate_management_letter",
            new=AsyncMock(
                return_value=(
                    fake_pdf,
                    {
                        "document_id": str(uuid.uuid4()),
                        "template": "management_letter",
                        "period_start": "2026-01-01",
                        "period_end": "2026-03-31",
                        "transaction_count": 42,
                        "generated_at": "2026-03-22T12:00:00",
                    },
                )
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/documents/generate",
                    json={"template": "management_letter", "period_start": "2026-01-01", "period_end": "2026-03-31"},
                )
    finally:
        app.dependency_overrides.pop(get_current_org, None)

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content == fake_pdf


# ── Unit tests: untrusted text in PDFs (self-review fix) ─────────────────────

_EVIL = '<script>alert(1)</script><img src="file:///etc/passwd">'


def test_render_html_escapes_transaction_and_narrative_text():
    """Descriptions come from Xero and narratives from the model: neither may inject markup."""
    figures = _calculate_figures(
        [_FakeTx(1000.00, cat="Sales"), _FakeTx(-300.00, description=_EVIL, cat=_EVIL)],
        date(2026, 1, 1),
        date(2026, 3, 31),
    )
    narrative = ManagementLetterNarrative(
        executive_summary=_EVIL,
        income_analysis="Income & expenses held steady.",
        expense_analysis="ok",
        cash_flow_observations="ok",
        recommendations="ok",
    )
    html = _render_html(figures, narrative, _EVIL, date(2026, 1, 1), date(2026, 3, 31))
    assert "<script>" not in html
    assert "<img" not in html
    assert "&lt;script&gt;" in html
    assert "Income &amp; expenses held steady." in html


@pytest.mark.parametrize("template", ["profit_loss.html", "vat_summary.html"])
def test_other_templates_escape_untrusted_text(template):
    from app.services.document_service import _template_env

    narrative = MagicMock()
    for field in ("overview", "income_commentary", "expense_commentary", "outlook",
                  "output_vat_commentary", "input_vat_commentary", "recommendations"):
        setattr(narrative, field, _EVIL)
    figures = {
        "income_categories": [{"name": _EVIL, "amount": 1.0}],
        "expense_categories": [{"name": _EVIL, "amount": 1.0}],
        "rate_breakdown": [{"rate": _EVIL, "net_sales": 1.0, "output_vat": 0.2,
                            "net_purchases": 1.0, "input_vat": 0.2}],
        "total_income": 1.0, "total_expenses": 1.0, "net": 0.0,
        "output_vat": 0.2, "input_vat": 0.2, "net_vat": 0.0, "net_vat_label": "owed to HMRC",
    }
    html = _template_env().get_template(template).render(
        figures=figures, narrative=narrative, fmt_money=lambda v: f"£{v}",
        organisation_name=_EVIL, period_start="1 January 2026", period_end="31 March 2026",
        generated_at="now", net_positive=True,
    )
    assert "<script>" not in html
    assert "<img" not in html


_BLOCKED_URLS = [
    "file:///etc/passwd",
    "file:///C:/Windows/win.ini",
    "http://169.254.169.254/latest/meta-data/",
    "https://example.com/tracker.png",
    "ftp://example.com/x",
]


@pytest.mark.parametrize("url", _BLOCKED_URLS)
def test_pdf_urls_blocked_except_data_and_templates(url):
    from app.services.document_service import _check_pdf_url, _pdf_url_allowed

    assert not _pdf_url_allowed(url)
    with pytest.raises(ValueError):
        _check_pdf_url(url)


def test_pdf_urls_allowed_for_data_uris_and_template_files():
    from app.services.document_service import TEMPLATES_DIR, _pdf_url_allowed

    assert _pdf_url_allowed("data:image/png;base64,iVBORw0KGgo=")
    assert _pdf_url_allowed((TEMPLATES_DIR / "logo.png").resolve().as_uri())
    assert not _pdf_url_allowed((TEMPLATES_DIR / ".." / "core" / "config.py").resolve().as_uri())


def test_html_to_pdf_uses_a_restricted_url_fetcher():
    """WeasyPrint >= 68 needs a URLFetcher subclass (it reads `_fail_on_errors` off the fetcher)."""
    import sys
    import types

    from app.services.document_service import _html_to_pdf_sync

    class FakeURLFetcher:
        _fail_on_errors = False

        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def fetch(self, url, headers=None):
            return ("fetched", url)

    fake_weasyprint = MagicMock()
    fake_weasyprint.HTML.return_value.write_pdf.return_value = b"%PDF"
    fake_urls = types.SimpleNamespace(URLFetcher=FakeURLFetcher)
    with patch.dict(sys.modules, {"weasyprint": fake_weasyprint, "weasyprint.urls": fake_urls}):
        assert _html_to_pdf_sync("<p>x</p>") == b"%PDF"

    fetcher = fake_weasyprint.HTML.call_args.kwargs["url_fetcher"]
    assert fake_weasyprint.HTML.call_args.kwargs["string"] == "<p>x</p>"
    assert isinstance(fetcher, FakeURLFetcher)
    assert fetcher.kwargs["allowed_protocols"] == {"data", "file"}
    assert fetcher.fetch("data:,x") == ("fetched", "data:,x")
    for url in _BLOCKED_URLS:
        with pytest.raises(ValueError):
            fetcher.fetch(url)


def test_real_pdf_render_blocks_local_files():
    """End to end with WeasyPrint (skipped where Pango/Cairo are missing; CI installs them)."""
    try:
        import weasyprint  # noqa: F401
    except (ImportError, OSError):
        pytest.skip("WeasyPrint needs Pango and Cairo")
    from app.services import document_service

    checked = []
    real_check = document_service._check_pdf_url

    def spy(url):
        checked.append(url)
        real_check(url)

    html = '<p>ok</p><img src="file:///etc/passwd"><img src="http://169.254.169.254/x.png">'
    with patch.object(document_service, "_check_pdf_url", spy):
        pdf = document_service._html_to_pdf_sync(html)
    assert pdf.startswith(b"%PDF")
    assert "file:///etc/passwd" in checked
    assert "http://169.254.169.254/x.png" in checked
