"""Background job submission and polling.

Async variants of the long-running endpoints (categorise, reconcile,
document generation). Each submits a Job row and returns immediately
with a `job_id`; clients poll `GET /api/v1/jobs/{id}` for status.

The existing synchronous endpoints (POST /api/v1/categorise, etc.) are
kept for backwards compatibility — the async variants are opt-in.
"""
from typing import Callable
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.categoriser import categorise_batch
from app.agents.reconciler import reconcile_batch
from app.core.cache import cache_delete_pattern, dashboard_key
from app.core.database import get_db
from app.core.jobs import submit_job
from app.core.rate_limit import limiter
from app.core.session import get_current_org
from app.models.database import Job, Organisation
from app.models.schemas import (
    DocumentGenerateRequest,
    JobRead,
    JobSubmitResponse,
)
from app.services import document_service

router = APIRouter(prefix="/api/v1", tags=["jobs"])


# ── Job polling ───────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}", response_model=JobRead)
async def get_job(
    job_id: UUID,
    org: Organisation = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    """Poll a job's status. Returns status, progress, and (if completed) result."""
    result = await db.execute(
        select(Job).where(Job.id == job_id, Job.organisation_id == org.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/jobs", response_model=list[JobRead])
async def list_jobs(
    kind: str | None = None,
    status: str | None = None,
    limit: int = 20,
    org: Organisation = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    """List recent jobs for the organisation, newest first."""
    query = select(Job).where(Job.organisation_id == org.id)
    if kind:
        query = query.where(Job.kind == kind)
    if status:
        query = query.where(Job.status == status)
    query = query.order_by(Job.created_at.desc()).limit(min(limit, 100))
    result = await db.execute(query)
    return list(result.scalars().all())


# ── Async job wrappers for the AI operations ─────────────────────────────────

async def _categorise_job(db, org_id, progress, params):
    """Wrap categorise_batch to match the JobFunc signature."""
    response = await categorise_batch(org_id, db)
    await cache_delete_pattern(dashboard_key(org_id))
    return response.model_dump()


async def _reconcile_job(db, org_id, progress, params):
    response = await reconcile_batch(org_id, db)
    await cache_delete_pattern(dashboard_key(org_id))
    return response.model_dump()


async def _document_job(db, org_id, progress, params):
    """Generate a document. The PDF bytes are discarded — the client
    retrieves the already-stored GeneratedDocument afterwards via the
    regenerate flow, or via GET /api/v1/documents."""
    template = params["template"]
    period_start = params["period_start"]
    period_end = params["period_end"]

    from datetime import date as _date
    if isinstance(period_start, str):
        period_start = _date.fromisoformat(period_start)
    if isinstance(period_end, str):
        period_end = _date.fromisoformat(period_end)

    generators = {
        "management_letter": document_service.generate_management_letter,
        "profit_loss": document_service.generate_profit_loss,
        "vat_summary": document_service.generate_vat_summary,
    }
    if template not in generators:
        raise ValueError(f"Unknown template: {template}")

    _pdf_bytes, metadata = await generators[template](
        org_id=org_id,
        period_start=period_start,
        period_end=period_end,
        db=db,
    )
    return metadata


@router.post("/categorise/async", response_model=JobSubmitResponse)
@limiter.limit("5/minute;120/hour")
async def submit_categorise_job(
    request: Request,
    org: Organisation = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    """Submit categorisation as a background job. Returns immediately."""
    job = await submit_job(db, org.id, "categorise", _categorise_job)
    return JobSubmitResponse(job_id=job.id, status=job.status, kind=job.kind)


@router.post("/reconcile/async", response_model=JobSubmitResponse)
@limiter.limit("5/minute;120/hour")
async def submit_reconcile_job(
    request: Request,
    org: Organisation = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    """Submit reconciliation as a background job. Returns immediately."""
    job = await submit_job(db, org.id, "reconcile", _reconcile_job)
    return JobSubmitResponse(job_id=job.id, status=job.status, kind=job.kind)


@router.post("/documents/generate/async", response_model=JobSubmitResponse)
@limiter.limit("3/minute;30/hour")
async def submit_document_job(
    request: Request,
    body: DocumentGenerateRequest,
    org: Organisation = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    """Submit document generation as a background job. Returns immediately.

    The generated PDF is stored in the database via GeneratedDocument. The
    client fetches it via GET /api/v1/documents after the job completes.
    """
    if body.period_start > body.period_end:
        raise HTTPException(status_code=400, detail="period_start must be before period_end")

    params = {
        "template": body.template,
        "period_start": body.period_start.isoformat(),
        "period_end": body.period_end.isoformat(),
    }
    job = await submit_job(db, org.id, "document", _document_job, params=params)
    return JobSubmitResponse(job_id=job.id, status=job.status, kind=job.kind)
