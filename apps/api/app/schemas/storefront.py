from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class StorefrontProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    item_id: str
    slug: str
    name: str
    price: Decimal
    compare_at_price: Optional[Decimal] = None
    stock: int
    track_quantity: bool = True
    stock_status: Optional[str] = None
    brand: str
    category: str
    thumbnail: Optional[str] = None
    in_stock: bool
    short_description: Optional[str] = None
    updated_at: Optional[datetime] = None
    featured: bool = False
    sku: Optional[str] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    # Filterable spec values keyed by attribute code (e.g. form_factor → mid_tower).
    filter_attributes: dict[str, str] = Field(default_factory=dict)


class StorefrontReviewRead(BaseModel):
    id: str
    customer_name: str
    rating: int
    title: str
    body: str
    created_at: datetime
    is_verified_purchase: bool = False
    helpful_votes: int = 0
    media_urls: List[str] = Field(default_factory=list)


class StorefrontQaRead(BaseModel):
    id: str
    customer_name: str
    question: str
    answer: Optional[str] = None
    answered_by: Optional[str] = None
    status: str
    is_verified: bool = False
    created_at: datetime


class StorefrontReviewCreate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=255)
    rating: int = Field(ge=1, le=5)
    body: str = Field(min_length=10, max_length=5000)
    title: Optional[str] = Field(default=None, max_length=255)


class StorefrontQaCreate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=255)
    question: str = Field(min_length=10, max_length=2000)


class StorefrontReviewCreateResponse(BaseModel):
    data: StorefrontReviewRead
    message: str = "Thanks! Your review was submitted and is pending approval."


class StorefrontQaCreateResponse(BaseModel):
    data: StorefrontQaRead
    message: str = "Thanks! Your question was submitted."


class StorefrontSpecItemRead(BaseModel):
    label: str
    value: str


class StorefrontSpecGroupRead(BaseModel):
    name: str
    specs: List[StorefrontSpecItemRead]


class StorefrontSellerInfoRead(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    store_name: Optional[str] = None
    level: Optional[float] = None
    delivery_score: Optional[float] = None
    item_score: Optional[float] = None
    service_score: Optional[float] = None


class StorefrontVariantOptionRead(BaseModel):
    name: str
    value: str
    image_url: Optional[str] = None


class StorefrontVariantRead(BaseModel):
    id: str
    sku: str
    name: str
    price: Decimal
    stock: int
    image_url: Optional[str] = None
    is_default: bool = False
    options: List[StorefrontVariantOptionRead] = Field(default_factory=list)
    weight_kg: Optional[float] = None


class StorefrontPriceTierRead(BaseModel):
    min_qty: int
    price_bdt: Decimal


class StorefrontProductDetailRead(StorefrontProductRead):
    full_description: Optional[str] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    brand_id: Optional[str] = None
    category_id: Optional[str] = None
    specifications: List[StorefrontSpecGroupRead] = Field(default_factory=list)
    gallery: List[str] = Field(default_factory=list)
    video_urls: List[str] = Field(default_factory=list)
    seller_info: Optional[StorefrontSellerInfoRead] = None
    source_url: Optional[str] = None
    variants: List[StorefrontVariantRead] = Field(default_factory=list)
    sales_volume: Optional[int] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    price_tiers: List[StorefrontPriceTierRead] = Field(default_factory=list)
    weight_kg: Optional[float] = None
    reviews: List[StorefrontReviewRead] = Field(default_factory=list)
    qa: List[StorefrontQaRead] = Field(default_factory=list)


class StorefrontProductDetailResponse(BaseModel):
    data: StorefrontProductDetailRead
    related: List[StorefrontProductRead] = Field(default_factory=list)


class StorefrontReviewListMeta(BaseModel):
    count: int
    average_rating: Optional[float] = None


class StorefrontReviewListResponse(BaseModel):
    data: List[StorefrontReviewRead]
    meta: StorefrontReviewListMeta


class StorefrontQaListMeta(BaseModel):
    count: int


class StorefrontQaListResponse(BaseModel):
    data: List[StorefrontQaRead]
    meta: StorefrontQaListMeta


class StorefrontProductListMeta(BaseModel):
    count: int
    page: int = 1
    per_page: int = 50


class StorefrontProductListResponse(BaseModel):
    data: List[StorefrontProductRead]
    meta: StorefrontProductListMeta


class StorefrontProductResponse(BaseModel):
    data: StorefrontProductRead


class StorefrontFacetBrandRead(BaseModel):
    id: str
    slug: str
    name: str
    count: int = 0


class StorefrontFacetAttributeOptionRead(BaseModel):
    value: str
    label: str
    count: int = 0


class StorefrontFacetAttributeRead(BaseModel):
    id: str
    code: str
    name: str
    display_type: str = "multi_select"
    options: List[StorefrontFacetAttributeOptionRead] = Field(default_factory=list)


class StorefrontFacetsRead(BaseModel):
    brands: List[StorefrontFacetBrandRead]
    price_min: Decimal
    price_max: Decimal
    attributes: List[StorefrontFacetAttributeRead] = Field(default_factory=list)


class StorefrontFacetsResponse(BaseModel):
    data: StorefrontFacetsRead

class StorefrontCartItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    item_id: str
    product_id: str
    variant_id: Optional[str] = None
    attributes: Optional[dict] = None
    slug: str
    sku: Optional[str] = None
    name: str
    variant_label: Optional[str] = None
    thumbnail: Optional[str] = None
    unit_price: Decimal
    compare_at_price: Optional[Decimal] = None
    quantity: int
    tax_amount: Decimal = Decimal("0")
    line_total: Decimal = Decimal("0")


class StorefrontCartIssueRead(BaseModel):
    cart_item_id: str
    item_id: str
    code: str
    message: str
    blocking: bool


class StorefrontCartRead(BaseModel):
    cart_token: str
    user_id: Optional[str] = None
    items: List[StorefrontCartItemRead]
    item_count: int
    subtotal: Decimal
    coupon_code: Optional[str] = None
    coupon_discount: Decimal = Decimal("0")
    ready_build_id: Optional[str] = None
    ready_build_discount: Decimal = Decimal("0")
    warehouse_id: Optional[str] = None
    tax_total: Decimal = Decimal("0")
    shipping_estimate: Decimal = Decimal("0")
    grand_total: Decimal = Decimal("0")
    valid: bool = True
    issues: List[StorefrontCartIssueRead] = Field(default_factory=list)


class StorefrontCartResponse(BaseModel):
    data: StorefrontCartRead


class StorefrontCartItemCreate(BaseModel):
    item_id: Optional[str] = Field(default=None, description="Universal item id (preferred)")
    product_id: Optional[str] = Field(default=None, description="Legacy catalog product id")
    variant_id: Optional[str] = None
    attributes: Optional[dict] = None
    quantity: int = Field(default=1, ge=1, le=99)


class StorefrontCartItemUpdate(BaseModel):
    quantity: int = Field(ge=0, le=99)


class StorefrontCartValidateRequest(BaseModel):
    sync_prices: bool = False


class StorefrontCartCouponApply(BaseModel):
    code: str = Field(min_length=1, max_length=64)


class StorefrontCartMergeResponse(BaseModel):
    data: StorefrontCartRead
    merged: bool = True


class StorefrontCheckoutAddress(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(default="", max_length=100)
    email: str = Field(default="", max_length=255)
    phone: str = Field(min_length=3, max_length=50)
    line1: str = Field(min_length=3, max_length=500)
    city: str = Field(min_length=1, max_length=100)
    region: str = Field(default="", max_length=100)
    postal_code: str = Field(default="", max_length=20)
    country: str = Field(default="Bangladesh", max_length=100)


class StorefrontCheckoutCreate(BaseModel):
    # many shoppers give only a mobile number: email and last name are optional
    email: str = Field(default="", max_length=255)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(default="", max_length=100)
    phone: str = Field(min_length=3, max_length=50)
    address: str = Field(min_length=3, max_length=500)
    district: str = Field(default="", max_length=100)
    postal_code: str = Field(default="", max_length=20)
    notes: Optional[str] = None
    payment_method: str = Field(default="cod", max_length=50)
    shipping_method: str = Field(default="standard", max_length=50)
    billing_same_as_shipping: bool = True
    billing_address: Optional[str] = None
    billing_city: Optional[str] = None
    billing_region: Optional[str] = None
    billing_postal_code: Optional[str] = None
    billing_country: Optional[str] = None
    shipping_address: Optional[str] = None
    shipping_city: Optional[str] = None
    shipping_region: Optional[str] = None
    shipping_postal_code: Optional[str] = None
    shipping_country: Optional[str] = None
    shipping_first_name: Optional[str] = None
    shipping_last_name: Optional[str] = None
    shipping_phone: Optional[str] = None
    coupon_code: Optional[str] = None
    customer_id: Optional[str] = None


class StorefrontCheckoutPreviewRequest(BaseModel):
    shipping_method: str = Field(default="standard", max_length=50)
    coupon_code: Optional[str] = None
    district: str = Field(default="", max_length=100)


class StorefrontCheckoutTotalsRead(BaseModel):
    subtotal: Decimal
    discount: Decimal
    tax: Decimal
    shipping: Decimal
    grand_total: Decimal
    coupon_code: Optional[str] = None


class StorefrontCheckoutPreviewResponse(BaseModel):
    data: StorefrontCheckoutTotalsRead


class StorefrontShippingOptionRead(BaseModel):
    id: str
    label: str
    eta: str
    base_price: Decimal
    free_over_threshold: bool = True
    pricing: str = "flat"
    rate_inside: Optional[Decimal] = None
    rate_outside: Optional[Decimal] = None
    rate_default: Optional[Decimal] = None
    district_rates: Optional[dict[str, Decimal]] = None
    zone_inside_label: Optional[str] = None
    zone_outside_label: Optional[str] = None
    free_threshold: Optional[Decimal] = None


class StorefrontPaymentOptionRead(BaseModel):
    id: str
    label: str
    description: str
    requires_gateway: bool = False
    plugin_id: str = "builtin"


class StorefrontEmiPlanRead(BaseModel):
    months: int
    charge_percent: float = 0


class StorefrontEmiBankRead(BaseModel):
    id: str
    name: str
    months: List[int] = []
    plans: List[StorefrontEmiPlanRead] = []


class StorefrontCheckoutOptionsRead(BaseModel):
    shipping_methods: List[StorefrontShippingOptionRead]
    payment_methods: List[StorefrontPaymentOptionRead]
    zones: List[str] = []
    inside_zones: List[str] = []
    district_rates: Optional[dict[str, Decimal]] = None
    free_threshold: Optional[Decimal] = None
    default_method: str = "standard"
    time_slots_enabled: bool = True
    reward_points_enabled: bool = False
    emi_banks: List[StorefrontEmiBankRead] = []
    tax_rate_percent: Decimal = Decimal("0")
    tax_label: str = "VAT"
    tax_included_in_price: bool = False


class StorefrontCheckoutOptionsResponse(BaseModel):
    data: StorefrontCheckoutOptionsRead


class StorefrontPreparedPaymentRead(BaseModel):
    payment_method: str
    amount: Decimal
    status: str
    provider: str
    requires_action: bool
    client_payload: dict


class StorefrontCheckoutRead(BaseModel):
    id: str
    order_number: str
    email: str
    grand_total: Decimal
    payment_method: str
    invoice_id: Optional[str] = None
    payment_record_id: Optional[str] = None
    prepared_payment: Optional[StorefrontPreparedPaymentRead] = None


class StorefrontCheckoutResponse(BaseModel):
    data: StorefrontCheckoutRead


class StorefrontOrderRead(BaseModel):
    id: str
    order_number: str
    status: str
    payment_status: str
    shipment_status: str
    grand_total: Decimal
    placed_at: datetime
    email: str


class StorefrontOrderResponse(BaseModel):
    data: StorefrontOrderRead


class StorefrontOrderTrackRequest(BaseModel):
    """Order number (ORD-…) or courier/consignment tracking number."""
    query: str = Field(min_length=3, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=50)
    email: Optional[str] = Field(default=None, max_length=255)


class StorefrontOrderTrackUpdate(BaseModel):
    time: str
    text: str


class StorefrontOrderTrackRead(BaseModel):
    order_number: str
    consignment_id: str
    status: str
    payment_status: str
    shipment_status: str
    payment_method: str
    grand_total: Decimal
    customer_name: str
    customer_phone: str
    shipping_address: str
    shipping_city: Optional[str] = None
    shipping_region: Optional[str] = None
    courier: Optional[str] = None
    tracking_url: Optional[str] = None
    placed_at: datetime
    progress_pct: int
    current_step: str
    steps: List[str]
    updates: List[StorefrontOrderTrackUpdate]


class StorefrontOrderTrackResponse(BaseModel):
    data: StorefrontOrderTrackRead


class StorefrontCategoryResolve(BaseModel):
    id: str
    slug: str
    name: str
    description: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    china_search_keyword: Optional[str] = None
    parent_id: Optional[str] = None
    show_price_comparison: bool = True


class StorefrontBrandResolve(BaseModel):
    id: str
    slug: str
    name: str
    description: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    logo_url: Optional[str] = None


class StorefrontSlugResolveResponse(BaseModel):
    type: str
    slug: str
    product: Optional[StorefrontProductDetailRead] = None
    category: Optional[StorefrontCategoryResolve] = None
    brand: Optional[StorefrontBrandResolve] = None
    related: List[StorefrontProductRead] = Field(default_factory=list)


class StorefrontCategoryNavNode(BaseModel):
    id: str
    slug: str
    name: str
    parent_id: Optional[str] = None
    icon_url: Optional[str] = None
    banner_url: Optional[str] = None
    show_in_top_menu: bool = False
    china_search_keyword: Optional[str] = None
    children: List["StorefrontCategoryNavNode"] = Field(default_factory=list)


class StorefrontCategoryNavResponse(BaseModel):
    data: List[StorefrontCategoryNavNode]


class StorefrontBrandNavRead(BaseModel):
    id: str
    slug: str
    name: str
    logo_url: Optional[str] = None


class StorefrontBrandNavResponse(BaseModel):
    data: List[StorefrontBrandNavRead]
