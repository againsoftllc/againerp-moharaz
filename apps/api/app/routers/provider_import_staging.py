from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps.auth import get_current_user, require_write_access
from app.models.auth_user import AuthUser
from app.models.provider_import import (
    ProviderImportError,
    ProviderImportHistory,
    ProviderImportImage,
    ProviderImportItem,
    ProviderImportJob,
    ProviderImportLog,
    ProviderImportVariant,
)
from app.schemas.provider_import import (
    BulkItemActionInput,
    CreateImportJobInput,
    ImportImagePatchInput,
    ImportImageRead,
    ImportItemDraftInput,
    ImportItemListResponse,
    ImportItemRead,
    ImportItemResponse,
    ImportItemReviewInput,
    ImportJobDetailRead,
    ImportJobListResponse,
    ImportJobRead,
    ImportJobResponse,
    ImportQueueMeta,
    ImportVariantRead,
    ImportErrorRead,
    ImportLogRead,
    ImportHistoryRead,
)
from app.services.provider_import_service import dumps_json, loads_json, validate_staging_item

router = APIRouter(prefix="/staging", tags=["china-import-staging"])

IMPORTER_ROLES = frozenset({"admin", "staff"})
REVIEWER_ROLES = frozenset({"admin", "staff"})
ADMIN_ROLES = frozenset({"admin"})


def _role(user: AuthUser) -> str:
    return user.role or "viewer"


def require_importer(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if _role(user) not in IMPORTER_ROLES:
        raise HTTPException(status_code=403, detail="Importer permission required")
    return user


def require_reviewer(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if _role(user) not in REVIEWER_ROLES:
        raise HTTPException(status_code=403, detail="Reviewer permission required")
    return user


def require_staging_admin(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if _role(user) not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Staging admin permission required")
    return user


def _image_read(row: ProviderImportImage) -> ImportImageRead:
    return ImportImageRead(
        id=row.id,
        item_id=row.item_id,
        url=row.url,
        thumbnail_url=row.thumbnail_url,
        position=row.position,
        width=row.width,
        height=row.height,
        is_primary=row.is_primary,
        status=row.status,
        local_path=row.local_path,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _variant_read(row: ProviderImportVariant) -> ImportVariantRead:
    return ImportVariantRead(
        id=row.id,
        item_id=row.item_id,
        sku=row.sku,
        barcode=row.barcode,
        price=row.price,
        sale_price=row.sale_price,
        stock=row.stock,
        weight=row.weight,
        image_url=row.image_url,
        attributes_json=loads_json(row.attributes_json),
        status=row.status,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _error_read(row: ProviderImportError) -> ImportErrorRead:
    return ImportErrorRead(
        id=row.id,
        job_id=row.job_id,
        item_id=row.item_id,
        kind=row.kind,
        field=row.field,
        message=row.message,
        severity=row.severity,
        details_json=loads_json(row.details_json),
        created_at=row.created_at,
    )


def _item_read(row: ProviderImportItem, include_children: bool = True) -> ImportItemRead:
    return ImportItemRead(
        id=row.id,
        job_id=row.job_id,
        provider=row.provider,
        provider_product_id=row.provider_product_id,
        status=row.status,
        title=row.title,
        currency=row.currency,
        base_price=row.base_price,
        sale_price=row.sale_price,
        brand_name=row.brand_name,
        category_name=row.category_name,
        supplier_name=row.supplier_name,
        universal_json=loads_json(row.universal_json),
        raw_json=loads_json(row.raw_json),
        validation_json=loads_json(row.validation_json),
        draft_json=loads_json(row.draft_json),
        warning_count=row.warning_count,
        error_count=row.error_count,
        reviewed_by=row.reviewed_by,
        reviewed_at=row.reviewed_at,
        review_notes=row.review_notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
        images=[_image_read(i) for i in row.images] if include_children else [],
        variants=[_variant_read(v) for v in row.variants] if include_children else [],
        errors=[_error_read(e) for e in row.errors] if include_children else [],
    )


def _job_read(row: ProviderImportJob) -> ImportJobRead:
    return ImportJobRead(
        id=row.id,
        company_id=row.company_id,
        provider=row.provider,
        status=row.status,
        user_id=row.user_id,
        user_email=row.user_email,
        item_count=row.item_count,
        success_count=row.success_count,
        error_count=row.error_count,
        warning_count=row.warning_count,
        source_label=row.source_label,
        notes=row.notes,
        started_at=row.started_at,
        completed_at=row.completed_at,
        duration_ms=row.duration_ms,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _queue_meta(db: Session) -> ImportQueueMeta:
    jobs = db.query(ProviderImportJob).all()
    items = db.query(ProviderImportItem).all()
    return ImportQueueMeta(
        count=len(jobs),
        pending_jobs=sum(1 for j in jobs if j.status in {"pending", "running"}),
        completed_jobs=sum(1 for j in jobs if j.status == "completed"),
        failed_jobs=sum(1 for j in jobs if j.status == "failed"),
        warning_items=sum(1 for i in items if i.status == "warning"),
        pending_items=sum(1 for i in items if i.status in {"pending", "mapped", "validated", "warning"}),
    )


def _add_history(
    db: Session,
    *,
    job_id: str,
    item_id: Optional[str],
    action: str,
    actor: AuthUser,
    from_status: Optional[str],
    to_status: Optional[str],
    snapshot: Optional[dict] = None,
) -> None:
    db.add(
        ProviderImportHistory(
            job_id=job_id,
            item_id=item_id,
            action=action,
            actor_email=actor.email,
            actor_role=_role(actor),
            from_status=from_status,
            to_status=to_status,
            snapshot_json=dumps_json(snapshot) if snapshot else None,
        )
    )


def _add_log(
    db: Session,
    *,
    job_id: str,
    item_id: Optional[str],
    level: str,
    message: str,
    context: Optional[dict] = None,
) -> None:
    db.add(
        ProviderImportLog(
            job_id=job_id,
            item_id=item_id,
            level=level,
            message=message,
            context_json=dumps_json(context) if context else None,
        )
    )


def _persist_item_children(db: Session, item: ProviderImportItem, universal: dict) -> None:
    images = universal.get("images") or []
    for idx, img in enumerate(images):
        if not isinstance(img, dict):
            continue
        url = str(img.get("url") or "")
        if not url:
            continue
        db.add(
            ProviderImportImage(
                item_id=item.id,
                url=url,
                thumbnail_url=str(img.get("thumbnail") or url),
                position=int(img.get("position") if img.get("position") is not None else idx),
                width=img.get("width") if isinstance(img.get("width"), int) else None,
                height=img.get("height") if isinstance(img.get("height"), int) else None,
                is_primary=idx == 0,
                status="pending",
            )
        )

    variants = universal.get("variants") or []
    for v in variants:
        if not isinstance(v, dict):
            continue
        sku = str(v.get("sku") or "")
        if not sku:
            continue
        attrs = v.get("attributes")
        db.add(
            ProviderImportVariant(
                item_id=item.id,
                sku=sku,
                barcode=str(v.get("barcode")) if v.get("barcode") else None,
                price=str(v.get("price")) if v.get("price") is not None else None,
                sale_price=str(v.get("salePrice")) if v.get("salePrice") is not None else None,
                stock=int(v["stock"]) if isinstance(v.get("stock"), int) else None,
                weight=str(v.get("weight")) if v.get("weight") is not None else None,
                image_url=str(v.get("image", {}).get("url")) if isinstance(v.get("image"), dict) else (
                    str(v.get("image_url")) if v.get("image_url") else None
                ),
                attributes_json=dumps_json(attrs) if attrs else None,
                status="pending",
            )
        )


@router.get("/jobs", response_model=ImportJobListResponse)
def list_jobs(
    db: Session = Depends(get_db),
    status: Optional[str] = Query(default=None),
    provider: Optional[str] = Query(default=None),
) -> ImportJobListResponse:
    query = db.query(ProviderImportJob).order_by(ProviderImportJob.created_at.desc())
    if status:
        query = query.filter(ProviderImportJob.status == status)
    if provider:
        query = query.filter(ProviderImportJob.provider == provider)
    rows = query.all()
    return ImportJobListResponse(data=[_job_read(r) for r in rows], meta=_queue_meta(db))


@router.post("/jobs", response_model=ImportJobResponse)
def create_job(
    payload: CreateImportJobInput,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_importer),
) -> ImportJobResponse:
    started = datetime.utcnow()
    job = ProviderImportJob(
        provider=payload.provider,
        status="running",
        user_id=user.id,
        user_email=user.email,
        source_label=payload.source_label,
        notes=payload.notes,
        started_at=started,
    )
    db.add(job)
    db.flush()

    existing_skus = {
        row[0]
        for row in db.query(ProviderImportVariant.sku).join(ProviderImportItem).all()
        if row[0]
    }
    existing_ids = {
        row[0]
        for row in db.query(ProviderImportItem.provider_product_id).all()
        if row[0]
    }

    success = 0
    errors = 0
    warnings = 0
    items_out: List[ProviderImportItem] = []

    for product in payload.products:
        universal = product.universal
        raw = product.raw or universal.get("rawData")
        item_status, validation, issue_rows = validate_staging_item(
            universal, raw if isinstance(raw, dict) else None, existing_skus, existing_ids
        )

        brand = universal.get("brand") if isinstance(universal.get("brand"), dict) else None
        category = universal.get("category") if isinstance(universal.get("category"), dict) else None
        supplier = universal.get("supplier") if isinstance(universal.get("supplier"), dict) else None

        item = ProviderImportItem(
            job_id=job.id,
            provider=payload.provider,
            provider_product_id=product.provider_product_id,
            status=item_status if item_status != "pending" else "mapped",
            title=str(universal.get("title") or product.provider_product_id),
            currency=str(universal.get("currency") or "CNY"),
            base_price=str(universal.get("basePrice")) if universal.get("basePrice") is not None else None,
            sale_price=str(universal.get("salePrice")) if universal.get("salePrice") is not None else None,
            brand_name=str(brand.get("name")) if brand else None,
            category_name=str(category.get("name")) if category else None,
            supplier_name=str(supplier.get("name")) if supplier else None,
            universal_json=dumps_json(universal),
            raw_json=dumps_json(raw),
            validation_json=dumps_json(validation),
            warning_count=len([i for i in issue_rows if i.get("severity") == "warning"]),
            error_count=len([i for i in issue_rows if i.get("severity") == "error"]),
        )
        db.add(item)
        db.flush()
        _persist_item_children(db, item, universal)

        for issue in issue_rows:
            db.add(
                ProviderImportError(
                    job_id=job.id,
                    item_id=item.id,
                    kind=str(issue.get("kind") or "validation"),
                    field=issue.get("field"),
                    message=str(issue.get("message") or ""),
                    severity=str(issue.get("severity") or "error"),
                    details_json=dumps_json(issue),
                )
            )

        if item.error_count:
            errors += 1
        elif item.warning_count:
            warnings += 1
        else:
            success += 1

        for v in universal.get("variants") or []:
            if isinstance(v, dict) and v.get("sku"):
                existing_skus.add(str(v["sku"]))
        existing_ids.add(product.provider_product_id)
        items_out.append(item)

    completed = datetime.utcnow()
    job.item_count = len(items_out)
    job.success_count = success
    job.error_count = errors
    job.warning_count = warnings
    job.status = "completed" if errors == 0 else "completed"
    job.completed_at = completed
    job.duration_ms = int((completed - started).total_seconds() * 1000)

    _add_log(db, job_id=job.id, item_id=None, level="info", message="Import job completed", context={"items": len(items_out)})
    _add_history(
        db,
        job_id=job.id,
        item_id=None,
        action="created",
        actor=user,
        from_status=None,
        to_status=job.status,
        snapshot={"item_count": job.item_count},
    )

    db.commit()
    db.refresh(job)

    job_detail = db.query(ProviderImportJob).options(
        joinedload(ProviderImportJob.items).joinedload(ProviderImportItem.images),
        joinedload(ProviderImportJob.items).joinedload(ProviderImportItem.variants),
        joinedload(ProviderImportJob.items).joinedload(ProviderImportItem.errors),
        joinedload(ProviderImportJob.logs),
        joinedload(ProviderImportJob.history),
    ).filter(ProviderImportJob.id == job.id).one()

    detail = ImportJobDetailRead(
        **_job_read(job_detail).model_dump(),
        items=[_item_read(i) for i in job_detail.items],
        logs=[
            ImportLogRead(
                id=l.id,
                job_id=l.job_id,
                item_id=l.item_id,
                level=l.level,
                message=l.message,
                context_json=loads_json(l.context_json),
                created_at=l.created_at,
            )
            for l in job_detail.logs
        ],
        history=[
            ImportHistoryRead(
                id=h.id,
                job_id=h.job_id,
                item_id=h.item_id,
                action=h.action,
                actor_email=h.actor_email,
                actor_role=h.actor_role,
                from_status=h.from_status,
                to_status=h.to_status,
                snapshot_json=loads_json(h.snapshot_json),
                created_at=h.created_at,
            )
            for h in job_detail.history
        ],
    )
    return ImportJobResponse(data=detail)


@router.get("/jobs/{job_id}", response_model=ImportJobResponse)
def get_job(job_id: str, db: Session = Depends(get_db)) -> ImportJobResponse:
    row = (
        db.query(ProviderImportJob)
        .options(
            joinedload(ProviderImportJob.items).joinedload(ProviderImportItem.images),
            joinedload(ProviderImportJob.items).joinedload(ProviderImportItem.variants),
            joinedload(ProviderImportJob.items).joinedload(ProviderImportItem.errors),
            joinedload(ProviderImportJob.logs),
            joinedload(ProviderImportJob.history),
        )
        .filter(ProviderImportJob.id == job_id)
        .one_or_none()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Import job not found")
    detail = ImportJobDetailRead(
        **_job_read(row).model_dump(),
        items=[_item_read(i) for i in row.items],
        logs=[
            ImportLogRead(
                id=l.id,
                job_id=l.job_id,
                item_id=l.item_id,
                level=l.level,
                message=l.message,
                context_json=loads_json(l.context_json),
                created_at=l.created_at,
            )
            for l in row.logs
        ],
        history=[
            ImportHistoryRead(
                id=h.id,
                job_id=h.job_id,
                item_id=h.item_id,
                action=h.action,
                actor_email=h.actor_email,
                actor_role=h.actor_role,
                from_status=h.from_status,
                to_status=h.to_status,
                snapshot_json=loads_json(h.snapshot_json),
                created_at=h.created_at,
            )
            for h in row.history
        ],
    )
    return ImportJobResponse(data=detail)


@router.get("/items", response_model=ImportItemListResponse)
def list_items(
    db: Session = Depends(get_db),
    status: Optional[str] = Query(default=None),
    provider: Optional[str] = Query(default=None),
    brand: Optional[str] = Query(default=None),
    category: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
    job_id: Optional[str] = Query(default=None),
) -> ImportItemListResponse:
    query = (
        db.query(ProviderImportItem)
        .options(
            joinedload(ProviderImportItem.images),
            joinedload(ProviderImportItem.variants),
            joinedload(ProviderImportItem.errors),
        )
        .order_by(ProviderImportItem.created_at.desc())
    )
    if status:
        query = query.filter(ProviderImportItem.status == status)
    if provider:
        query = query.filter(ProviderImportItem.provider == provider)
    if brand:
        query = query.filter(ProviderImportItem.brand_name.ilike(f"%{brand}%"))
    if category:
        query = query.filter(ProviderImportItem.category_name.ilike(f"%{category}%"))
    if job_id:
        query = query.filter(ProviderImportItem.job_id == job_id)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (ProviderImportItem.title.ilike(like))
            | (ProviderImportItem.provider_product_id.ilike(like))
        )
    rows = query.all()
    return ImportItemListResponse(data=[_item_read(r) for r in rows], meta=_queue_meta(db))


@router.get("/items/{item_id}", response_model=ImportItemResponse)
def get_item(item_id: str, db: Session = Depends(get_db)) -> ImportItemResponse:
    row = (
        db.query(ProviderImportItem)
        .options(
            joinedload(ProviderImportItem.images),
            joinedload(ProviderImportItem.variants),
            joinedload(ProviderImportItem.errors),
        )
        .filter(ProviderImportItem.id == item_id)
        .one_or_none()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Import item not found")
    return ImportItemResponse(data=_item_read(row))


@router.patch("/items/{item_id}/review", response_model=ImportItemResponse)
def review_item(
    item_id: str,
    payload: ImportItemReviewInput,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_reviewer),
) -> ImportItemResponse:
    row = db.get(ProviderImportItem, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Import item not found")
    if row.status in {"approved", "rejected"}:
        raise HTTPException(status_code=409, detail="Item already reviewed")

    prev = row.status
    row.status = payload.status
    row.reviewed_by = user.email
    row.reviewed_at = datetime.utcnow()
    row.review_notes = payload.review_notes

    _add_history(
        db,
        job_id=row.job_id,
        item_id=row.id,
        action=payload.status,
        actor=user,
        from_status=prev,
        to_status=row.status,
    )
    _add_log(
        db,
        job_id=row.job_id,
        item_id=row.id,
        level="info",
        message=f"Item {payload.status}",
        context={"notes": payload.review_notes},
    )
    db.commit()
    db.refresh(row)
    return ImportItemResponse(data=_item_read(row))


@router.patch("/items/{item_id}/draft", response_model=ImportItemResponse)
def save_draft(
    item_id: str,
    payload: ImportItemDraftInput,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_importer),
) -> ImportItemResponse:
    row = db.get(ProviderImportItem, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Import item not found")
    row.draft_json = dumps_json(payload.draft_json)
    row.status = "mapped" if row.status == "pending" else row.status
    _add_history(
        db,
        job_id=row.job_id,
        item_id=row.id,
        action="draft_saved",
        actor=user,
        from_status=row.status,
        to_status=row.status,
    )
    db.commit()
    db.refresh(row)
    return ImportItemResponse(data=_item_read(row))


@router.post("/items/bulk")
def bulk_items(
    payload: BulkItemActionInput,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_write_access),
) -> dict:
    rows = db.query(ProviderImportItem).filter(ProviderImportItem.id.in_(payload.item_ids)).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No items found")

    if payload.action in {"approve", "reject"} and _role(user) not in REVIEWER_ROLES:
        raise HTTPException(status_code=403, detail="Reviewer permission required")

    if payload.action == "delete" and _role(user) not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Staging admin permission required")

    affected = 0
    export_payload: list = []

    for row in rows:
        if payload.action == "approve":
            row.status = "approved"
            row.reviewed_by = user.email
            row.reviewed_at = datetime.utcnow()
            affected += 1
        elif payload.action == "reject":
            row.status = "rejected"
            row.reviewed_by = user.email
            row.reviewed_at = datetime.utcnow()
            affected += 1
        elif payload.action == "delete":
            db.delete(row)
            affected += 1
        elif payload.action == "export":
            export_payload.append(loads_json(row.universal_json))

    db.commit()
    if payload.action == "export":
        return {"action": "export", "count": len(export_payload), "data": export_payload}
    return {"action": payload.action, "count": affected}


@router.patch("/images/{image_id}", response_model=ImportImageRead)
def patch_image(
    image_id: str,
    payload: ImportImagePatchInput,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_importer),
) -> ImportImageRead:
    row = db.get(ProviderImportImage, image_id)
    if not row:
        raise HTTPException(status_code=404, detail="Image not found")

    if payload.is_primary:
        db.query(ProviderImportImage).filter(ProviderImportImage.item_id == row.item_id).update(
            {"is_primary": False}
        )
        row.is_primary = True
    if payload.status is not None:
        row.status = payload.status
    if payload.url is not None:
        row.url = payload.url
        row.status = "replaced"

    db.commit()
    db.refresh(row)
    return _image_read(row)


@router.delete("/images/{image_id}")
def delete_image(
    image_id: str,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_importer),
) -> dict:
    row = db.get(ProviderImportImage, image_id)
    if not row:
        raise HTTPException(status_code=404, detail="Image not found")
    row.status = "deleted"
    db.commit()
    return {"ok": True, "id": image_id, "status": "deleted"}
