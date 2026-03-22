from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.integrations.xero_adapter import XeroAdapter

router = APIRouter(tags=["auth"])


@router.get("/auth/xero/connect")
async def xero_connect():
    """Redirect the browser to Xero's OAuth2 authorization page."""
    url = XeroAdapter.get_auth_url()
    return RedirectResponse(url)


@router.get("/auth/xero/callback")
async def xero_callback(code: str, db: AsyncSession = Depends(get_db)):
    """Handle the OAuth2 callback from Xero, store tokens, return success."""
    try:
        org = await XeroAdapter.handle_callback(code, db)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "status": "connected",
        "organisation": org.name,
        "organisation_id": str(org.id),
        "message": "Xero connected successfully. You can now trigger a sync.",
    }
