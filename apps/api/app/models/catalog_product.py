from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CatalogProduct(Base):
    """
    Catalog commerce extension — merchandising, pricing, taxonomy (ADR-014 P7).

    Identity fields (sku, name, status, product_type) are **deprecated mirrors**
    of `items`. Authoritative identity lives on `items`; this row is keyed by
    `item_id`. API responses resolve identity from items at read time.
    """

    __tablename__ = "catalog_products"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    item_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    name: Mapped[str] = mapped_column(String(255), nullable=False)  # P7 mirror — SSOT: items.name
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    sku: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)  # P7 mirror
    model: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # Internal note / remarks about the product — staff-only, never shown on the storefront.
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    compare_at_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    purchase_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    last_selling_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    track_quantity: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    not_for_selling: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    weight: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    tax_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    tax_type: Mapped[str] = mapped_column(String(20), nullable=False, default="exclusive")
    stock_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # P7 mirror — publish via ecommerce_items
    product_type: Mapped[str] = mapped_column(String(20), nullable=False, default="simple")  # P7 mirror — SSOT: items.item_type
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="public")
    brand: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    brand_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("catalog_brands.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    category_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("catalog_categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    attribute_profile_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("catalog_attribute_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    short_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    seo_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    seo_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    focus_keyphrase: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    warranty: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    origin: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    thumbnail: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    custom_specs_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Variant attribute definitions (name + ordered values + optional per-value image) —
    # persisted separately from custom_specs_json so the Variants tab survives reload.
    variant_attributes_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Combo product composition — list of {product_id, variant_id, product_name, sku,
    # quantity, unit_price, thumbnail}; only meaningful when product_type == "combo".
    combo_components_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Dropship / Elim enrichment (kept outside custom_specs so product-form saves cannot wipe them)
    source_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    seller_info_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dropship_meta_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Module visibility: a product belongs to the Inventory module's catalog and/or the Website module's product
    # list. Both default true (legacy rows); each module's "create" sets only its own flag, and adding a website
    # product to inventory is an explicit action (POST /catalog/products/add-to-inventory).
    in_inventory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true", index=True)
    on_website: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true", index=True)
    gallery_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # image URL list (CDN hotlinks)
    video_urls_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
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
    # who made the last change: filled for every save from the signed-in user (app/services/audit_actor.py), the AI chat included
    updated_by_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    updated_by_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
