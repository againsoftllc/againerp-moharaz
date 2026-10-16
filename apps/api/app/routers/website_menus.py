from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.website_menu import WebsiteMenu, WebsiteMenuSlot, dump_json
from app.schemas.website_menu import (
    WebsiteMenuCreate,
    WebsiteMenuListMeta,
    WebsiteMenuListResponse,
    WebsiteMenuRead,
    WebsiteMenuResponse,
    WebsiteMenuSlotRead,
    WebsiteMenuSlotsResponse,
    WebsiteMenuSlotsUpdate,
    WebsiteMenuUpdate,
)
from app.routers.storefront_menus import menu_cache
from app.services.website_menu_service import (
    ensure_catalog_menus_synced,
    ensure_system_menus,
    ensure_unique_handle,
    menu_to_dict,
    slugify_handle,
    sync_auto_menu,
)

router = APIRouter(tags=["website-menus"])


def _to_read(db: Session, row: WebsiteMenu, *, preview: bool = False) -> WebsiteMenuRead:
    return WebsiteMenuRead.model_validate(menu_to_dict(db, row, include_preview=preview))


@router.get("/menus", response_model=WebsiteMenuListResponse)
def list_menus(db: Session = Depends(get_db)) -> WebsiteMenuListResponse:
    ensure_catalog_menus_synced(db)
    rows = db.query(WebsiteMenu).order_by(WebsiteMenu.sort_order.asc(), WebsiteMenu.name.asc()).all()
    data = [_to_read(db, row) for row in rows]
    return WebsiteMenuListResponse(data=data, meta=WebsiteMenuListMeta(count=len(data)))


@router.get("/menus/{menu_id}", response_model=WebsiteMenuResponse)
def get_menu(menu_id: str, db: Session = Depends(get_db)) -> WebsiteMenuResponse:
    ensure_catalog_menus_synced(db)
    row = db.get(WebsiteMenu, menu_id)
    if not row:
        raise HTTPException(status_code=404, detail="Menu not found")
    if row.source == "auto":
        db.commit()
        db.refresh(row)
    return WebsiteMenuResponse(data=_to_read(db, row, preview=True))


@router.post("/menus", response_model=WebsiteMenuResponse, status_code=201)
def create_menu(
    payload: WebsiteMenuCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> WebsiteMenuResponse:
    ensure_system_menus(db)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    handle = ensure_unique_handle(db, payload.handle or slugify_handle(name))
    source = payload.source or "custom"
    auto_type = payload.auto_type or "category"
    row = WebsiteMenu(
        id=str(uuid.uuid4()),
        company_id="default",
        name=name,
        handle=handle,
        kind="custom",
        system_key=None,
        source=source,
        auto_type=auto_type,
        auto_show_new=bool(payload.auto_show_new),
        active=payload.active,
        sort_order=100,
        items_json=dump_json([i.model_dump() for i in payload.items]),
    )
    db.add(row)
    db.flush()
    if source == "auto":
        sync_auto_menu(db, row)
    db.commit()
    menu_cache.clear()
    db.refresh(row)
    return WebsiteMenuResponse(data=_to_read(db, row, preview=True))


@router.patch("/menus/{menu_id}", response_model=WebsiteMenuResponse)
def update_menu(
    menu_id: str,
    payload: WebsiteMenuUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> WebsiteMenuResponse:
    ensure_system_menus(db)
    row = db.get(WebsiteMenu, menu_id)
    if not row:
        raise HTTPException(status_code=404, detail="Menu not found")

    data = payload.model_dump(exclude_unset=True)

    if "name" in data and data["name"] is not None:
        name = str(data["name"]).strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name is required")
        row.name = name

    if "handle" in data and data["handle"] is not None:
        if row.kind == "system":
            raise HTTPException(status_code=400, detail="System menu handle cannot be changed")
        row.handle = ensure_unique_handle(db, str(data["handle"]), exclude_id=row.id)

    if "auto_type" in data and data["auto_type"] is not None:
        row.auto_type = data["auto_type"]

    if "auto_show_new" in data and data["auto_show_new"] is not None:
        row.auto_show_new = bool(data["auto_show_new"])

    if "source" in data and data["source"] is not None:
        row.source = data["source"]

    if "items" in data and data["items"] is not None:
        items = payload.items or []
        row.items_json = dump_json([i.model_dump() for i in items])

    if "active" in data and data["active"] is not None:
        if row.kind == "system" and data["active"] is False:
            raise HTTPException(status_code=400, detail="System menus cannot be deactivated")
        row.active = bool(data["active"])

    if "sort_order" in data and data["sort_order"] is not None:
        row.sort_order = int(data["sort_order"])

    # Re-sync after source/auto_type changes (cleans leftovers even if items were patched).
    if row.source == "auto" and ("source" in data or "auto_type" in data):
        sync_auto_menu(db, row)

    db.commit()
    menu_cache.clear()
    db.refresh(row)
    return WebsiteMenuResponse(data=_to_read(db, row, preview=True))


@router.delete("/menus/{menu_id}", status_code=204)
def delete_menu(
    menu_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    ensure_system_menus(db)
    row = db.get(WebsiteMenu, menu_id)
    if not row:
        raise HTTPException(status_code=404, detail="Menu not found")
    if row.kind == "system":
        raise HTTPException(status_code=400, detail="System menus cannot be deleted")
    in_use = db.query(WebsiteMenuSlot).filter(WebsiteMenuSlot.menu_id == menu_id).first()
    if in_use:
        raise HTTPException(status_code=400, detail="Menu is assigned to a slot — reassign first")
    db.delete(row)
    db.commit()
    menu_cache.clear()


@router.get("/menu-slots", response_model=WebsiteMenuSlotsResponse)
def list_menu_slots(db: Session = Depends(get_db)) -> WebsiteMenuSlotsResponse:
    ensure_system_menus(db)
    rows = db.query(WebsiteMenuSlot).order_by(WebsiteMenuSlot.slot_key.asc()).all()
    data: list[WebsiteMenuSlotRead] = []
    for row in rows:
        menu = db.get(WebsiteMenu, row.menu_id)
        title = (getattr(row, "title", None) or "").strip()
        nav_style = (getattr(row, "nav_style", None) or "megamenu").strip().lower()
        if nav_style not in ("megamenu", "dropdown"):
            nav_style = "megamenu"
        data.append(
            WebsiteMenuSlotRead(
                slot_key=row.slot_key,
                menu_id=row.menu_id,
                menu_name=menu.name if menu else None,
                title=title,
                nav_style=nav_style,  # type: ignore[arg-type]
                updated_at=row.updated_at,
            )
        )
    return WebsiteMenuSlotsResponse(data=data)


@router.patch("/menu-slots", response_model=WebsiteMenuSlotsResponse)
def update_menu_slots(
    payload: WebsiteMenuSlotsUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> WebsiteMenuSlotsResponse:
    ensure_system_menus(db)
    for item in payload.slots:
        slot = db.get(WebsiteMenuSlot, item.slot_key)
        if not slot:
            raise HTTPException(status_code=404, detail=f"Slot not found: {item.slot_key}")
        menu = db.get(WebsiteMenu, item.menu_id)
        if not menu:
            raise HTTPException(status_code=400, detail=f"Menu not found: {item.menu_id}")
        slot.menu_id = item.menu_id
        if item.title is not None:
            slot.title = item.title.strip()
        if item.nav_style is not None:
            slot.nav_style = item.nav_style
    db.commit()
    menu_cache.clear()
    return list_menu_slots(db)
