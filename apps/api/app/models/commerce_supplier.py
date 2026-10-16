from __future__ import annotations

import json
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
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


class CommerceSupplier(Base):
    __tablename__ = "commerce_suppliers"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    party_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("parties.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    vendor_code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    phone: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    payment_terms: Mapped[str] = mapped_column(String(50), nullable=False, default="Net 30")
    lead_time_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    rating: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False, default=0)
    open_pos: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    spend_ytd: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    country: Mapped[str] = mapped_column(String(100), nullable=False, default="Bangladesh")
    tax_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    currency: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    credit_limit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    payment_schedule: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    min_order_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    incoterms: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    buyer_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    contacts_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    addresses_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    contracts_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    bills_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    performance_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    timeline_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    rfq_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    receipt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    has_stock_feed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    total_pos: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
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
