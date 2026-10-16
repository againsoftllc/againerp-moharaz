from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.website_builder_document import (
    WebsiteBuilderDocument,
    dump_json,
    load_json,
)
from app.schemas.website_builder_document import (
    WebsiteBuilderDocumentRead,
    WebsiteBuilderDocumentResponse,
    WebsiteBuilderDocumentSave,
)

router = APIRouter(prefix="/builder-documents", tags=["website-builder-documents"])


def _to_read(row: WebsiteBuilderDocument) -> WebsiteBuilderDocumentRead:
    return WebsiteBuilderDocumentRead(
        page_id=row.page_id,
        company_id=row.company_id,
        document=load_json(row.document_json, {}),
        version=row.version,
        updated_by=row.updated_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/{page_id}", response_model=WebsiteBuilderDocumentResponse)
def get_builder_document(page_id: str, db: Session = Depends(get_db)) -> WebsiteBuilderDocumentResponse:
    row = db.get(WebsiteBuilderDocument, page_id)
    if not row:
        raise HTTPException(status_code=404, detail="No saved builder document for this page")
    return WebsiteBuilderDocumentResponse(data=_to_read(row))


@router.put("/{page_id}", response_model=WebsiteBuilderDocumentResponse)
def save_builder_document(
    page_id: str,
    payload: WebsiteBuilderDocumentSave,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> WebsiteBuilderDocumentResponse:
    row = db.get(WebsiteBuilderDocument, page_id)
    if row:
        row.document_json = dump_json(payload.document)
        row.updated_by = payload.updated_by
        row.version += 1
    else:
        row = WebsiteBuilderDocument(
            page_id=page_id,
            company_id="default",
            document_json=dump_json(payload.document),
            version=1,
            updated_by=payload.updated_by,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return WebsiteBuilderDocumentResponse(data=_to_read(row))
