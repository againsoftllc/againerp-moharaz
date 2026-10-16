from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MarketingOffer(Base):
    """Storefront deal landing page (countdown + category tabs + products)."""

    __tablename__ = "marketing_offers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    slug: Mapped[str] = mapped_column(String(160), nullable=False, unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    outlet_label: Mapped[str] = mapped_column(String(120), nullable=False, default="All Outlet")
    starts_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", index=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    products_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=12)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    sections: Mapped[list["MarketingOfferSection"]] = relationship(
        "MarketingOfferSection",
        back_populates="offer",
        cascade="all, delete-orphan",
        order_by="MarketingOfferSection.sort_order",
    )


class MarketingOfferSection(Base):
    """Category tab / product section within a deal page."""

    __tablename__ = "marketing_offer_sections"
    __table_args__ = (UniqueConstraint("offer_id", "key", name="uq_marketing_offer_section_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    offer_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("marketing_offers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(120), nullable=False)
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    category_slug: Mapped[str] = mapped_column(String(160), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    offer: Mapped["MarketingOffer"] = relationship("MarketingOffer", back_populates="sections")
