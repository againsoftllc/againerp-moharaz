from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

COMPANY_STATUSES = ("trialing", "active", "suspended", "cancelled")


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="trialing")
    plan_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    trial_ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    subscription_ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    suspended_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # JSON-encoded array of RBAC module ids (app.services.rbac.RBAC_MODULES).
    # NULL = all modules enabled (no restriction).
    enabled_modules: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    legal_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    mobile: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    street: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    street2: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    zip_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tax_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    vat_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    registration_no: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    currency_code: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    language_code: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    timezone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    date_format: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    time_format: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    decimal_places: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    number_grouping: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    fiscal_year_start_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    bank_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    bank_account: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    bank_branch: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    bank_routing: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    invoice_prefix: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    invoice_include_year: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    invoice_padding: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    invoice_next_sequence: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    invoice_due_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    invoice_payment_terms: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    invoice_tax_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    invoice_prices_include_tax: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    tax_enabled: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    invoice_footer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    credit_note_prefix: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    invoice_layout: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    packing_layout: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    purchase_layout: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payment_layout: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
