"""Resolve which payment methods are available on storefront checkout.

Rules:
- Business settings (`payments.cod` / `payments.online` / `payments.bank` / `payments.partial`)
  gate method groups (defaults = enabled when unset).
- Online gateways only appear when the matching plugin is installed + enabled
  (+ checkout_enabled when the plugin exposes it).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

from sqlalchemy.orm import Session

from app.models.bkash_plugin import BkashPlugin
from app.models.paypal_plugin import PaypalPlugin
from app.models.platform_setting import PlatformSetting
from app.models.sslcommerz_plugin import SslcommerzPlugin
from app.models.stripe_plugin import StripePlugin
from app.services.ecommerce.checkout_constants import PAYMENT_METHODS, PaymentMethodOption

PAYMENT_SETTING_DEFAULTS: Dict[str, bool] = {
    "payments.cod": True,
    "payments.online": True,
    "payments.bank": True,
    "payments.partial": False,
}

# plugin registry id → checkout method id
PLUGIN_TO_METHOD: Dict[str, str] = {
    "bkash": "bkash",
    "sslcommerz": "sslcommerz",
    "paypal": "paypal",
    "stripe": "stripe",
    "bank-emi": "emi",
}


def _truthy(raw: Optional[str], default: bool) -> bool:
    if raw is None or str(raw).strip() == "":
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def load_payment_method_flags(db: Session) -> Dict[str, bool]:
    keys = list(PAYMENT_SETTING_DEFAULTS.keys())
    rows = (
        db.query(PlatformSetting)
        .filter(PlatformSetting.key.in_(keys))
        .all()
    )
    by_key = {r.key: r.value for r in rows}
    return {
        key: _truthy(by_key.get(key), default)
        for key, default in PAYMENT_SETTING_DEFAULTS.items()
    }


def _plugin_active(
    *,
    installed: bool,
    enabled: bool,
    checkout_enabled: Optional[bool] = None,
) -> bool:
    if not installed or not enabled:
        return False
    if checkout_enabled is False:
        return False
    return True


def active_gateway_method_ids(db: Session) -> Set[str]:
    """Checkout method ids backed by installed/enabled payment plugins."""
    active: Set[str] = set()

    bkash = db.get(BkashPlugin, "bkash-default")
    if bkash and _plugin_active(
        installed=bkash.installed,
        enabled=bkash.enabled,
        checkout_enabled=bkash.checkout_enabled,
    ):
        active.add("bkash")

    ssl = db.get(SslcommerzPlugin, "sslcommerz-default")
    if ssl and _plugin_active(
        installed=ssl.installed,
        enabled=ssl.enabled,
        checkout_enabled=getattr(ssl, "checkout_enabled", True),
    ):
        active.add("sslcommerz")

    paypal = db.get(PaypalPlugin, "paypal-default")
    if paypal and _plugin_active(
        installed=paypal.installed,
        enabled=paypal.enabled,
        checkout_enabled=getattr(paypal, "checkout_enabled", True),
    ):
        active.add("paypal")

    stripe = db.get(StripePlugin, "stripe-default")
    if stripe and _plugin_active(
        installed=stripe.installed,
        enabled=stripe.enabled,
        checkout_enabled=getattr(stripe, "checkout_enabled", True),
    ):
        active.add("stripe")

    # bank-emi has no dedicated DB table — use platform_settings flag set by admin install
    emi_flag = (
        db.query(PlatformSetting)
        .filter(PlatformSetting.key == "plugin.bank_emi.installed")
        .first()
    )
    if emi_flag and _truthy(emi_flag.value, False):
        active.add("emi")

    return active


def list_available_payment_options(db: Session) -> List[PaymentMethodOption]:
    flags = load_payment_method_flags(db)
    gateways = active_gateway_method_ids(db)
    out: List[PaymentMethodOption] = []

    if flags.get("payments.cod", True) and "cod" in PAYMENT_METHODS:
        out.append(PAYMENT_METHODS["cod"])

    if flags.get("payments.online", True):
        for method_id in ("bkash", "sslcommerz", "nagad", "paypal", "stripe", "emi"):
            if method_id not in PAYMENT_METHODS:
                continue
            # Built-in online wallets without a plugin row never auto-appear
            if method_id == "nagad":
                continue
            if method_id not in gateways:
                continue
            out.append(PAYMENT_METHODS[method_id])

    if flags.get("payments.bank", True) and "bank" in PAYMENT_METHODS:
        out.append(PAYMENT_METHODS["bank"])

    # De-dupe while preserving order
    seen: Set[str] = set()
    unique: List[PaymentMethodOption] = []
    for m in out:
        if m.id in seen:
            continue
        seen.add(m.id)
        unique.append(m)
    return unique


def payment_options_as_dicts(db: Session) -> List[dict[str, Any]]:
    return [
        {
            "id": m.id,
            "label": m.label,
            "description": m.description,
            "requires_gateway": m.requires_gateway,
            "plugin_id": m.plugin_id,
        }
        for m in list_available_payment_options(db)
    ]


def is_payment_method_allowed(db: Session, method_id: str) -> bool:
    allowed = {m.id for m in list_available_payment_options(db)}
    return method_id in allowed
