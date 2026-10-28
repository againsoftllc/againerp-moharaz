"""Company-scoped module settings (the simple settings pages of Finance, RMA, Media…).

The admin form owns the field list; the backend only needs defaults for the keys it enforces,
so a company that never saved the page still gets the documented behaviour.
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.company_module_setting import CompanyModuleSetting

MODULE_IDS: frozenset[str] = frozenset(
    {"dashboard", "inventory", "rma", "service", "vendors", "finance", "crm", "media", "catalog", "security"}
)

# Keys read by backend code, with the value used until the company saves the page.
BACKEND_DEFAULTS: dict[str, dict[str, Any]] = {
    "finance": {"requirePaymentAccount": False},
    "media": {"maxUploadMb": 25},
    # Workspace → Users → Security (services/core/auth_security.py)
    "security": {"lockoutAttempts": 5, "lockoutMinutes": 15, "passwordExpiryDays": 0},
    # Website → Settings (catalog). Defaults keep the behaviour from before the page saved anything.
    "catalog": {
        "auto_generate_sku": True,
        "sku_prefix": "SKU-",
        "require_brand": False,
        "require_category": False,
        "reviews_auto_approve": False,
        "group_qa_enabled": True,
        "qa_public_visibility": "answered_only",
    },
}

MAX_VALUES_BYTES = 16_000


def _row(db: Session, company_id: str, module_id: str) -> Optional[CompanyModuleSetting]:
    return (
        db.query(CompanyModuleSetting)
        .filter(CompanyModuleSetting.company_id == company_id, CompanyModuleSetting.module_id == module_id)
        .first()
    )


def get_saved_values(db: Session, company_id: str, module_id: str) -> Optional[dict[str, Any]]:
    """The values the company saved, or None when the page was never saved."""
    row = _row(db, company_id, module_id)
    if not row:
        return None
    try:
        data = json.loads(row.values_json or "{}")
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def get_module_setting(db: Session, company_id: str, module_id: str, key: str) -> Any:
    saved = get_saved_values(db, company_id, module_id) or {}
    if key in saved:
        return saved[key]
    return BACKEND_DEFAULTS.get(module_id, {}).get(key)


def save_module_settings(
    db: Session, company_id: str, module_id: str, values: dict[str, Any], *, actor_id: Optional[str]
) -> dict[str, Any]:
    raw = json.dumps(values)
    if len(raw.encode()) > MAX_VALUES_BYTES:
        raise ValueError("Settings are too large")
    row = _row(db, company_id, module_id)
    if not row:
        row = CompanyModuleSetting(company_id=company_id, module_id=module_id)
        db.add(row)
    row.values_json = raw
    row.updated_by = actor_id
    db.flush()
    return values


def require_payment_account_if_set(db: Session, company_id: str, payment_account_id: Optional[str]) -> None:
    """Finance → "Require payment account": a manual payment must name the cash/bank account it
    moves through instead of falling back to the default account for its method."""
    if payment_account_id:
        return
    if get_module_setting(db, company_id, "finance", "requirePaymentAccount"):
        raise HTTPException(
            status_code=400,
            detail="Choose a payment account. Finance settings require one on every manual payment.",
        )


def clean_sku_prefix(raw: Any) -> str:
    """Catalog settings → SKU prefix, limited to characters that are safe in a SKU and in the serial lookup."""
    prefix = re.sub(r"[^A-Za-z0-9_./-]", "", str(raw or ""))[:20]
    return prefix or "SKU-"


def enforce_publish_rules(
    db: Session,
    company_id: str,
    *,
    brand: Optional[str],
    brand_id: Optional[str],
    category_ids: list[Optional[str]],
) -> None:
    """Catalog settings → "Require brand" / "Require category": a product can't be published without them."""
    missing = []
    if get_module_setting(db, company_id, "catalog", "require_brand") and not ((brand or "").strip() or brand_id):
        missing.append("a brand")
    if get_module_setting(db, company_id, "catalog", "require_category") and not any(category_ids):
        missing.append("a category")
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Set {' and '.join(missing)} before publishing. Website settings require it.",
        )
