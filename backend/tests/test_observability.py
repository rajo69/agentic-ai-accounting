"""Tests for Sentry observability. Verify safe no-op behaviour without DSN."""
from app.core.observability import capture_exception, init_sentry, set_org_context


def test_init_sentry_no_dsn_is_safe(monkeypatch):
    """With no SENTRY_DSN set, init should be a no-op."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "sentry_dsn", "")
    # Should not raise
    init_sentry()


def test_capture_exception_without_init_is_safe():
    """Calling capture_exception before init should not crash."""
    try:
        raise ValueError("test error")
    except ValueError as exc:
        # Should not raise
        capture_exception(exc, extra_field="test")


def test_set_org_context_without_init_is_safe():
    """Calling set_org_context before init should not crash."""
    # Should not raise
    set_org_context("org-123", "Test Org")
