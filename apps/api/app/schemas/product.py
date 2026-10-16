from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def dump_tags(tags: Optional[List[str]]) -> str:
    return json.dumps(tags or [])


def load_tags(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


class ProductBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    # Inventory products are keyed by id: slug and SKU are optional on input — a
    # blank slug is derived from the name, a blank SKU is generated.
    slug: str = Field(default="", max_length=255)
    sku: str = Field(default="", max_length=100)
    model: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = None
    short_description: Optional[str] = None
    price: Decimal = Field(ge=0)
    compare_at_price: Optional[Decimal] = Field(default=None, ge=0)
    purchase_price: Optional[Decimal] = Field(default=None, ge=0)
    last_selling_price: Optional[Decimal] = Field(default=None, ge=0)
    stock: int = Field(default=0, ge=0)
    track_quantity: bool = Field(default=True)
    # Units carry serial numbers (phones, laptops): the sale line must name them.
    track_serial: bool = Field(default=False)
    barcode: Optional[str] = Field(default=None, max_length=100)
    barcode_type: str = Field(default="C128", pattern="^(C128|C39|EAN13|EAN8|UPCA|UPCE)$")
    not_for_selling: bool = Field(default=False)
    weight: Optional[str] = Field(default=None, max_length=50)
    tax_rate: Optional[Decimal] = Field(default=None, ge=0, le=100)
    tax_type: str = Field(default="exclusive", pattern="^(inclusive|exclusive)$")
    location_ids: List[str] = Field(default_factory=list)
    stock_status: Optional[str] = Field(default=None, pattern="^(in_stock|out_of_stock|pre_order|coming_soon)?$")
    status: str = Field(default="draft", pattern="^(draft|published|archived)$")
    product_type: str = Field(default="simple", pattern="^(simple|variable|digital|combo)$")
    visibility: str = Field(default="public", pattern="^(public|private)$")
    brand: Optional[str] = Field(default=None, max_length=100)
    category: Optional[str] = Field(default=None, max_length=100)
    brand_id: Optional[str] = None
    category_id: Optional[str] = None
    category_ids: List[str] = Field(default_factory=list)
    attribute_profile_id: Optional[str] = None
    thumbnail: Optional[str] = Field(default=None, max_length=500)
    seo_title: Optional[str] = Field(default=None, max_length=255)
    seo_description: Optional[str] = None
    focus_keyphrase: Optional[str] = Field(default=None, max_length=200)
    warranty: Optional[str] = Field(default=None, max_length=200)
    origin: Optional[str] = Field(default=None, max_length=200)
    alert_quantity: Optional[int] = Field(default=None, ge=0)
    unit_type: Optional[str] = Field(default=None, max_length=20)
    track_serial: Optional[bool] = Field(default=None)
    track_batch: Optional[bool] = Field(default=None)
    tracking_type: Optional[str] = Field(default=None, pattern="^(none|serial|batch)?$")
    tags: List[str] = Field(default_factory=list)
    custom_specs_json: Optional[str] = None
    variant_attributes_json: Optional[str] = None
    combo_components_json: Optional[str] = None
    source_url: Optional[str] = Field(default=None, max_length=1000)
    seller_info_json: Optional[str] = None
    dropship_meta_json: Optional[str] = None
    gallery_json: Optional[str] = None
    video_urls_json: Optional[str] = None

    @field_validator("tags", mode="before")
    @classmethod
    def coerce_tags(cls, value: Any) -> List[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return load_tags(value)
        return value


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, max_length=255)
    sku: Optional[str] = Field(default=None, max_length=100)
    model: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = None
    short_description: Optional[str] = None
    price: Optional[Decimal] = Field(default=None, ge=0)
    compare_at_price: Optional[Decimal] = Field(default=None, ge=0)
    purchase_price: Optional[Decimal] = Field(default=None, ge=0)
    last_selling_price: Optional[Decimal] = Field(default=None, ge=0)
    stock: Optional[int] = Field(default=None, ge=0)
    track_quantity: Optional[bool] = None
    barcode: Optional[str] = Field(default=None, max_length=100)
    barcode_type: Optional[str] = Field(default=None, pattern="^(C128|C39|EAN13|EAN8|UPCA|UPCE)?$")
    not_for_selling: Optional[bool] = None
    weight: Optional[str] = Field(default=None, max_length=50)
    tax_rate: Optional[Decimal] = Field(default=None, ge=0, le=100)
    tax_type: Optional[str] = Field(default=None, pattern="^(inclusive|exclusive)?$")
    location_ids: Optional[List[str]] = None
    stock_status: Optional[str] = Field(default=None, pattern="^(in_stock|out_of_stock|pre_order|coming_soon)?$")
    status: Optional[str] = Field(default=None, pattern="^(draft|published|archived)$")
    product_type: Optional[str] = Field(default=None, pattern="^(simple|variable|digital|combo)$")
    visibility: Optional[str] = Field(default=None, pattern="^(public|private)$")
    brand: Optional[str] = Field(default=None, max_length=100)
    category: Optional[str] = Field(default=None, max_length=100)
    brand_id: Optional[str] = None
    category_id: Optional[str] = None
    category_ids: Optional[List[str]] = None
    attribute_profile_id: Optional[str] = None
    thumbnail: Optional[str] = Field(default=None, max_length=500)
    seo_title: Optional[str] = Field(default=None, max_length=255)
    seo_description: Optional[str] = None
    focus_keyphrase: Optional[str] = Field(default=None, max_length=200)
    warranty: Optional[str] = Field(default=None, max_length=200)
    origin: Optional[str] = Field(default=None, max_length=200)
    alert_quantity: Optional[int] = Field(default=None, ge=0)
    unit_type: Optional[str] = Field(default=None, max_length=20)
    track_serial: Optional[bool] = None
    track_batch: Optional[bool] = None
    tracking_type: Optional[str] = Field(default=None, pattern="^(none|serial|batch)?$")
    tags: Optional[List[str]] = None
    custom_specs_json: Optional[str] = None
    variant_attributes_json: Optional[str] = None
    combo_components_json: Optional[str] = None
    source_url: Optional[str] = Field(default=None, max_length=1000)
    seller_info_json: Optional[str] = None
    dropship_meta_json: Optional[str] = None
    gallery_json: Optional[str] = None
    video_urls_json: Optional[str] = None


class ProductRead(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    # Reads must accept negative stock — "Allow negative stock" lets sales
    # drive on-hand below zero; the ge=0 on ProductBase only guards input.
    stock: int = 0

    id: str
    item_id: Optional[str] = Field(
        default=None,
        description="Universal Item SSOT id — authoritative identity key (ADR-014 P7).",
    )
    company_id: str
    created_at: datetime
    updated_at: datetime

    # P7: sku, name, status, product_type in ProductBase are API-compat mirrors of items.


class ProductVariantBrief(BaseModel):
    id: str
    sku: str
    name: str
    price: Decimal
    purchase_price: Optional[Decimal] = None
    stock: int
    status: str
    is_default: bool
    sort_order: int
    image_id: Optional[str] = None
    image_url: Optional[str] = None
    options_json: Optional[str] = None
    external_sku_id: Optional[str] = None


class ProductMediaBrief(BaseModel):
    id: str
    media_id: str
    url: str
    name: str
    media_type: str
    sort_order: int
    is_primary: bool


class ProductDetailRead(ProductRead):
    variants: List[ProductVariantBrief] = Field(default_factory=list)
    media: List[ProductMediaBrief] = Field(default_factory=list)
    has_inventory: bool = False
    ecommerce_publish_status: Optional[str] = None


class ProductListMeta(BaseModel):
    count: int
    page: int = 1
    per_page: int = 50


class ProductListResponse(BaseModel):
    data: List[ProductRead]
    meta: ProductListMeta
    errors: List[str] = []


class ProductResponse(BaseModel):
    data: ProductRead
    errors: List[str] = []


class ProductDetailResponse(BaseModel):
    data: ProductDetailRead
    errors: List[str] = []


class ProductMediaReplace(BaseModel):
    media_ids: List[str] = Field(default_factory=list)


class ProductSpecValueRead(BaseModel):
    attribute_id: str
    attribute_code: str
    attribute_name: str
    value: str
    sort_order: int = 0


class ProductSpecsRead(BaseModel):
    attribute_profile_id: Optional[str] = None
    values: List[ProductSpecValueRead] = Field(default_factory=list)


class ProductSpecValueUpsert(BaseModel):
    attribute_id: str
    value: str = ""
    sort_order: int = 0


class ProductSpecsReplace(BaseModel):
    attribute_profile_id: Optional[str] = None
    values: List[ProductSpecValueUpsert] = Field(default_factory=list)


class ProductSpecsResponse(BaseModel):
    data: ProductSpecsRead
    errors: List[str] = []


class ProductSlugCheckResponse(BaseModel):
    slug: str
    available: bool
    message: Optional[str] = None


class ProductInventoryUpsert(BaseModel):
    warehouse_id: str = Field(min_length=1)
    on_hand: Optional[int] = Field(default=None, ge=0)
    min_qty: int = Field(default=10, ge=0)
    unit_cost: Optional[Decimal] = Field(default=None, ge=0)
    # Serial-tracked items: one serial per unit; the quantity is their count.
    serial_numbers: Optional[List[str]] = None


class ProductInventoryRead(BaseModel):
    id: str
    warehouse_id: str
    warehouse_name: str
    variant_id: str
    on_hand: int
    min_qty: int
    unit_cost: Decimal
    serials_registered: int = 0


class ProductInventoryResponse(BaseModel):
    data: ProductInventoryRead
    errors: List[str] = []


class HealthResponse(BaseModel):
    status: str
    app: str
    env: str
    database: dict
