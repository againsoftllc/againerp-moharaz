"""Vendor portal permissions — SPEC.md §7-8.

Separate from app.services.rbac on purpose: that system is coarse
module×action RBAC for internal AuthUser staff. Vendor portal users are a
different identity (VendorUser) and need the finer dotted-string grants the
spec calls for (`vendor.order.create`, `vendor.ledger.view`, ...). A vendor
role is a fixed bundle of these strings for Phase 1 — a per-user override
table can replace the fixed bundle later (Phase 2 "Advanced Permissions")
without changing the checker's call sites.
"""

from __future__ import annotations

VENDOR_PERMISSIONS = frozenset(
    {
        "vendor.products.view",
        "vendor.stock.view",
        "vendor.price.view",
        "vendor.order.create",
        "vendor.order.view",
        "vendor.order.cancel",
        "vendor.quotation.view",
        "vendor.quotation.accept",
        "vendor.invoice.view",
        "vendor.payment.view",
        "vendor.ledger.view",
        "vendor.users.manage",
    }
)

_STAFF_PERMISSIONS = frozenset(
    {
        "vendor.products.view",
        "vendor.stock.view",
        "vendor.price.view",
    }
)

_PURCHASE_MANAGER_PERMISSIONS = _STAFF_PERMISSIONS | frozenset(
    {
        "vendor.order.create",
        "vendor.order.view",
        "vendor.order.cancel",
        "vendor.quotation.view",
        "vendor.quotation.accept",
    }
)

_ACCOUNTS_MANAGER_PERMISSIONS = _STAFF_PERMISSIONS | frozenset(
    {
        "vendor.invoice.view",
        "vendor.payment.view",
        "vendor.ledger.view",
    }
)

_OWNER_PERMISSIONS = VENDOR_PERMISSIONS  # full access

ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "owner": _OWNER_PERMISSIONS,
    "purchase_manager": _PURCHASE_MANAGER_PERMISSIONS,
    "accounts_manager": _ACCOUNTS_MANAGER_PERMISSIONS,
    "staff": _STAFF_PERMISSIONS,
}


def permissions_for_role(role: str) -> frozenset[str]:
    return ROLE_PERMISSIONS.get(role, _STAFF_PERMISSIONS)


def vendor_user_has_permission(role: str, permission: str) -> bool:
    return permission in permissions_for_role(role)
