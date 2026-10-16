"""Per-site storefront settings held in `workspace_sites.options_json.storefront`.

These values used to live in the storefront bundle (`data/company.ts`,
`live-edit/site-chrome.ts`, `globals.css`), so a second storefront could not
have its own branding without a code change. Keeping them in the existing free
JSON column avoids a schema migration — the project has no Alembic.

Everything is optional. Empty values are returned as empty strings so the
storefront can keep its own compiled defaults as the last-resort fallback.
"""

from __future__ import annotations

from typing import Any, Dict, List

STOREFRONT_OPTIONS_KEY = "storefront"

EMAIL_DEPARTMENTS: tuple[str, ...] = (
    "support",
    "sales",
    "payments",
    "delivery",
    "returns",
)

SOCIAL_NETWORKS: tuple[str, ...] = ("facebook", "instagram", "youtube")

HEADER_ACTION_IDS: tuple[str, ...] = (
    "offers",
    "happyHour",
    "pcBuilderMobile",
    "compare",
    "account",
    "pcBuilderCta",
)

THEME_FIELDS: tuple[str, ...] = (
    "primary_color",
    "secondary_color",
    "header_background",
    "footer_background",
    "font_family",
)

META_FIELDS: tuple[str, ...] = (
    "title_template",
    "description",
    "notice_text",
)


# Admin → Site → Option fields the storefront renders with. These sit at the
# root of `options_json` (not under `storefront`), where the admin form saves
# them.
CATALOG_TOGGLES: Dict[str, bool] = {
    "category_product_count": True,
    "display_stock": True,
    "show_out_of_stock_warning": True,
}

CATALOG_NUMBERS: Dict[str, int] = {
    "catalog_items_per_page": 16,
    "list_description_limit": 100,
}


COMMERCE_TOGGLES: Dict[str, bool] = {
    "allow_reviews": True,
    "allow_guest_reviews": False,
    "guest_checkout": True,
    "login_display_prices": False,
    "stock_checkout": False,
    "display_prices_with_tax": True,
    "maintenance_mode": False,
}


def _text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("1", "true", "yes", "on"):
            return True
        if lowered in ("0", "false", "no", "off"):
            return False
    return default


def _int(value: Any, default: int) -> int:
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def build_catalog_options(options: Dict[str, Any] | None) -> Dict[str, Any]:
    """Display rules for product listings, straight from the admin Option tab."""
    data = _dict(options)
    out: Dict[str, Any] = {
        key: _bool(data.get(key), default) for key, default in CATALOG_TOGGLES.items()
    }
    out.update(
        {key: _int(data.get(key), default) for key, default in CATALOG_NUMBERS.items()}
    )
    return out


def _dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _header_actions(raw: Any) -> List[Dict[str, Any]]:
    """Label / href / visibility overrides, keyed by the storefront's action ids."""
    items = raw if isinstance(raw, list) else []
    by_id = {_text(_dict(item).get("id")): _dict(item) for item in items}
    actions: List[Dict[str, Any]] = []
    for action_id in HEADER_ACTION_IDS:
        cur = by_id.get(action_id, {})
        actions.append(
            {
                "id": action_id,
                "label": _text(cur.get("label")),
                "href": _text(cur.get("href")),
                # Absent means "leave the storefront default alone".
                "enabled": bool(cur.get("enabled", True)),
            }
        )
    return actions


def _memberships(raw: Any) -> List[Dict[str, str]]:
    items = raw if isinstance(raw, list) else []
    out: List[Dict[str, str]] = []
    for item in items:
        row = _dict(item)
        name = _text(row.get("name"))
        image = _text(row.get("image"))
        if not name and not image:
            continue
        out.append({"name": name, "image": image})
    return out


def build_commerce_options(options: Dict[str, Any] | None) -> Dict[str, Any]:
    """Review / checkout / price gates from the admin Option tab."""
    data = _dict(options)
    return {key: _bool(data.get(key), default) for key, default in COMMERCE_TOGGLES.items()}


def commerce_option(options: Dict[str, Any] | None, key: str) -> bool:
    return build_commerce_options(options)[key]


def build_storefront_options(options: Dict[str, Any] | None) -> Dict[str, Any]:
    """Normalize the stored blob into a stable shape for the public API."""
    data = _dict(_dict(options).get(STOREFRONT_OPTIONS_KEY))
    emails = _dict(data.get("emails"))
    header = _dict(data.get("header"))
    footer = _dict(data.get("footer"))
    social = _dict(data.get("social"))
    theme = _dict(data.get("theme"))
    meta = _dict(data.get("meta"))

    return {
        "emails": {dept: _text(emails.get(dept)) for dept in EMAIL_DEPARTMENTS},
        "header": {
            "logo_alt": _text(header.get("logo_alt")),
            "search_placeholder": _text(header.get("search_placeholder")),
            "actions": _header_actions(header.get("actions")),
        },
        "footer": {
            "support_hours": _text(footer.get("support_hours")),
            "payment_image": _text(footer.get("payment_image")),
            "memberships": _memberships(footer.get("memberships")),
        },
        "social": {name: _text(social.get(name)) for name in SOCIAL_NETWORKS},
        "theme": {field: _text(theme.get(field)) for field in THEME_FIELDS},
        "meta": {field: _text(meta.get(field)) for field in META_FIELDS},
    }
