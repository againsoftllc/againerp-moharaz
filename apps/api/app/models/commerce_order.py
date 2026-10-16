from __future__ import annotations

import json
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, List, Optional

from sqlalchemy import DateTime, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def dump_json(value: Any) -> str:
    return json.dumps(value if value is not None else [])


def load_json(value: Optional[str], default: Any = None) -> Any:
    if not value:
        return default if default is not None else []
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default if default is not None else []


class CommerceOrder(Base):
    __tablename__ = "commerce_orders"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    # Which storefront took the order (workspace_sites.id). Null on rows created
    # before multi-site, which are treated as the primary site's.
    site_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    order_number: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    order_date: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    payment_status: Mapped[str] = mapped_column(String(20), nullable=False, default="unpaid")
    shipment_status: Mapped[str] = mapped_column(String(20), nullable=False, default="unfulfilled")
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="Web Store")
    branch: Mapped[str] = mapped_column(String(100), nullable=False, default="Dhaka HQ")
    assigned_staff: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="normal")
    tags_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    customer_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    # Vendor B2B origin — set only for orders converted from an accepted
    # vendor quotation (modules/vendor). Loose, no FK, same as customer_id.
    vendor_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    vendor_quotation_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    vendor_order_request_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    billing_address_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    shipping_address_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    payment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    invoice_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    primary_shipment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    warehouse_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    customer_email: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    customer_group: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    customer_lifetime_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    customer_order_count: Mapped[int] = mapped_column(nullable=False, default=0)
    customer_risk_score: Mapped[int] = mapped_column(nullable=False, default=0)
    billing_address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    billing_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    billing_region: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    billing_country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    shipping_address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    shipping_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    shipping_region: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    shipping_country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False, default="COD")
    payment_transaction_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    due_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    refund_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    courier: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tracking_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tracking_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    shipping_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    shipped_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    shipping_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    grand_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Dropship manual 1688 fulfillment
    supplier_order_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", index=True
    )
    supplier_order_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    supplier_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_risk: Mapped[str] = mapped_column(String(20), nullable=False, default="low")
    ai_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    timeline_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    activities_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    comments_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    attachments_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    payment_timeline_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    ai_insights_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    followers_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
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

    @property
    def tags(self) -> List[str]:
        return load_json(self.tags_json, [])

    @tags.setter
    def tags(self, value: List[str]) -> None:
        self.tags_json = dump_json(value)
