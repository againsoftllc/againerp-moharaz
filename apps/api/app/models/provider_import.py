from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ProviderImportJob(Base):
    __tablename__ = "provider_import_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default", index=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    user_email: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    item_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    success_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    warning_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_label: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    api_response_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    items: Mapped[list["ProviderImportItem"]] = relationship(back_populates="job", cascade="all, delete-orphan")
    logs: Mapped[list["ProviderImportLog"]] = relationship(back_populates="job", cascade="all, delete-orphan")
    errors: Mapped[list["ProviderImportError"]] = relationship(back_populates="job", cascade="all, delete-orphan")
    history: Mapped[list["ProviderImportHistory"]] = relationship(back_populates="job", cascade="all, delete-orphan")


class ProviderImportItem(Base):
    __tablename__ = "provider_import_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("provider_import_jobs.id"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    provider_product_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="CNY")
    base_price: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    sale_price: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    brand_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    category_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    supplier_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    universal_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    validation_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    draft_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    warning_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    job: Mapped["ProviderImportJob"] = relationship(back_populates="items")
    images: Mapped[list["ProviderImportImage"]] = relationship(
        back_populates="item", cascade="all, delete-orphan"
    )
    variants: Mapped[list["ProviderImportVariant"]] = relationship(
        back_populates="item", cascade="all, delete-orphan"
    )
    errors: Mapped[list["ProviderImportError"]] = relationship(back_populates="item")
    history: Mapped[list["ProviderImportHistory"]] = relationship(back_populates="item")


class ProviderImportImage(Base):
    __tablename__ = "provider_import_images"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("provider_import_items.id"), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    local_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    item: Mapped["ProviderImportItem"] = relationship(back_populates="images")


class ProviderImportVariant(Base):
    __tablename__ = "provider_import_variants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("provider_import_items.id"), nullable=False, index=True
    )
    sku: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    barcode: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    price: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    sale_price: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    stock: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    weight: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    attributes_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    item: Mapped["ProviderImportItem"] = relationship(back_populates="variants")


class ProviderImportLog(Base):
    __tablename__ = "provider_import_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("provider_import_jobs.id"), nullable=False, index=True)
    item_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    level: Mapped[str] = mapped_column(String(10), nullable=False, default="info")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    context_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    job: Mapped["ProviderImportJob"] = relationship(back_populates="logs")


class ProviderImportError(Base):
    __tablename__ = "provider_import_errors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("provider_import_jobs.id"), nullable=False, index=True)
    item_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("provider_import_items.id"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    field: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False, default="error")
    details_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    job: Mapped["ProviderImportJob"] = relationship(back_populates="errors")
    item: Mapped[Optional["ProviderImportItem"]] = relationship(back_populates="errors")


class ProviderImportHistory(Base):
    __tablename__ = "provider_import_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("provider_import_jobs.id"), nullable=False, index=True)
    item_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("provider_import_items.id"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    actor_email: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    actor_role: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    from_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    to_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    snapshot_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    job: Mapped["ProviderImportJob"] = relationship(back_populates="history")
    item: Mapped[Optional["ProviderImportItem"]] = relationship(back_populates="history")
