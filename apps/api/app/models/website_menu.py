from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Fixed IDs for system menus (seed + merge).
SYSTEM_MENU_CATALOG_ID = "menu-catalog"
SYSTEM_MENU_HEADER_ID = "menu-header"
SYSTEM_MENU_FOOTER_ID = "menu-footer"

DEFAULT_SLOTS: list[dict[str, str]] = [
    {"slot_key": "catalog.shop", "menu_id": SYSTEM_MENU_CATALOG_ID},
    {"slot_key": "header.primary", "menu_id": SYSTEM_MENU_HEADER_ID},
    {"slot_key": "footer.links", "menu_id": SYSTEM_MENU_FOOTER_ID},
]

DEFAULT_FOOTER_ITEMS: list[dict[str, Any]] = [
    {
        "id": "fi1",
        "label": "About Us",
        "link_type": "custom",
        "link_ref_id": None,
        "href": "/about",
        "hidden": False,
        "children": [],
    },
    {
        "id": "fi2",
        "label": "Order Track",
        "link_type": "custom",
        "link_ref_id": None,
        "href": "/order-track",
        "hidden": False,
        "children": [],
    },
    {
        "id": "fi3",
        "label": "Blog",
        "link_type": "custom",
        "link_ref_id": None,
        "href": "/blog",
        "hidden": False,
        "children": [],
    },
    {
        "id": "fi4",
        "label": "Contact Us",
        "link_type": "custom",
        "link_ref_id": None,
        "href": "/contact",
        "hidden": False,
        "children": [],
    },
    {
        "id": "fi5",
        "label": "Privacy Policy",
        "link_type": "custom",
        "link_ref_id": None,
        "href": "/privacy-policy",
        "hidden": False,
        "children": [],
    },
    {
        "id": "fi6",
        "label": "Terms & Conditions",
        "link_type": "custom",
        "link_ref_id": None,
        "href": "/terms",
        "hidden": False,
        "children": [],
    },
    {
        "id": "fi7",
        "label": "Shipping Charge",
        "link_type": "custom",
        "link_ref_id": None,
        "href": "/shipping-charge",
        "hidden": False,
        "children": [],
    },
    {
        "id": "fi8",
        "label": "Refund & Return Policy",
        "link_type": "custom",
        "link_ref_id": None,
        "href": "/refund-return",
        "hidden": False,
        "children": [],
    },
]


def dump_json(value: Any) -> str:
    return json.dumps(value if value is not None else [])


def load_json_list(value: Optional[str]) -> list[Any]:
    if not value:
        return []
    try:
        raw = json.loads(value)
        return raw if isinstance(raw, list) else []
    except json.JSONDecodeError:
        return []


def new_menu_id() -> str:
    return str(uuid.uuid4())


class WebsiteMenu(Base):
    """Named navigation menu — system (Catalog/Header/Footer) or custom."""

    __tablename__ = "website_menus"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_menu_id)
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    handle: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    # system | custom
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="custom", index=True)
    # catalog | header | footer | null
    system_key: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    # auto = sync from category/brand/page tree; custom = manual items
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="custom")
    # category | brand | page — used when source=auto
    auto_type: Mapped[str] = mapped_column(String(16), nullable=False, default="category")
    # When True, newly synced catalog entities start visible; False = start hidden
    auto_show_new: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    items_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class WebsiteMenuSlot(Base):
    """Assigns a menu to a storefront slot (header / footer / catalog shop)."""

    __tablename__ = "website_menu_slots"

    slot_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    menu_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("website_menus.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # Storefront trigger label (e.g. SHOP). Empty = derive from menu name / slot default.
    title: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    # megamenu | dropdown
    nav_style: Mapped[str] = mapped_column(String(16), nullable=False, default="megamenu")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
