"""Party Workspace — constants for profile data and module registry."""

from __future__ import annotations

CONTACT_KINDS = frozenset({"phone", "email", "social"})

ADDRESS_TYPES = frozenset({"billing", "shipping", "office", "warehouse", "factory"})

DOCUMENT_TYPES = frozenset(
    {"trade_license", "bin", "tin", "nid", "passport", "agreement"},
)

NOTE_TYPES = frozenset({"general", "internal", "follow_up"})

PARTY_MODULE_KEYS = frozenset(
    {
        "crm",
        "hr",
        "purchase",
        "sales",
        "service",
        "manufacturing",
        "projects",
        "ai",
    },
)

PARTY_LABEL_CATALOG: dict[str, dict[str, str]] = {
    "active": {"display": "Active", "color": "#22c55e"},
    "verified": {"display": "Verified", "color": "#3b82f6"},
    "vip": {"display": "VIP", "color": "#a855f7"},
    "blocked": {"display": "Blocked", "color": "#ef4444"},
    "onboarding": {"display": "Onboarding", "color": "#f59e0b"},
}

DOCUMENT_TYPE_LABELS: dict[str, str] = {
    "trade_license": "Trade License",
    "bin": "BIN",
    "tin": "TIN",
    "nid": "NID",
    "passport": "Passport",
    "agreement": "Agreement",
}

ADDRESS_TYPE_LABELS: dict[str, str] = {
    "billing": "Billing",
    "shipping": "Shipping",
    "office": "Office",
    "warehouse": "Warehouse",
    "factory": "Factory",
}
