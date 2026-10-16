from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

DEFAULT_WEBSITE_CATEGORY_PAGE_ID = "default"

DEFAULT_CATEGORY_PAGE_CONTENT: dict[str, Any] = {
    "settings": {
        "products_per_page": 16,
        "load_mode": "load_more",
        "load_more_count": 10,
        "grid_cols_md": 3,
        "grid_cols_lg": 4,
        "default_sort": "default",
        "show_breadcrumbs": True,
        "filter_layout": "drawer",
        "empty_title": "No products found",
        "empty_message": "Product listings for this category are being added. Please check back soon.",
        "empty_filter_message": "No products match the selected filters.",
    },
    "sorting": {
        "hidden": False,
        "options": [
            {"id": "default", "label": "Default", "hidden": False},
            {"id": "price-asc", "label": "Price (Low > High)", "hidden": False},
            {"id": "price-desc", "label": "Price (High > Low)", "hidden": False},
        ],
    },
    "filters": {
        "hidden": False,
        "button_label": "Filter By",
        "price": {"enabled": True, "label": "Price Range"},
        "availability": {
            "enabled": True,
            "label": "Availability",
            "options": [
                {"id": "in_stock", "label": "In Stock", "hidden": False},
                {"id": "pre_order", "label": "Pre Order", "hidden": False},
                {"id": "upcoming", "label": "Up Coming", "hidden": False},
                {"id": "out_of_stock", "label": "Out of Stock", "hidden": False},
            ],
        },
    },
    "product_card": {
        "show_rating": True,
        "show_review_count": True,
        "show_compare_at": True,
        "show_discount_badge": True,
        "show_buy_now": True,
        "show_wishlist": True,
        "show_compare": True,
    },
    "stats": {"hidden": False},
    "description": {
        "hidden": False,
        "collapse_enabled": True,
        "title_template": "About {category}",
        "body_html": "",
    },
}


def dump_json(value: Any) -> str:
    return json.dumps(value if value is not None else {})


def load_json(value: Optional[str], default: Any = None) -> Any:
    if not value:
        return default if default is not None else {}
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default if default is not None else {}


class WebsiteCategoryPage(Base):
    """Singleton storefront category/brand PLP template content."""

    __tablename__ = "website_category_page"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=DEFAULT_WEBSITE_CATEGORY_PAGE_ID
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    content_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
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
