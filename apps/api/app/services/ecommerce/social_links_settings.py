"""Public social profile links, driven from admin settings.

Stored in `platform_settings` as `social.<network>`. These used to be hardcoded
in the storefront bundle, so changing a profile URL needed a redeploy.

An unset link stays empty rather than falling back to a placeholder URL, so the
storefront can hide the icon instead of linking somewhere wrong.
"""

from __future__ import annotations

from typing import Dict

from sqlalchemy.orm import Session

from app.models.platform_setting import PlatformSetting

SOCIAL_NETWORKS: tuple[tuple[str, str], ...] = (
    ("facebook", "Facebook"),
    ("instagram", "Instagram"),
    ("youtube", "YouTube"),
)

SOCIAL_KEYS = tuple(f"social.{name}" for name, _ in SOCIAL_NETWORKS)


def load_social_links(db: Session) -> Dict[str, str]:
    rows = db.query(PlatformSetting).filter(PlatformSetting.key.in_(SOCIAL_KEYS)).all()
    stored = {r.key: (r.value or "").strip() for r in rows}
    return {name: stored.get(f"social.{name}", "") for name, _ in SOCIAL_NETWORKS}
