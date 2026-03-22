from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.database import Organisation, Account, Transaction, BankStatement
from app.models.schemas import DashboardSummary

router = APIRouter(prefix="/api/v1", tags=["dashboard"])


@router.get("/dashboard/summary", response_model=DashboardSummary)
async def dashboard_summary(db: AsyncSession = Depends(get_db)):
    """Return high-level counts for the dashboard."""
    result = await db.execute(select(Organisation).where(Organisation.xero_access_token.isnot(None)).limit(1))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(
            status_code=404,
            detail="No Xero organisation connected. Visit /auth/xero/connect first.",
        )

    total_accounts = await db.scalar(
        select(func.count()).select_from(Account).where(Account.organisation_id == org.id)
    )
    total_transactions = await db.scalar(
        select(func.count()).select_from(Transaction).where(Transaction.organisation_id == org.id)
    )
    uncategorised_count = await db.scalar(
        select(func.count())
        .select_from(Transaction)
        .where(
            Transaction.organisation_id == org.id,
            Transaction.categorisation_status == "uncategorised",
        )
    )
    unreconciled_count = await db.scalar(
        select(func.count())
        .select_from(Transaction)
        .where(
            Transaction.organisation_id == org.id,
            Transaction.is_reconciled.is_(False),
        )
    )

    return DashboardSummary(
        total_accounts=total_accounts or 0,
        total_transactions=total_transactions or 0,
        uncategorised_count=uncategorised_count or 0,
        unreconciled_count=unreconciled_count or 0,
        last_sync_at=org.last_sync_at,
        organisation_name=org.name,
    )
