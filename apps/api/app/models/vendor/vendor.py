from __future__ import annotations

import json
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# SPEC.md §41 — vendor onboarding lifecycle
VENDOR_STATUSES = (
    "invited",
    "pending",
    "under_review",
    "approved",
    "active",
    "suspended",
    "blocked",
    "archived",
)


def dump_json(value: Any) -> str:
    return json.dumps(value if value is not None else [])


def load_json(value: Optional[str], default: Any = None) -> Any:
    if not value:
        return default if default is not None else []
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default if default is not None else []


class Vendor(Base):
    """B2B vendor/dealer/reseller master profile — SPEC.md §4.

    This is the buyer-side counterpart to CommerceCustomer, not a rename of
    CommerceSupplier (which is who AgainERP buys FROM). A Vendor buys FROM
    AgainERP through the vendor portal.
    """

    __tablename__ = "vendors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    party_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("parties.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    vendor_code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    display_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")

    contact_person: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    phone: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    email: Mapped[str] = mapped_column(String(255), nullable=False, default="", index=True)
    website: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    logo: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    vendor_type_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("vendor_types.id", ondelete="SET NULL"), nullable=True, index=True
    )
    vendor_group_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("vendor_groups.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Overrides the group's price list when set — SPEC §13 tier 2.
    price_list_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("vendor_price_lists.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)

    # Address — JSON-blob list (billing + shipping entries), matching the
    # CommerceCustomer pattern instead of a normalised address table.
    addresses_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    state_division: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    country: Mapped[str] = mapped_column(String(100), nullable=False, default="Bangladesh")
    postal_code: Mapped[str] = mapped_column(String(20), nullable=False, default="")

    # Business information
    trade_license: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    vat_tax_id: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    bin_tin: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    business_registration_number: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    payment_terms: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    payment_schedule: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    credit_limit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="BDT")
    preferred_payment_method: Mapped[str] = mapped_column(String(50), nullable=False, default="")

    # Account management
    account_manager_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    sales_rep_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    onboarding_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    last_order_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    last_payment_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Portal access
    portal_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    @property
    def addresses(self) -> list[dict[str, Any]]:
        return load_json(self.addresses_json, [])

    @addresses.setter
    def addresses(self, value: list[dict[str, Any]]) -> None:
        self.addresses_json = dump_json(value)
