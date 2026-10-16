"""CRUD for the customer-facing tab grouping above a builder profile's slot
table (Components / Extras / Peripherals) — see ConfiguratorSlotTab and
ensure_slot_tabs_for_profile in app/services/builder_slot_packs.py, which
seeds the defaults this endpoint lets an admin then rename/reorder/add to."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.configurator_category import ConfiguratorCategory
from app.models.configurator_slot_tab import ConfiguratorSlotTab
from app.schemas.configurator_slot_tab import (
    ConfiguratorSlotTabCreate,
    ConfiguratorSlotTabListResponse,
    ConfiguratorSlotTabRead,
    ConfiguratorSlotTabResponse,
    ConfiguratorSlotTabUpdate,
)

router = APIRouter(prefix="/slot-tabs", tags=["configurator-slot-tabs"])


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "tab"


def _to_read(db: Session, row: ConfiguratorSlotTab) -> ConfiguratorSlotTabRead:
    count = db.query(ConfiguratorCategory).filter(ConfiguratorCategory.tab_id == row.id).count()
    data = ConfiguratorSlotTabRead.model_validate(row)
    data.slot_count = count
    return data


@router.get("", response_model=ConfiguratorSlotTabListResponse)
def list_slot_tabs(
    profile_id: str = Query(...),
    db: Session = Depends(get_db),
) -> ConfiguratorSlotTabListResponse:
    rows = (
        db.query(ConfiguratorSlotTab)
        .filter(ConfiguratorSlotTab.profile_id == profile_id)
        .order_by(ConfiguratorSlotTab.sort_order)
        .all()
    )
    data = [_to_read(db, r) for r in rows]
    return ConfiguratorSlotTabListResponse(data=data, meta={"count": len(data)})


@router.post("", response_model=ConfiguratorSlotTabResponse, status_code=201)
def create_slot_tab(
    payload: ConfiguratorSlotTabCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ConfiguratorSlotTabResponse:
    slug = payload.slug.strip() or _slugify(payload.name)
    existing = (
        db.query(ConfiguratorSlotTab)
        .filter(ConfiguratorSlotTab.profile_id == payload.profile_id, ConfiguratorSlotTab.slug == slug)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="A tab with this name already exists")
    row = ConfiguratorSlotTab(profile_id=payload.profile_id, name=payload.name, slug=slug, sort_order=payload.sort_order)
    db.add(row)
    db.commit()
    db.refresh(row)
    return ConfiguratorSlotTabResponse(data=_to_read(db, row))


@router.patch("/{tab_id}", response_model=ConfiguratorSlotTabResponse)
def update_slot_tab(
    tab_id: str,
    payload: ConfiguratorSlotTabUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> ConfiguratorSlotTabResponse:
    row = db.get(ConfiguratorSlotTab, tab_id)
    if not row:
        raise HTTPException(status_code=404, detail="Tab not found")
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return ConfiguratorSlotTabResponse(data=_to_read(db, row))


@router.delete("/{tab_id}", status_code=204)
def delete_slot_tab(
    tab_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(ConfiguratorSlotTab, tab_id)
    if not row:
        raise HTTPException(status_code=404, detail="Tab not found")
    in_use = db.query(ConfiguratorCategory).filter(ConfiguratorCategory.tab_id == tab_id).count()
    if in_use:
        raise HTTPException(status_code=400, detail="Move this tab's slots to another tab before deleting it")
    db.delete(row)
    db.commit()
