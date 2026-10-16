"""Universal Collaboration Framework — shared constants."""

from __future__ import annotations

ENTITY_TYPE_ITEM = "item"
ENTITY_TYPE_PARTY = "party"
ENTITY_TYPE_CUSTOMER = "customer"
ENTITY_TYPE_SUPPLIER = "supplier"
ENTITY_TYPE_PURCHASE = "purchase"
ENTITY_TYPE_SALES = "sales"
ENTITY_TYPE_INVOICE = "invoice"
ENTITY_TYPE_MANUFACTURING = "manufacturing"
ENTITY_TYPE_SERVICE = "service"
ENTITY_TYPE_CRM = "crm"

ACTIVITY_CREATED = "created"
ACTIVITY_UPDATED = "updated"
ACTIVITY_STOCK_CHANGE = "stock_change"
ACTIVITY_PRICE_CHANGE = "price_change"
ACTIVITY_PUBLISHED = "published"
ACTIVITY_ARCHIVED = "archived"
ACTIVITY_COMMENT = "comment"
ACTIVITY_APPROVAL = "approval"

OWNERSHIP_SOURCES = frozenset({"user", "ai", "api", "import"})

APPROVAL_STATUSES = frozenset({"draft", "review", "approved", "published", "archived", "rejected"})

LABEL_CATALOG: dict[str, dict[str, str]] = {
    "draft": {"display": "Draft", "color": "#94a3b8"},
    "seo_pending": {"display": "SEO Pending", "color": "#f59e0b"},
    "qc_pending": {"display": "QC Pending", "color": "#eab308"},
    "ready": {"display": "Ready", "color": "#22c55e"},
    "published": {"display": "Published", "color": "#3b82f6"},
    "active": {"display": "Active", "color": "#22c55e"},
    "verified": {"display": "Verified", "color": "#3b82f6"},
    "vip": {"display": "VIP", "color": "#a855f7"},
    "blocked": {"display": "Blocked", "color": "#ef4444"},
    "onboarding": {"display": "Onboarding", "color": "#f59e0b"},
}

FILE_TYPES = frozenset({"image", "document", "certificate", "contract", "other"})

COMMENT_VISIBILITY = frozenset({"internal", "client", "public"})
AUTHOR_TYPES = frozenset({"user", "ai", "system"})
