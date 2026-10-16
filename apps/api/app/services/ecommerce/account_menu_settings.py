"""Which customer-panel menus the storefront shows, driven from admin settings.

Stored in `platform_settings` as `account_menu.<key>`. Sections that are not
launched yet default to off so the customer panel only advertises what the
business can actually service.
"""

from __future__ import annotations

from typing import Dict, Optional

from sqlalchemy.orm import Session

from app.models.platform_setting import PlatformSetting

# Dashboard, Orders and Profile are structural — no toggle, they always show.
ACCOUNT_MENU_DEFAULTS: Dict[str, bool] = {
    "wishlist": True,
    "payments": True,
    "returns": True,
    "qc": False,
    "complain": False,
    "support": False,
    "points": False,
    "delivery": False,
}

ACCOUNT_MENU_KEYS = tuple(f"account_menu.{k}" for k in ACCOUNT_MENU_DEFAULTS)


def _truthy(raw: Optional[str], default: bool) -> bool:
    if raw is None or str(raw).strip() == "":
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def load_account_menu_settings(db: Session) -> Dict[str, bool]:
    rows = (
        db.query(PlatformSetting)
        .filter(PlatformSetting.key.in_(ACCOUNT_MENU_KEYS))
        .all()
    )
    stored = {r.key: r.value for r in rows}
    return {
        name: _truthy(stored.get(f"account_menu.{name}"), default)
        for name, default in ACCOUNT_MENU_DEFAULTS.items()
    }
