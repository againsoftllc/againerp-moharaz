from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MarketingHappyHour(Base):
    """Time-boxed Happy Hour campaign (hand-picked products + campaign prices)."""

    __tablename__ = "marketing_happy_hours"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    slug: Mapped[str] = mapped_column(String(160), nullable=False, unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    subtitle: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    outlet_label: Mapped[str] = mapped_column(String(120), nullable=False, default="Online Only")
    starts_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    daily_start_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=22)
    daily_end_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", index=True)
    terms_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    sections: Mapped[list["MarketingHappyHourSection"]] = relationship(
        "MarketingHappyHourSection",
        back_populates="campaign",
        cascade="all, delete-orphan",
        order_by="MarketingHappyHourSection.sort_order",
    )


class MarketingHappyHourSection(Base):
    __tablename__ = "marketing_happy_hour_sections"
    __table_args__ = (UniqueConstraint("campaign_id", "key", name="uq_marketing_hh_section_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("marketing_happy_hours.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    key: Mapped[str] = mapped_column(String(120), nullable=False)
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    campaign: Mapped["MarketingHappyHour"] = relationship("MarketingHappyHour", back_populates="sections")
    deals: Mapped[list["MarketingHappyHourDeal"]] = relationship(
        "MarketingHappyHourDeal",
        back_populates="section",
        cascade="all, delete-orphan",
        order_by="MarketingHappyHourDeal.sort_order",
    )


class MarketingHappyHourDeal(Base):
    __tablename__ = "marketing_happy_hour_deals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    section_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("marketing_happy_hour_sections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_slug: Mapped[str] = mapped_column(String(200), nullable=False)
    offer_price: Mapped[float] = mapped_column(Float, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    section: Mapped["MarketingHappyHourSection"] = relationship(
        "MarketingHappyHourSection", back_populates="deals"
    )
