"""Helpers for website category PLP template content."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.website_category_page import (
    DEFAULT_CATEGORY_PAGE_CONTENT,
    DEFAULT_WEBSITE_CATEGORY_PAGE_ID,
    WebsiteCategoryPage,
    dump_json,
    load_json,
)


def default_category_page_content() -> dict[str, Any]:
    return {
        "settings": dict(DEFAULT_CATEGORY_PAGE_CONTENT["settings"]),
        "sorting": {
            **DEFAULT_CATEGORY_PAGE_CONTENT["sorting"],
            "options": [dict(o) for o in DEFAULT_CATEGORY_PAGE_CONTENT["sorting"]["options"]],
        },
        "filters": {
            **DEFAULT_CATEGORY_PAGE_CONTENT["filters"],
            "price": dict(DEFAULT_CATEGORY_PAGE_CONTENT["filters"]["price"]),
            "availability": {
                **DEFAULT_CATEGORY_PAGE_CONTENT["filters"]["availability"],
                "options": [
                    dict(o)
                    for o in DEFAULT_CATEGORY_PAGE_CONTENT["filters"]["availability"]["options"]
                ],
            },
        },
        "product_card": dict(DEFAULT_CATEGORY_PAGE_CONTENT["product_card"]),
        "stats": dict(DEFAULT_CATEGORY_PAGE_CONTENT["stats"]),
        "description": dict(DEFAULT_CATEGORY_PAGE_CONTENT["description"]),
    }


def load_category_page_raw(row: WebsiteCategoryPage) -> dict[str, Any]:
    raw = load_json(row.content_json, default_category_page_content())
    if not isinstance(raw, dict):
        return default_category_page_content()
    base = default_category_page_content()
    for key in ("settings", "sorting", "filters", "product_card", "stats", "description"):
        if key not in raw or not isinstance(raw.get(key), dict):
            raw[key] = base[key]
    # Nested merge for filters sub-blocks
    filters = raw["filters"]
    if "price" not in filters or not isinstance(filters.get("price"), dict):
        filters["price"] = base["filters"]["price"]
    if "availability" not in filters or not isinstance(filters.get("availability"), dict):
        filters["availability"] = base["filters"]["availability"]
    return raw


def ensure_category_page(db: Session) -> WebsiteCategoryPage:
    row = db.get(WebsiteCategoryPage, DEFAULT_WEBSITE_CATEGORY_PAGE_ID)
    if row is None:
        row = WebsiteCategoryPage(
            id=DEFAULT_WEBSITE_CATEGORY_PAGE_ID,
            content_json=dump_json(default_category_page_content()),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    stored = load_json(row.content_json, {})
    raw = load_category_page_raw(row)
    if not isinstance(stored, dict) or any(
        k not in stored for k in ("settings", "sorting", "filters", "product_card", "stats", "description")
    ):
        row.content_json = dump_json(raw)
        db.commit()
        db.refresh(row)
    return row
