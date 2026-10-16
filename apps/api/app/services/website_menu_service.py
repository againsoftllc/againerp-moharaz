from __future__ import annotations

import re
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.catalog_brand import CatalogBrand
from app.models.catalog_category import CatalogCategory
from app.models.website_menu import (
    DEFAULT_FOOTER_ITEMS,
    DEFAULT_SLOTS,
    SYSTEM_MENU_CATALOG_ID,
    SYSTEM_MENU_FOOTER_ID,
    SYSTEM_MENU_HEADER_ID,
    WebsiteMenu,
    WebsiteMenuSlot,
    dump_json,
    load_json_list,
)
from app.models.website_page import WebsitePage
from app.services.ecommerce.storefront_catalog_service import StorefrontCatalogService


def slugify_handle(name: str) -> str:
    raw = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return raw or "menu"


def _slug_href(slug: str) -> str:
    cleaned = (slug or "").strip().lstrip("/")
    return f"/{cleaned}" if cleaned else "/"


def resolve_item_href(db: Session, item: dict[str, Any]) -> str:
    link_type = item.get("link_type") or "custom"
    ref = item.get("link_ref_id")
    href = (item.get("href") or "").strip()

    if link_type == "custom":
        return href or "#"

    if not ref:
        return href or "#"

    if link_type == "page":
        page = db.get(WebsitePage, ref)
        if page:
            return page.url or _slug_href(page.slug)
        return href or "#"

    if link_type == "category":
        cat = db.get(CatalogCategory, ref)
        if cat:
            return _slug_href(cat.slug)
        return href or "#"

    if link_type == "brand":
        brand = db.get(CatalogBrand, ref)
        if brand:
            return _slug_href(brand.slug)
        return href or "#"

    return href or "#"


def resolve_items_tree(db: Session, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for raw in items:
        if not isinstance(raw, dict):
            continue
        children_raw = raw.get("children") or []
        children = resolve_items_tree(db, children_raw if isinstance(children_raw, list) else [])
        out.append(
            {
                "id": str(raw.get("id") or ""),
                "label": str(raw.get("label") or ""),
                "link_type": raw.get("link_type") or "custom",
                "link_ref_id": raw.get("link_ref_id"),
                "href": resolve_item_href(db, raw),
                "hidden": bool(raw.get("hidden")),
                "children": children,
            }
        )
    return out


def category_tree_as_menu_preview(db: Session) -> list[dict[str, Any]]:
    # Storefront categories live in the "catalog" channel; the default
    # ("dropshipping") is the China/frontstore tree and leaves this menu empty.
    tree = StorefrontCatalogService(db).list_categories(channel="catalog")

    def node(row: dict[str, Any]) -> dict[str, Any]:
        children = [node(c) for c in row.get("children") or []]
        return {
            "id": f"cat-{row['id']}",
            "label": row["name"],
            "link_type": "category",
            "link_ref_id": row["id"],
            "href": _slug_href(row["slug"]),
            "hidden": False,
            "children": children,
        }

    return [node(r) for r in tree]


def brand_list_as_menu_preview(db: Session) -> list[dict[str, Any]]:
    brands = StorefrontCatalogService(db).list_brands(channel="catalog")
    return [
        {
            "id": f"brand-{row['id']}",
            "label": row["name"],
            "link_type": "brand",
            "link_ref_id": row["id"],
            "href": _slug_href(row["slug"]),
            "hidden": False,
            "children": [],
        }
        for row in brands
    ]


def page_list_as_menu_preview(db: Session) -> list[dict[str, Any]]:
    rows = (
        db.query(WebsitePage)
        .filter(WebsitePage.status.in_(["published", "draft"]))
        .order_by(WebsitePage.name.asc())
        .all()
    )
    return [
        {
            "id": f"page-{row.id}",
            "label": row.name,
            "link_type": "page",
            "link_ref_id": row.id,
            "href": row.url or _slug_href(row.slug),
            "hidden": False,
            "children": [],
        }
        for row in rows
    ]


def live_tree_for_auto_type(db: Session, auto_type: str) -> list[dict[str, Any]]:
    key = (auto_type or "category").strip().lower()
    if key == "brand":
        return brand_list_as_menu_preview(db)
    if key == "page":
        return page_list_as_menu_preview(db)
    return category_tree_as_menu_preview(db)


def _merge_auto_tree(
    live_nodes: list[dict[str, Any]],
    stored_nodes: list[dict[str, Any]],
    *,
    sync_type: str | None = None,
    new_hidden: bool = False,
) -> list[dict[str, Any]]:
    """Preserve order + hidden + custom items; refresh live labels/href; append new live nodes.

    sync_type: when set (root auto sync), drop stored page/category/brand nodes that do not
    match — used when switching auto_type. Nested custom subtrees pass sync_type=None.
    new_hidden: when True, newly synced entities start as hidden (auto_show_new=False).
    """
    stored_list = [n for n in stored_nodes if isinstance(n, dict)]
    live_by_ref = {
        str(n.get("link_ref_id")): n for n in live_nodes if n.get("link_ref_id")
    }

    merged: list[dict[str, Any]] = []
    seen: set[str] = set()

    for stored in stored_list:
        ref = str(stored.get("link_ref_id") or "")
        link_type = str(stored.get("link_type") or "custom")
        stored_children = stored.get("children") if isinstance(stored.get("children"), list) else []
        is_synced = (
            sync_type is not None
            and link_type == sync_type
            and bool(ref)
            and ref in live_by_ref
        )

        if is_synced:
            live = live_by_ref[ref]
            merged.append(
                {
                    "id": str(stored.get("id") or live["id"]),
                    "label": live["label"],
                    "link_type": live.get("link_type") or link_type,
                    "link_ref_id": ref,
                    "href": live["href"],
                    "hidden": bool(stored.get("hidden")),
                    "children": _merge_auto_tree(
                        live.get("children") or [],
                        stored_children,
                        sync_type=sync_type,
                        new_hidden=new_hidden,
                    ),
                }
            )
            seen.add(ref)
            continue

        # Synced type but entity deleted — drop.
        if sync_type and link_type == sync_type and ref and ref not in live_by_ref:
            continue

        # Leftover entities from a different auto_type — drop at sync root levels.
        if sync_type and link_type in ("page", "category", "brand") and link_type != sync_type:
            continue

        # Custom item — keep in place (nested customs are not filtered by sync_type).
        merged.append(
            {
                "id": str(stored.get("id") or ""),
                "label": str(stored.get("label") or "Custom"),
                "link_type": link_type if link_type in ("page", "category", "brand", "custom") else "custom",
                "link_ref_id": stored.get("link_ref_id"),
                "href": str(stored.get("href") or ""),
                "hidden": bool(stored.get("hidden")),
                "children": _merge_auto_tree([], stored_children, sync_type=None, new_hidden=False),
            }
        )

    for live in live_nodes:
        ref = str(live.get("link_ref_id") or "")
        if not ref or ref in seen:
            continue
        merged.append(
            {
                **live,
                "hidden": new_hidden,
                "children": _merge_auto_tree(
                    live.get("children") or [],
                    [],
                    sync_type=sync_type,
                    new_hidden=new_hidden,
                ),
            }
        )

    return merged


def sync_auto_menu(db: Session, row: WebsiteMenu) -> bool:
    """Merge live auto_type tree into menu items. Returns True if persisted."""
    if row.source != "auto":
        return False
    auto_type = getattr(row, "auto_type", None) or "category"
    if auto_type not in ("category", "brand", "page"):
        auto_type = "category"
    live = live_tree_for_auto_type(db, auto_type)
    stored = load_json_list(row.items_json)
    auto_show_new = bool(getattr(row, "auto_show_new", True))
    merged = _merge_auto_tree(
        live,
        stored,
        sync_type=auto_type,
        new_hidden=not auto_show_new,
    )
    new_json = dump_json(merged)
    if new_json == row.items_json:
        return False
    row.items_json = new_json
    return True


# Back-compat alias
def sync_catalog_auto_menu(db: Session, row: WebsiteMenu) -> bool:
    return sync_auto_menu(db, row)


def ensure_catalog_menus_synced(db: Session) -> None:
    ensure_system_menus(db)
    dirty = False
    for row in db.query(WebsiteMenu).filter(WebsiteMenu.source == "auto").all():
        if sync_auto_menu(db, row):
            dirty = True
    if dirty:
        db.commit()


def ensure_system_menus(db: Session) -> None:
    """Idempotent seed/merge for Catalog, Header, Footer + default slots."""
    changed = False

    catalog = db.get(WebsiteMenu, SYSTEM_MENU_CATALOG_ID)
    if not catalog:
        db.add(
            WebsiteMenu(
                id=SYSTEM_MENU_CATALOG_ID,
                company_id="default",
                name="Catalog",
                handle="catalog",
                kind="system",
                system_key="catalog",
                source="auto",
                auto_type="category",
                auto_show_new=True,
                active=True,
                sort_order=0,
                items_json="[]",
            )
        )
        changed = True

    header = db.get(WebsiteMenu, SYSTEM_MENU_HEADER_ID)
    if not header:
        db.add(
            WebsiteMenu(
                id=SYSTEM_MENU_HEADER_ID,
                company_id="default",
                name="Header",
                handle="header",
                kind="system",
                system_key="header",
                source="custom",
                auto_type="category",
                active=True,
                sort_order=1,
                items_json="[]",
            )
        )
        changed = True

    footer = db.get(WebsiteMenu, SYSTEM_MENU_FOOTER_ID)
    if not footer:
        db.add(
            WebsiteMenu(
                id=SYSTEM_MENU_FOOTER_ID,
                company_id="default",
                name="Footer",
                handle="footer",
                kind="system",
                system_key="footer",
                source="custom",
                auto_type="category",
                active=True,
                sort_order=2,
                items_json=dump_json(DEFAULT_FOOTER_ITEMS),
            )
        )
        changed = True

    for slot in DEFAULT_SLOTS:
        existing = db.get(WebsiteMenuSlot, slot["slot_key"])
        if not existing:
            title = "SHOP" if slot["slot_key"] == "catalog.shop" else ""
            db.add(
                WebsiteMenuSlot(
                    slot_key=slot["slot_key"],
                    menu_id=slot["menu_id"],
                    title=title,
                    nav_style="megamenu",
                )
            )
            changed = True
        elif slot["slot_key"] == "catalog.shop":
            if not (getattr(existing, "title", None) or "").strip():
                existing.title = "SHOP"
                changed = True
            if not (getattr(existing, "nav_style", None) or "").strip():
                existing.nav_style = "megamenu"
                changed = True

    if changed:
        db.commit()


def menu_to_dict(db: Session, row: WebsiteMenu, *, include_preview: bool = False) -> dict[str, Any]:
    if row.source == "auto":
        sync_auto_menu(db, row)
        raw_items = load_json_list(row.items_json)
        items = resolve_items_tree(db, raw_items)
        auto_preview = items if include_preview else []
    else:
        raw_items = load_json_list(row.items_json)
        items = resolve_items_tree(db, raw_items)
        auto_preview = []
    auto_type = getattr(row, "auto_type", None) or "category"
    if auto_type not in ("category", "brand", "page"):
        auto_type = "category"
    return {
        "id": row.id,
        "company_id": row.company_id,
        "name": row.name,
        "handle": row.handle,
        "kind": row.kind,
        "system_key": row.system_key,
        "source": row.source,
        "auto_type": auto_type,
        "auto_show_new": bool(getattr(row, "auto_show_new", True)),
        "active": row.active,
        "sort_order": row.sort_order,
        "items": items,
        "auto_preview": auto_preview,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def ensure_unique_handle(db: Session, handle: str, exclude_id: Optional[str] = None) -> str:
    base = slugify_handle(handle)
    candidate = base
    n = 2
    while True:
        q = db.query(WebsiteMenu).filter(WebsiteMenu.handle == candidate)
        if exclude_id:
            q = q.filter(WebsiteMenu.id != exclude_id)
        if not q.first():
            return candidate
        candidate = f"{base}-{n}"
        n += 1


def _filter_visible(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in items:
        if item.get("hidden"):
            continue
        children = _filter_visible(item.get("children") or [])
        out.append({**item, "children": children})
    return out


def resolve_storefront_slot(db: Session, slot_key: str) -> Optional[dict[str, Any]]:
    """Public storefront menu for a slot key (e.g. footer.links, catalog.shop)."""
    ensure_system_menus(db)
    slot = db.get(WebsiteMenuSlot, slot_key)
    if not slot:
        return None
    menu = db.get(WebsiteMenu, slot.menu_id)
    if not menu or not menu.active:
        return None

    if menu.source == "auto":
        if sync_auto_menu(db, menu):
            db.commit()
            db.refresh(menu)
        items = _filter_visible(resolve_items_tree(db, load_json_list(menu.items_json)))
    else:
        items = _filter_visible(resolve_items_tree(db, load_json_list(menu.items_json)))

    title = (getattr(slot, "title", None) or "").strip()
    if not title and slot.slot_key == "catalog.shop":
        title = "SHOP"
    nav_style = (getattr(slot, "nav_style", None) or "megamenu").strip().lower()
    if nav_style not in ("megamenu", "dropdown"):
        nav_style = "megamenu"

    return {
        "slot_key": slot_key,
        "menu_id": menu.id,
        "name": menu.name,
        "handle": menu.handle,
        "source": menu.source,
        "title": title,
        "nav_style": nav_style,
        "items": items,
    }
