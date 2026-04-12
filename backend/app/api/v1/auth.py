from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.email import render_invite_email, send_email
from app.core.jobs import submit_job
from app.core.session import create_session_token, get_current_org, get_current_user
from app.integrations.xero_adapter import XeroAdapter
from app.models.database import Organisation, User
from app.models.schemas import InviteRequest, UserRead

router = APIRouter(tags=["auth"])


@router.get("/auth/xero/connect")
async def xero_connect():
    """Redirect the browser to Xero's OAuth2 authorization page."""
    return RedirectResponse(XeroAdapter.get_auth_url())


@router.get("/auth/xero/callback")
async def xero_callback(code: str, db: AsyncSession = Depends(get_db)):
    """Handle the OAuth2 callback, create user if needed, issue a JWT, redirect to frontend."""
    try:
        org = await XeroAdapter.handle_callback(code, db)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Ensure an owner user exists for this org.
    result = await db.execute(
        select(User).where(User.organisation_id == org.id, User.role == "owner")
    )
    user = result.scalar_one_or_none()
    if not user:
        user = User(
            organisation_id=org.id,
            email=f"{org.xero_tenant_id}@xero.placeholder",
            name=org.name,
            role="owner",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = create_session_token(org.id, org.name, user_id=user.id)

    # First-run onboarding: auto-trigger a sync so the user doesn't land on an
    # empty dashboard. Runs in the background so the redirect is instant.
    # Only for first-time connections — existing orgs have last_sync_at set.
    first_sync_job_id = None
    if org.last_sync_at is None:
        try:
            from app.api.v1.jobs import _sync_job
            sync_job = await submit_job(db, org.id, "sync", _sync_job)
            first_sync_job_id = str(sync_job.id)
        except Exception:
            # If the job system is down, just skip — user can click Sync manually.
            pass

    redirect_url = f"{settings.frontend_url}/auth/callback?token={token}"
    if first_sync_job_id:
        redirect_url += f"&first_sync_job={first_sync_job_id}"
    return RedirectResponse(url=redirect_url, status_code=302)


@router.get("/api/v1/auth/me")
async def me(
    org: Organisation = Depends(get_current_org),
    user: User = Depends(get_current_user),
):
    """Return the current authenticated user and organisation."""
    return {
        "org_id": str(org.id),
        "org_name": org.name,
        "user_id": str(user.id),
        "user_name": user.name,
        "user_email": user.email,
        "role": user.role,
    }


@router.post("/api/v1/auth/logout")
async def logout():
    """Logout — token is client-side only, so just acknowledge."""
    return {"status": "logged_out"}


# ── Team management ──────────────────────────────────────────────────────────

@router.get("/api/v1/auth/team", response_model=list[UserRead])
async def list_team(
    org: Organisation = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    """List all users in the organisation."""
    result = await db.execute(
        select(User).where(User.organisation_id == org.id).order_by(User.created_at)
    )
    return list(result.scalars().all())


@router.post("/api/v1/auth/invite", response_model=UserRead)
async def invite_member(
    body: InviteRequest,
    org: Organisation = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Invite a new member to the organisation. Only owners can invite."""
    if user.role != "owner":
        raise HTTPException(status_code=403, detail="Only owners can invite members")

    # Check if email already exists
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User with this email already exists")

    new_user = User(
        organisation_id=org.id,
        email=body.email,
        name=body.name,
        role="member",
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    # Send invitation email (best-effort; failure doesn't block the invite).
    invite_link = f"{settings.frontend_url}/?invited=1"
    html, text = render_invite_email(
        inviter_name=user.name,
        org_name=org.name,
        invite_link=invite_link,
    )
    await send_email(
        to=body.email,
        subject=f"You've been invited to join {org.name} on AI Accountant",
        html=html,
        text=text,
    )

    return new_user


@router.delete("/api/v1/auth/team/{user_id}")
async def remove_member(
    user_id: UUID,
    org: Organisation = Depends(get_current_org),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a member from the organisation. Only owners can remove. Cannot remove self."""
    if user.role != "owner":
        raise HTTPException(status_code=403, detail="Only owners can remove members")
    if user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")

    result = await db.execute(
        select(User).where(User.id == user_id, User.organisation_id == org.id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    await db.delete(target)
    await db.commit()
    return {"status": "removed", "user_id": str(user_id)}
