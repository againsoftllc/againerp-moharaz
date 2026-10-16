"""Helpers for website homepage content."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.website_homepage import (
    DEFAULT_ABOUT,
    DEFAULT_BANNERS,
    DEFAULT_BRANDS,
    DEFAULT_CATEGORIES,
    DEFAULT_FEATURED,
    DEFAULT_FOOTER,
    DEFAULT_HEADER,
    DEFAULT_HERO,
    DEFAULT_LAYOUT,
    DEFAULT_SIDE_MENU,
    DEFAULT_SUPPORT,
    DEFAULT_WEBSITE_HOMEPAGE_ID,
    WebsiteHomepage,
    brands_section_from_catalog,
    categories_section_from_catalog,
    dump_json,
    load_json,
)
from app.services.ecommerce.storefront_catalog_service import StorefrontCatalogService


def default_homepage_content() -> dict[str, Any]:
    return {
        "hero": DEFAULT_HERO,
        "categories": DEFAULT_CATEGORIES,
        "banners": DEFAULT_BANNERS,
        "featured": DEFAULT_FEATURED,
        "brands": DEFAULT_BRANDS,
        "about": DEFAULT_ABOUT,
        "support": DEFAULT_SUPPORT,
        "side_menu": DEFAULT_SIDE_MENU,
        "header": DEFAULT_HEADER,
        "footer": DEFAULT_FOOTER,
        "layout": [dict(item) for item in DEFAULT_LAYOUT],
        "blocks": {},
    }


def load_homepage_raw(row: WebsiteHomepage) -> dict[str, Any]:
    raw = load_json(row.content_json, default_homepage_content())
    if not isinstance(raw, dict):
        raw = default_homepage_content()
    if "hero" not in raw:
        raw = {**raw, "hero": DEFAULT_HERO}
    if "categories" not in raw or not isinstance(raw.get("categories"), dict):
        raw = {**raw, "categories": dict(DEFAULT_CATEGORIES)}
    if "banners" not in raw or not isinstance(raw.get("banners"), dict):
        raw = {**raw, "banners": dict(DEFAULT_BANNERS)}
    if "featured" not in raw or not isinstance(raw.get("featured"), dict):
        raw = {**raw, "featured": dict(DEFAULT_FEATURED)}
    if "brands" not in raw or not isinstance(raw.get("brands"), dict):
        raw = {**raw, "brands": dict(DEFAULT_BRANDS)}
    if "about" not in raw or not isinstance(raw.get("about"), dict):
        raw = {**raw, "about": dict(DEFAULT_ABOUT)}
    if "support" not in raw or not isinstance(raw.get("support"), dict):
        raw = {**raw, "support": dict(DEFAULT_SUPPORT)}
    if "side_menu" not in raw or not isinstance(raw.get("side_menu"), dict):
        raw = {**raw, "side_menu": dict(DEFAULT_SIDE_MENU)}
    if "header" not in raw or not isinstance(raw.get("header"), dict):
        raw = {**raw, "header": dict(DEFAULT_HEADER)}
    else:
        header = raw["header"]
        if "mobile" not in header or not isinstance(header.get("mobile"), dict):
            raw = {
                **raw,
                "header": {**header, "mobile": dict(DEFAULT_HEADER["mobile"])},
            }
    if "footer" not in raw or not isinstance(raw.get("footer"), dict):
        raw = {**raw, "footer": dict(DEFAULT_FOOTER)}
    else:
        footer = raw["footer"]
        if "mobile" not in footer or not isinstance(footer.get("mobile"), dict):
            raw = {
                **raw,
                "footer": {**footer, "mobile": dict(DEFAULT_FOOTER["mobile"])},
            }
    if "layout" not in raw or not isinstance(raw.get("layout"), list) or len(raw["layout"]) == 0:
        raw = {**raw, "layout": [dict(item) for item in DEFAULT_LAYOUT]}
    if "blocks" not in raw or not isinstance(raw.get("blocks"), dict):
        raw = {**raw, "blocks": {}}
    return raw


def ensure_homepage_category_pins(db: Session, row: WebsiteHomepage | None = None) -> WebsiteHomepage:
    """Pin categories/brands when empty; persist missing section defaults."""
    if row is None:
        row = db.get(WebsiteHomepage, DEFAULT_WEBSITE_HOMEPAGE_ID)
    if row is None:
        row = WebsiteHomepage(
            id=DEFAULT_WEBSITE_HOMEPAGE_ID,
            content_json=dump_json(default_homepage_content()),
        )
        db.add(row)
        db.flush()

    stored = load_json(row.content_json, {})
    had_banners = isinstance(stored, dict) and isinstance(stored.get("banners"), dict)
    had_featured = isinstance(stored, dict) and isinstance(stored.get("featured"), dict)
    had_brands = isinstance(stored, dict) and isinstance(stored.get("brands"), dict)
    had_about = isinstance(stored, dict) and isinstance(stored.get("about"), dict)
    had_support = isinstance(stored, dict) and isinstance(stored.get("support"), dict)
    had_side_menu = isinstance(stored, dict) and isinstance(stored.get("side_menu"), dict)
    had_header = isinstance(stored, dict) and isinstance(stored.get("header"), dict)
    had_header_mobile = (
        isinstance(stored, dict)
        and isinstance(stored.get("header"), dict)
        and isinstance(stored["header"].get("mobile"), dict)
    )
    had_footer = isinstance(stored, dict) and isinstance(stored.get("footer"), dict)
    had_footer_mobile = (
        isinstance(stored, dict)
        and isinstance(stored.get("footer"), dict)
        and isinstance(stored["footer"].get("mobile"), dict)
    )
    had_layout = (
        isinstance(stored, dict)
        and isinstance(stored.get("layout"), list)
        and len(stored["layout"]) > 0
    )
    raw = load_homepage_raw(row)
    dirty = False

    if (
        not had_banners
        or not had_featured
        or not had_brands
        or not had_about
        or not had_support
        or not had_side_menu
        or not had_header
        or not had_header_mobile
        or not had_footer
        or not had_footer_mobile
        or not had_layout
    ):
        dirty = True

    # Fill empty about body from default seed (first-time migrate).
    about = raw.get("about") if isinstance(raw.get("about"), dict) else {}
    if isinstance(about, dict) and not str(about.get("body_html") or "").strip():
        raw = {
            **raw,
            "about": {
                **dict(DEFAULT_ABOUT),
                "title": about.get("title") or DEFAULT_ABOUT["title"],
                "subtitle": about.get("subtitle") or DEFAULT_ABOUT["subtitle"],
                "collapse_enabled": (
                    bool(about["collapse_enabled"])
                    if "collapse_enabled" in about
                    else DEFAULT_ABOUT["collapse_enabled"]
                ),
                "body_html": DEFAULT_ABOUT["body_html"],
            },
        }
        dirty = True

    categories = raw.get("categories") or {}
    items = categories.get("items") if isinstance(categories, dict) else None
    if not (isinstance(items, list) and len(items) > 0):
        # Storefront categories live in the "catalog" channel (default is the dropshipping tree).
        tree = StorefrontCatalogService(db).list_categories(channel="catalog")
        pinned = categories_section_from_catalog(tree)
        if isinstance(categories, dict) and "hidden" in categories:
            pinned["hidden"] = bool(categories.get("hidden"))
        raw = {**raw, "categories": pinned}
        dirty = True

    brands = raw.get("brands") or {}
    brand_items = brands.get("items") if isinstance(brands, dict) else None
    if not (isinstance(brand_items, list) and len(brand_items) > 0):
        catalog_brands = StorefrontCatalogService(db).list_brands(channel="catalog")
        pinned_brands = brands_section_from_catalog(catalog_brands)
        if isinstance(brands, dict):
            if brands.get("title"):
                pinned_brands["title"] = brands["title"]
            if brands.get("subtitle"):
                pinned_brands["subtitle"] = brands["subtitle"]
            if "autoplay_ms" in brands and brands.get("autoplay_ms") is not None:
                pinned_brands["autoplay_ms"] = brands["autoplay_ms"]
        raw = {**raw, "brands": pinned_brands}
        dirty = True

    # Restore original SVG icons when a previous FA-only migrate left icon_url empty.
    # Also remap legacy Monarch theme paths → media-library uploads.
    _prev_fa = {
        "sm1": "fa-solid fa-phone",
        "sm2": "fa-solid fa-comment-dots",
        "sm3": "fa-solid fa-right-left",
        "sm4": "fa-solid fa-gift",
        "sm5": "fa-solid fa-fire",
        "sm6": "fa-solid fa-desktop",
    }
    _legacy_icon_map = {
        "/images/catalog/view/theme/default/image/svg/phone-black-icon.svg": "/uploads/media/sidemenu-phone-black-icon.svg",
        "/images/catalog/view/theme/default/image/message-icon.svg": "/uploads/media/sidemenu-message-icon.svg",
        "/images/catalog/view/theme/default/image/compare-icon-svg.svg": "/uploads/media/sidemenu-compare-icon.svg",
        "/images/catalog/view/theme/default/image/svg/gift-black-icon.svg": "/uploads/media/sidemenu-gift-black-icon.svg",
        "/images/catalog/view/theme/default/image/svg/fire-black-icon.svg": "/uploads/media/sidemenu-fire-black-icon.svg",
        "/images/catalog/view/theme/default/image/svg/pc-icon.svg": "/uploads/media/sidemenu-pc-icon.svg",
        "/images/catalog/view/theme/default/image/monarch-it-icon.png": "/uploads/media/sidemenu-monarch-it-icon.png",
    }
    side_menu = raw.get("side_menu") if isinstance(raw.get("side_menu"), dict) else None
    if isinstance(side_menu, dict):
        logo_url = str(side_menu.get("logo_url") or "").strip()
        if logo_url in _legacy_icon_map:
            side_menu = {**side_menu, "logo_url": _legacy_icon_map[logo_url]}
            raw = {**raw, "side_menu": side_menu}
            dirty = True
    side_items = side_menu.get("items") if isinstance(side_menu, dict) else None
    if isinstance(side_items, list) and side_items:
        default_by_id = {
            str(item.get("id")): item
            for item in (DEFAULT_SIDE_MENU.get("items") or [])
            if isinstance(item, dict) and item.get("id")
        }
        migrated: list[Any] = []
        side_dirty = False
        for item in side_items:
            if not isinstance(item, dict):
                migrated.append(item)
                continue
            next_item = dict(item)
            item_id = str(next_item.get("id") or "")
            seed = default_by_id.get(item_id)
            icon = str(next_item.get("icon") or "").strip()
            icon_url = str(next_item.get("icon_url") or "").strip()
            if (
                seed
                and not icon_url
                and icon
                and icon == _prev_fa.get(item_id)
                and seed.get("icon_url")
            ):
                next_item["icon"] = ""
                next_item["icon_url"] = seed["icon_url"]
                side_dirty = True
            elif icon_url in _legacy_icon_map:
                next_item["icon_url"] = _legacy_icon_map[icon_url]
                side_dirty = True
            migrated.append(next_item)
        if side_dirty:
            raw = {**raw, "side_menu": {**(raw.get("side_menu") or side_menu), "items": migrated}}
            dirty = True

    if dirty:
        row.content_json = dump_json(raw)
        db.commit()
        db.refresh(row)
    return row
