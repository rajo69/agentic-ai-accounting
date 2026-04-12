"""JWT session helpers and FastAPI dependencies for authenticated routes."""
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.database import Organisation, User

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24

_bearer = HTTPBearer(auto_error=False)


def create_session_token(org_id: UUID, org_name: str, user_id: UUID | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {"org_id": str(org_id), "org_name": org_name, "exp": expire}
    if user_id:
        payload["user_id"] = str(user_id)
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_session_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise ValueError("Invalid or expired token") from exc


async def get_current_org(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> Organisation:
    """FastAPI dependency — verifies Bearer JWT and returns the Organisation."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = decode_session_token(credentials.credentials)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    org_id_str = payload.get("org_id")
    if not org_id_str:
        raise HTTPException(status_code=401, detail="Malformed token")

    result = await db.execute(
        select(Organisation).where(Organisation.id == UUID(org_id_str))
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=401, detail="Organisation not found")

    return org


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """FastAPI dependency — verifies Bearer JWT and returns the User.

    Falls back to returning the org owner if the token doesn't contain a
    user_id (backwards compatibility with pre-multiuser tokens).
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = decode_session_token(credentials.credentials)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user_id_str = payload.get("user_id")
    if user_id_str:
        result = await db.execute(
            select(User).where(User.id == UUID(user_id_str))
        )
        user = result.scalar_one_or_none()
        if user:
            return user

    # Fallback: find the owner of the org (backwards compat for old tokens).
    org_id_str = payload.get("org_id")
    if not org_id_str:
        raise HTTPException(status_code=401, detail="Malformed token")

    result = await db.execute(
        select(User).where(
            User.organisation_id == UUID(org_id_str),
            User.role == "owner",
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user
