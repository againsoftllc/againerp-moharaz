from __future__ import annotations

from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field, HttpUrl


class ProductDraftSpecItem(BaseModel):
    label: str
    value: str


class ProductDraftSpecGroup(BaseModel):
    group: str
    items: List[ProductDraftSpecItem] = Field(default_factory=list)


class ProductDraftVariant(BaseModel):
    name: str = Field(max_length=255)
    sku: Optional[str] = Field(default=None, max_length=100)
    price: Optional[Decimal] = Field(default=None, ge=0)
    attributes: dict[str, str] = Field(default_factory=dict)
    image: Optional[str] = None


class ProductDraft(BaseModel):
    """Simplified CanonicalProduct — just the fields this catalog uses.

    Reference: againerp-center modules/ai-commerce-agent/CanonicalProduct.md.
    Filters and downloads are out of scope for this MVP importer.
    """

    name: str = Field(max_length=255)
    sku: Optional[str] = Field(default=None, max_length=100)
    model: Optional[str] = Field(default=None, max_length=200)
    short_description: Optional[str] = None
    description: Optional[str] = None
    brand_name: Optional[str] = Field(default=None, max_length=100)
    category_name: Optional[str] = Field(default=None, max_length=100)
    # Every existing catalog category the product fits (exact names from our own tree), so it
    # can sit in several at once — category_name stays the single best/primary one.
    category_names: List[str] = Field(default_factory=list)
    price: Optional[Decimal] = Field(default=None, ge=0)
    # the old / regular price when the page shows an offer (price is then the offer price)
    compare_at_price: Optional[Decimal] = Field(default=None, ge=0)
    # the source's availability: in_stock | out_of_stock | pre_order | coming_soon
    stock_status: Optional[str] = Field(default=None, max_length=20)
    currency: str = "BDT"
    warranty: Optional[str] = Field(default=None, max_length=200)
    origin: Optional[str] = Field(default=None, max_length=200)
    seller_site_name: Optional[str] = Field(default=None, max_length=200)
    images: List[str] = Field(default_factory=list)
    specifications: List[ProductDraftSpecGroup] = Field(default_factory=list)
    variants: List[ProductDraftVariant] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    seo_title: Optional[str] = Field(default=None, max_length=255)
    seo_description: Optional[str] = None
    source_url: Optional[str] = None
    # the source shop's own filters for this product's category ([{title, options}]) - read only when our catalog has no
    # specification profile for the category yet, to build one with its filters
    source_filters: list[dict] = Field(default_factory=list)
    confidence_notes: Optional[str] = None
    # the product's Remarks (staff-only note): where it came from + the source's own ids, so a second import of the same
    # source product is easy to spot - set by the importer, never by the model
    remarks: Optional[str] = None


class CatalogAiExtractRequest(BaseModel):
    url: HttpUrl


class CatalogAiExtractResponse(BaseModel):
    draft: ProductDraft
    matched_brand_id: Optional[str] = None
    matched_category_id: Optional[str] = None
    matched_category_ids: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class CatalogAiCreateRequest(BaseModel):
    draft: ProductDraft
    brand_id: Optional[str] = None
    category_id: Optional[str] = None
    category_ids: List[str] = Field(default_factory=list)
    create_brand_if_missing: bool = True
    create_category_if_missing: bool = True
    import_images: bool = True
    status: str = Field(default="draft", pattern="^(draft|published)$")


class CatalogAiCreateResponse(BaseModel):
    id: str
    sku: str
    slug: str
    name: str
    status: str
