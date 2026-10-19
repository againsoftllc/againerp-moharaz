"""Universal Item platform — constants and type mappings."""

from __future__ import annotations

ITEM_TYPES = frozenset({"physical", "digital", "service", "bundle", "combo"})

ITEM_STATUSES = frozenset({"draft", "unlisted", "active", "archived"})

CATALOG_PRODUCT_TYPE_TO_ITEM_TYPE: dict[str, str] = {
    "simple": "physical",
    "variable": "physical",
    "digital": "digital",
    "combo": "combo",
}

CATALOG_STATUS_TO_ITEM_STATUS: dict[str, str] = {
    "draft": "draft",
    # Parked off the Products list (Website → Unlisted); never live on the storefront.
    "unlisted": "unlisted",
    "published": "active",
    "archived": "archived",
    # Legacy rows carry the item vocabulary in the catalog column. Without this
    # alias they fall through to "draft" and live products read as unpublished.
    "active": "active",
}

ITEM_STATUS_TO_CATALOG_STATUS: dict[str, str] = {
    "draft": "draft",
    "unlisted": "unlisted",
    "active": "published",
    "archived": "archived",
}

ITEM_TYPE_TO_CATALOG_PRODUCT_TYPE: dict[str, str] = {
    "physical": "simple",
    "digital": "digital",
    "service": "simple",
    "bundle": "variable",
    "combo": "combo",
}
