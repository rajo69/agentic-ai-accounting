"""Document generation API routes."""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.core.session import get_current_org
from app.models.database import GeneratedDocument, Organisation
from app.models.schemas import (
    DocumentGenerateRequest,
    GeneratedDocumentRead,
)
from app.services import document_service

router = APIRouter(prefix="/api/v1", tags=["documents"])

SUPPORTED_TEMPLATES = {"management_letter", "profit_loss", "vat_summary"}

_GENERATOR_NAMES = {
    "management_letter": "generate_management_letter",
    "profit_loss": "generate_profit_loss",
    "vat_summary": "generate_vat_summary",
}


@router.post("/documents/generate")
@limiter.limit("3/minute;30/hour")
async def generate_document(
    request: Request,
    body: DocumentGenerateRequest,
    org: Organisation = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    """Generate a document PDF for the given period. Returns the PDF as a download."""
    if body.template not in SUPPORTED_TEMPLATES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown template '{body.template}'. Supported: {sorted(SUPPORTED_TEMPLATES)}",
        )
    if body.period_start > body.period_end:
        raise HTTPException(status_code=400, detail="period_start must be before period_end")

    generator = getattr(document_service, _GENERATOR_NAMES[body.template])
    try:
        pdf_bytes, metadata = await generator(
            org_id=org.id,
            period_start=body.period_start,
            period_end=body.period_end,
            db=db,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Document generation failed: {exc}") from exc

    filename = f"{body.template}_{body.period_start}_{body.period_end}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/documents", response_model=list[GeneratedDocumentRead])
async def list_documents(
    org: Organisation = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    """List all previously generated documents for the connected organisation."""
    result = await db.execute(
        select(GeneratedDocument)
        .where(GeneratedDocument.organisation_id == org.id)
        .order_by(GeneratedDocument.generated_at.desc())
        .limit(50)
    )
    return list(result.scalars().all())
