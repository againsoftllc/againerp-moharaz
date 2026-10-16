from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user
from app.models.platform_setting import PlatformSetting

router = APIRouter(prefix="/platform-settings", tags=["platform-settings"])

# Keys that are secrets — their values are masked in GET responses
SECRET_KEYS = {
    "pagespeed_api_key",
    "openai_api_key",
    "smtp_password",
    "sms_api_key",
    "cloudflare_oauth_client_id",
    "cloudflare_oauth_client_secret",
    "cloudflare_api_token",
    "cloudflare_account_id",
}

# Storefront shipping + tax settings. Their absence here made every admin save
# 404 silently, because both GET/{key} and PUT/{key} reject unregistered keys.
_SHIPPING_KEYS: tuple[tuple[str, str, str], ...] = (
    ("shipping.free_threshold", "Free shipping over", "Order subtotal that earns free shipping (0 = off)"),
    ("shipping.default_method", "Default method", "Shipping method preselected at checkout"),
    ("shipping.time_slots", "Delivery time slots", "Let customers pick a delivery time slot"),
    ("shipping.method_standard", "Home delivery", "Offer standard home delivery"),
    ("shipping.method_express", "Express delivery", "Offer next-business-day delivery"),
    ("shipping.method_same_day", "Same day delivery", "Offer same-day delivery"),
    ("shipping.method_pickup", "Store pickup", "Offer collection from store"),
    ("shipping.rate_default", "Default rate", "Fallback rate for districts without their own"),
    ("shipping.rate_express", "Express rate", "Flat rate for express delivery"),
    ("shipping.rate_same_day", "Same day rate", "Flat rate for same-day delivery"),
    ("shipping.zones", "Delivery zones", "Comma-separated districts served"),
    ("shipping.district_rates", "District rates", "JSON map of district to delivery charge"),
)

_TAX_KEYS: tuple[tuple[str, str, str], ...] = (
    ("tax.rate_percent", "Tax rate (%)", "Storefront tax rate applied at checkout (0 = no tax)"),
    ("tax.label", "Tax label", "Name shown next to tax on cart, checkout and invoices"),
    ("tax.included_in_price", "Prices include tax", "Product prices already contain tax"),
    ("tax.shipping_taxable", "Tax shipping", "Apply the tax rate to the delivery charge too"),
)

# Customer panel menu visibility. Labels mirror the storefront account sidebar.
_ACCOUNT_MENU_KEYS: tuple[tuple[str, str], ...] = (
    ("wishlist", "Wishlist"),
    ("payments", "Payments"),
    ("returns", "Return & Refund"),
    ("qc", "QC"),
    ("complain", "Complain"),
    ("support", "Support"),
    ("points", "Points"),
    ("delivery", "Delivery"),
)

# Public social profile URLs shown in the storefront footer / header.
_SOCIAL_KEYS: tuple[tuple[str, str], ...] = (
    ("facebook", "Facebook"),
    ("instagram", "Instagram"),
    ("youtube", "YouTube"),
)

# Website → PC Builder → General / Language (the storefront reads them with the builder profile)
_PC_BUILDER_KEYS: tuple[tuple[str, str, str], ...] = (
    ("language", "PC Builder admin language", "Language of the PC Builder admin panel (en | bn)"),
    ("show_incompatible", "Show mismatching products", "Show parts that don't fit the build, greyed out with the reason"),
    ("show_coming_soon", "Show Coming soon products", "List parts whose stock status is Coming soon"),
    ("hide_oos", "Hide out-of-stock products", "Leave Out of stock parts out of the builder's slot lists"),
    ("show_autofilter_notice", "Show the auto-filter notice", "Tell the shopper the slot only lists parts that fit"),
    ("share_link", "Build share link", "Shoppers can copy a link to their build"),
    ("default_sort", "Default sort", "Default sort of every slot: popular | low | high"),
    ("msg.incompatible", "Incompatible message", "Fallback message of an Error rule without its own text"),
    ("msg.warning", "Warning message", "Fallback message of a Warning rule without its own text"),
)

KNOWN_KEYS: dict[str, dict[str, Any]] = {
    "pagespeed_api_key": {
        "description": "Google PageSpeed Insights API Key — enables performance audits for all clients",
        "is_secret": True,
        "group": "integrations",
        "label": "PageSpeed API Key",
    },
    "openai_api_key": {
        "description": "Deprecated — configure OpenAI in AgainERP Center Provider Gateway",
        "is_secret": True,
        "group": "integrations",
        "label": "OpenAI API Key (Center)",
    },
    "smtp_host": {
        "description": "SMTP server hostname for outgoing email",
        "is_secret": False,
        "group": "email",
        "label": "SMTP Host",
    },
    "smtp_port": {
        "description": "SMTP server port (e.g. 587)",
        "is_secret": False,
        "group": "email",
        "label": "SMTP Port",
    },
    "smtp_user": {
        "description": "SMTP username / sender email",
        "is_secret": False,
        "group": "email",
        "label": "SMTP Username",
    },
    "smtp_password": {
        "description": "SMTP account password",
        "is_secret": True,
        "group": "email",
        "label": "SMTP Password",
    },
    "sms_api_key": {
        "description": "SMS gateway API key",
        "is_secret": True,
        "group": "sms",
        "label": "SMS API Key",
    },
    "sms_sender_id": {
        "description": "SMS sender name shown to recipients",
        "is_secret": False,
        "group": "sms",
        "label": "SMS Sender ID",
    },
    "platform_name": {
        "description": "Platform display name shown in emails and reports",
        "is_secret": False,
        "group": "general",
        "label": "Platform Name",
    },
    "support_email": {
        "description": "Support email address",
        "is_secret": False,
        "group": "general",
        "label": "Support Email",
    },
    "dropship_cny_to_bdt": {
        "description": "CNY → BDT exchange rate used for Elim / China product pricing",
        "is_secret": False,
        "group": "dropship",
        "label": "CNY to BDT Rate",
    },
    "dropship_markup_percent": {
        "description": "Markup % added on Elim cost (BDT) for website sell price — storefront uses this",
        "is_secret": False,
        "group": "dropship",
        "label": "Markup Percent",
    },
    "dropship_profit_bdt": {
        "description": "Optional flat profit (BDT) added after markup",
        "is_secret": False,
        "group": "dropship",
        "label": "Profit (BDT)",
    },
    "dropship_server_charge_bdt": {
        "description": "Optional flat server / service fee (BDT) added after markup",
        "is_secret": False,
        "group": "dropship",
        "label": "Server Charge (BDT)",
    },
    "amazon_usd_to_bdt": {
        "description": "USD → BDT exchange rate used for Amazon import pricing",
        "is_secret": False,
        "group": "dropship",
        "label": "USD to BDT Rate",
    },
    "dropship_currencies_json": {
        "description": "JSON list of source currency rates (code, name, rateToBdt, active)",
        "is_secret": False,
        "group": "dropship",
        "label": "Currency Rates JSON",
    },
    "group_dropship_pricing": {
        "description": "Enable dropship pricing formula on imports",
        "is_secret": False,
        "group": "dropship",
        "label": "Dropship Pricing Formula",
    },
    "group_import_defaults": {
        "description": "Enable import preset defaults",
        "is_secret": False,
        "group": "dropship",
        "label": "Import Presets",
    },
    "import_auto_publish": {
        "description": "Auto-publish products after import",
        "is_secret": False,
        "group": "dropship",
        "label": "Auto-publish After Import",
    },
    "import_sync_images": {
        "description": "Download and store source gallery images during import",
        "is_secret": False,
        "group": "dropship",
        "label": "Sync Product Images",
    },
    "import_default_status": {
        "description": "Default product status for newly imported dropship products (draft|active)",
        "is_secret": False,
        "group": "dropship",
        "label": "Default Product Status",
    },
    "group_product_variant": {
        "description": "Enable variants for dropship products",
        "is_secret": False,
        "group": "dropship",
        "label": "Variants",
    },
    "group_attributes": {
        "description": "Use dropshipping attribute profiles",
        "is_secret": False,
        "group": "dropship",
        "label": "Attribute Profiles",
    },
    "group_storefront_stock": {
        "description": "Show stock on dropship product pages",
        "is_secret": False,
        "group": "dropship",
        "label": "Show Stock",
    },
    "group_storefront_seller": {
        "description": "Show seller information on dropship product pages",
        "is_secret": False,
        "group": "dropship",
        "label": "Show Seller Info",
    },
    "module_elim_connector": {
        "description": "Enable AgainAPI (Elim) import connector",
        "is_secret": False,
        "group": "dropship",
        "label": "AgainAPI Connector",
    },
    "module_amazon_connector": {
        "description": "Enable Amazon import connector",
        "is_secret": False,
        "group": "dropship",
        "label": "Amazon Connector",
    },
    "payments.cod": {
        "description": "Show Cash On Delivery on storefront checkout",
        "is_secret": False,
        "group": "payments",
        "label": "Cash On Delivery",
    },
    "payments.online": {
        "description": "Show installed online payment gateways on storefront checkout",
        "is_secret": False,
        "group": "payments",
        "label": "Online Payment",
    },
    "payments.bank": {
        "description": "Show Bank Transfer on storefront checkout",
        "is_secret": False,
        "group": "payments",
        "label": "Bank Transfer",
    },
    "payments.partial": {
        "description": "Allow partial payments (reserved)",
        "is_secret": False,
        "group": "payments",
        "label": "Partial Payment",
    },
    "plugin.bank_emi.installed": {
        "description": "Bank EMI plugin installed for storefront EMI facility",
        "is_secret": False,
        "group": "payments",
        "label": "Bank EMI Plugin",
    },
    "plugin.ai_search.installed": {
        "description": "AI Search plugin installed (storefront AI search and shopping assistant)",
        "is_secret": False,
        "group": "plugins",
        "label": "AI Search Plugin",
    },
    "plugin.ai_search.enabled": {
        "description": "AI Search answers storefront questions (needs the OpenAI key under AI settings)",
        "is_secret": False,
        "group": "plugins",
        "label": "AI Search Enabled",
    },
    **{
        key: {"description": desc, "is_secret": False, "group": "shipping", "label": label}
        for key, label, desc in _SHIPPING_KEYS
    },
    **{
        key: {"description": desc, "is_secret": False, "group": "tax", "label": label}
        for key, label, desc in _TAX_KEYS
    },
    **{
        f"account_menu.{name}": {
            "description": f"Show the {label} section in the customer account panel",
            "is_secret": False,
            "group": "account_menu",
            "label": label,
        }
        for name, label in _ACCOUNT_MENU_KEYS
    },
    **{
        f"social.{name}": {
            "description": f"Public {label} profile URL shown on the storefront",
            "is_secret": False,
            "group": "social",
            "label": label,
        }
        for name, label in _SOCIAL_KEYS
    },
    **{
        f"pcbuilder.{name}": {"description": desc, "is_secret": False, "group": "pcbuilder", "label": label}
        for name, label, desc in _PC_BUILDER_KEYS
    },
}


def _mask(key: str, value: Optional[str]) -> Optional[str]:
    if value and key in SECRET_KEYS:
        return "•" * 8
    return value


class SettingOut(BaseModel):
    key: str
    value: Optional[str]
    description: Optional[str]
    is_secret: bool
    group: str
    label: str
    configured: bool


class SettingUpsert(BaseModel):
    value: str


# Empty path (no trailing slash): Next.js strips trailing slashes on /api proxies,
# and FastAPI's slash redirect would point at :8010 and drop Authorization.
@router.get("", response_model=list[SettingOut])
def list_settings(
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[SettingOut]:
    rows = {r.key: r for r in db.query(PlatformSetting).all()}
    result = []
    for key, meta in KNOWN_KEYS.items():
        row = rows.get(key)
        value = row.value if row else None
        result.append(SettingOut(
            key=key,
            value=_mask(key, value),
            description=meta["description"],
            is_secret=meta["is_secret"],
            group=meta["group"],
            label=meta["label"],
            configured=bool(value),
        ))
    return result


@router.get("/{key}", response_model=SettingOut)
def get_setting(
    key: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> SettingOut:
    if key not in KNOWN_KEYS:
        raise HTTPException(status_code=404, detail=f"Unknown setting key: {key}")
    meta = KNOWN_KEYS[key]
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    return SettingOut(
        key=key,
        value=_mask(key, row.value if row else None),
        description=meta["description"],
        is_secret=meta["is_secret"],
        group=meta["group"],
        label=meta["label"],
        configured=bool(row and row.value),
    )


@router.put("/{key}", response_model=SettingOut)
def upsert_setting(
    key: str,
    body: SettingUpsert,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> SettingOut:
    if key not in KNOWN_KEYS:
        raise HTTPException(status_code=404, detail=f"Unknown setting key: {key}")
    if key == "openai_api_key":
        raise HTTPException(
            status_code=410,
            detail="OpenAI keys are managed in AgainERP Center — not AgainERP platform_settings.",
        )
    meta = KNOWN_KEYS[key]
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    if row:
        row.value = body.value or None
        row.description = meta["description"]
        row.is_secret = meta["is_secret"]
    else:
        row = PlatformSetting(
            key=key,
            value=body.value or None,
            description=meta["description"],
            is_secret=meta["is_secret"],
        )
        db.add(row)
    db.commit()
    db.refresh(row)

    return SettingOut(
        key=key,
        value=_mask(key, row.value),
        description=meta["description"],
        is_secret=meta["is_secret"],
        group=meta["group"],
        label=meta["label"],
        configured=bool(row.value),
    )


@router.post("/{key}/test")
def test_setting(
    key: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> dict:
    if key == "openai_api_key":
        raise HTTPException(
            status_code=410,
            detail="Test OpenAI via AgainERP Center gateway — not AgainERP.",
        )
    raise HTTPException(status_code=400, detail="Test not supported for this key")


@router.delete("/{key}")
def clear_setting(
    key: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
) -> dict:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    if row:
        row.value = None
        db.commit()
    return {"cleared": True}


def get_platform_setting(db: Session, key: str) -> Optional[str]:
    """Helper used by other routers to fetch a setting value."""
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    return row.value if row else None
