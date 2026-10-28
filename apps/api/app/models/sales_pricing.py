from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CustomerGroup(Base):
    """Customer group master (OnerERP CustomerGroup). `code` is what `commerce_customers.group` holds (retail, dealer, ...).
    A group can carry a default price type and discount type."""

    __tablename__ = "customer_groups"
    __table_args__ = (UniqueConstraint("company_id", "code", name="uq_customer_group_code"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    price_type_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    discount_type_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class PriceType(Base):
    """A named price list (OnerERP Price Type: Retail, Dealer, Corporate ...). `allow_change` = IsLimitChange: the seller may
    change the price, within lower / upper % of the list price when those are set; otherwise the list price is fixed."""

    __tablename__ = "sales_price_types"
    __table_args__ = (UniqueConstraint("company_id", "code", name="uq_sales_price_type_code"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    allow_change: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    lower_limit_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)  # e.g. 5 = may go 5% below
    upper_limit_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class PriceTypeItem(Base):
    """One product's price in a price type, from a quantity up (slabs), optionally for a date range."""

    __tablename__ = "sales_price_type_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    price_type_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sales_price_types.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    min_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    valid_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    valid_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)


class DiscountType(Base):
    """A named discount scheme (OnerERP Discount Type). `max_pct` caps what a seller may give on a line under it."""

    __tablename__ = "sales_discount_types"
    __table_args__ = (UniqueConstraint("company_id", "code", name="uq_sales_discount_type_code"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    max_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class DiscountTypeItem(Base):
    """A discount % for a product, a brand or a category (the first that matches, in that order), from a quantity up."""

    __tablename__ = "sales_discount_type_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    discount_type_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sales_discount_types.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    brand_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    category_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    min_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    discount_pct: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    valid_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    valid_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)


class PricingRule(Base):
    """Price / Discount Configuration (OnerERP): which price type and discount type apply where. Every filled condition must
    match (customer group, warehouse, salesperson user, brand, category, date range); the most specific rule wins, then the
    highest priority."""

    __tablename__ = "sales_pricing_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    price_type_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    discount_type_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    customer_group: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    warehouse_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    brand_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    category_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    valid_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    valid_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
