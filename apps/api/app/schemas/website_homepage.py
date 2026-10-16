from __future__ import annotations

from datetime import datetime
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field


class HeroSlide(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    image_url: str = Field(max_length=500)
    href: str = Field(default="/", max_length=500)
    alt: str = Field(default="", max_length=255)
    object_fit: Literal["fill", "fit"] = "fill"
    image_width: Optional[int] = Field(default=None, ge=1)
    image_height: Optional[int] = Field(default=None, ge=1)
    hidden: bool = False


class HeroSection(BaseModel):
    autoplay_ms: int = Field(default=3000, ge=0, le=60_000)
    slides: List[HeroSlide] = Field(default_factory=list)


class CategoryCarouselItem(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    category_id: str = Field(min_length=1, max_length=64)
    # Optional homepage override — empty uses catalog banner/icon.
    image_url: str = Field(default="", max_length=500)
    # Optional custom link — empty uses /{category.slug}.
    href: str = Field(default="", max_length=500)
    hidden: bool = False


class CategoriesSection(BaseModel):
    """Homepage category carousel. Empty items = automatic featured categories."""

    hidden: bool = False
    items: List[CategoryCarouselItem] = Field(default_factory=list)


class BannerSlide(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    image_url: str = Field(default="", max_length=500)
    href: str = Field(default="/", max_length=500)
    alt: str = Field(default="", max_length=255)
    object_fit: Literal["fill", "fit"] = "fill"
    image_width: Optional[int] = Field(default=None, ge=1)
    image_height: Optional[int] = Field(default=None, ge=1)
    hidden: bool = False


class BannersSection(BaseModel):
    """Homepage dual banner strip."""

    slides: List[BannerSlide] = Field(default_factory=list)


class FeaturedTab(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    title: str = Field(default="Featured", max_length=120)
    # default = auto feed from storefront; custom = product_ids list
    mode: Literal["default", "custom"] = "default"
    default_source: Literal["featured", "newest", "bestsellers"] = "featured"
    product_ids: List[str] = Field(default_factory=list)
    hidden: bool = False


class FeaturedProductsSection(BaseModel):
    """Homepage Most Wanted / featured product tabs."""

    title: str = Field(default="Most Wanted", max_length=200)
    subtitle: str = Field(default="Explore Our Best-Selling Deal", max_length=300)
    autoplay_ms: int = Field(default=0, ge=0, le=60_000)
    tabs: List[FeaturedTab] = Field(default_factory=list)


class BrandCarouselItem(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    brand_id: str = Field(min_length=1, max_length=64)
    # Optional homepage override — empty uses catalog logo.
    image_url: str = Field(default="", max_length=500)
    # Optional custom link — empty uses /{brand.slug}.
    href: str = Field(default="", max_length=500)
    hidden: bool = False


class BrandsSection(BaseModel):
    """Homepage brand strip. Empty items = all active catalog brands."""

    title: str = Field(default="Brands We Distribute", max_length=200)
    subtitle: str = Field(default="Official distributor of trusted brands.", max_length=300)
    autoplay_ms: int = Field(default=0, ge=0, le=60_000)
    items: List[BrandCarouselItem] = Field(default_factory=list)


class AboutSection(BaseModel):
    """Homepage about / company story box."""

    title: str = Field(default="Monarch IT Ltd", max_length=200)
    subtitle: str = Field(
        default="A Trusted Computer Distributor & Retailer in Bangladesh",
        max_length=300,
    )
    collapse_enabled: bool = True
    body_html: str = Field(default="")


class SupportSection(BaseModel):
    """Homepage support / contact strip."""

    title: str = Field(default="Support", max_length=200)
    subtitle: str = Field(default="Official distributor of trusted brands.", max_length=300)
    phone: str = Field(default="+8801332-812759", max_length=64)
    phone_href: str = Field(default="tel:+8801332812759", max_length=120)
    whatsapp: str = Field(default="+8801332-812764", max_length=64)
    whatsapp_href: str = Field(default="https://wa.me/8801332812764", max_length=300)
    hours: str = Field(default="10:00 AM - 08:00 PM", max_length=120)
    phone_icon_url: str = Field(default="", max_length=500)
    agent_image_url: str = Field(default="", max_length=500)
    store_label: str = Field(default="Store Locator", max_length=120)
    store_title: str = Field(default="Find our Stores", max_length=200)
    store_href: str = Field(default="/outlets", max_length=500)
    store_icon_url: str = Field(default="", max_length=500)


class SideMenuItem(BaseModel):
    """Floating left rail icon button."""

    id: str = Field(min_length=1, max_length=64)
    label: str = Field(default="", max_length=120)
    href: str = Field(default="#", max_length=500)
    # Optional Font Awesome class — when set, overrides icon_url
    icon: str = Field(default="", max_length=120)
    # Default image icon (original SVG / media)
    icon_url: str = Field(default="", max_length=500)
    active: bool = False
    hidden: bool = False


class SideMenuSection(BaseModel):
    """Storefront floating toolbar (left rail)."""

    enabled: bool = True
    logo_url: str = Field(default="", max_length=500)
    logo_href: str = Field(default="/", max_length=500)
    items: List[SideMenuItem] = Field(default_factory=list)


class HeaderLinkItem(BaseModel):
    """Header action link (Order Track / PC Builder)."""

    label: str = Field(default="", max_length=120)
    href: str = Field(default="/", max_length=500)
    icon: str = Field(default="", max_length=120)
    icon_url: str = Field(default="", max_length=500)
    hidden: bool = False


class HeaderMobileSection(BaseModel):
    """Storefront mobile header chrome (logo + search)."""

    enabled: bool = True
    logo_url: str = Field(default="", max_length=500)
    logo_href: str = Field(default="/", max_length=500)
    search_placeholder: str = Field(default="Search Products", max_length=120)


class HeaderSection(BaseModel):
    """Storefront header chrome — desktop fields + nested mobile."""

    enabled: bool = True
    logo_url: str = Field(default="", max_length=500)
    logo_href: str = Field(default="/", max_length=500)
    search_placeholder: str = Field(default="Search Products", max_length=120)
    order_track: HeaderLinkItem = Field(default_factory=HeaderLinkItem)
    pc_builder: HeaderLinkItem = Field(default_factory=HeaderLinkItem)
    mobile: HeaderMobileSection = Field(default_factory=HeaderMobileSection)


class FooterSocialItem(BaseModel):
    """Footer social icon link."""

    id: str = Field(..., max_length=40)
    icon: str = Field(default="", max_length=80)
    href: str = Field(default="#", max_length=500)


class FooterMobileSection(BaseModel):
    """Storefront mobile footer overrides."""

    enabled: bool = True
    logo_url: str = Field(default="", max_length=500)
    about_text: str = Field(default="", max_length=2000)
    hide_socials: bool = False
    hide_membership: bool = False
    hide_payment: bool = False


class FooterSection(BaseModel):
    """Storefront footer chrome — desktop fields + nested mobile; links via footer.links slot."""

    enabled: bool = True
    logo_url: str = Field(default="", max_length=500)
    about_text: str = Field(default="", max_length=2000)
    socials: List[FooterSocialItem] = Field(default_factory=list)
    links_title: str = Field(default="Important Links", max_length=120)
    membership_title: str = Field(default="Membership", max_length=120)
    membership_logo_url: str = Field(default="", max_length=500)
    head_office_text: str = Field(default="", max_length=1000)
    copyright_text: str = Field(default="", max_length=500)
    payment_image_url: str = Field(default="", max_length=500)
    mobile: FooterMobileSection = Field(default_factory=FooterMobileSection)


HomepageBodySectionType = Literal[
    "hero",
    "categories",
    "banners",
    "featured",
    "brands",
    "about",
    "support",
    # Legacy / extended Monarch-style homepage sections (stored in DB layout)
    "category_promo",
    "video_gallery",
    "gallery_carousel",
    "category_rails",
    "you_may_love",
]


class LayoutBlock(BaseModel):
    """Ordered homepage body section instance."""

    id: str = Field(..., min_length=1, max_length=64)
    # Accept known + future section keys so GET /homepage never 500s on older JSON.
    type: str = Field(..., min_length=1, max_length=64)
    hidden: bool = False


def default_homepage_layout() -> List[LayoutBlock]:
    return [
        LayoutBlock(id="hero", type="hero"),
        LayoutBlock(id="categories", type="categories"),
        LayoutBlock(id="banners", type="banners"),
        LayoutBlock(id="featured", type="featured"),
        LayoutBlock(id="brands", type="brands"),
        LayoutBlock(id="about", type="about"),
        LayoutBlock(id="support", type="support"),
    ]


class HomepageContent(BaseModel):
    model_config = {"extra": "ignore"}

    hero: HeroSection = Field(default_factory=HeroSection)
    categories: CategoriesSection = Field(default_factory=CategoriesSection)
    banners: BannersSection = Field(default_factory=BannersSection)
    featured: FeaturedProductsSection = Field(default_factory=FeaturedProductsSection)
    brands: BrandsSection = Field(default_factory=BrandsSection)
    about: AboutSection = Field(default_factory=AboutSection)
    support: SupportSection = Field(default_factory=SupportSection)
    side_menu: SideMenuSection = Field(default_factory=SideMenuSection)
    header: HeaderSection = Field(default_factory=HeaderSection)
    footer: FooterSection = Field(default_factory=FooterSection)
    layout: List[LayoutBlock] = Field(default_factory=default_homepage_layout)
    """Extra section instances keyed by layout id (primary ids use typed fields)."""
    blocks: dict[str, Any] = Field(default_factory=dict)


class WebsiteHomepageRead(BaseModel):
    id: str
    company_id: str
    content: HomepageContent
    created_at: datetime
    updated_at: datetime


class WebsiteHomepageUpdate(BaseModel):
    content: Optional[HomepageContent] = None


class WebsiteHomepageResponse(BaseModel):
    data: WebsiteHomepageRead
    errors: List[str] = []


class StorefrontHomepageResponse(BaseModel):
    data: HomepageContent
    errors: List[str] = []
