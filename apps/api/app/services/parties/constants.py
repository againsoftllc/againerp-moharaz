"""Universal Party platform — constants and role definitions."""

from __future__ import annotations

PARTY_TYPES = frozenset({"person", "organization"})

PARTY_STATUSES = frozenset({"active", "inactive", "archived"})

PARTY_ROLES = frozenset(
    {
        "customer",
        "supplier",
        "employee",
        "user",
        "sales_representative",
        "manufacturer",
        "courier",
        "dropship_supplier",
        "service_provider",
        "affiliate",
        "vendor",
    }
)

PARTY_ROLE_LABELS: dict[str, str] = {
    "customer": "Customer",
    "supplier": "Supplier",
    "employee": "Employee",
    "user": "User",
    "sales_representative": "Sales Representative",
    "manufacturer": "Manufacturer",
    "courier": "Courier",
    "dropship_supplier": "Dropship Supplier",
    "service_provider": "Service Provider",
    "affiliate": "Affiliate",
    "vendor": "Vendor",
}

COMMERCE_CUSTOMER_STATUS_TO_PARTY_STATUS: dict[str, str] = {
    "active": "active",
    "inactive": "inactive",
    "blocked": "inactive",
    "archived": "archived",
}

COMMERCE_SUPPLIER_STATUS_TO_PARTY_STATUS: dict[str, str] = {
    "active": "active",
    "preferred": "active",
    "inactive": "inactive",
    "blocked": "inactive",
    "archived": "archived",
}
