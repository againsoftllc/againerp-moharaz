from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

ENTITY_TYPES = frozenset({"brand", "category", "attribute", "supplier"})
MAPPING_STATUSES = frozenset(
    {
        "pending",
        "suggested",
        "auto_matched",
        "manual",
        "approved",
        "rejected",
        "conflict",
        "merged",
    }
)
MATCH_METHODS = frozenset({"none", "exact", "rule", "fuzzy", "ai", "manual"})


class ProviderEntityMapping(Base):
    """Provider → ERP entity mapping. Never auto-creates catalog masters."""

    __tablename__ = "provider_entity_mappings"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "entity_type",
            "provider_entity_id",
            name="uq_provider_entity_mapping_key",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    provider_entity_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    provider_name: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    provider_path_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    erp_entity_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    erp_entity_name: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    match_method: Mapped[str] = mapped_column(String(20), nullable=False, default="none")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    suggestion_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    conflict_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_item_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    merged_into_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("provider_entity_mappings.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    history: Mapped[list["ProviderMappingHistory"]] = relationship(
        back_populates="mapping", cascade="all, delete-orphan"
    )


class ProviderMappingRule(Base):
    """Rule-based mapping — provider-agnostic patterns."""

    __tablename__ = "provider_mapping_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    pattern_type: Mapped[str] = mapped_column(String(20), nullable=False, default="exact")
    pattern_value: Mapped[str] = mapped_column(String(500), nullable=False)
    erp_entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    erp_entity_name: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class ProviderMappingHistory(Base):
    """Audit trail for mapping actions."""

    __tablename__ = "provider_mapping_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    mapping_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("provider_entity_mappings.id"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    actor_email: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    actor_role: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    from_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    to_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    detail_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    mapping: Mapped["ProviderEntityMapping"] = relationship(back_populates="history")
