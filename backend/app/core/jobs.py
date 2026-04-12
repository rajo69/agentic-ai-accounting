"""In-process background job tracking.

Each submitted job creates a row in the `jobs` table, then runs in a
separate asyncio task with its own DB session. The task updates the row
with progress, status, and result/error.

This keeps long-running operations (categorise, reconcile, PDF generation)
out of the HTTP request-response path without requiring a separate worker
process or job queue service. For the current scale (<20 beta customers)
this is the right trade-off: simpler ops, no new Railway service, one
fewer moving part to debug.

If the backend restarts while a job is running, the job is left in
'running' status. A startup hook marks any such stale rows as 'failed'
with a clear error message so clients can see what happened.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Awaitable, Callable, Optional
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.core.observability import capture_exception
from app.models.database import Job

logger = logging.getLogger(__name__)


# A job function receives (db_session, org_id, progress_callback, params)
# and returns a JSON-serialisable result dict.
JobFunc = Callable[
    [AsyncSession, UUID, Callable[[int, int], Awaitable[None]], Optional[dict]],
    Awaitable[dict],
]


async def submit_job(
    db: AsyncSession,
    org_id: UUID,
    kind: str,
    func: JobFunc,
    params: Optional[dict] = None,
) -> Job:
    """Create a job row and dispatch the work in a background asyncio task.

    Returns the Job row immediately so the caller can return `{job_id}` to
    the client. The task runs in the same process with its own DB session.
    """
    job = Job(
        organisation_id=org_id,
        kind=kind,
        status="queued",
        params=params,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Fire-and-forget the work. Task is stored on asyncio loop so it
    # survives until completion even after the HTTP request returns.
    asyncio.create_task(_run_job(job.id, org_id, func, params))

    return job


async def _run_job(
    job_id: UUID,
    org_id: UUID,
    func: JobFunc,
    params: Optional[dict],
) -> None:
    """Execute a job with its own DB session and update the job row with progress."""
    async with async_session() as db:
        # Mark as running
        await db.execute(
            update(Job).where(Job.id == job_id).values(status="running")
        )
        await db.commit()

        async def progress_callback(current: int, total: int) -> None:
            """Update progress without holding a transaction open."""
            async with async_session() as progress_db:
                await progress_db.execute(
                    update(Job)
                    .where(Job.id == job_id)
                    .values(progress_current=current, progress_total=total)
                )
                await progress_db.commit()

        try:
            result = await func(db, org_id, progress_callback, params)
            await db.execute(
                update(Job).where(Job.id == job_id).values(
                    status="completed",
                    result=result,
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
            logger.info("Job %s (%s) completed", job_id, func.__name__)
        except Exception as exc:
            logger.exception("Job %s (%s) failed", job_id, func.__name__)
            capture_exception(exc, job_id=str(job_id), org_id=str(org_id))
            try:
                await db.rollback()
                await db.execute(
                    update(Job).where(Job.id == job_id).values(
                        status="failed",
                        error=str(exc)[:1000],
                        completed_at=datetime.now(timezone.utc),
                    )
                )
                await db.commit()
            except Exception:
                logger.exception("Failed to mark job %s as failed", job_id)


async def mark_stale_jobs_failed() -> int:
    """On startup, mark any jobs stuck in 'running' state as failed.

    These are jobs that were mid-flight when the backend restarted. Without
    this sweep they'd appear perpetually in progress to polling clients.
    """
    async with async_session() as db:
        result = await db.execute(
            update(Job)
            .where(Job.status.in_(("queued", "running")))
            .values(
                status="failed",
                error="Backend restarted before job completed",
                completed_at=datetime.now(timezone.utc),
            )
            .returning(Job.id)
        )
        stale_ids = list(result.scalars().all())
        await db.commit()
        if stale_ids:
            logger.warning("Marked %d stale jobs as failed on startup", len(stale_ids))
        return len(stale_ids)
