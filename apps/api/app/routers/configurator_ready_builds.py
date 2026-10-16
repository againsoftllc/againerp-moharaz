"""Admin CRUD for Ready Builds — see app/services/ecommerce/ready_build_service.py."""

from __future__ import annotations

import json
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.catalog_product import CatalogProduct
from app.models.ready_build import ReadyBuild
from app.services.ecommerce import ready_build_service as svc

router = APIRouter(prefix="/ready-builds", tags=["configurator-ready-builds"])


class ItemWrite(BaseModel):
    product_id: str
    build_price: Optional[float] = None
    is_default: bool = False


class SlotWrite(BaseModel):
    category_id: str
    mode: str = Field(pattern="^(locked|list|any|hidden)$")
    sort_order: int = 0
    items: List[ItemWrite] = []


class ReadyBuildWrite(BaseModel):
    profile_id: str
    name: str
    slug: Optional[str] = None
    status: Optional[str] = None
    images: List[str] = []
    tags: List[str] = []
    category: Optional[str] = None
    fps_label: Optional[str] = None
    discount_type: str = "none"
    discount_value: float = 0
    starts_at: Optional[date] = None
    ends_at: Optional[date] = None
    show_timer: bool = True
    discount_on_change: bool = True
    slots: List[SlotWrite] = []


def _to_dict(db: Session, build: ReadyBuild, *, with_totals: bool = False) -> Dict[str, Any]:
    slots_out = []
    for slot in svc.slots_of(db, build.id):
        items_out = []
        for item in svc.items_of(db, slot.id):
            product = db.get(CatalogProduct, item.product_id)
            items_out.append({
                "id": item.id,
                "product_id": item.product_id,
                "product_name": product.name if product else None,
                "catalog_price": float(product.price) if product else None,
                "build_price": float(item.build_price) if item.build_price is not None else None,
                "is_default": item.is_default,
            })
        slots_out.append({
            "id": slot.id,
            "category_id": slot.category_id,
            "mode": slot.mode,
            "sort_order": slot.sort_order,
            "items": items_out,
        })

    data = {
        "id": build.id,
        "profile_id": build.profile_id,
        "name": build.name,
        "slug": build.slug,
        "status": build.status,
        "images": json.loads(build.images_json or "[]"),
        "tags": json.loads(build.tags_json or "[]"),
        "category": build.category,
        "fps_label": build.fps_label,
        "discount_type": build.discount_type,
        "discount_value": float(build.discount_value),
        "starts_at": build.starts_at.isoformat() if build.starts_at else None,
        "ends_at": build.ends_at.isoformat() if build.ends_at else None,
        "show_timer": build.show_timer,
        "discount_on_change": build.discount_on_change,
        "slots": slots_out,
    }
    if with_totals:
        data["totals"] = svc.compute_totals(db, build)
    return data


@router.get("")
def list_ready_builds(
    profile_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    rows = svc.list_builds(db, profile_id=profile_id, status=status)
    return {"data": [_to_dict(db, r, with_totals=True) for r in rows], "meta": {"count": len(rows)}}


@router.get("/{build_id}")
def get_ready_build(build_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        build = svc.get_build(db, build_id)
    except svc.ReadyBuildError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"data": _to_dict(db, build, with_totals=True)}


@router.post("", status_code=201)
def create_ready_build(
    payload: ReadyBuildWrite,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> Dict[str, Any]:
    try:
        build = svc.save_build(db, payload.model_dump())
    except svc.ReadyBuildError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"data": _to_dict(db, build, with_totals=True)}


@router.put("/{build_id}")
def update_ready_build(
    build_id: str,
    payload: ReadyBuildWrite,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> Dict[str, Any]:
    try:
        build = svc.save_build(db, payload.model_dump(), build_id=build_id)
    except svc.ReadyBuildError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"data": _to_dict(db, build, with_totals=True)}


@router.delete("/{build_id}", status_code=204)
def delete_ready_build(
    build_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    try:
        svc.delete_build(db, build_id)
    except svc.ReadyBuildError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{build_id}/publish")
def publish_ready_build(
    build_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> Dict[str, Any]:
    try:
        build = svc.publish_build(db, build_id)
    except svc.ReadyBuildError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"data": _to_dict(db, build, with_totals=True)}


@router.post("/{build_id}/unpublish")
def unpublish_ready_build(
    build_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> Dict[str, Any]:
    try:
        build = svc.get_build(db, build_id)
    except svc.ReadyBuildError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    build.status = "draft"
    db.commit()
    db.refresh(build)
    return {"data": _to_dict(db, build, with_totals=True)}
