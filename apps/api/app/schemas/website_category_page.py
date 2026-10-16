from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

LoadMode = Literal["load_more", "pagination"]
FilterLayout = Literal["drawer"]
SortOptionId = Literal["default", "price-asc", "price-desc"]
AvailabilityId = Literal["in_stock", "pre_order", "upcoming", "out_of_stock"]


class CatalogSettings(BaseModel):
    products_per_page: int = Field(16, ge=1, le=100)
    load_mode: LoadMode = "load_more"
    load_more_count: int = Field(10, ge=1, le=50)
    grid_cols_md: int = Field(3, ge=1, le=4)
    grid_cols_lg: int = Field(4, ge=1, le=6)
    default_sort: SortOptionId = "default"
    show_breadcrumbs: bool = True
    filter_layout: FilterLayout = "drawer"
    empty_title: str = "No products found"
    empty_message: str = (
        "Product listings for this category are being added. Please check back soon."
    )
    empty_filter_message: str = "No products match the selected filters."


class SortOption(BaseModel):
    id: SortOptionId
    label: str = ""
    hidden: bool = False


class SortingSection(BaseModel):
    hidden: bool = False
    options: List[SortOption] = Field(
        default_factory=lambda: [
            SortOption(id="default", label="Default"),
            SortOption(id="price-asc", label="Price (Low > High)"),
            SortOption(id="price-desc", label="Price (High > Low)"),
        ]
    )


class FilterPriceBlock(BaseModel):
    enabled: bool = True
    label: str = "Price Range"


class AvailabilityOption(BaseModel):
    id: AvailabilityId
    label: str = ""
    hidden: bool = False


class FilterAvailabilityBlock(BaseModel):
    enabled: bool = True
    label: str = "Availability"
    options: List[AvailabilityOption] = Field(
        default_factory=lambda: [
            AvailabilityOption(id="in_stock", label="In Stock"),
            AvailabilityOption(id="pre_order", label="Pre Order"),
            AvailabilityOption(id="upcoming", label="Up Coming"),
            AvailabilityOption(id="out_of_stock", label="Out of Stock"),
        ]
    )


class FiltersSection(BaseModel):
    hidden: bool = False
    button_label: str = "Filter By"
    price: FilterPriceBlock = Field(default_factory=FilterPriceBlock)
    availability: FilterAvailabilityBlock = Field(default_factory=FilterAvailabilityBlock)


class ProductCardSection(BaseModel):
    show_rating: bool = True
    show_review_count: bool = True
    show_compare_at: bool = True
    show_discount_badge: bool = True
    show_buy_now: bool = True
    show_wishlist: bool = True
    show_compare: bool = True


class StatsSection(BaseModel):
    hidden: bool = False


class DescriptionSection(BaseModel):
    hidden: bool = False
    collapse_enabled: bool = True
    title_template: str = "About {category}"
    body_html: str = ""


class CategoryPageContent(BaseModel):
    settings: CatalogSettings = Field(default_factory=CatalogSettings)
    sorting: SortingSection = Field(default_factory=SortingSection)
    filters: FiltersSection = Field(default_factory=FiltersSection)
    product_card: ProductCardSection = Field(default_factory=ProductCardSection)
    stats: StatsSection = Field(default_factory=StatsSection)
    description: DescriptionSection = Field(default_factory=DescriptionSection)


class WebsiteCategoryPageRead(BaseModel):
    id: str
    company_id: str
    content: CategoryPageContent
    created_at: datetime
    updated_at: datetime


class WebsiteCategoryPageUpdate(BaseModel):
    content: Optional[CategoryPageContent] = None


class WebsiteCategoryPageResponse(BaseModel):
    data: WebsiteCategoryPageRead
    errors: List[str] = []


class StorefrontCategoryPageResponse(BaseModel):
    data: CategoryPageContent
    errors: List[str] = []
