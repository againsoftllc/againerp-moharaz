"""Digital file upload/download for digital products."""
from __future__ import annotations

import mimetypes
import os
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_digital_file import CatalogProductDigitalFile

router = APIRouter(prefix="/api/v1/catalog/products", tags=["digital-files"])

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "digital"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 500 * 1024 * 1024  # 500 MB


class DigitalFileBrief(BaseModel):
    id: str
    product_id: str
    file_name: str
    file_size: int
    mime_type: str
    download_limit: Optional[int]
    expires_days: Optional[int]
    sort_order: int


class DigitalFileListResponse(BaseModel):
    data: List[DigitalFileBrief]
    errors: List[str] = []


class DigitalFileResponse(BaseModel):
    data: DigitalFileBrief
    errors: List[str] = []


def _brief(row: CatalogProductDigitalFile) -> DigitalFileBrief:
    return DigitalFileBrief(
        id=row.id,
        product_id=row.product_id,
        file_name=row.file_name,
        file_size=row.file_size,
        mime_type=row.mime_type,
        download_limit=row.download_limit,
        expires_days=row.expires_days,
        sort_order=row.sort_order,
    )


@router.get("/{product_id}/digital-files", response_model=DigitalFileListResponse)
def list_digital_files(
    product_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_write_access),
):
    product = db.get(CatalogProduct, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    files = (
        db.query(CatalogProductDigitalFile)
        .filter(CatalogProductDigitalFile.product_id == product_id)
        .order_by(CatalogProductDigitalFile.sort_order, CatalogProductDigitalFile.created_at)
        .all()
    )
    return DigitalFileListResponse(data=[_brief(f) for f in files])


@router.post("/{product_id}/digital-files", response_model=DigitalFileResponse, status_code=201)
async def upload_digital_file(
    product_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: str = Depends(require_write_access),
):
    product = db.get(CatalogProduct, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 500 MB)")

    file_id = str(uuid.uuid4())
    original_name = file.filename or "file"
    ext = Path(original_name).suffix
    storage_name = f"{file_id}{ext}"
    storage_path = UPLOAD_DIR / storage_name

    storage_path.write_bytes(content)

    mime = file.content_type or mimetypes.guess_type(original_name)[0] or "application/octet-stream"

    row = CatalogProductDigitalFile(
        product_id=product_id,
        file_name=original_name,
        file_size=len(content),
        mime_type=mime,
        storage_path=str(storage_path),
        sort_order=db.query(CatalogProductDigitalFile).filter(
            CatalogProductDigitalFile.product_id == product_id
        ).count(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return DigitalFileResponse(data=_brief(row))


@router.delete("/{product_id}/digital-files/{file_id}", status_code=204)
def delete_digital_file(
    product_id: str,
    file_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_write_access),
):
    row = db.query(CatalogProductDigitalFile).filter(
        CatalogProductDigitalFile.id == file_id,
        CatalogProductDigitalFile.product_id == product_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    # Remove from disk
    try:
        Path(row.storage_path).unlink(missing_ok=True)
    except Exception:
        pass
    db.delete(row)
    db.commit()


@router.get("/{product_id}/digital-files/{file_id}/download")
def download_digital_file(
    product_id: str,
    file_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(require_write_access),
):
    row = db.query(CatalogProductDigitalFile).filter(
        CatalogProductDigitalFile.id == file_id,
        CatalogProductDigitalFile.product_id == product_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    if not Path(row.storage_path).exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(
        path=row.storage_path,
        filename=row.file_name,
        media_type=row.mime_type,
    )
