from __future__ import annotations

import json
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, List, Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
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


def append_customer_timeline(
    row: "CommerceCustomer",
    title: str,
    *,
    actor: str = "Admin",
    event_type: str = "activity",
    description: Optional[str] = None,
    role: Optional[str] = None,
) -> None:
    """Prepend a history event on the customer profile (admin + storefront)."""
    actor_name = (actor or "System").strip() or "System"
    initials = "".join(part[0] for part in actor_name.replace("@", " ").split()[:2]).upper() or "SY"
    resolved_role = (role or "").strip().lower()
    if not resolved_role:
        lower_actor = actor_name.lower()
        if lower_actor in {"system"}:
            resolved_role = "system"
        elif "customer" in lower_actor or lower_actor == (getattr(row, "name", "") or "").strip().lower():
            resolved_role = "customer"
        else:
            resolved_role = "admin"
    timeline = load_json(row.timeline_json, [])
    if not isinstance(timeline, list):
        timeline = []
    entry: dict[str, Any] = {
        "id": f"tl_{uuid.uuid4().hex[:12]}",
        "type": event_type,
        "title": title,
        "actor": actor_name,
        "actorInitials": initials,
        "role": resolved_role,
        "at": datetime.utcnow().isoformat() + "Z",
    }
    if description:
        entry["description"] = description
    timeline.insert(0, entry)
    # Keep history bounded so JSON stays light
    row.timeline_json = dump_json(timeline[:200])


class CommerceCustomer(Base):
    __tablename__ = "commerce_customers"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    party_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("parties.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    customer_code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    email: Mapped[str] = mapped_column(String(255), nullable=False, default="", index=True)
    whatsapp_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    profile_image: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    group: Mapped[str] = mapped_column(String(30), nullable=False, default="retail")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    loyalty_tier: Mapped[str] = mapped_column(String(20), nullable=False, default="silver")
    city: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    region: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    country: Mapped[str] = mapped_column(String(100), nullable=False, default="Bangladesh")
    customer_since: Mapped[date] = mapped_column(Date, nullable=False)
    last_order_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    assigned_staff: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tags_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    total_orders: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_spend: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    avg_order_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    return_rate: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    reward_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    wallet_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    credit_limit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    # Credit control at sale (services/customer/credit_control.py; OnerERP IsLocked, TransactionType, CreditAllowedDays,
    # ConditionalLimit + ValidTill, SecurityMoney, OpeningDate). Columns added by ensure_customer_credit_columns.
    sales_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sales_lock_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trade_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="both")
    credit_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    conditional_limit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    conditional_valid_till: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    security_money: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    opening_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    payment_terms: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    payment_schedule: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    risk_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False, default="low")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    addresses_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    wallet_transactions_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    reward_events_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    timeline_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    comments_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    activities_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    attachments_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    ai_insights_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
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


class CommerceCustomerContact(Base):
    """A person at a client/company — a customer can have several (only one primary)."""

    __tablename__ = "commerce_customer_contacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    customer_id: Mapped[str] = mapped_column(String(36), ForeignKey("commerce_customers.id", ondelete="CASCADE"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
