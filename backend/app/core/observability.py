"""Sentry error tracking. Inactive if SENTRY_DSN is not configured."""
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

_initialised = False


def init_sentry() -> None:
    """Initialise Sentry SDK if configured. Safe to call multiple times."""
    global _initialised
    if _initialised or not settings.sentry_dsn:
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            # Capture info-level and above breadcrumbs, errors and above as events
            traces_sample_rate=0.1,  # 10% of transactions for perf monitoring
            send_default_pii=False,  # never send user emails / IP / bodies
            integrations=[
                FastApiIntegration(),
                StarletteIntegration(),
                SqlalchemyIntegration(),
            ],
            # Don't report these — they're expected control flow
            ignore_errors=["HTTPException"],
        )
        _initialised = True
        logger.info("Sentry initialised (env=%s)", settings.environment)
    except ImportError:
        logger.debug("sentry-sdk not installed — error tracking disabled")
    except Exception:
        logger.exception("Failed to initialise Sentry")


def capture_exception(exc: Exception, **extra) -> None:
    """Manually capture an exception with optional extra context.

    Use this for caught exceptions that would otherwise not reach Sentry
    (e.g. inside a try/except where we still want to record the failure).
    """
    if not _initialised:
        return
    try:
        import sentry_sdk
        with sentry_sdk.push_scope() as scope:
            for key, value in extra.items():
                scope.set_extra(key, value)
            sentry_sdk.capture_exception(exc)
    except Exception:
        pass


def set_org_context(org_id: str, org_name: str) -> None:
    """Tag subsequent Sentry events with the current organisation."""
    if not _initialised:
        return
    try:
        import sentry_sdk
        sentry_sdk.set_tag("org_id", org_id)
        sentry_sdk.set_tag("org_name", org_name)
    except Exception:
        pass
