"""AI usage packages — monthly token allowances a company can subscribe to,
with an optional pay-as-you-go overage mode once the included allowance runs
out (mirrors Cursor's included-usage / on-demand model). Deliberately kept
local to this deployment (see AGAINERP_AI_OS_MASTER_PLAN.md §25 for why usage
tracking itself stayed billing-free until now — this is the follow-on request
that turns it into one)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, BigInteger, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AiPackage(Base):
    """A purchasable plan — e.g. Starter/Growth/Scale. Seeded, editable via admin."""

    __tablename__ = "ai_packages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    price_bdt: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    included_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class AiSubscription(Base):
    """One row per company — its current package and billing-period window."""

    __tablename__ = "ai_subscriptions"
    __table_args__ = (UniqueConstraint("company_id", name="uq_ai_subscriptions_company"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    package_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("ai_packages.id", ondelete="RESTRICT"), nullable=False
    )
    # Pay-as-you-go once included_tokens runs out, instead of hard-blocking until upgrade.
    on_demand_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    current_period_start: Mapped[date] = mapped_column(Date, nullable=False)
    current_period_end: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class AiOverageInvoice(Base):
    """An on-demand-usage bill for one billing period — unpaid blocks further
    on-demand usage until settled, exactly like the included allowance does."""

    __tablename__ = "ai_overage_invoices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    subscription_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("ai_subscriptions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    overage_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    amount_bdt: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="unpaid", index=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
