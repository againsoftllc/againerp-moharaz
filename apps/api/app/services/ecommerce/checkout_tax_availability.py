"""Admin-configurable storefront tax, stored in `platform_settings`.

Mirrors `checkout_shipping_availability`: defaults live here, the admin
overrides them per key, and checkout reads the resolved values.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Dict, Optional

from sqlalchemy.orm import Session

from app.models.platform_setting import PlatformSetting

TAX_SETTING_DEFAULTS: Dict[str, str] = {
    # 0 = no tax charged, which is the historical behaviour.
    "tax.rate_percent": "0",
    "tax.label": "VAT",
    # When true the catalog price already contains tax, so it is reported
    # for the invoice instead of being added on top of the order total.
    "tax.included_in_price": "false",
    "tax.shipping_taxable": "false",
}

TAX_SETTING_KEYS = tuple(TAX_SETTING_DEFAULTS)


def _decimal(raw: Optional[str], default: Decimal) -> Decimal:
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return Decimal(str(raw).strip())
    except (InvalidOperation, ValueError):
        return default


def _truthy(raw: Optional[str], default: bool) -> bool:
    if raw is None or str(raw).strip() == "":
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def load_tax_settings(db: Session) -> Dict[str, str]:
    rows = (
        db.query(PlatformSetting)
        .filter(PlatformSetting.key.in_(TAX_SETTING_KEYS))
        .all()
    )
    stored = {r.key: r.value for r in rows if r.value not in (None, "")}
    return {**TAX_SETTING_DEFAULTS, **stored}


def tax_rate_percent(db: Session) -> Decimal:
    """Configured rate as a percentage, clamped to a sane 0–100."""
    rate = _decimal(load_tax_settings(db).get("tax.rate_percent"), Decimal("0"))
    if rate < 0:
        return Decimal("0")
    return min(rate, Decimal("100"))


def tax_is_included_in_price(db: Session) -> bool:
    return _truthy(load_tax_settings(db).get("tax.included_in_price"), False)


def shipping_is_taxable(db: Session) -> bool:
    return _truthy(load_tax_settings(db).get("tax.shipping_taxable"), False)


def resolve_tax_amount(db: Session, taxable: Decimal) -> Decimal:
    """Tax to ADD to the order. Zero when prices already include tax."""
    if taxable <= 0 or tax_is_included_in_price(db):
        return Decimal("0")
    rate = tax_rate_percent(db)
    if rate <= 0:
        return Decimal("0")
    return (taxable * rate / Decimal("100")).quantize(Decimal("0.01"))


def resolve_included_tax_amount(db: Session, gross: Decimal) -> Decimal:
    """Tax already contained in a tax-inclusive price, for invoice display."""
    if gross <= 0 or not tax_is_included_in_price(db):
        return Decimal("0")
    rate = tax_rate_percent(db)
    if rate <= 0:
        return Decimal("0")
    return (gross * rate / (Decimal("100") + rate)).quantize(Decimal("0.01"))
