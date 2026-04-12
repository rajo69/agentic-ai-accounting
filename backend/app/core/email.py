"""Transactional email via Resend. Silently no-ops if RESEND_API_KEY is unset.

Kept intentionally small: one function, one dependency (httpx, already
installed). Resend's API is a single HTTP POST — no SDK overhead needed.
"""
import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_RESEND_URL = "https://api.resend.com/emails"


async def send_email(
    to: str,
    subject: str,
    html: str,
    text: Optional[str] = None,
) -> bool:
    """Send a transactional email via Resend.

    Returns True on success, False on failure (or if Resend isn't configured).
    Never raises — email sending is best-effort; the caller's operation
    (e.g. creating an invited user) must not fail because of a mail problem.
    """
    if not settings.resend_api_key:
        logger.debug("RESEND_API_KEY not set — email to %s skipped", to)
        return False

    payload = {
        "from": settings.email_from,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _RESEND_URL,
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if resp.status_code >= 400:
                logger.warning(
                    "Resend send failed for %s: %d %s",
                    to, resp.status_code, resp.text[:200],
                )
                return False
            return True
    except Exception:
        logger.exception("Email send to %s raised — continuing anyway", to)
        return False


def render_invite_email(
    inviter_name: str,
    org_name: str,
    invite_link: str,
) -> tuple[str, str]:
    """Return (html, text) for a team invitation email."""
    subject_line = f"You've been invited to join {org_name} on AI Accountant"
    html = f"""
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 32px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <h1 style="color: #0f172a; font-size: 20px; margin: 0 0 16px 0;">You're invited to {org_name}</h1>
    <p style="color: #475569; font-size: 14px; line-height: 1.6;">
      {inviter_name} has invited you to join their organisation on AI Accountant, an AI-powered
      assistant for UK accountants that automates Xero transaction categorisation and bank reconciliation.
    </p>
    <div style="margin: 24px 0;">
      <a href="{invite_link}" style="display: inline-block; background: #4f46e5; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Accept invitation</a>
    </div>
    <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
      If you weren't expecting this invitation, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
""".strip()
    text = (
        f"You've been invited to join {org_name} on AI Accountant.\n\n"
        f"{inviter_name} has invited you to join their organisation, an AI-powered assistant "
        f"for UK accountants that automates Xero transaction categorisation and bank reconciliation.\n\n"
        f"Accept the invitation: {invite_link}\n\n"
        f"If you weren't expecting this invitation, you can safely ignore this email."
    )
    return html, text
