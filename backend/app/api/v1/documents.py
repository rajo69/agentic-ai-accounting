"""Document generation API routes."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.database import GeneratedDocument, Organisation
from app.models.schemas import (
    DocumentGenerateRequest,
    DocumentGenerateResponse,
    GeneratedDocumentRead,
)
from app.services.document_service import generate_management_letter

router = APIRouter(prefix="/api/v1", tags=["documents"])

SUPPORTED_TEMPLATES = {"management_letter"}


async def _get_org(db: AsyncSession) -> Optional[Organisation]:
    result = await db.execute(
        select(Organisation).where(Organisation.xero_access_token.isnot(None)).limit(1)
    )
    return result.scalar_one_or_none()


@router.post("/documents/generate")
async def generate_document(
    request: DocumentGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate a document PDF for the given period. Returns the PDF as a download."""
    if request.template not in SUPPORTED_TEMPLATES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown template '{request.template}'. Supported: {sorted(SUPPORTED_TEMPLATES)}",
        )
    if request.period_start > request.period_end:
        raise HTTPException(status_code=400, detail="period_start must be before period_end")

    org = await _get_org(db)
    if not org:
        raise HTTPException(
            status_code=404,
            detail="No Xero organisation connected. Visit /auth/xero/connect first.",
        )

    try:
        pdf_bytes, metadata = await generate_management_letter(
            org_id=org.id,
            period_start=request.period_start,
            period_end=request.period_end,
            db=db,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Document generation failed: {exc}") from exc

    filename = f"management_letter_{request.period_start}_{request.period_end}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/documents", response_model=list[GeneratedDocumentRead])
async def list_documents(db: AsyncSession = Depends(get_db)):
    """List all previously generated documents for the connected organisation."""
    org = await _get_org(db)
    if not org:
        raise HTTPException(
            status_code=404,
            detail="No Xero organisation connected. Visit /auth/xero/connect first.",
        )

    result = await db.execute(
        select(GeneratedDocument)
        .where(GeneratedDocument.organisation_id == org.id)
        .order_by(GeneratedDocument.generated_at.desc())
        .limit(50)
    )
    return list(result.scalars().all())
