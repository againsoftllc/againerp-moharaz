"""Ecommerce domain constants — publish workflow (STEP 03)."""

from __future__ import annotations

# Primary publish workflow: draft → review → published → archived
PUBLISH_STATUSES = frozenset({"draft", "review", "published", "hidden", "archived"})

WORKFLOW_STATUSES = frozenset({"draft", "review", "published", "archived"})

VISIBILITY_VALUES = frozenset({"public", "private"})

# Allowed transitions: from_status → set of to_status
PUBLISH_TRANSITIONS: dict[str, frozenset[str]] = {
    "draft": frozenset({"review", "archived"}),
    "review": frozenset({"published", "draft", "archived"}),
    "published": frozenset({"draft", "archived"}),
    "hidden": frozenset({"draft", "published", "archived"}),
    "archived": frozenset({"draft"}),
}

CATALOG_STATUS_TO_PUBLISH = {
    "draft": "draft",
    "published": "published",
    "archived": "archived",
}

PUBLISH_TO_CATALOG_STATUS = {
    "draft": "draft",
    "review": "draft",
    "published": "published",
    "hidden": "draft",
    "archived": "archived",
}

STOREFRONT_LIVE_STATUSES = frozenset({"published"})
