"""Tests for the email module. Verify no-op behaviour without API key."""
import pytest

from app.core.email import render_invite_email, send_email


@pytest.mark.asyncio
async def test_send_email_no_api_key_returns_false(monkeypatch):
    """Without RESEND_API_KEY, send_email should silently return False."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "resend_api_key", "")
    result = await send_email(
        to="test@example.com",
        subject="Test",
        html="<p>Test</p>",
    )
    assert result is False


def test_render_invite_email_returns_html_and_text():
    html, text = render_invite_email(
        inviter_name="Jane Smith",
        org_name="Acme Accounting",
        invite_link="https://example.com/invite",
    )
    # Both contain the essential bits
    assert "Jane Smith" in html
    assert "Acme Accounting" in html
    assert "https://example.com/invite" in html
    assert "Jane Smith" in text
    assert "Acme Accounting" in text
    assert "https://example.com/invite" in text
    # HTML is actually HTML
    assert "<html>" in html
    assert "<a href=" in html
