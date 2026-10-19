#!/usr/bin/env python3
"""Create tables and seed catalog data for AgainERP."""

import logging
from decimal import Decimal
from datetime import date, datetime
from pathlib import Path
from typing import Dict, Optional, Union

from sqlalchemy import text

from app.database import Base, SessionLocal, check_database_connection, engine
from app.models.core_sequence import CoreSequence  # noqa: F401 — register metadata
from app.models.finance_period import FinancePeriod  # noqa: F401 — register metadata
from app.models.approval_limit import ApprovalLimit  # noqa: F401 — register metadata
from app.models.ai_conversation import AiConversation, AiMessage  # noqa: F401 — register metadata
from app.models.ai_memory import AiMemory  # noqa: F401 — register metadata
from app.models.ai_preset import AiPreset, AiPresetVersion  # noqa: F401 — register metadata
from app.models.auth_session import AuthSession
from app.models.auth_user import AuthUser
from app.models.auth_role import AuthRole  # noqa: F401 — register metadata
from app.models.auth_role_permission import AuthRolePermission  # noqa: F401
from app.models.auth_user_role import AuthUserRole  # noqa: F401
from app.models.storefront_cart import StorefrontCart, StorefrontCartItem
from app.models.website_wishlist import WebsiteWishlist, WebsiteWishlistItem  # noqa: F401 — register metadata
from app.models.website_contact_submission import WebsiteContactSubmission  # noqa: F401 — register metadata
from app.models.website_chat import WebsiteChatConversation, WebsiteChatMessage  # noqa: F401 — register metadata
from app.models.storefront_customer_auth import (  # noqa: F401 — register metadata
    StorefrontCustomerCase,
    StorefrontCustomerIdentity,
    StorefrontCustomerSession,
    StorefrontOtpChallenge,
)
from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_attribute_group import CatalogAttributeGroup
from app.models.catalog_attribute_profile import CatalogAttributeProfile
from app.models.catalog_brand import CatalogBrand
from app.models.catalog_bundle import CatalogBundle  # noqa: F401 — register metadata
from app.models.catalog_collection import CatalogCollection
from app.models.configurator_build import ConfiguratorBuild
from app.models.configurator_category import ConfiguratorCategory
from app.models.configurator_profile import ConfiguratorProfile
from app.models.configurator_template import ConfiguratorTemplate, dump_components
from app.models.catalog_filter import CatalogFilter
from app.models.catalog_category import CatalogCategory
from app.models.catalog_product import CatalogProduct
from app.models.catalog_product_attribute_value import CatalogProductAttributeValue
from app.models.catalog_product_media import CatalogProductMedia
from app.models.marketing_audience import MarketingAudience
from app.models.marketing_campaign import MarketingCampaign
from app.models.marketing_journey import MarketingJourney
from app.models.marketing_coupon import MarketingCoupon
from app.models.marketing_happy_hour import (  # noqa: F401 — register metadata
    MarketingHappyHour,
    MarketingHappyHourDeal,
    MarketingHappyHourSection,
)
from app.models.marketing_offer import MarketingOffer, MarketingOfferSection  # noqa: F401
from app.models.seo_meta_record import SeoMetaRecord, dump_json as dump_json_list_seo
from app.models.seo_audit_issue import SeoAuditIssue
from app.models.seo_audit_run import SeoAuditRun
from app.models.seo_redirect import SeoRedirect
from app.models.seo_url_record import SeoUrlRecord
from app.models.media import Media
from app.models.catalog_product_review import CatalogProductReview
from app.models.catalog_product_qa import CatalogProductQa
from app.models.blog_post import BlogPost
from app.models.blog_post_product import BlogPostProduct
from app.models.blog_category import BlogCategory
from app.models.blog_category_post import BlogCategoryPost
from app.models.blog_comment import BlogComment
from app.models.blog_settings import BlogSettings, DEFAULT_BLOG_SETTINGS_ID
from app.models.website_page import WebsitePage, dump_json as website_dump_json
from app.models.website_layout import WebsiteLayout
from app.models.website_builder_document import (
    WebsiteBuilderDocument,
    dump_json as builder_dump_json,
)
from app.models.configurator_compatibility_rule import (
    ConfiguratorCompatibilityRule,
    dump_json as compatibility_dump_json,
)
from app.models.website_settings import DEFAULT_WEBSITE_SETTINGS_ID, WebsiteSettings
from app.models.workspace_site import WorkspaceSite  # noqa: F401 — register metadata
from app.models.website_homepage import (
    DEFAULT_ABOUT,
    DEFAULT_BANNERS,
    DEFAULT_BRANDS,
    DEFAULT_CATEGORIES,
    DEFAULT_FEATURED,
    DEFAULT_FOOTER,
    DEFAULT_HERO,
    DEFAULT_HEADER,
    DEFAULT_LAYOUT,
    DEFAULT_SIDE_MENU,
    DEFAULT_SUPPORT,
    DEFAULT_WEBSITE_HOMEPAGE_ID,
    WebsiteHomepage,
    dump_json as homepage_dump_json,
    load_json as homepage_load_json,
)
from app.services.website_homepage_service import ensure_homepage_category_pins
from app.models.website_category_page import (
    DEFAULT_WEBSITE_CATEGORY_PAGE_ID,
    WebsiteCategoryPage,
    dump_json as category_page_dump_json,
)
from app.services.website_category_page_service import (
    default_category_page_content,
    ensure_category_page,
)
from app.models.website_menu import WebsiteMenu, WebsiteMenuSlot
from app.services.website_menu_service import ensure_system_menus
from app.models.catalog_product_variant import CatalogProductVariant
from app.models.commerce_customer import CommerceCustomer
from app.models.ai_approval import AiApproval
from app.models.ai_audit_log import AiAuditLog
from app.models.again_drop_api_plugin import AgainDropApiPlugin
from app.models.bkash_plugin import BkashPayment, BkashPlugin  # noqa: F401 — register metadata
from app.models.sslcommerz_plugin import SslcommerzPayment, SslcommerzPlugin  # noqa: F401
from app.models.erp_billing import ErpBill, ErpBillPayment  # noqa: F401 — register metadata
from app.models.paypal_plugin import PaypalPayment, PaypalPlugin  # noqa: F401
from app.models.stripe_plugin import StripePayment, StripePlugin  # noqa: F401
from app.models.zkteco_plugin import ZktecoAttendanceLog, ZktecoPlugin  # noqa: F401
from app.models.hrm import *  # noqa: F401,F403 — register all hrm_* tables
from app.models.pathao_plugin import PathaoPlugin  # noqa: F401
from app.models.marketing_tracking_plugin import MarketingTrackingPlugin, MarketingTrackingSite  # noqa: F401
from app.models.cloudflare_plugin import CloudflarePlugin
from app.models.sms_gateway_plugin import SmsGatewayPlugin  # noqa: F401 — SMS gateway plugins
from app.models.ai_api_connection import AiApiConnection
from app.models.ai_provider import AiProvider
from app.models.ai_agent import AiAgent
from app.models.ai_tool import AiTool
from app.models.commerce_supplier import CommerceSupplier, dump_json as supplier_dump_json
from app.models.commerce_order import CommerceOrder, dump_json, load_json
from app.models.commerce_order_item import CommerceOrderItem
from app.models.commerce_order_address import CommerceOrderAddress
from app.models.commerce_order_event import CommerceOrderEvent
from app.models.commerce_order_shipment import CommerceOrderShipment
from app.models.commerce_order_return import CommerceOrderReturn
from app.models.commerce_order_refund import CommerceOrderRefund
from app.models.inventory_location import InventoryLocation
from app.models.inventory_serial import InventorySerial
from app.models.inventory_stock_count import InventoryStockCount, InventoryStockCountLine, InventoryStockCountSerial
from app.models.inventory_stock_adjustment import (  # noqa: F401 — register metadata
    InventoryStockAdjustment,
    InventoryStockAdjustmentEvent,
    InventoryStockAdjustmentLine,
    InventoryStockAdjustmentSerial,
)
from app.models.inventory_stock_transfer import (  # noqa: F401 — register metadata
    InventoryStockTransfer,
    InventoryStockTransferEvent,
    InventoryStockTransferLine,
    InventoryStockTransferSerial,
)
from app.models.inventory_stock_level import InventoryStockLevel
from app.models.inventory_reservation import InventoryReservation  # noqa: F401
from app.models.inventory_incoming import InventoryIncoming  # noqa: F401
from app.models.inventory_item_location import InventoryItemLocation  # noqa: F401 — register metadata
from app.models.inventory_warehouse import InventoryWarehouse
from app.models.inventory_stock_picking_type import InventoryStockPickingType
from app.models.inventory_stock_picking import InventoryStockPicking
from app.models.inventory_stock_move import InventoryStockMove
from app.models.inventory_stock_quant import InventoryStockQuant
from app.models.inventory_stock_scrap import InventoryStockScrap
from app.models.inventory_orderpoint import InventoryOrderpoint
from app.models.invoice import Invoice, InvoiceItem
from app.models.item import Item
from app.models.party import Party
from app.models.party_role import PartyRole
from app.models.party_contact import PartyContact
from app.models.party_address import PartyAddress
from app.models.party_document import PartyDocument
from app.models.party_bank_account import PartyBankAccount
from app.models.party_note import PartyNote
from app.models.inventory_item import InventoryItem
from app.models.inventory_stock_movement import InventoryStockMovement
from app.models.inventory_uom import InventoryUom
from app.models.ecommerce_item import EcommerceItem
from app.models.ecommerce_item_category import EcommerceItemCategory
from app.models.ecommerce_item_media import EcommerceItemMedia
from app.models.service_item import ServiceItem
from app.models.service_category import ServiceCategory
from app.models.provider_import import (
    ProviderImportError,
    ProviderImportHistory,
    ProviderImportImage,
    ProviderImportItem,
    ProviderImportJob,
    ProviderImportLog,
    ProviderImportVariant,
)
from app.models.provider_entity_mapping import (
    ProviderEntityMapping,
    ProviderMappingHistory,
    ProviderMappingRule,
)
from app.models.manufacturing_item import ManufacturingItem
from app.models.supplier_link import SupplierLink
from app.models.supplier_user import SupplierUser, SupplierSession  # noqa: F401 — register metadata
from app.models.rma import (  # noqa: F401 — register metadata
    RmaTicket,
    RmaCharge,
    RmaSupplierJob,
    RmaStatusHistory,
    RmaReason,
)
from app.models.service_job import ServiceJob, ServiceJobHistory, ServiceJobLine  # noqa: F401
from app.models.supplier_product import SupplierProduct
from app.models.supplier_price_list import SupplierPriceList
from app.models.vendor import (  # noqa: F401 — register metadata
    Vendor,
    VendorCart,
    VendorCartItem,
    VendorGroup,
    VendorInvoice,
    VendorNegotiation,
    VendorNotification,
    VendorOrderRequest,
    VendorOrderRequestItem,
    VendorPriceList,
    VendorPriceListItem,
    VendorProductPrice,
    VendorQuotation,
    VendorQuotationItem,
    VendorType,
    VendorSession,
    VendorUser,
)
from app.models.collab_ownership import CollabOwnership
from app.models.collab_activity import CollabActivity
from app.models.collab_comment import CollabComment
from app.models.collab_label import CollabLabel
from app.models.collab_file import CollabFile
from app.models.collab_ai_note import CollabAiNote
from app.models.collab_approval_state import CollabApprovalState
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatusHistory
from app.models.purchase_rfq import (  # noqa: F401 — register metadata
    PurchaseRfq,
    PurchaseRfqInvite,
    PurchaseRfqLine,
    PurchaseRfqQuote,
    PurchaseRfqQuoteLine,
    PurchaseRfqStatusHistory,
)
from app.models.purchase_receipt import PurchaseReceipt, PurchaseReceiptLine
from app.models.purchase_return import PurchaseReturn, PurchaseReturnLine
from app.models.sales import (
    CustomerItemPrice,
    SalesDelivery,
    SalesOrder,
    SalesQuotation,
)
from app.models.sales_return import SalesReturn, SalesReturnLine  # noqa: F401
from app.models.sales_edit_request import SalesOrderEditRequest  # noqa: F401
from app.models.inventory_setting import InventorySetting  # noqa: F401
from app.models.pos import PosCart, PosCashMovement, PosReceipt, PosReturn, PosSession, PosSetting, PosTerminal
from app.models.finance import FinanceAccount, FinancePayment
from app.schemas.attribute_profile import dump_json_list
from app.security import hash_password
from app.services.inventory.stock_status import compute_stock_status as _compute_stock_status
from scripts.auth_seed_data import AUTH_USERS_SEED
from scripts.meta_seed_data import META_SEED
from scripts.redirect_seed_data import REDIRECT_SEED
from scripts.journey_seed_data import JOURNEY_SEED
from scripts.audience_seed_data import AUDIENCE_SEED
from scripts.campaign_seed_data import CAMPAIGN_SEED
from scripts.coupon_seed_data import COUPON_SEED
from scripts.customer_seed_data import CUSTOMER_SEED
from scripts.ai_approval_seed_data import AI_APPROVAL_SEED
from scripts.ai_audit_log_seed_data import AI_AUDIT_LOG_SEED
from scripts.ai_connection_seed_data import AI_CONNECTION_SEED
from scripts.ai_provider_seed_data import AI_PROVIDER_SEED
from scripts.ai_agent_seed_data import AI_AGENT_SEED
from scripts.ai_tool_seed_data import AI_TOOL_SEED
from scripts.supplier_seed_data import SUPPLIER_SEED
from scripts.seed_data import (
    ATTRIBUTE_PROFILE_SEED,
    BRAND_SEED,
    CATALOG_SEED,
    CATEGORY_SEED,
    COLLECTION_SEED,
    CONFIGURATOR_BUILD_SEED,
    CONFIGURATOR_CATEGORY_SEED,
    CONFIGURATOR_PROFILE_SEED,
    CONFIGURATOR_TEMPLATE_SEED,
    FILTER_SEED,
    MEDIA_SEED,
    WAREHOUSE_SEED,
)


def seed_products(db) -> int:
    existing_slugs = {
        row[0]
        for row in db.query(CatalogProduct.slug).all()
    }
    inserted = 0
    for item in CATALOG_SEED:
        if item["slug"] in existing_slugs:
            continue
        db.add(CatalogProduct(**item))
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def _apply_path_depth(row: CatalogCategory, parent: Optional[CatalogCategory]) -> None:
    if parent:
        row.parent_id = parent.id
        row.depth = parent.depth + 1
        row.path = f"{parent.path}{row.id}/"
    else:
        row.parent_id = None
        row.depth = 0
        row.path = f"/{row.id}/"


def seed_categories(db) -> int:
    slug_to_id: Dict[str, str] = {
        slug: cat_id for slug, cat_id in db.query(CatalogCategory.slug, CatalogCategory.id).all()
    }
    inserted = 0
    updated = 0
    for item in CATEGORY_SEED:
        existing_id = slug_to_id.get(item["slug"])
        parent: Optional[CatalogCategory] = None
        parent_slug = item.get("parent_slug")
        if parent_slug:
            parent_id = slug_to_id.get(parent_slug)
            if parent_id:
                parent = db.get(CatalogCategory, parent_id)

        if existing_id:
            row = db.get(CatalogCategory, existing_id)
            if not row:
                continue
            changed = False
            if item.get("china_search_keyword") and row.china_search_keyword != item["china_search_keyword"]:
                row.china_search_keyword = item["china_search_keyword"]
                changed = True
            if item.get("sort_order") is not None and row.sort_order != item["sort_order"]:
                row.sort_order = item["sort_order"]
                changed = True
            if item.get("show_in_top_menu") is not None and row.show_in_top_menu != item["show_in_top_menu"]:
                row.show_in_top_menu = bool(item["show_in_top_menu"])
                changed = True
            if item.get("name") and row.name != item["name"]:
                row.name = item["name"]
                changed = True
            if item.get("caption") and row.caption != (item.get("caption") or item["name"]):
                row.caption = item.get("caption") or item["name"]
                changed = True
            if getattr(row, "channel", None) != "dropshipping":
                row.channel = "dropshipping"
                changed = True
            desired_parent_id = parent.id if parent else None
            if row.parent_id != desired_parent_id:
                _apply_path_depth(row, parent)
                changed = True
            if changed:
                updated += 1
            continue

        row = CatalogCategory(
            name=item["name"],
            caption=item.get("caption") or item["name"],
            slug=item["slug"],
            sort_order=item.get("sort_order", 0),
            is_active=item.get("is_active", True),
            show_in_top_menu=item.get("show_in_top_menu", False),
            description=item.get("description"),
            meta_title=item.get("meta_title"),
            meta_description=item.get("meta_description"),
            meta_keywords=item.get("meta_keywords"),
            icon_url=item.get("icon_url"),
            banner_url=item.get("banner_url"),
            china_search_keyword=item.get("china_search_keyword"),
            channel="dropshipping",
        )
        db.add(row)
        db.flush()
        _apply_path_depth(row, parent)
        slug_to_id[row.slug] = row.id
        inserted += 1

    if inserted or updated:
        db.commit()
    return inserted


def seed_catalog_channel_categories(db) -> int:
    """Upsert an admin Catalog-channel tree (mirrors CATEGORY_SEED, separate slugs).

    Dropshipping frontstore keeps CATEGORY_SEED slugs; Catalog admin uses `erp-{slug}`
    so `/catalog/categories?channel=catalog` is not empty.
    """
    slug_to_id: Dict[str, str] = {
        slug: cat_id for slug, cat_id in db.query(CatalogCategory.slug, CatalogCategory.id).all()
    }
    upserted = 0
    for item in CATEGORY_SEED:
        catalog_slug = f"erp-{item['slug']}"
        parent: Optional[CatalogCategory] = None
        parent_slug = item.get("parent_slug")
        if parent_slug:
            parent_id = slug_to_id.get(f"erp-{parent_slug}")
            if parent_id:
                parent = db.get(CatalogCategory, parent_id)

        existing_id = slug_to_id.get(catalog_slug)
        if existing_id:
            row = db.get(CatalogCategory, existing_id)
            if not row:
                continue
            row.name = item["name"]
            row.caption = item.get("caption") or item["name"]
            row.sort_order = item.get("sort_order", 0)
            row.is_active = item.get("is_active", True)
            row.show_in_top_menu = bool(item.get("show_in_top_menu", False))
            row.description = item.get("description")
            row.meta_title = item.get("meta_title")
            row.meta_description = item.get("meta_description")
            row.meta_keywords = item.get("meta_keywords")
            row.icon_url = item.get("icon_url")
            row.banner_url = item.get("banner_url")
            row.china_search_keyword = item.get("china_search_keyword")
            row.channel = "catalog"
            desired_parent_id = parent.id if parent else None
            if row.parent_id != desired_parent_id:
                _apply_path_depth(row, parent)
            upserted += 1
            continue

        row = CatalogCategory(
            name=item["name"],
            caption=item.get("caption") or item["name"],
            slug=catalog_slug,
            sort_order=item.get("sort_order", 0),
            is_active=item.get("is_active", True),
            show_in_top_menu=item.get("show_in_top_menu", False),
            description=item.get("description"),
            meta_title=item.get("meta_title"),
            meta_description=item.get("meta_description"),
            meta_keywords=item.get("meta_keywords"),
            icon_url=item.get("icon_url"),
            banner_url=item.get("banner_url"),
            china_search_keyword=item.get("china_search_keyword"),
            channel="catalog",
        )
        db.add(row)
        db.flush()
        _apply_path_depth(row, parent)
        slug_to_id[row.slug] = row.id
        upserted += 1

    if upserted:
        db.commit()
    return upserted


def seed_brands(db) -> int:
    existing_slugs = {
        slug for slug, in db.query(CatalogBrand.slug).all()
    }
    inserted = 0
    for item in BRAND_SEED:
        if item["slug"] in existing_slugs:
            row = db.query(CatalogBrand).filter(CatalogBrand.slug == item["slug"]).first()
            if row and getattr(row, "channel", None) != "dropshipping":
                row.channel = "dropshipping"
            continue
        payload = {**item, "channel": item.get("channel", "dropshipping")}
        db.add(CatalogBrand(**payload))
        inserted += 1
    db.commit()
    return inserted


def seed_catalog_channel_brands(db) -> int:
    """Upsert admin Catalog-channel brands (mirrors BRAND_SEED, `erp-{slug}`)."""
    by_slug = {
        slug: row
        for slug, row in (
            (b.slug, b) for b in db.query(CatalogBrand).all()
        )
    }
    upserted = 0
    for item in BRAND_SEED:
        catalog_slug = f"erp-{item['slug']}"
        row = by_slug.get(catalog_slug)
        if row is None:
            row = CatalogBrand(slug=catalog_slug)
            db.add(row)
            by_slug[catalog_slug] = row
        row.name = item["name"]
        row.sort_order = item.get("sort_order", 0)
        row.is_active = item.get("is_active", True)
        row.description = item.get("description")
        row.website = item.get("website")
        row.meta_title = item.get("meta_title")
        row.meta_description = item.get("meta_description")
        row.meta_keywords = item.get("meta_keywords")
        row.logo_url = item.get("logo_url")
        row.banner_url = item.get("banner_url")
        row.logo_media_id = item.get("logo_media_id")
        row.banner_media_id = item.get("banner_media_id")
        row.channel = "catalog"
        upserted += 1

    if upserted:
        db.commit()
    return upserted


def _parse_optional_date(value: Optional[Union[str, date]]) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def seed_collections(db) -> int:
    existing_slugs = {
        slug for slug, in db.query(CatalogCollection.slug).all()
    }
    inserted = 0
    for item in COLLECTION_SEED:
        if item["slug"] in existing_slugs:
            continue
        payload = dict(item)
        payload["schedule_start"] = _parse_optional_date(payload.get("schedule_start"))
        payload["schedule_end"] = _parse_optional_date(payload.get("schedule_end"))
        db.add(CatalogCollection(**payload))
        inserted += 1
    if inserted:
        db.commit()
    return inserted


BLOG_MOCK_CATEGORY_SLUGS = frozenset({
    "buying-guides",
    "consulting",
    "delivery",
    "installation",
    "support",
    "ad-campaign-consulting",
    "seo-consulting",
})

BLOG_MOCK_ARTICLE_SLUGS = frozenset({
    "best-gaming-laptops-2026",
    "mechanical-keyboard-buying-guide",
    "home-office-monitor-setup",
})


def blog_has_mock_seed(db) -> bool:
    """True when legacy demo blog rows are still present."""
    category_slugs = {row[0] for row in db.query(BlogCategory.slug).all()}
    article_slugs = {row[0] for row in db.query(BlogPost.slug).all()}
    return bool(category_slugs & BLOG_MOCK_CATEGORY_SLUGS or article_slugs & BLOG_MOCK_ARTICLE_SLUGS)


def clear_blog_content(db) -> None:
    """Remove blog posts/categories and dependent rows (keeps blog_settings)."""
    db.query(BlogComment).delete(synchronize_session=False)
    db.query(BlogPostProduct).delete(synchronize_session=False)
    db.query(BlogCategoryPost).delete(synchronize_session=False)
    db.query(BlogPost).delete(synchronize_session=False)
    db.query(BlogCategory).delete(synchronize_session=False)
    db.commit()


def seed_blog_categories_from_catalog(db) -> int:
    """Seed blog categories from catalog_categories (real store taxonomy)."""
    if db.query(BlogCategory).count() > 0:
        return 0

    catalog_rows = (
        db.query(CatalogCategory)
        .order_by(CatalogCategory.sort_order, CatalogCategory.name)
        .all()
    )
    if not catalog_rows:
        return 0

    catalog_to_blog: dict[str, str] = {}
    for row in catalog_rows:
        blog_row = BlogCategory(
            name=row.name,
            slug=row.slug,
            description=row.description or f"Articles and guides about {row.name}.",
            status="active" if row.is_active else "inactive",
            sort_order=row.sort_order,
            cover_image_url=row.banner_url or row.icon_url,
            seo_title=row.meta_title,
            seo_description=row.meta_description,
        )
        db.add(blog_row)
        db.flush()
        catalog_to_blog[row.id] = blog_row.id

    for row in catalog_rows:
        if not row.parent_id:
            continue
        parent_blog_id = catalog_to_blog.get(row.parent_id)
        blog_id = catalog_to_blog.get(row.id)
        if not parent_blog_id or not blog_id:
            continue
        blog_row = db.get(BlogCategory, blog_id)
        if blog_row:
            blog_row.parent_id = parent_blog_id

    db.commit()
    return len(catalog_rows)


def seed_blog_articles_from_catalog(db) -> int:
    """Seed blog articles from published catalog products grouped by category."""
    if db.query(BlogPost).count() > 0:
        return 0

    products = (
        db.query(CatalogProduct)
        .filter(CatalogProduct.status == "published")
        .order_by(CatalogProduct.category, CatalogProduct.name)
        .all()
    )
    if len(products) < 3:
        return 0

    blog_categories = {row.slug: row for row in db.query(BlogCategory).all()}
    catalog_categories = {row.id: row for row in db.query(CatalogCategory).all()}

    grouped: dict[str, list[CatalogProduct]] = {}
    for product in products:
        key = str(product.category_id or product.category or "general")
        grouped.setdefault(key, []).append(product)

    ranked_groups = sorted(
        ((key, rows) for key, rows in grouped.items() if key != "general" and rows),
        key=lambda item: len(item[1]),
        reverse=True,
    )

    now = datetime.utcnow()
    inserted = 0

    for group_key, group_products in ranked_groups[:6]:

        blog_cat = None
        category_name = group_products[0].category or "Catalog"
        category_slug = category_name.lower().replace(" ", "-")

        if group_key in catalog_categories:
            catalog_cat = catalog_categories[group_key]
            blog_cat = blog_categories.get(catalog_cat.slug)
            category_name = catalog_cat.name
            category_slug = catalog_cat.slug
        elif group_key != "general":
            category_name = group_key
            category_slug = group_key.lower().replace(" ", "-")
            blog_cat = blog_categories.get(category_slug)

        if not blog_cat:
            blog_cat = blog_categories.get(category_slug)

        lead = group_products[0]
        title = f"Top {category_name} — Our Catalog Picks"
        slug = f"top-{category_slug}-catalog-picks"
        if db.query(BlogPost).filter(BlogPost.slug == slug).first():
            continue

        names = ", ".join(p.name for p in group_products[:3])
        excerpt = lead.short_description or lead.description or f"Explore {category_name}: {names}."
        content = lead.description or (
            f"<p>Our team selected the best {category_name.lower()} from the AgainERP catalog.</p>"
            f"<p>Featured products: {names}.</p>"
        )
        cover = lead.thumbnail

        row = BlogPost(
            title=title,
            slug=slug,
            excerpt=excerpt[:500] if excerpt else None,
            content=content,
            status="published" if inserted < 2 else "draft",
            category_id=blog_cat.id if blog_cat else None,
            category_name=blog_cat.name if blog_cat else category_name,
            author_name="AgainERP Team",
            cover_image_url=cover,
            seo_title=f"{title} | AgainERP Blog",
            seo_description=(excerpt or title)[:300],
            published_at=now if inserted < 2 else None,
        )
        db.add(row)
        db.flush()

        for index, product in enumerate(group_products[:5]):
            db.add(
                BlogPostProduct(
                    post_id=row.id,
                    product_id=product.id,
                    sort_order=index,
                )
            )
        inserted += 1

    if inserted:
        db.commit()
    return inserted


def reseed_blog_from_catalog(db) -> dict[str, int]:
    """Replace legacy mock blog rows with catalog-backed categories and articles."""
    clear_blog_content(db)
    categories = seed_blog_categories_from_catalog(db)
    articles = seed_blog_articles_from_catalog(db)
    backfill_blog_post_categories(db)
    comments = seed_blog_comments_from_catalog(db)
    return {
        "categories": categories,
        "articles": articles,
        "comments": comments,
    }


def seed_blog_categories(db) -> int:
    """Seed blog categories — delegates to catalog taxonomy."""
    return seed_blog_categories_from_catalog(db)


def backfill_blog_category_mock_tree(db) -> int:
    """Deprecated — mock tree removed; blog categories come from catalog."""
    return 0


def backfill_blog_post_categories(db) -> int:
    """Link articles to blog categories using category_name when category_id is missing."""
    categories = db.query(BlogCategory).all()
    if not categories:
        return 0
    by_name = {c.name: c for c in categories}
    by_slug = {c.slug: c for c in categories}
    updated = 0
    for post in db.query(BlogPost).filter(BlogPost.category_id.is_(None)).all():
        category = None
        if post.category_name:
            category = by_name.get(post.category_name)
        if not category and post.category_name:
            slug_guess = post.category_name.lower().replace(" ", "-")
            category = by_slug.get(slug_guess)
        if not category:
            continue
        post.category_id = category.id
        post.category_name = category.name
        updated += 1
    if updated:
        db.commit()
    return updated


def seed_blog(db) -> int:
    """Seed blog articles — delegates to catalog products."""
    return seed_blog_articles_from_catalog(db)


def seed_blog_comments_from_catalog(db) -> int:
    """Seed moderation comments on the first catalog-backed articles."""
    if db.query(BlogComment).count() > 0:
        return 0

    posts = db.query(BlogPost).order_by(BlogPost.created_at).limit(3).all()
    if not posts:
        return 0

    templates = [
        {
            "author_name": "Rahim Uddin",
            "author_email": "rahim@example.com",
            "body": "This was helpful — do you have stock updates for these products?",
            "status": "pending",
        },
        {
            "author_name": "Fatima Khan",
            "author_email": "fatima@example.com",
            "body": "Thanks for linking the catalog products directly.",
            "status": "approved",
            "moderated_by": "Admin",
        },
        {
            "author_name": "Karim Ahmed",
            "author_email": "karim@example.com",
            "body": "Could you add more comparison details between the top picks?",
            "status": "pending",
        },
        {
            "author_name": "Spam Bot",
            "author_email": "spam@fake.io",
            "body": "Buy cheap products at http://spam.example — best deals!!!",
            "status": "spam",
            "moderated_by": "Admin",
        },
        {
            "author_name": "Nusrat Jahan",
            "author_email": "nusrat@example.com",
            "body": "Great roundup — which option is best for everyday office use?",
            "status": "approved",
            "moderated_by": "AgainERP Team",
        },
    ]

    inserted = 0
    for index, post in enumerate(posts):
        for offset, template in enumerate(templates[index : index + 2]):
            db.add(
                BlogComment(
                    post_id=post.id,
                    article_title=post.title,
                    **template,
                )
            )
            inserted += 1
            if offset == 1:
                break

    if inserted:
        db.commit()
    return inserted


def seed_blog_comments(db) -> int:
    """Seed blog comments — delegates to catalog-backed articles."""
    return seed_blog_comments_from_catalog(db)


def seed_blog_settings(db) -> int:
    """Ensure singleton blog configuration row exists."""
    if db.get(BlogSettings, DEFAULT_BLOG_SETTINGS_ID):
        return 0
    db.add(BlogSettings(id=DEFAULT_BLOG_SETTINGS_ID))
    db.commit()
    return 1


def seed_website_settings(db) -> int:
    """Ensure singleton website configuration row exists."""
    if db.get(WebsiteSettings, DEFAULT_WEBSITE_SETTINGS_ID):
        return 0
    db.add(
        WebsiteSettings(
            id=DEFAULT_WEBSITE_SETTINGS_ID,
            site_name="AgainERP",
            tagline="Modern ERP for Bangladeshi businesses",
            logo_url="",
            logo_mobile_url="",
            favicon_url="",
            address="",
            contact_phone="",
            contact_email="",
            whatsapp_number="",
            copyright_text="© 2026 AgainERP. All rights reserved.",
        )
    )
    db.commit()
    return 1


def seed_website_homepage(db) -> int:
    """Ensure singleton storefront homepage content is Monarch-branded (upsert defaults)."""
    from app.services.website_homepage_service import (
        default_homepage_content,
        ensure_homepage_category_pins,
    )

    row = db.get(WebsiteHomepage, DEFAULT_WEBSITE_HOMEPAGE_ID)
    payload = default_homepage_content()
    # Keep previously pinned category/brand items when present.
    if row is not None:
        existing = homepage_load_json(row.content_json, {})
        if isinstance(existing, dict):
            cats = existing.get("categories")
            if isinstance(cats, dict) and isinstance(cats.get("items"), list) and cats["items"]:
                payload["categories"] = cats
            brands = existing.get("brands")
            if (
                isinstance(brands, dict)
                and isinstance(brands.get("items"), list)
                and brands["items"]
            ):
                payload["brands"] = {
                    **payload["brands"],
                    "items": brands["items"],
                    "title": brands.get("title") or payload["brands"]["title"],
                    "subtitle": brands.get("subtitle") or payload["brands"]["subtitle"],
                    "autoplay_ms": brands.get("autoplay_ms", payload["brands"]["autoplay_ms"]),
                }
            featured = existing.get("featured")
            if isinstance(featured, dict):
                payload["featured"] = {
                    **payload["featured"],
                    **{
                        k: featured[k]
                        for k in ("title", "subtitle", "autoplay_ms", "tabs")
                        if k in featured
                    },
                }

    inserted = 0
    if row is None:
        db.add(
            WebsiteHomepage(
                id=DEFAULT_WEBSITE_HOMEPAGE_ID,
                content_json=homepage_dump_json(payload),
            )
        )
        inserted = 1
    else:
        row.content_json = homepage_dump_json(payload)
        inserted = 1
    db.commit()
    ensure_homepage_category_pins(db)
    return inserted


def seed_website_category_page(db) -> int:
    """Ensure singleton category/brand PLP template exists."""
    existed = db.get(WebsiteCategoryPage, DEFAULT_WEBSITE_CATEGORY_PAGE_ID) is not None
    if not existed:
        db.add(
            WebsiteCategoryPage(
                id=DEFAULT_WEBSITE_CATEGORY_PAGE_ID,
                content_json=category_page_dump_json(default_category_page_content()),
            )
        )
        db.commit()
        return 1
    ensure_category_page(db)
    return 0


def load_json_homepage_items(db) -> list:
    row = db.get(WebsiteHomepage, DEFAULT_WEBSITE_HOMEPAGE_ID)
    if not row:
        return []
    raw = homepage_load_json(row.content_json, {})
    cats = raw.get("categories") if isinstance(raw, dict) else None
    items = cats.get("items") if isinstance(cats, dict) else None
    return items if isinstance(items, list) else []


def seed_website_menus(db) -> int:
    before = db.query(WebsiteMenu).count()
    ensure_system_menus(db)
    after = db.query(WebsiteMenu).count()
    return max(0, after - before)


def seed_filters(db) -> int:
    existing_keys = {
        key for key, in db.query(CatalogFilter.param_key).all()
    }
    inserted = 0
    for item in FILTER_SEED:
        if item["param_key"] in existing_keys:
            continue
        db.add(CatalogFilter(**item))
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def seed_configurator_profiles(db) -> int:
    existing_slugs = {
        slug for slug, in db.query(ConfiguratorProfile.slug).all()
    }
    inserted = 0
    for item in CONFIGURATOR_PROFILE_SEED:
        if item["slug"] in existing_slugs:
            continue
        db.add(ConfiguratorProfile(**item))
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def seed_configurator_categories(db) -> int:
    profiles_by_slug = {row.slug: row for row in db.query(ConfiguratorProfile).all()}
    existing = {
        (profile_id, slug)
        for profile_id, slug in db.query(ConfiguratorCategory.profile_id, ConfiguratorCategory.slug).all()
    }
    inserted = 0
    touched_profiles: set[str] = set()

    for item in CONFIGURATOR_CATEGORY_SEED:
        profile = profiles_by_slug.get(item["profile_slug"])
        if not profile:
            continue
        key = (profile.id, item["slug"])
        if key in existing:
            continue
        db.add(
            ConfiguratorCategory(
                profile_id=profile.id,
                name=item["name"],
                slug=item["slug"],
                description=item.get("description"),
                sort_order=item.get("sort_order", 0),
                is_required=item.get("is_required", False),
                selection_mode=item.get("selection_mode", "single"),
                product_count=item.get("product_count", 0),
                status=item.get("status", "draft"),
            ),
        )
        touched_profiles.add(profile.id)
        inserted += 1

    if inserted:
        db.commit()
        for profile_id in touched_profiles:
            profile = db.get(ConfiguratorProfile, profile_id)
            if profile:
                profile.category_count = (
                    db.query(ConfiguratorCategory)
                    .filter(ConfiguratorCategory.profile_id == profile_id)
                    .count()
                )
        db.commit()
    return inserted


def seed_configurator_templates(db) -> int:
    profiles_by_slug = {row.slug: row for row in db.query(ConfiguratorProfile).all()}
    categories_by_key = {
        (row.profile_id, row.slug): row
        for row in db.query(ConfiguratorCategory).all()
    }
    existing = {
        (profile_id, slug)
        for profile_id, slug in db.query(ConfiguratorTemplate.profile_id, ConfiguratorTemplate.slug).all()
    }
    inserted = 0
    touched_profiles: set[str] = set()

    for item in CONFIGURATOR_TEMPLATE_SEED:
        profile = profiles_by_slug.get(item["profile_slug"])
        if not profile:
            continue
        key = (profile.id, item["slug"])
        if key in existing:
            continue

        components = []
        for comp in item.get("components", []):
            category = categories_by_key.get((profile.id, comp["category_slug"]))
            if not category:
                continue
            components.append(
                {
                    "category_id": category.id,
                    "category_name": comp.get("category_name", category.name),
                    "product_name": comp.get("product_name"),
                    "quantity": comp.get("quantity", 1),
                },
            )

        db.add(
            ConfiguratorTemplate(
                profile_id=profile.id,
                name=item["name"],
                slug=item["slug"],
                description=item.get("description"),
                components_json=dump_components(components),
                is_featured=item.get("is_featured", False),
                status=item.get("status", "draft"),
                use_count=item.get("use_count", 0),
            ),
        )
        touched_profiles.add(profile.id)
        inserted += 1

    if inserted:
        db.commit()
        for profile_id in touched_profiles:
            profile = db.get(ConfiguratorProfile, profile_id)
            if profile:
                profile.template_count = (
                    db.query(ConfiguratorTemplate)
                    .filter(ConfiguratorTemplate.profile_id == profile_id)
                    .count()
                )
        db.commit()
    return inserted


def seed_configurator_builds(db) -> int:
    profiles_by_slug = {row.slug: row for row in db.query(ConfiguratorProfile).all()}
    categories_by_key = {
        (row.profile_id, row.slug): row
        for row in db.query(ConfiguratorCategory).all()
    }
    existing_codes = {code for code, in db.query(ConfiguratorBuild.build_code).all()}
    inserted = 0
    touched_profiles: set[str] = set()

    for item in CONFIGURATOR_BUILD_SEED:
        if item["build_code"] in existing_codes:
            continue
        profile = profiles_by_slug.get(item["profile_slug"])
        if not profile:
            continue

        components = []
        for comp in item.get("components", []):
            category = categories_by_key.get((profile.id, comp["category_slug"]))
            if not category:
                continue
            components.append(
                {
                    "category_id": category.id,
                    "category_name": comp.get("category_name", category.name),
                    "product_name": comp.get("product_name"),
                    "quantity": comp.get("quantity", 1),
                },
            )

        db.add(
            ConfiguratorBuild(
                profile_id=profile.id,
                name=item["name"],
                build_code=item["build_code"],
                customer_name=item.get("customer_name"),
                user_name=item.get("user_name"),
                components_json=dump_components(components),
                total_price=Decimal(str(item.get("total_price", 0))),
                compatibility_status=item.get("compatibility_status", "compatible"),
                status=item.get("status", "draft"),
            ),
        )
        touched_profiles.add(profile.id)
        inserted += 1

    if inserted:
        db.commit()
        for profile_id in touched_profiles:
            profile = db.get(ConfiguratorProfile, profile_id)
            if profile:
                profile.build_count = (
                    db.query(ConfiguratorBuild)
                    .filter(ConfiguratorBuild.profile_id == profile_id)
                    .count()
                )
        db.commit()
    return inserted


COMPATIBILITY_RULE_SEED = [
    {
        "name": "CPU ↔ Motherboard Socket Match",
        "code": "socket_match",
        "configurator_profile_id": "cfg_pc",
        "configurator_profile_name": "PC Builder",
        "description": "CPU socket must equal motherboard socket.",
        "priority": 1,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_cpu", "fieldCode": "socket"},
                    "operator": "equals",
                    "right": {"profileId": "cap_mobo", "fieldCode": "socket"},
                },
            ],
            "then": {"status": "compatible", "message": "CPU socket matches motherboard socket."},
            "else": {
                "status": "incompatible",
                "message": "CPU socket does not match motherboard socket — cannot install.",
            },
        },
    },
    {
        "name": "Motherboard ↔ RAM Type Match",
        "code": "ram_type_match",
        "configurator_profile_id": "cfg_pc",
        "configurator_profile_name": "PC Builder",
        "description": "Motherboard RAM type must equal RAM module type.",
        "priority": 2,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_mobo", "fieldCode": "ram_type"},
                    "operator": "equals",
                    "right": {"profileId": "cap_ram", "fieldCode": "type"},
                },
            ],
            "then": {"status": "compatible", "message": "RAM type matches motherboard support."},
            "else": {
                "status": "incompatible",
                "message": "RAM type incompatible with motherboard — check DDR4/DDR5.",
            },
        },
    },
    {
        "name": "High TDP CPU Warning",
        "code": "tdp_warning",
        "configurator_profile_id": "cfg_pc",
        "configurator_profile_name": "PC Builder",
        "description": "Warn when CPU TDP exceeds 125W — verify cooler and PSU.",
        "priority": 10,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_cpu", "fieldCode": "tdp"},
                    "operator": "greater_than",
                    "right": {"literal": 125},
                },
            ],
            "then": {
                "status": "warning",
                "message": "CPU TDP exceeds 125W — ensure adequate cooling and PSU headroom.",
            },
            "else": {"status": "compatible", "message": "CPU TDP within standard cooling range."},
        },
    },
    {
        "name": "DDR5 Speed Check",
        "code": "ddr5_speed_check",
        "configurator_profile_id": "cfg_pc",
        "configurator_profile_name": "PC Builder",
        "description": None,
        "priority": 15,
        "active": True,
        "body": {
            "conditions": [
                {
                    "id": "c1",
                    "left": {"profileId": "cap_ram", "fieldCode": "type"},
                    "operator": "equals",
                    "right": {"literal": "ddr5"},
                },
                {
                    "id": "c2",
                    "left": {"profileId": "cap_ram", "fieldCode": "speed"},
                    "operator": "less_than",
                    "right": {"literal": 4800},
                },
            ],
            "then": {
                "status": "warning",
                "message": "DDR5 speed below 4800 MHz — performance may be limited on Z790 boards.",
            },
            "else": {"status": "compatible", "message": "RAM speed acceptable."},
        },
    },
]


def seed_configurator_compatibility_rules(db) -> int:
    existing_codes = {
        code for code, in db.query(ConfiguratorCompatibilityRule.code).all()
    }
    inserted = 0
    for item in COMPATIBILITY_RULE_SEED:
        if item["code"] in existing_codes:
            continue
        db.add(
            ConfiguratorCompatibilityRule(
                name=item["name"],
                code=item["code"],
                configurator_profile_id=item["configurator_profile_id"],
                configurator_profile_name=item["configurator_profile_name"],
                description=item.get("description"),
                priority=item["priority"],
                active=item["active"],
                body_json=compatibility_dump_json(item["body"]),
            ),
        )
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def seed_attribute_profiles(db) -> int:
    """Upsert attribute profiles + groups + fields from ATTRIBUTE_PROFILE_SEED."""
    existing = {
        code: row
        for code, row in (
            (p.code, p) for p in db.query(CatalogAttributeProfile).all()
        )
    }
    upserted = 0

    for item in ATTRIBUTE_PROFILE_SEED:
        profile = existing.get(item["code"])
        if profile is None:
            profile = CatalogAttributeProfile(
                code=item["code"],
                name=item["name"],
                description=item.get("description"),
                sort_order=item.get("sort_order", 0),
                is_active=item.get("is_active", True),
                icon_url=item.get("icon_url"),
                image_url=item.get("image_url"),
                category_labels=dump_json_list(item.get("category_labels", [])),
            )
            db.add(profile)
            db.flush()
            existing[item["code"]] = profile
        else:
            profile.name = item["name"]
            profile.description = item.get("description")
            profile.sort_order = item.get("sort_order", 0)
            profile.is_active = item.get("is_active", True)
            profile.icon_url = item.get("icon_url")
            profile.image_url = item.get("image_url")
            profile.category_labels = dump_json_list(item.get("category_labels", []))

        groups_by_code = {
            g.code: g
            for g in db.query(CatalogAttributeGroup)
            .filter(CatalogAttributeGroup.profile_id == profile.id)
            .all()
        }

        for group_item in item.get("groups", []):
            group = groups_by_code.get(group_item["code"])
            if group is None:
                group = CatalogAttributeGroup(
                    profile_id=profile.id,
                    code=group_item["code"],
                    name=group_item["name"],
                    sort_order=group_item.get("sort_order", 0),
                    is_active=True,
                    description=group_item.get("description"),
                )
                db.add(group)
                db.flush()
                groups_by_code[group.code] = group
            else:
                group.name = group_item["name"]
                group.sort_order = group_item.get("sort_order", 0)
                group.is_active = True
                group.description = group_item.get("description")

            attrs_by_code = {
                a.code: a
                for a in db.query(CatalogAttribute)
                .filter(CatalogAttribute.group_id == group.id)
                .all()
            }

            for attr_index, attr_item in enumerate(group_item.get("attributes", [])):
                attr = attrs_by_code.get(attr_item["code"])
                if attr is None:
                    attr = CatalogAttribute(
                        group_id=group.id,
                        code=attr_item["code"],
                        name=attr_item["name"],
                        field_type=attr_item.get("field_type", "text"),
                        sort_order=attr_index,
                        is_required=attr_item.get("is_required", False),
                        is_filterable=attr_item.get("is_filterable", False),
                        is_comparable=attr_item.get("is_comparable", True),
                        is_searchable=attr_item.get("is_searchable", False),
                        is_visible=attr_item.get("is_visible", True),
                        is_active=True,
                        unit=attr_item.get("unit"),
                        help_text=attr_item.get("help_text"),
                        predefined_values=dump_json_list(attr_item.get("predefined_values", [])),
                    )
                    db.add(attr)
                    attrs_by_code[attr_item["code"]] = attr
                else:
                    attr.name = attr_item["name"]
                    attr.field_type = attr_item.get("field_type", "text")
                    attr.sort_order = attr_index
                    attr.is_required = attr_item.get("is_required", False)
                    attr.is_filterable = attr_item.get("is_filterable", False)
                    attr.is_comparable = attr_item.get("is_comparable", True)
                    attr.is_searchable = attr_item.get("is_searchable", False)
                    attr.is_visible = attr_item.get("is_visible", True)
                    attr.is_active = True
                    attr.unit = attr_item.get("unit")
                    attr.help_text = attr_item.get("help_text")
                    attr.predefined_values = dump_json_list(attr_item.get("predefined_values", []))

        upserted += 1

    if upserted:
        db.commit()
    return upserted


def seed_variants(db) -> int:
    existing_product_ids = {
        pid for pid, in db.query(CatalogProductVariant.product_id).all()
    }
    inserted = 0
    products = db.query(CatalogProduct).all()
    for product in products:
        if product.id in existing_product_ids:
            continue
        db.add(
            CatalogProductVariant(
                product_id=product.id,
                sku=product.sku,
                name="Default",
                price=product.price,
                stock=product.stock,
                status=product.status,
                is_default=True,
                sort_order=0,
            ),
        )
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def seed_media(db) -> int:
    before = db.query(Media).count()
    if before > 0:
        return 0
    for item in MEDIA_SEED:
        db.add(Media(**item))
    db.commit()
    return len(MEDIA_SEED)


# Side-menu rail icons — copied into uploads/media so Media Library can pick them.
SIDE_MENU_ICON_FILES: list[tuple[str, str, str]] = [
    # (media_id, source_filename, stored_filename)
    ("media_sidemenu_logo", "monarch-it-icon.png", "sidemenu-monarch-it-icon.png"),
    ("media_sidemenu_phone", "phone-black-icon.svg", "sidemenu-phone-black-icon.svg"),
    ("media_sidemenu_message", "message-icon.svg", "sidemenu-message-icon.svg"),
    ("media_sidemenu_compare", "compare-icon-svg.svg", "sidemenu-compare-icon.svg"),
    # Wishlist reuses compare artwork until a dedicated SVG is provided.
    ("media_sidemenu_wishlist", "compare-icon-svg.svg", "sidemenu-wishlist-icon.svg"),
    ("media_sidemenu_gift", "gift-black-icon.svg", "sidemenu-gift-black-icon.svg"),
    ("media_sidemenu_fire", "fire-black-icon.svg", "sidemenu-fire-black-icon.svg"),
    ("media_sidemenu_pc", "pc-icon.svg", "sidemenu-pc-icon.svg"),
]


def seed_side_menu_media(db) -> int:
    """Upload side-menu SVG/PNG icons into media library (idempotent)."""
    from app.config import get_settings

    source_dir = Path(__file__).resolve().parents[1] / "seed_assets" / "side_menu"
    upload_dir = Path(__file__).resolve().parents[1] / "uploads" / "media"
    upload_dir.mkdir(parents=True, exist_ok=True)
    settings = get_settings()
    inserted = 0

    for media_id, source_name, stored_name in SIDE_MENU_ICON_FILES:
        src = source_dir / source_name
        if not src.is_file():
            continue
        dest = upload_dir / stored_name
        content = src.read_bytes()
        if not dest.is_file() or dest.read_bytes() != content:
            dest.write_bytes(content)

        ext = Path(stored_name).suffix.lower()
        mime = "image/png" if ext == ".png" else "image/svg+xml"
        title = source_name.rsplit(".", 1)[0].replace("-", " ").replace("_", " ")
        public_url = f"http://{settings.api_host}:{settings.api_port}/uploads/media/{stored_name}"

        row = db.get(Media, media_id)
        if row is None:
            db.add(
                Media(
                    id=media_id,
                    name=stored_name,
                    title=title,
                    folder="Side menu",
                    url=public_url,
                    media_type="image",
                    mime_type=mime,
                    size_kb=max(1, len(content) // 1024),
                    alt=title,
                    local_path=f"/storage/media/uploads/{stored_name}",
                    imported_by="seed",
                    provider="direct",
                    uploaded_by="System",
                    title_linked_to_name=True,
                    alt_linked_to_name=True,
                )
            )
            inserted += 1
        else:
            row.name = stored_name
            row.title = title
            row.folder = "Side menu"
            row.url = public_url
            row.media_type = "image"
            row.mime_type = mime
            row.size_kb = max(1, len(content) // 1024)
            row.alt = title
            row.local_path = f"/storage/media/uploads/{stored_name}"
            row.provider = "direct"

    db.commit()
    return inserted


HEADER_MEDIA_FILES: list[tuple[str, str, str]] = [
    ("media_header_logo", "monarch-it-logo.png", "header-monarch-it-logo.png"),
    ("media_header_order_track", "order-track-icon.svg", "header-order-track-icon.svg"),
]


def seed_header_media(db) -> int:
    """Upload header logo + order-track icon into media library (idempotent)."""
    from app.config import get_settings

    source_dir = Path(__file__).resolve().parents[1] / "seed_assets" / "header"
    upload_dir = Path(__file__).resolve().parents[1] / "uploads" / "media"
    upload_dir.mkdir(parents=True, exist_ok=True)
    settings = get_settings()
    inserted = 0

    for media_id, source_name, stored_name in HEADER_MEDIA_FILES:
        src = source_dir / source_name
        if not src.is_file():
            continue
        dest = upload_dir / stored_name
        content = src.read_bytes()
        if not dest.is_file() or dest.read_bytes() != content:
            dest.write_bytes(content)

        ext = Path(stored_name).suffix.lower()
        mime = "image/png" if ext == ".png" else "image/svg+xml"
        title = source_name.rsplit(".", 1)[0].replace("-", " ").replace("_", " ")
        public_url = f"http://{settings.api_host}:{settings.api_port}/uploads/media/{stored_name}"

        row = db.get(Media, media_id)
        if row is None:
            db.add(
                Media(
                    id=media_id,
                    name=stored_name,
                    title=title,
                    folder="Header",
                    url=public_url,
                    media_type="image",
                    mime_type=mime,
                    size_kb=max(1, len(content) // 1024),
                    alt=title,
                    local_path=f"/storage/media/uploads/{stored_name}",
                    imported_by="seed",
                    provider="direct",
                    uploaded_by="System",
                    title_linked_to_name=True,
                    alt_linked_to_name=True,
                )
            )
            inserted += 1
        else:
            row.name = stored_name
            row.title = title
            row.folder = "Header"
            row.url = public_url
            row.media_type = "image"
            row.mime_type = mime
            row.size_kb = max(1, len(content) // 1024)
            row.alt = title
            row.local_path = f"/storage/media/uploads/{stored_name}"
            row.provider = "direct"

    db.commit()
    return inserted


FOOTER_MEDIA_FILES: list[tuple[str, str, str]] = [
    ("media_footer_logo", "monarch-it.png", "footer-monarch-it.png"),
    ("media_footer_membership", "partnership-logo.png", "footer-partnership-logo.png"),
    ("media_footer_payment", "payment-partner.png", "footer-payment-partner.png"),
]


def seed_footer_media(db) -> int:
    """Upload footer logo / membership / payment images into media library (idempotent)."""
    from app.config import get_settings

    source_dir = Path(__file__).resolve().parents[1] / "seed_assets" / "footer"
    upload_dir = Path(__file__).resolve().parents[1] / "uploads" / "media"
    upload_dir.mkdir(parents=True, exist_ok=True)
    settings = get_settings()
    inserted = 0

    for media_id, source_name, stored_name in FOOTER_MEDIA_FILES:
        src = source_dir / source_name
        if not src.is_file():
            continue
        dest = upload_dir / stored_name
        content = src.read_bytes()
        if not dest.is_file() or dest.read_bytes() != content:
            dest.write_bytes(content)

        ext = Path(stored_name).suffix.lower()
        mime = "image/png" if ext == ".png" else "image/jpeg"
        title = source_name.rsplit(".", 1)[0].replace("-", " ").replace("_", " ")
        public_url = f"http://{settings.api_host}:{settings.api_port}/uploads/media/{stored_name}"

        row = db.get(Media, media_id)
        if row is None:
            db.add(
                Media(
                    id=media_id,
                    name=stored_name,
                    title=title,
                    folder="Footer",
                    url=public_url,
                    media_type="image",
                    mime_type=mime,
                    size_kb=max(1, len(content) // 1024),
                    alt=title,
                    local_path=f"/storage/media/uploads/{stored_name}",
                    imported_by="seed",
                    provider="direct",
                    uploaded_by="System",
                    title_linked_to_name=True,
                    alt_linked_to_name=True,
                )
            )
            inserted += 1
        else:
            row.name = stored_name
            row.title = title
            row.folder = "Footer"
            row.url = public_url
            row.media_type = "image"
            row.mime_type = mime
            row.size_kb = max(1, len(content) // 1024)
            row.alt = title
            row.local_path = f"/storage/media/uploads/{stored_name}"
            row.provider = "direct"

    db.commit()
    return inserted


def seed_warehouses(db) -> int:
    existing_codes = {code for code, in db.query(InventoryWarehouse.code).all()}
    inserted = 0
    for item in WAREHOUSE_SEED:
        if item["code"] in existing_codes:
            continue
        db.add(InventoryWarehouse(**item))
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def seed_stock_pickings(db) -> int:
    """stock.picking.type + stock.picking + stock.move seed (incoming/outgoing)."""
    if db.query(InventoryStockPicking).count() > 0:
        return 0

    types = [
        InventoryStockPickingType(
            id="spt_incoming",
            name="Receipts",
            code="incoming",
            sequence_code="WH/IN",
            warehouse_name="againsoft",
        ),
        InventoryStockPickingType(
            id="spt_outgoing",
            name="Delivery Orders",
            code="outgoing",
            sequence_code="WH/OUT",
            warehouse_name="againsoft",
        ),
    ]
    for row in types:
        db.add(row)

    pickings_data = [
        {
            "id": "pck_in_001",
            "name": "WH/IN/00001",
            "picking_type_id": "spt_incoming",
            "partner_name": "Riyad",
            "location_id": "Partners/Vendors",
            "location_dest_id": "WH/Stock",
            "scheduled_date": datetime(2026, 7, 4, 5, 56),
            "date_deadline": datetime(2026, 7, 4, 5, 56),
            "origin": "P00001",
            "state": "assigned",
            "weight": Decimal("2"),
            "moves": [
                ("mv_in_001_1", "Testing Product 1", Decimal("1"), Decimal("1"), 10),
                ("mv_in_001_2", "Testing Product 2", Decimal("5"), Decimal("5"), 20, True),
            ],
        },
        {
            "id": "pck_in_002",
            "name": "WH/IN/00002",
            "picking_type_id": "spt_incoming",
            "partner_name": "againsoft, Mossiur Rahman Riyad",
            "location_id": "Partners/Vendors",
            "location_dest_id": "WH/Stock",
            "scheduled_date": datetime(2026, 6, 28, 14, 0),
            "origin": "P00012",
            "state": "done",
            "weight": Decimal("0"),
            "moves": [],
        },
        {
            "id": "pck_in_003",
            "name": "WH/IN/00003",
            "picking_type_id": "spt_incoming",
            "partner_name": "Riyad",
            "location_id": "Partners/Vendors",
            "location_dest_id": "WH/Stock",
            "scheduled_date": datetime(2026, 7, 4, 9, 0),
            "origin": "",
            "state": "assigned",
            "weight": Decimal("0"),
            "moves": [],
        },
        {
            "id": "pck_out_001",
            "name": "WH/OUT/00001",
            "picking_type_id": "spt_outgoing",
            "partner_name": "Riyad",
            "location_id": "WH/Stock",
            "location_dest_id": "Customers",
            "scheduled_date": datetime(2026, 7, 4, 5, 56),
            "date_deadline": datetime(2026, 7, 4, 5, 56),
            "origin": "S00001",
            "state": "assigned",
            "weight": Decimal("2"),
            "moves": [
                ("mv_out_001_1", "Testing Product 1", Decimal("1"), Decimal("1"), 10),
                ("mv_out_001_2", "Testing Product 2", Decimal("5"), Decimal("5"), 20, True),
            ],
        },
        {
            "id": "pck_out_002",
            "name": "WH/OUT/00002",
            "picking_type_id": "spt_outgoing",
            "partner_name": "againsoft, Mossiur Rahman Riyad",
            "location_id": "WH/Stock",
            "location_dest_id": "Customers",
            "scheduled_date": datetime(2026, 6, 28, 14, 0),
            "origin": "S00012",
            "state": "done",
            "weight": Decimal("0"),
            "moves": [],
        },
        {
            "id": "pck_out_003",
            "name": "WH/OUT/00003",
            "picking_type_id": "spt_outgoing",
            "partner_name": "Riyad",
            "location_id": "WH/Stock",
            "location_dest_id": "Customers",
            "scheduled_date": datetime(2026, 7, 4, 9, 0),
            "origin": "",
            "state": "assigned",
            "weight": Decimal("0"),
            "moves": [],
        },
    ]

    count = 0
    for item in pickings_data:
        moves = item.pop("moves")
        db.add(InventoryStockPicking(**item))
        count += 1
        for move_row in moves:
            show_details = move_row[5] if len(move_row) > 5 else False
            db.add(
                InventoryStockMove(
                    id=move_row[0],
                    picking_id=item["id"],
                    name=move_row[1],
                    product_uom_qty=move_row[2],
                    quantity=move_row[3],
                    sequence=move_row[4],
                    state=item["state"],
                    show_details=show_details,
                )
            )
    db.commit()
    return count + len(types)


def seed_stock_quants(db) -> int:
    """stock.quant seed — physical inventory lines (Again demo)."""
    if db.query(InventoryStockQuant).count() > 0:
        return 0

    rows = [
        {
            "id": "sq_001",
            "product_name": "Maono PD200X",
            "product_categ_name": "Goods",
            "lot_name": "0000001",
            "quantity": Decimal("1"),
            "inventory_date": datetime(2026, 7, 4, 9, 0),
            "scheduled_date": datetime(2026, 12, 31, 0, 0),
        },
        {
            "id": "sq_002",
            "product_name": "Testing Product 1",
            "product_categ_name": "Goods",
            "lot_name": "6",
            "quantity": Decimal("10"),
            "inventory_quantity": Decimal("0"),
            "inventory_diff_quantity": Decimal("-10"),
        },
        {
            "id": "sq_003",
            "product_name": "Testing Product 2",
            "product_categ_name": "Goods",
            "lot_name": "0000001",
            "quantity": Decimal("0"),
        },
        {
            "id": "sq_004",
            "product_name": "Testing Product 2",
            "product_categ_name": "Goods",
            "lot_name": "0000002",
            "quantity": Decimal("0"),
        },
        {
            "id": "sq_005",
            "product_name": "Testing Product 2",
            "product_categ_name": "Goods",
            "lot_name": "0000003",
            "quantity": Decimal("0"),
        },
        {
            "id": "sq_006",
            "product_name": "Testing Product 2",
            "product_categ_name": "Goods",
            "lot_name": "0000004",
            "quantity": Decimal("0"),
        },
        {
            "id": "sq_007",
            "product_name": "Testing Product 2",
            "product_categ_name": "Goods",
            "lot_name": "0000005",
            "quantity": Decimal("0"),
        },
        {
            "id": "sq_008",
            "product_name": "Testing Product 2",
            "product_categ_name": "Goods",
            "lot_name": "0000006",
            "quantity": Decimal("0"),
        },
        {
            "id": "sq_009",
            "product_name": "Testing Product 2",
            "product_categ_name": "Goods",
            "lot_name": "0000007",
            "quantity": Decimal("0"),
        },
        {
            "id": "sq_010",
            "product_name": "Testing Product 2",
            "product_categ_name": "Goods",
            "lot_name": "0000008",
            "quantity": Decimal("0"),
        },
        {
            "id": "sq_011",
            "product_name": "Testing Product 2",
            "product_categ_name": "Goods",
            "lot_name": "0000009",
            "quantity": Decimal("0"),
        },
    ]

    for item in rows:
        db.add(InventoryStockQuant(**item))
    db.commit()
    return len(rows)


def seed_stock_scraps(db) -> int:
    """stock.scrap seed — demo scrap line."""
    if db.query(InventoryStockScrap).count() > 0:
        return 0

    db.add(
        InventoryStockScrap(
            id="scr_001",
            name="SP/00001",
            date=datetime(2026, 7, 6, 5, 7),
            product_name="Maono PD200X",
            scrap_qty=Decimal("1"),
            location_id="WH/Stock",
            state="done",
        )
    )
    db.commit()
    return 1


def seed_orderpoints(db) -> int:
    """stock.warehouse.orderpoint seed — replenishment demo line."""
    if db.query(InventoryOrderpoint).count() > 0:
        return 0

    db.add(
        InventoryOrderpoint(
            id="op_001",
            product_name="Testing Product",
            qty_on_hand=Decimal("10"),
            qty_forecast=Decimal("5"),
            route_name="Buy",
            vendor_name="againsoft",
            trigger="manual",
            product_min_qty=Decimal("0"),
            product_max_qty=Decimal("0"),
            qty_multiple=Decimal("1"),
            qty_to_order=Decimal("0"),
            snoozed=False,
        )
    )
    db.commit()
    return 1


def seed_stock_levels(db) -> int:
    if db.query(InventoryStockLevel).count() > 0:
        return 0

    warehouses = (
        db.query(InventoryWarehouse)
        .order_by(InventoryWarehouse.sort_order, InventoryWarehouse.name)
        .all()
    )
    if not warehouses:
        return 0

    variants = (
        db.query(CatalogProductVariant, CatalogProduct)
        .join(CatalogProduct, CatalogProductVariant.product_id == CatalogProduct.id)
        .order_by(CatalogProductVariant.sku)
        .all()
    )

    inserted = 0
    for index, (variant, product) in enumerate(variants):
        warehouse = warehouses[index % len(warehouses)]
        on_hand = variant.stock
        reserved = min(3, on_hand // 4) if on_hand > 0 else 0
        if on_hand == 0:
            incoming = 24
        elif on_hand < 10:
            incoming = 50
        else:
            incoming = 0
        min_qty = 10
        max_qty = max(on_hand * 3, 50)
        unit_cost = (product.price * Decimal("0.65")).quantize(Decimal("0.01"))
        display_name = product.name
        if variant.name and variant.name != "Default":
            display_name = f"{product.name} — {variant.name}"

        db.add(
            InventoryStockLevel(
                warehouse_id=warehouse.id,
                variant_id=variant.id,
                product_id=product.id,
                item_id=product.item_id or product.id,
                sku=variant.sku,
                name=display_name,
                on_hand=on_hand,
                reserved=reserved,
                incoming=incoming,
                min_qty=min_qty,
                max_qty=max_qty,
                reorder_level=min_qty,
                unit_cost=unit_cost,
                status=_compute_stock_status(on_hand, min_qty, max_qty),
                thumbnail=product.thumbnail,
            ),
        )
        inserted += 1

    if inserted:
        db.commit()
    return inserted


def _default_ai_insights(risk: str, score: int) -> dict:
    return {
        "orderSummary": "Standard ecommerce order with verified payment."
        if risk == "low"
        else "COD order — confirm address before fulfillment."
        if risk == "medium"
        else "High-value return case — review refund history.",
        "customerSummary": "Active buyer with consistent purchase pattern.",
        "riskLevel": risk,
        "riskScore": score,
        "riskReasons": ["Verified payment", "Repeat customer"]
        if risk == "low"
        else ["COD payment", "New delivery address"]
        if risk == "medium"
        else ["Multiple returns", "Unusual location"],
        "deliveryPrediction": {
            "success": 94 if risk == "low" else 78 if risk == "medium" else 62,
            "delayRisk": "Low" if risk == "low" else "Medium" if risk == "medium" else "High",
            "returnRisk": "2%" if risk == "low" else "8%" if risk == "medium" else "24%",
        },
        "upsellSuggestions": [
            {"name": "Extended Warranty", "reason": "Electronics category match"},
        ],
        "retentionProbability": 87 if risk == "low" else 64 if risk == "medium" else 41,
    }


ORDER_SEED_TEMPLATES = [
    {"id": "ord_1001", "order_number": "ORD-1001", "status": "shipped", "tags": ["VIP"], "ai_risk": "low", "risk_score": 12},
    {"id": "ord_1002", "order_number": "ORD-1002", "status": "pending", "payment_status": "unpaid", "shipment_status": "unfulfilled", "priority": "high", "ai_risk": "medium", "risk_score": 45, "customer_idx": 1, "payment_method": "COD", "paid_amount": 0},
    {"id": "ord_1003", "order_number": "ORD-1003", "status": "processing", "shipment_status": "partial", "branch": "Chittagong", "assigned_staff": "Nusrat Jahan", "tags": ["B2B"], "ai_risk": "low", "risk_score": 20, "customer_idx": 2, "item_count": 2},
    {"id": "ord_1004", "order_number": "ORD-1004", "status": "delivered", "shipment_status": "delivered", "courier": "RedX", "tracking_number": "RDX-99102", "ai_risk": "low", "risk_score": 10},
    {"id": "ord_1005", "order_number": "ORD-1005", "status": "completed", "payment_status": "paid", "shipment_status": "delivered", "ai_risk": "low", "risk_score": 8},
    {"id": "ord_1006", "order_number": "ORD-1006", "status": "draft", "payment_status": "unpaid", "shipment_status": "unfulfilled", "source": "Phone", "assigned_staff": "Sales Team", "ai_risk": "medium", "risk_score": 30},
    {"id": "ord_1007", "order_number": "ORD-1007", "status": "confirmed", "tags": ["Express"], "ai_risk": "low", "risk_score": 15},
    {"id": "ord_1008", "order_number": "ORD-1008", "status": "packed", "shipment_status": "partial", "ai_risk": "low", "risk_score": 18},
    {"id": "ord_1009", "order_number": "ORD-1009", "status": "returned", "payment_status": "refunded", "shipment_status": "returned", "priority": "urgent", "ai_risk": "high", "risk_score": 72},
    {"id": "ord_1010", "order_number": "ORD-1010", "status": "refunded", "payment_status": "refunded", "ai_risk": "medium", "risk_score": 55},
    {"id": "ord_1011", "order_number": "ORD-1011", "status": "cancelled", "payment_status": "failed", "shipment_status": "unfulfilled", "ai_risk": "medium", "risk_score": 40},
    {"id": "ord_1012", "order_number": "ORD-1012", "status": "failed", "payment_status": "failed", "ai_risk": "high", "risk_score": 80},
]

# Must match real commerce_customers (CUSTOMER_SEED) so storefront
# /account/orders returns rows after OTP login as rakib@example.com / 01711-234567.
def _order_customer_payload(seed: dict) -> dict:
    return {
        "id": seed["id"],
        "name": seed["name"],
        "phone": seed["phone"],
        "email": seed["email"],
        "group": seed.get("group", "retail").title(),
        "lifetime_value": seed.get("total_spend", Decimal("0")),
        "order_count": seed.get("total_orders", 0),
        "risk_score": seed.get("risk_score", 12),
    }


ORDER_CUSTOMERS = [
    _order_customer_payload(next(c for c in CUSTOMER_SEED if c["id"] == "cust_001")),
    _order_customer_payload(next(c for c in CUSTOMER_SEED if c["id"] == "cust_002")),
    # cust_003 is inactive — use cust_004 so OTP login can still see orders
    _order_customer_payload(next(c for c in CUSTOMER_SEED if c["id"] == "cust_004")),
]

# Legacy seed IDs → real customer rows (existing DBs that still have c1/c2/c3)
_LEGACY_ORDER_CUSTOMER_MAP = {
    "c1": "cust_001",
    "c2": "cust_002",
    "c3": "cust_004",
}


def link_seed_orders_to_customers(db) -> int:
    """Point seeded commerce orders at real commerce_customers rows.

    Safe to re-run. Fixes older seeds that used inline c1/c2/c3 IDs which
    never matched CUSTOMER_SEED, so storefront account orders stayed empty.
    """
    by_id = {c["id"]: c for c in CUSTOMER_SEED}
    updated = 0
    for order in db.query(CommerceOrder).all():
        target_id = _LEGACY_ORDER_CUSTOMER_MAP.get(order.customer_id or "", order.customer_id)
        if not target_id or target_id not in by_id:
            continue
        seed = by_id[target_id]
        changed = False
        if order.customer_id != target_id:
            order.customer_id = target_id
            changed = True
        if order.customer_name != seed["name"]:
            order.customer_name = seed["name"]
            changed = True
        if order.customer_phone != seed["phone"]:
            order.customer_phone = seed["phone"]
            changed = True
        if order.customer_email != seed["email"]:
            order.customer_email = seed["email"]
            changed = True
        if changed:
            updated += 1
    if updated:
        db.commit()
    return updated


def seed_account_demo_data(db) -> dict[str, int]:
    """Seed storefront account demo rows: payments, cases, reward events, addresses.

    Safe to re-run (idempotent by payment_number / case_number / customer id).
    """
    from datetime import date as date_cls

    result = {"payments": 0, "cases": 0, "customers_enriched": 0}

    # --- Finance payments linked to commerce orders (account Payments page) ---
    existing_pay_nums = {
        num for (num,) in db.query(FinancePayment.payment_number).all()
    }
    paid_orders = (
        db.query(CommerceOrder)
        .filter(CommerceOrder.paid_amount > 0)
        .order_by(CommerceOrder.order_date.desc())
        .all()
    )
    for idx, order in enumerate(paid_orders[:20]):
        pay_number = f"PAY-SF-{order.order_number}"
        if pay_number in existing_pay_nums:
            continue
        db.add(
            FinancePayment(
                id=f"pay_sf_{order.id}",
                company_id=getattr(order, "company_id", None) or "default",
                payment_number=pay_number,
                payment_date=order.order_date.date() if hasattr(order.order_date, "date") else date_cls(2026, 6, 10),
                amount=order.paid_amount,
                payment_method=order.payment_method or "bKash",
                direction="inbound",
                source_type="commerce_order",
                source_id=order.id,
                party_type="customer",
                party_id=order.customer_id,
                reference=order.payment_transaction_id or f"TRX-{order.order_number}",
                notes='{"provider":"mobile","status":"paid"}',
            )
        )
        existing_pay_nums.add(pay_number)
        result["payments"] += 1

    # --- Cases for demo customer cust_001 ---
    existing_cases = {
        num for (num,) in db.query(StorefrontCustomerCase.case_number).all()
    }
    case_seed = [
        {
            "case_number": "SUP-SEED001",
            "case_type": "support",
            "customer_id": "cust_001",
            "order_id": "ord_1001",
            "order_number": "ORD-1001",
            "subject": "Delivery time confirmation",
            "message": "When will ORD-1001 reach Mirpur?",
            "status": "open",
            "manager_name": "Sumaiya Akter",
        },
        {
            "case_number": "CMP-SEED001",
            "case_type": "complaint",
            "customer_id": "cust_001",
            "order_id": "ord_1004",
            "order_number": "ORD-1004",
            "subject": "Packaging damaged",
            "message": "Outer carton arrived with a dent — item seems fine but please note.",
            "status": "open",
            "manager_name": "Sumaiya Akter",
        },
        {
            "case_number": "QC-SEED001",
            "case_type": "qc",
            "customer_id": "cust_001",
            "order_id": "ord_1007",
            "order_number": "ORD-1007",
            "subject": "QC photos requested",
            "message": "Please share QC photos before dispatch.",
            "product_label": "Corsair Vengeance 32GB DDR5",
            "status": "open",
            "manager_name": "Sumaiya Akter",
        },
    ]
    for item in case_seed:
        if item["case_number"] in existing_cases:
            continue
        if not db.get(CommerceCustomer, item["customer_id"]):
            continue
        db.add(
            StorefrontCustomerCase(
                customer_id=item["customer_id"],
                case_type=item["case_type"],
                case_number=item["case_number"],
                order_id=item.get("order_id"),
                order_number=item.get("order_number"),
                subject=item["subject"],
                message=item["message"],
                product_label=item.get("product_label"),
                status=item["status"],
                manager_name=item.get("manager_name"),
            )
        )
        result["cases"] += 1

    # --- Enrich customers: address keys + reward events ---
    for seed in CUSTOMER_SEED:
        row = db.get(CommerceCustomer, seed["id"])
        if not row:
            continue
        changed = False
        addresses = load_json(row.addresses_json, [])
        normalized = []
        for addr in addresses if isinstance(addresses, list) else []:
            if not isinstance(addr, dict):
                continue
            line1 = addr.get("line1") or addr.get("address") or ""
            normalized.append(
                {
                    "id": addr.get("id") or f"addr_{seed['id']}",
                    "label": addr.get("label") or "Home",
                    "line1": line1,
                    "city": addr.get("city") or row.city or "",
                    "region": addr.get("region") or row.region or "",
                    "postal_code": addr.get("postal_code") or addr.get("postalCode") or "",
                    "country": addr.get("country") or row.country or "Bangladesh",
                    "is_default": bool(addr.get("is_default", addr.get("isDefault", False))),
                }
            )
        if normalized and normalized != addresses:
            row.addresses_json = dump_json(normalized)
            changed = True

        events = load_json(row.reward_events_json, [])
        seed_events = seed.get("reward_events") or []
        if seed_events:
            legacy = (
                isinstance(events, list)
                and bool(events)
                and isinstance(events[0], dict)
                and "label" not in events[0]
            )
            if not events or legacy:
                row.reward_events_json = dump_json(seed_events)
                changed = True

        wallet_txs = load_json(row.wallet_transactions_json, [])
        if not wallet_txs and seed["id"] == "cust_001":
            row.wallet_transactions_json = dump_json(
                [
                    {
                        "id": "wt_seed_001",
                        "label": "Welcome credit",
                        "amount": 500.0,
                        "type": "credit",
                        "at": "2026-05-01T10:00:00Z",
                    },
                    {
                        "id": "wt_seed_002",
                        "label": "Refund credit · ORD-1004",
                        "amount": 250.0,
                        "type": "credit",
                        "at": "2026-06-09T14:20:00Z",
                    },
                    {
                        "id": "wt_seed_003",
                        "label": "Used on checkout · ORD-1007",
                        "amount": 250.0,
                        "type": "debit",
                        "at": "2026-06-12T11:05:00Z",
                    },
                ]
            )
            if (row.wallet_balance or Decimal("0")) <= 0:
                row.wallet_balance = Decimal("500.00")
            changed = True

        if changed:
            result["customers_enriched"] += 1

    if result["payments"] or result["cases"] or result["customers_enriched"]:
        db.commit()
    return result


def seed_orders(db) -> int:
    if db.query(CommerceOrder).count() > 0:
        return 0

    catalog_rows = (
        db.query(CatalogProductVariant, CatalogProduct)
        .join(CatalogProduct, CatalogProductVariant.product_id == CatalogProduct.id)
        .order_by(CatalogProductVariant.sku)
        .all()
    )
    if not catalog_rows:
        return 0

    inserted = 0
    order_dates = [
        "2026-06-10T14:32:00",
        "2026-06-12T10:15:00",
        "2026-06-11T16:45:00",
        "2026-06-08T09:20:00",
        "2026-06-07T18:00:00",
        "2026-06-13T11:30:00",
        "2026-06-09T13:10:00",
        "2026-06-11T08:55:00",
        "2026-06-05T15:40:00",
        "2026-06-04T12:00:00",
        "2026-06-03T10:25:00",
        "2026-06-02T17:15:00",
    ]

    for index, tmpl in enumerate(ORDER_SEED_TEMPLATES):
        customer = ORDER_CUSTOMERS[tmpl.get("customer_idx", index % len(ORDER_CUSTOMERS))]
        risk = tmpl.get("ai_risk", "low")
        score = tmpl.get("risk_score", customer["risk_score"])

        shipping_amount = Decimal("120")
        discount_amount = Decimal("500") if index % 2 == 0 else Decimal("0")
        subtotal = Decimal("0")
        line_rows = []
        item_count = tmpl.get("item_count", 1)

        for line_idx in range(item_count):
            variant, product = catalog_rows[(index + line_idx) % len(catalog_rows)]
            qty = 2 if line_idx == 0 and item_count == 1 and index == 0 else 1
            unit_price = variant.price
            line_discount = Decimal("200") if line_idx == 0 and index == 0 else Decimal("0")
            line_tax = (unit_price * qty * Decimal("0.05")).quantize(Decimal("0.01"))
            line_total = unit_price * qty - line_discount + line_tax
            subtotal += unit_price * qty
            line_rows.append((variant, product, qty, unit_price, line_discount, line_tax, line_total, line_idx))

        tax_amount = sum(row[5] for row in line_rows)
        grand_total = subtotal - discount_amount + tax_amount + shipping_amount
        paid_amount = tmpl.get("paid_amount", grand_total)
        if isinstance(paid_amount, int):
            paid_amount = Decimal(str(paid_amount))
        due_amount = max(grand_total - paid_amount, Decimal("0"))

        payment_status = tmpl.get("payment_status", "paid" if paid_amount >= grand_total else "unpaid")
        shipment_status = tmpl.get("shipment_status", "shipped" if tmpl["status"] in {"shipped", "delivered", "completed"} else "unfulfilled")

        order = CommerceOrder(
            id=tmpl["id"],
            order_number=tmpl["order_number"],
            order_date=datetime.fromisoformat(order_dates[index]),
            status=tmpl["status"],
            payment_status=payment_status,
            shipment_status=shipment_status,
            source=tmpl.get("source", "Web Store"),
            branch=tmpl.get("branch", "Dhaka HQ"),
            assigned_staff=tmpl.get("assigned_staff", "Karim Ahmed"),
            priority=tmpl.get("priority", "normal"),
            tags_json=dump_json(tmpl.get("tags", [])),
            customer_id=customer["id"],
            customer_name=customer["name"],
            customer_phone=customer["phone"],
            customer_email=customer["email"],
            customer_group=customer["group"],
            customer_lifetime_value=customer["lifetime_value"],
            customer_order_count=customer["order_count"],
            customer_risk_score=score,
            billing_address="12 Mirpur Road",
            billing_city="Dhaka",
            billing_region="Dhaka",
            billing_country="Bangladesh",
            shipping_address="12 Mirpur Road",
            shipping_city="Dhaka",
            shipping_region="Dhaka",
            shipping_country="Bangladesh",
            payment_method=tmpl.get("payment_method", "bKash"),
            payment_transaction_id="BKX92837465" if payment_status == "paid" else None,
            paid_amount=paid_amount,
            due_amount=due_amount,
            refund_amount=grand_total if payment_status == "refunded" else Decimal("0"),
            courier=tmpl.get("courier", "Pathao" if shipment_status != "unfulfilled" else None),
            tracking_number=tmpl.get("tracking_number", "PTH-8827364" if shipment_status != "unfulfilled" else None),
            tracking_url="https://pathao.com/track/8827364" if shipment_status != "unfulfilled" else None,
            shipping_cost=shipping_amount,
            subtotal=subtotal,
            discount_amount=discount_amount,
            tax_amount=tax_amount,
            shipping_amount=shipping_amount,
            grand_total=grand_total,
            ai_risk=risk,
            ai_summary="COD order — verify address before confirm." if risk == "medium" else None,
            timeline_json=dump_json([
                {
                    "id": f"t_created_{tmpl['id']}",
                    "type": "created",
                    "title": "Order placed",
                    "actor": "System",
                    "actorInitials": "SY",
                    "at": order_dates[index] + "Z",
                },
            ]),
            activities_json=dump_json([]),
            comments_json=dump_json([]),
            attachments_json=dump_json([]),
            payment_timeline_json=dump_json([
                {
                    "id": f"pt_{tmpl['id']}",
                    "label": "Payment received" if payment_status == "paid" else "Awaiting payment",
                    "amount": float(paid_amount),
                    "status": "completed" if payment_status == "paid" else "pending",
                    "at": order_dates[index],
                },
            ]),
            ai_insights_json=dump_json(_default_ai_insights(risk, score)),
            followers_json=dump_json(["Karim Ahmed"]),
        )
        db.add(order)
        db.flush()

        for variant, product, qty, unit_price, line_discount, line_tax, line_total, line_idx in line_rows:
            db.add(
                CommerceOrderItem(
                    order_id=order.id,
                    product_id=product.id,
                    item_id=product.item_id or product.id,
                    variant_id=variant.id,
                    sku=variant.sku,
                    name=product.name,
                    image_url=product.thumbnail,
                    variant_label=variant.name if variant.name != "Default" else None,
                    quantity=qty,
                    unit_price=unit_price,
                    discount_amount=line_discount,
                    tax_amount=line_tax,
                    line_total=line_total,
                    sort_order=line_idx,
                ),
            )

        inserted += 1

    if inserted:
        db.commit()
    return inserted


def seed_customers(db) -> int:
    existing_codes = {code for code, in db.query(CommerceCustomer.customer_code).all()}
    inserted = 0
    for item in CUSTOMER_SEED:
        if item["customer_code"] in existing_codes:
            continue
        row = CommerceCustomer(
            id=item["id"],
            customer_code=item["customer_code"],
            name=item["name"],
            phone=item["phone"],
            email=item["email"],
            group=item["group"],
            status=item["status"],
            loyalty_tier=item["loyalty_tier"],
            city=item["city"],
            region=item["region"],
            country=item["country"],
            customer_since=item["customer_since"],
            last_order_date=item.get("last_order_date"),
            assigned_staff=item.get("assigned_staff"),
            tags_json=dump_json(item.get("tags", [])),
            total_orders=item.get("total_orders", 0),
            total_spend=item.get("total_spend", Decimal("0")),
            avg_order_value=item.get("avg_order_value", Decimal("0")),
            return_rate=item.get("return_rate", Decimal("0")),
            reward_points=item.get("reward_points", 0),
            wallet_balance=item.get("wallet_balance", Decimal("0")),
            risk_score=item.get("risk_score", 0),
            risk_level=item.get("risk_level", "low"),
            addresses_json=dump_json(item.get("addresses", [])),
            wallet_transactions_json=dump_json(item.get("wallet_transactions", [])),
            reward_events_json=dump_json(item.get("reward_events", [])),
            timeline_json=dump_json(item.get("timeline", [])),
            comments_json=dump_json(item.get("comments", [])),
            activities_json=dump_json(item.get("activities", [])),
            attachments_json=dump_json(item.get("attachments", [])),
            ai_insights_json=dump_json(item.get("ai_insights", {})),
        )
        from app.services.parties.commerce_party_bridge import ensure_party_for_customer

        ensure_party_for_customer(db, row)
        db.add(row)
        inserted += 1
    if inserted:
        db.commit()
    return inserted


RETURN_SEED = [
    {
        "id": "ret_001",
        "return_number": "RMA-5001",
        "order_id": "ord_1004",
        "order_number": "ORD-1004",
        "customer_name": "Rakibul Hasan",
        "product_name": "Wireless Earbuds Pro",
        "sku": "SKU-0002",
        "quantity": 1,
        "reason": "Defective — left earbud not working",
        "status": "requested",
        "amount": Decimal("3499"),
        "assigned_staff": "Sadia Rahman",
        "created_at": "2026-06-12T09:00:00",
    },
    {
        "id": "ret_002",
        "return_number": "RMA-5002",
        "order_id": "ord_1002",
        "order_number": "ORD-1002",
        "customer_name": "Fatima Khan",
        "product_name": "Smart Watch Series 5",
        "sku": "SKU-0005",
        "quantity": 1,
        "reason": "Wrong size band received",
        "status": "review",
        "amount": Decimal("8900"),
        "assigned_staff": "Rahim Uddin",
        "created_at": "2026-06-11T14:30:00",
    },
    {
        "id": "ret_003",
        "return_number": "RMA-5003",
        "order_id": "ord_1005",
        "order_number": "ORD-1005",
        "customer_name": "Nasrin Akter",
        "product_name": "Ceramic Coffee Mug Set",
        "sku": "SKU-0003",
        "quantity": 2,
        "reason": "Damaged in shipping",
        "status": "approved",
        "amount": Decimal("1200"),
        "assigned_staff": "Sadia Rahman",
        "created_at": "2026-06-10T11:00:00",
    },
    {
        "id": "ret_004",
        "return_number": "RMA-5004",
        "order_id": "ord_1003",
        "order_number": "ORD-1003",
        "customer_name": "Tanvir Ahmed",
        "product_name": "Running Shoes Ultra",
        "sku": "SKU-0004",
        "quantity": 1,
        "reason": "Size mismatch — ordered 42, received 40",
        "status": "received",
        "amount": Decimal("5200"),
        "assigned_staff": "Warehouse Team",
        "created_at": "2026-06-08T16:00:00",
    },
    {
        "id": "ret_005",
        "return_number": "RMA-5005",
        "order_id": "ord_1001",
        "order_number": "ORD-1001",
        "customer_name": "Rahim Uddin",
        "product_name": "Premium Cotton T-Shirt",
        "sku": "SKU-0001",
        "quantity": 1,
        "reason": "Color different from website",
        "status": "inspected",
        "amount": Decimal("899"),
        "assigned_staff": "Warehouse Team",
        "created_at": "2026-06-07T10:00:00",
    },
    {
        "id": "ret_006",
        "return_number": "RMA-5006",
        "order_id": "ord_1006",
        "order_number": "ORD-1006",
        "customer_name": "Jahidul Islam",
        "product_name": "Bluetooth Speaker Mini",
        "sku": "SKU-0007",
        "quantity": 1,
        "reason": "Not as described — battery life poor",
        "status": "completed",
        "amount": Decimal("2100"),
        "created_at": "2026-06-01T08:00:00",
    },
    {
        "id": "ret_007",
        "return_number": "RMA-5007",
        "order_id": "ord_1007",
        "order_number": "ORD-1007",
        "customer_name": "Karim Ahmed",
        "product_name": "LED Desk Lamp",
        "sku": "SKU-0010",
        "quantity": 1,
        "reason": "Changed mind",
        "status": "rejected",
        "amount": Decimal("1850"),
        "created_at": "2026-05-28T12:00:00",
    },
]


REVIEW_SEED = [
    {
        "id": "rev_001",
        "review_number": "R-20001",
        "product_slug": "dell-inspiron-15",
        "customer_id": "cust_001",
        "customer_name": "Rahim Uddin",
        "review_type": "photo",
        "status": "approved",
        "rating": 5,
        "title": "Best laptop I've ever bought — completely worth it!",
        "body": "Performance is outstanding, the display is gorgeous, and the battery easily lasts all day.",
        "sentiment": "positive",
        "is_verified_purchase": True,
        "helpful_votes": 47,
        "moderated_by": "Sumaiya Akter",
        "created_at": "2026-06-10T10:00:00",
    },
    {
        "id": "rev_002",
        "review_number": "R-20002",
        "product_slug": "asus-tuf-gaming-f15",
        "customer_id": "cust_002",
        "customer_name": "Fatima Khan",
        "review_type": "text",
        "status": "pending",
        "rating": 2,
        "title": "Disappointed — overheats constantly",
        "body": "It overheats during video calls and the fan noise is unbearable. Considering returning it.",
        "sentiment": "negative",
        "is_verified_purchase": True,
        "helpful_votes": 12,
        "created_at": "2026-06-11T14:00:00",
    },
    {
        "id": "rev_003",
        "review_number": "R-20003",
        "product_slug": "logitech-mx-master-3s",
        "customer_id": "cust_003",
        "customer_name": "Karim Ahmed",
        "review_type": "verified",
        "status": "approved",
        "rating": 4,
        "title": "Great mouse, scroll wheel could be better",
        "body": "Comfortable for long sessions. Side buttons are well placed. Scroll wheel feels a bit stiff.",
        "sentiment": "positive",
        "is_verified_purchase": True,
        "helpful_votes": 23,
        "moderated_by": "Admin",
        "created_at": "2026-06-09T08:30:00",
    },
    {
        "id": "rev_004",
        "review_number": "R-20004",
        "product_slug": "hp-pavilion-14",
        "customer_id": "cust_001",
        "customer_name": "Rahim Uddin",
        "review_type": "text",
        "status": "rejected",
        "rating": 1,
        "title": "Terrible experience — do not buy",
        "body": "Product arrived damaged and support refused a replacement. One star.",
        "sentiment": "negative",
        "is_verified_purchase": False,
        "helpful_votes": 3,
        "moderated_by": "Admin",
        "created_at": "2026-06-08T16:00:00",
    },
    {
        "id": "rev_005",
        "review_number": "R-20005",
        "product_slug": "macbook-air-m2",
        "customer_id": "cust_002",
        "customer_name": "Fatima Khan",
        "review_type": "photo",
        "status": "approved",
        "rating": 5,
        "title": "Perfect for students and professionals",
        "body": "Lightweight, silent, and the M2 chip handles everything I throw at it.",
        "sentiment": "positive",
        "is_verified_purchase": True,
        "helpful_votes": 61,
        "moderated_by": "Sumaiya Akter",
        "created_at": "2026-06-07T11:00:00",
    },
    {
        "id": "rev_006",
        "review_number": "R-20006",
        "product_slug": "lenovo-ideapad-slim-5",
        "customer_id": "cust_003",
        "customer_name": "Karim Ahmed",
        "review_type": "text",
        "status": "spam",
        "rating": 3,
        "title": "CLICK HERE FOR FREE LAPTOP!!!",
        "body": "Visit my website for amazing deals and free gifts!!!",
        "sentiment": "neutral",
        "is_verified_purchase": False,
        "helpful_votes": 0,
        "moderated_by": "AI Agent",
        "created_at": "2026-06-06T09:00:00",
    },
    {
        "id": "rev_007",
        "review_number": "R-20007",
        "product_slug": "razer-deathadder-v3",
        "customer_id": "cust_001",
        "customer_name": "Rahim Uddin",
        "review_type": "text",
        "status": "pending",
        "rating": 4,
        "title": "Solid gaming mouse for the price",
        "body": "Responsive clicks and comfortable grip. Software could use an update.",
        "sentiment": "positive",
        "is_verified_purchase": True,
        "helpful_votes": 8,
        "created_at": "2026-06-12T09:30:00",
    },
    {
        "id": "rev_008",
        "review_number": "R-20008",
        "product_slug": "dell-inspiron-15",
        "customer_id": "cust_002",
        "customer_name": "Fatima Khan",
        "review_type": "text",
        "status": "archived",
        "rating": 3,
        "title": "Mixed feelings after 6 months",
        "body": "Started great but battery degraded quickly. Still usable for office work.",
        "sentiment": "mixed",
        "is_verified_purchase": True,
        "helpful_votes": 15,
        "moderated_by": "Admin",
        "created_at": "2026-05-20T10:00:00",
    },
]


QA_SEED = [
    {
        "id": "qa_001",
        "question_number": "Q-20001",
        "customer_name": "Rafi Ahmed",
        "question": "Does this include the original charger and box?",
        "answer": "Yes — sealed retail box with charger and documentation.",
        "answered_by": "Admin",
        "status": "answered",
        "is_verified": True,
        "created_at": "2026-06-01T10:00:00",
    },
    {
        "id": "qa_002",
        "question_number": "Q-20002",
        "customer_name": "Nusrat Jahan",
        "question": "Is international warranty available in Bangladesh?",
        "answer": None,
        "answered_by": None,
        "status": "pending",
        "is_verified": False,
        "created_at": "2026-06-08T12:30:00",
    },
    {
        "id": "qa_003",
        "question_number": "Q-20003",
        "customer_name": "Karim Hossain",
        "question": "Can I use this with a 65W GaN charger?",
        "answer": "Yes, PD chargers up to the supported wattage work fine.",
        "answered_by": "Support",
        "status": "answered",
        "is_verified": True,
        "created_at": "2026-06-12T09:15:00",
    },
    {
        "id": "qa_004",
        "question_number": "Q-20004",
        "customer_name": "Sadia Islam",
        "question": "What is the return window if the seal is unbroken?",
        "answer": None,
        "answered_by": None,
        "status": "pending",
        "is_verified": False,
        "created_at": "2026-06-18T16:40:00",
    },
    {
        "id": "qa_005",
        "question_number": "Q-20005",
        "customer_name": "Imran Kabir",
        "question": "Does the color look cooler in person than the photos?",
        "answer": "Lighting varies; in-store samples match the listing photos closely.",
        "answered_by": "Admin",
        "status": "answered",
        "is_verified": False,
        "created_at": "2026-06-22T11:05:00",
    },
    {
        "id": "qa_006",
        "question_number": "Q-20006",
        "customer_name": "Farhana Akter",
        "question": "Is COD available outside Dhaka?",
        "answer": None,
        "answered_by": None,
        "status": "archived",
        "is_verified": False,
        "created_at": "2026-05-20T08:00:00",
    },
    {
        "id": "qa_007",
        "question_number": "Q-20007",
        "customer_name": "Tanvir Hasan",
        "question": "How long does delivery usually take to Chittagong?",
        "answer": "Typically 2–4 business days depending on courier capacity.",
        "answered_by": "Admin",
        "status": "answered",
        "is_verified": True,
        "created_at": "2026-06-25T14:20:00",
    },
    {
        "id": "qa_008",
        "question_number": "Q-20008",
        "customer_name": "Maliha Rahman",
        "question": "Can I gift-wrap this for a birthday delivery?",
        "answer": None,
        "answered_by": None,
        "status": "pending",
        "is_verified": False,
        "created_at": "2026-07-01T09:45:00",
    },
    {
        "id": "qa_009",
        "question_number": "Q-20009",
        "customer_name": "Arif Chowdhury",
        "question": "Does the package include a user manual in English?",
        "answer": "Yes — English manual is included in the box.",
        "answered_by": "Support",
        "status": "answered",
        "is_verified": True,
        "created_at": "2026-07-05T11:10:00",
    },
    {
        "id": "qa_010",
        "question_number": "Q-20010",
        "customer_name": "Sumaiya Akter",
        "question": "Is there an official service center for repairs?",
        "answer": "Authorized service partners are available in Dhaka and major cities.",
        "answered_by": "Admin",
        "status": "answered",
        "is_verified": True,
        "created_at": "2026-07-10T16:00:00",
    },
    {
        "id": "qa_011",
        "question_number": "Q-20011",
        "customer_name": "Jahidul Islam",
        "question": "Will you price-match if I find it cheaper locally?",
        "answer": None,
        "answered_by": None,
        "status": "pending",
        "is_verified": False,
        "created_at": "2026-07-12T08:30:00",
    },
    {
        "id": "qa_012",
        "question_number": "Q-20012",
        "customer_name": "Priya Sultana",
        "question": "Can I reserve one unit for weekend pickup?",
        "answer": "Yes — contact support with your preferred store and we will hold it for 48 hours.",
        "answered_by": "Admin",
        "status": "answered",
        "is_verified": False,
        "created_at": "2026-07-15T13:25:00",
    },
]


def seed_product_qa(db, *, force: bool = False) -> int:
    """Upsert catalog product Q&A from QA_SEED onto real products."""
    _ = force
    products = db.query(CatalogProduct).order_by(CatalogProduct.created_at.desc()).all()
    if not products:
        return 0

    upserted = 0
    for index, item in enumerate(QA_SEED):
        product = products[index % len(products)]
        created_at = datetime.fromisoformat(item["created_at"])
        row = db.get(CatalogProductQa, item["id"])
        if row is None:
            row = CatalogProductQa(id=item["id"])
            db.add(row)
        row.question_number = item["question_number"]
        row.product_id = product.id
        row.product_name = product.name
        row.product_sku = product.sku or ""
        row.product_brand = product.brand
        row.product_category = product.category
        row.product_image_url = product.thumbnail
        row.customer_name = item["customer_name"]
        row.question = item["question"]
        row.answer = item["answer"]
        row.answered_by = item["answered_by"]
        row.status = item["status"]
        row.is_verified = item["is_verified"]
        row.created_at = created_at
        upserted += 1

    if upserted:
        db.commit()
    return upserted


def seed_reviews(db, *, force: bool = False) -> int:
    """Upsert catalog product reviews from REVIEW_SEED onto real products."""
    _ = force  # kept for callers; upsert is always idempotent by id
    products = db.query(CatalogProduct).order_by(CatalogProduct.created_at.desc()).all()
    if not products:
        return 0

    slug_to_product = {product.slug: product for product in products}
    upserted = 0
    for index, item in enumerate(REVIEW_SEED):
        product = slug_to_product.get(item["product_slug"]) or products[index % len(products)]
        row = db.get(CatalogProductReview, item["id"])
        if row is None:
            row = CatalogProductReview(id=item["id"])
            db.add(row)
        row.review_number = item["review_number"]
        row.product_id = product.id
        row.product_name = product.name
        row.product_sku = product.sku or ""
        row.product_brand = product.brand
        row.product_category = product.category
        row.product_image_url = product.thumbnail
        row.customer_id = item.get("customer_id")
        row.customer_name = item["customer_name"]
        row.review_type = item["review_type"]
        row.status = item["status"]
        row.rating = item["rating"]
        row.title = item["title"]
        row.body = item["body"]
        row.sentiment = item["sentiment"]
        row.is_verified_purchase = item["is_verified_purchase"]
        row.helpful_votes = item["helpful_votes"]
        row.moderated_by = item.get("moderated_by")
        row.created_at = datetime.fromisoformat(item["created_at"])
        upserted += 1

    if upserted:
        db.commit()
    return upserted


REFUND_SEED = [
    {
        "id": "ref_001",
        "refund_number": "REF-3001",
        "order_id": "ord_1006",
        "order_number": "ORD-1006",
        "customer_name": "Jahidul Islam",
        "amount": Decimal("2100"),
        "method": "bKash",
        "reason": "Return completed — RMA-5006",
        "status": "completed",
        "approved_by": "Manager",
        "created_at": "2026-06-02T10:00:00",
    },
    {
        "id": "ref_002",
        "refund_number": "REF-3002",
        "order_id": "ord_1002",
        "order_number": "ORD-1002",
        "customer_name": "Fatima Khan",
        "amount": Decimal("8900"),
        "method": "Card",
        "reason": "Partial refund — shipping delay compensation",
        "status": "pending",
        "created_at": "2026-06-12T11:00:00",
    },
    {
        "id": "ref_003",
        "refund_number": "REF-3003",
        "order_id": "ord_1003",
        "order_number": "ORD-1003",
        "customer_name": "Tanvir Ahmed",
        "amount": Decimal("5200"),
        "method": "Nagad",
        "reason": "Return approved — awaiting item receipt",
        "status": "approved",
        "approved_by": "Sadia Rahman",
        "created_at": "2026-06-09T09:00:00",
    },
    {
        "id": "ref_004",
        "refund_number": "REF-3004",
        "order_id": "ord_1008",
        "order_number": "ORD-1008",
        "customer_name": "Mossiur Rahman",
        "amount": Decimal("4500"),
        "method": "bKash",
        "reason": "Duplicate payment charged",
        "status": "processing",
        "approved_by": "Manager",
        "created_at": "2026-06-11T15:00:00",
    },
    {
        "id": "ref_005",
        "refund_number": "REF-3005",
        "order_id": "ord_1007",
        "order_number": "ORD-1007",
        "customer_name": "Unknown User",
        "amount": Decimal("1850"),
        "method": "COD",
        "reason": "Return rejected — outside policy window",
        "status": "rejected",
        "approved_by": "Manager",
        "created_at": "2026-05-29T10:00:00",
    },
]


def seed_refunds(db) -> int:
    if db.query(CommerceOrderRefund).count() > 0:
        return 0
    if db.query(CommerceOrder).count() == 0:
        return 0

    inserted = 0
    for item in REFUND_SEED:
        if db.get(CommerceOrder, item["order_id"]) is None:
            continue
        db.add(
            CommerceOrderRefund(
                id=item["id"],
                refund_number=item["refund_number"],
                order_id=item["order_id"],
                order_number=item["order_number"],
                customer_name=item["customer_name"],
                amount=item["amount"],
                method=item["method"],
                reason=item["reason"],
                status=item["status"],
                approved_by=item.get("approved_by"),
                created_at=datetime.fromisoformat(item["created_at"]),
            ),
        )
        inserted += 1

    if inserted:
        db.commit()
    return inserted


def seed_returns(db) -> int:
    if db.query(CommerceOrderReturn).count() > 0:
        return 0
    if db.query(CommerceOrder).count() == 0:
        return 0

    inserted = 0
    for item in RETURN_SEED:
        if db.get(CommerceOrder, item["order_id"]) is None:
            continue
        db.add(
            CommerceOrderReturn(
                id=item["id"],
                return_number=item["return_number"],
                order_id=item["order_id"],
                order_number=item["order_number"],
                customer_name=item["customer_name"],
                product_name=item["product_name"],
                sku=item["sku"],
                quantity=item["quantity"],
                reason=item["reason"],
                status=item["status"],
                amount=item["amount"],
                assigned_staff=item.get("assigned_staff"),
                created_at=datetime.fromisoformat(item["created_at"]),
            ),
        )
        inserted += 1

    if inserted:
        db.commit()
    return inserted


VENDOR_TYPE_SEED = (
    ("dealer", "Dealer"),
    ("distributor", "Distributor"),
    ("reseller", "Reseller"),
    ("retailer", "Retailer"),
    ("corporate", "Corporate"),
    ("wholesaler", "Wholesaler"),
    ("system_integrator", "System Integrator"),
    ("online_seller", "Online Seller"),
    ("regional_partner", "Regional Partner"),
    ("vip_partner", "VIP Partner"),
)


def ensure_commerce_order_vendor_columns() -> None:
    """Loose linkage from a real order back to the vendor request that
    created it (STEP 12) — same no-FK-constraint convention as
    commerce_orders.customer_id, so this never blocks core order writes."""
    statements = [
        "ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(36)",
        "ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS vendor_quotation_id VARCHAR(36)",
        "ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS vendor_order_request_id VARCHAR(36)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_vendor_quotation_revision_columns() -> None:
    """Additive vendor quotation schema for STEP 18 (revision chain)."""
    statements = [
        "ALTER TABLE vendor_quotations ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE vendor_quotations ADD COLUMN IF NOT EXISTS previous_quotation_id VARCHAR(36)",
        "ALTER TABLE vendor_quotations ADD COLUMN IF NOT EXISTS superseded_by_id VARCHAR(36)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_vendor_credit_columns() -> None:
    """Additive vendor order request schema for STEP 14 (credit flag)."""
    statements = [
        "ALTER TABLE vendor_order_requests ADD COLUMN IF NOT EXISTS requires_credit_approval BOOLEAN NOT NULL DEFAULT FALSE",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_vendor_pricing_columns() -> None:
    """Additive vendor pricing schema for Vendor module STEP 07.

    vendors/vendor_groups already existed by the time price lists were
    built, so their price_list_id link is added here rather than in the
    model's original create_all pass.
    """
    statements = [
        "ALTER TABLE vendors ADD COLUMN IF NOT EXISTS price_list_id VARCHAR(36)",
        "ALTER TABLE vendor_groups ADD COLUMN IF NOT EXISTS price_list_id VARCHAR(36)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_catalog_product_updated_by_columns() -> None:
    """catalog_products.updated_by_id / updated_by_name - who made the last change (app/services/audit_actor.py)."""
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS updated_by_id VARCHAR(36)"))
        conn.execute(text("ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS updated_by_name VARCHAR(255)"))


def ensure_role_publish_column() -> None:
    """auth_role_permissions.can_publish (docs/AI/ai.md step 1.3). Added once; roles that could write get it, so nobody loses a right."""
    with engine.begin() as conn:
        conn.execute(text(
            "DO $$ BEGIN "
            "IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_role_permissions' AND column_name = 'can_publish') THEN "
            "ALTER TABLE auth_role_permissions ADD COLUMN can_publish BOOLEAN NOT NULL DEFAULT FALSE; "
            "UPDATE auth_role_permissions SET can_publish = TRUE WHERE can_write = TRUE; "
            "END IF; END $$;"
        ))


def ensure_role_export_column() -> None:
    """auth_role_permissions.can_export (docs/AI/ai.md step 1.3). Added once; roles that could write get it."""
    with engine.begin() as conn:
        conn.execute(text(
            "DO $$ BEGIN "
            "IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auth_role_permissions' AND column_name = 'can_export') THEN "
            "ALTER TABLE auth_role_permissions ADD COLUMN can_export BOOLEAN NOT NULL DEFAULT FALSE; "
            "UPDATE auth_role_permissions SET can_export = TRUE WHERE can_write = TRUE; "
            "END IF; END $$;"
        ))


def seed_vendor_types(db) -> int:
    """SPEC.md §5 — example types, seeded so the admin UI isn't empty on day one."""
    existing_codes = {code for code, in db.query(VendorType.code).all()}
    inserted = 0
    for code, name in VENDOR_TYPE_SEED:
        if code in existing_codes:
            continue
        db.add(VendorType(code=code, name=name, is_system=True))
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def seed_suppliers(db) -> int:
    existing_codes = {code for code, in db.query(CommerceSupplier.vendor_code).all()}
    inserted = 0
    for item in SUPPLIER_SEED:
        if item["vendor_code"] in existing_codes:
            continue
        row = CommerceSupplier(
            id=item["id"],
            vendor_code=item["vendor_code"],
            name=item["name"],
            email=item["email"],
            phone=item["phone"],
            payment_terms=item["payment_terms"],
            lead_time_days=item["lead_time_days"],
            rating=item["rating"],
            open_pos=item.get("open_pos", 0),
            spend_ytd=item.get("spend_ytd", Decimal("0")),
            status=item["status"],
            country=item["country"],
            tax_id=item.get("tax_id"),
            website=item.get("website"),
            currency=item.get("currency"),
            min_order_value=item.get("min_order_value"),
            incoterms=item.get("incoterms"),
            buyer_name=item.get("buyer_name"),
            contacts_json=supplier_dump_json(item.get("contacts", [])),
            addresses_json=supplier_dump_json(item.get("addresses", [])),
            contracts_json=supplier_dump_json(item.get("contracts", [])),
            bills_json=supplier_dump_json(item.get("bills", [])),
            performance_json=supplier_dump_json(item.get("performance", {})),
            timeline_json=supplier_dump_json(item.get("timeline", [])),
            rfq_count=item.get("rfq_count", 0),
            receipt_count=item.get("receipt_count", 0),
            has_stock_feed=item.get("has_stock_feed", False),
            total_pos=item.get("total_pos", 0),
        )
        from app.services.parties.commerce_party_bridge import ensure_party_for_supplier

        ensure_party_for_supplier(db, row)
        db.add(row)
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def seed_ai_approvals(db) -> int:
    existing_ids = {row[0] for row in db.query(AiApproval.id).all()}
    inserted = 0
    for item in AI_APPROVAL_SEED:
        if item["id"] in existing_ids:
            continue
        db.add(
            AiApproval(
                id=item["id"],
                agent=item["agent"],
                tool=item["tool"],
                summary=item["summary"],
                reason=item["reason"],
                risk=item["risk"],
                status=item["status"],
                entity=item["entity"],
                requested_at=item["requested_at"],
            ),
        )
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def seed_ai_audit_logs(db) -> int:
    existing_ids = {row[0] for row in db.query(AiAuditLog.id).all()}
    inserted = 0
    for item in AI_AUDIT_LOG_SEED:
        if item["id"] in existing_ids:
            continue
        db.add(
            AiAuditLog(
                id=item["id"],
                action=item["action"],
                agent=item["agent"],
                user=item["user"],
                summary=item["summary"],
                tokens=item["tokens"],
                logged_at=item["logged_at"],
            ),
        )
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def ensure_catalog_attribute_filter_columns() -> None:
    """Storefront filter display type + visibility on catalog attributes."""
    statements = [
        "ALTER TABLE catalog_attributes ADD COLUMN IF NOT EXISTS filter_display_type VARCHAR(30) NOT NULL DEFAULT 'multi_select'",
        "ALTER TABLE catalog_attributes ADD COLUMN IF NOT EXISTS storefront_filter_visible BOOLEAN NOT NULL DEFAULT TRUE",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_catalog_review_columns() -> None:
    statements = [
        "ALTER TABLE catalog_product_reviews ADD COLUMN IF NOT EXISTS customer_image_url VARCHAR(500)",
        "ALTER TABLE catalog_product_reviews ADD COLUMN IF NOT EXISTS media_json TEXT NOT NULL DEFAULT '[]'",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_storefront_customer_case_columns() -> None:
    """Admin/storefront case reply thread storage."""
    statements = [
        "ALTER TABLE storefront_customer_cases ADD COLUMN IF NOT EXISTS replies_json TEXT NOT NULL DEFAULT '[]'",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_commerce_customer_finance_columns() -> None:
    """Customer opening balance + credit limit (Payment tab)."""
    statements = [
        "ALTER TABLE commerce_customers ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0",
        "ALTER TABLE commerce_customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(14, 2) NOT NULL DEFAULT 0",
        "ALTER TABLE commerce_customers ADD COLUMN IF NOT EXISTS whatsapp_verified BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE commerce_customers ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100)",
        "ALTER TABLE commerce_customers ADD COLUMN IF NOT EXISTS payment_schedule VARCHAR(50)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_commerce_supplier_finance_columns() -> None:
    """Supplier opening balance, credit limit, payment schedule (Terms tab)."""
    statements = [
        "ALTER TABLE commerce_suppliers ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0",
        "ALTER TABLE commerce_suppliers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(14, 2) NOT NULL DEFAULT 0",
        "ALTER TABLE commerce_suppliers ADD COLUMN IF NOT EXISTS payment_schedule VARCHAR(50)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_item_barcode_type_column() -> None:
    """Barcode Type (AgainPOS-style: C128/C39/EAN13/EAN8/UPCA/UPCE) on the Item SSOT."""
    statements = [
        "ALTER TABLE items ADD COLUMN IF NOT EXISTS barcode_type VARCHAR(20) DEFAULT 'C128'",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_sales_order_pricing_columns() -> None:
    """Header discount, shipping charge and additional expenses on sales orders."""
    statements = [
        "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS order_discount NUMERIC(14, 2) NOT NULL DEFAULT 0",
        "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS order_discount_type VARCHAR(10) NOT NULL DEFAULT 'fixed'",
        "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_charge NUMERIC(14, 2) NOT NULL DEFAULT 0",
        "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS additional_expenses_json TEXT NOT NULL DEFAULT '[]'",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_inventory_settings_columns() -> None:
    """Sales policy switches on the per-company inventory settings row."""
    statements = [
        "ALTER TABLE inventory_settings ADD COLUMN IF NOT EXISTS warranty_start_basis VARCHAR(20) NOT NULL DEFAULT 'sale'",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_sales_line_serial_columns() -> None:
    """Serial numbers captured on sales order / sales return lines."""
    statements = [
        "ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS serial_numbers_json TEXT",
        "ALTER TABLE sales_return_lines ADD COLUMN IF NOT EXISTS serial_numbers_json TEXT",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_workspace_site_company_id_column() -> None:
    """WorkspaceSite columns added to the model after the live table was created."""
    statements = [
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS company_id VARCHAR(36) NOT NULL DEFAULT 'default'",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS plan VARCHAR(80) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS owner VARCHAR(160) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS primary_domain VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS domain_aliases TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS storefront_url_local VARCHAR(500) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS storefront_url_preview VARCHAR(500) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS storefront_url_production VARCHAR(500) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS git_repo_url VARCHAR(500) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS git_default_branch VARCHAR(120) NOT NULL DEFAULT 'main'",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS vercel_project_id VARCHAR(120) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS vercel_project_name VARCHAR(160) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS vercel_team_slug VARCHAR(120) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS tagline VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS logo_mobile_url VARCHAR(500) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS favicon_url VARCHAR(500) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(50) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS copyright_text VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS business_hours VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS meta_title VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS meta_description TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS meta_keywords TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS options_json TEXT NOT NULL DEFAULT '{}'",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS storefront_cms_json TEXT NOT NULL DEFAULT '{}'",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS currency VARCHAR(12) NOT NULL DEFAULT 'BDT'",
        "ALTER TABLE workspace_sites ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Dhaka'",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_catalog_product_pos_fields_columns() -> None:
    """Not for selling, Weight, Applicable Tax, Selling Price Tax Type (AgainPOS-style)."""
    statements = [
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS not_for_selling BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS in_inventory BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS on_website BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS weight VARCHAR(50)",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 2)",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS tax_type VARCHAR(20) NOT NULL DEFAULT 'exclusive'",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))
    _migrate_drafts_to_unlisted()


UNLISTED_MIGRATION_KEY = "migration.catalog_status_unlisted_v1"


def _migrate_drafts_to_unlisted() -> None:
    """Once: every draft product becomes `unlisted` (the new Website → Unlisted page) and storefront visibility is
    forced to public everywhere — live-ness now follows the product status only. Guarded by a platform setting so
    drafts created later stay drafts."""
    try:
        with engine.begin() as conn:
            done = conn.execute(
                text("SELECT 1 FROM platform_settings WHERE key = :k"), {"k": UNLISTED_MIGRATION_KEY}
            ).first()
            if done:
                return
            conn.execute(
                text(
                    "UPDATE items SET status = 'unlisted' WHERE status = 'draft' AND id IN "
                    "(SELECT item_id FROM catalog_products WHERE status = 'draft' AND item_id IS NOT NULL)"
                )
            )
            conn.execute(text("UPDATE catalog_products SET status = 'unlisted' WHERE status = 'draft'"))
            conn.execute(text("UPDATE catalog_products SET visibility = 'public' WHERE visibility <> 'public'"))
            conn.execute(text("UPDATE ecommerce_items SET visibility = 'public' WHERE visibility <> 'public'"))
            conn.execute(
                text(
                    "INSERT INTO platform_settings (key, value, description, is_secret) "
                    "VALUES (:k, 'done', 'Drafts moved to the Unlisted status', false)"
                ),
                {"k": UNLISTED_MIGRATION_KEY},
            )
    except Exception:  # platform_settings / items not created yet on a brand-new database: the next start runs it
        logging.getLogger(__name__).warning("Unlisted status migration skipped", exc_info=True)


def ensure_catalog_product_variant_purchase_price_column() -> None:
    """Per-variant Purchase price, backing the variant matrix's Margin calculator."""
    statements = [
        "ALTER TABLE catalog_product_variants ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12, 2)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_sales_return_discount_column() -> None:
    """Return-level discount, applied on top of the returned lines' subtotal."""
    statements = [
        "ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_sales_return_line_discount_column() -> None:
    """Per-line discount on a return line, mirroring sales_order_lines.discount_amount."""
    statements = [
        "ALTER TABLE sales_return_lines ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_catalog_product_combo_components_column() -> None:
    """Combo product composition (product_type == 'combo') — JSON list of components."""
    statements = [
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS combo_components_json TEXT",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_vendor_terms_columns() -> None:
    """Vendor opening balance + payment schedule (Terms tab)."""
    statements = [
        "ALTER TABLE vendors ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0",
        "ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_schedule VARCHAR(50)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_cloudflare_plugin_columns() -> None:
    statements = [
        "ALTER TABLE plugin_cloudflare ADD COLUMN IF NOT EXISTS auth_method VARCHAR(20) NOT NULL DEFAULT 'manual'",
        "ALTER TABLE plugin_cloudflare ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE plugin_cloudflare ADD COLUMN IF NOT EXISTS account_name VARCHAR(120) NOT NULL DEFAULT ''",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_ai_audit_log_columns() -> None:
    """Extend the pre-existing ai_audit_logs table (dashboard-shaped: action/agent/user/
    summary/tokens) with the fields STEP 11 needs for a real per-tool-call and per-chat-turn
    trail, instead of creating a rival table. See AGAINERP_AI_OS_MASTER_PLAN.md §24/§34."""
    statements = [
        "ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)",
        "ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS conversation_id VARCHAR(36)",
        "ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS provider_id VARCHAR(40)",
        "ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS model_id VARCHAR(80)",
        "ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS tool_name VARCHAR(120)",
        "ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS tool_input_json TEXT",
        "ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS tool_output_json TEXT",
        "ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS risk_tier VARCHAR(20)",
        "ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS module VARCHAR(80)",
        "ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'success'",
        "ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS latency_ms INTEGER",
        "ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS input_tokens INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS output_tokens INTEGER NOT NULL DEFAULT 0",
        "CREATE INDEX IF NOT EXISTS ix_ai_audit_logs_conversation_id ON ai_audit_logs (conversation_id)",
        "CREATE INDEX IF NOT EXISTS ix_ai_audit_logs_user_id ON ai_audit_logs (user_id)",
        # STEP 14 — prompt caching.
        "ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE ai_audit_logs ADD COLUMN IF NOT EXISTS cache_read_input_tokens INTEGER NOT NULL DEFAULT 0",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_zkteco_plugin_columns() -> None:
    """Add device setup fields to existing Phase 1 ZKTeco installations."""
    statements = [
        "ALTER TABLE plugin_zkteco ADD COLUMN IF NOT EXISTS device_name VARCHAR(100) NOT NULL DEFAULT 'F22'",
        "ALTER TABLE plugin_zkteco ADD COLUMN IF NOT EXISTS device_serial_number VARCHAR(64) NOT NULL DEFAULT 'JJA1254800682'",
        "ALTER TABLE plugin_zkteco ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(40) NOT NULL DEFAULT '6.60'",
        "ALTER TABLE plugin_zkteco ADD COLUMN IF NOT EXISTS push_version VARCHAR(40) NOT NULL DEFAULT '3.1.2'",
        "ALTER TABLE plugin_zkteco ADD COLUMN IF NOT EXISTS server_address VARCHAR(255) NOT NULL DEFAULT '192.168.10.46'",
        "ALTER TABLE plugin_zkteco ADD COLUMN IF NOT EXISTS server_port INTEGER NOT NULL DEFAULT 7074",
        "ALTER TABLE plugin_zkteco ADD COLUMN IF NOT EXISTS https_enabled BOOLEAN NOT NULL DEFAULT FALSE",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_website_menu_columns() -> None:
    """Add menu auto fields + slot title/nav_style for Shop trigger config."""
    statements = [
        "ALTER TABLE website_menus ADD COLUMN IF NOT EXISTS auto_type VARCHAR(16) NOT NULL DEFAULT 'category'",
        "ALTER TABLE website_menus ADD COLUMN IF NOT EXISTS auto_show_new BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE website_menu_slots ADD COLUMN IF NOT EXISTS title VARCHAR(80) NOT NULL DEFAULT ''",
        "ALTER TABLE website_menu_slots ADD COLUMN IF NOT EXISTS nav_style VARCHAR(16) NOT NULL DEFAULT 'megamenu'",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))
        conn.execute(
            text(
                "UPDATE website_menus SET auto_type = 'category' "
                "WHERE system_key = 'catalog' AND (auto_type IS NULL OR auto_type = '')"
            )
        )
        # Default Shop trigger label.
        conn.execute(
            text(
                "UPDATE website_menu_slots SET title = 'SHOP' "
                "WHERE slot_key = 'catalog.shop' AND (title IS NULL OR title = '')"
            )
        )


def ensure_website_page_columns() -> None:
    statements = [
        "ALTER TABLE website_pages ADD COLUMN IF NOT EXISTS body_html TEXT NOT NULL DEFAULT ''",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


CONTENT_PAGE_SEEDS: list[dict] = [
    {
        "id": "pg-about",
        "name": "About Us",
        "slug": "about",
        "description": "About TechPickly",
        "body_html": (
            "<p>TechPickly connects Bangladesh with China wholesale — source products, "
            "compare prices in BDT, and ship with trusted logistics you can rely on.</p>"
            "<h3>China sourcing for Bangladesh</h3>"
            "<p>Browse 1688 / Taobao style catalogs, lock prices in BDT, and place orders "
            "with air or sea shipping options.</p>"
            "<ul><li>Wholesale sourcing from China suppliers</li>"
            "<li>Transparent BDT pricing and shipping estimates</li>"
            "<li>Order tracking from China warehouse to Bangladesh</li>"
            "<li>Customer support in Bangla and English</li></ul>"
        ),
        "seo": {
            "meta_title": "About Us | TechPickly",
            "meta_description": "TechPickly connects Bangladesh with China wholesale and trusted logistics.",
        },
    },
    {
        "id": "pg-privacy",
        "name": "Privacy Policy",
        "slug": "privacy-policy",
        "description": "How we collect and use personal data",
        "body_html": (
            "<h3>1. Information We Collect</h3>"
            "<p>We may collect personal information such as your name, email, phone, "
            "billing/shipping address, and order details when you use our website.</p>"
            "<h3>2. How We Use Your Information</h3>"
            "<p>Your information is used to process orders, deliver products, provide support, "
            "and improve the storefront experience.</p>"
            "<h3>3. Cookies and Tracking</h3>"
            "<p>We use cookies to remember preferences, support secure checkout, and improve performance.</p>"
            "<h3>4. Sharing of Information</h3>"
            "<p>We do not sell your personal information. We may share it with trusted payment "
            "and logistics partners to fulfill orders.</p>"
            "<h3>5. Contact Us</h3>"
            "<p>Questions about this Privacy Policy can be sent through our Contact page.</p>"
        ),
        "seo": {
            "meta_title": "Privacy Policy | TechPickly",
            "meta_description": "Privacy policy for TechPickly customers.",
        },
    },
    {
        "id": "pg-terms",
        "name": "Terms & Conditions",
        "slug": "terms",
        "description": "Store terms of use",
        "body_html": (
            "<h3>1. Acceptance of Terms</h3>"
            "<p>By accessing this website and placing orders, you agree to these Terms &amp; Conditions.</p>"
            "<h3>2. Products &amp; Pricing</h3>"
            "<p>Product availability, specifications, and prices may change without prior notice.</p>"
            "<h3>3. Orders &amp; Payment</h3>"
            "<p>You are responsible for providing accurate shipping and billing information. "
            "Orders typically require advance payment as stated at checkout.</p>"
            "<h3>4. Delivery</h3>"
            "<p>Delivery timelines are estimates and may vary by air/sea mode and courier partner.</p>"
        ),
        "seo": {
            "meta_title": "Terms & Conditions | TechPickly",
            "meta_description": "Terms and conditions for shopping at TechPickly.",
        },
    },
    {
        "id": "pg-delivery",
        "name": "Shipping Charge",
        "slug": "shipping-charge",
        "description": "Shipping rates and delivery timelines",
        "body_html": (
            "<h3>By Air</h3>"
            "<p>Faster delivery from China to Bangladesh. Per-kg rates apply after actual weighing.</p>"
            "<h3>By Sea</h3>"
            "<p>Lower cost for heavier shipments with longer transit times.</p>"
            "<h3>Notes</h3>"
            "<p>Listed product weights are estimates. Final shipping is calculated on actual weight "
            "after arrival at our warehouse.</p>"
        ),
        "seo": {
            "meta_title": "Shipping Charge | TechPickly",
            "meta_description": "Air and sea shipping charges from China to Bangladesh.",
        },
    },
    {
        "id": "pg-refund",
        "name": "Refund & Return Policy",
        "slug": "refund-return",
        "description": "Returns and refunds",
        "body_html": (
            "<h3>Eligibility</h3>"
            "<p>Returns depend on supplier rules and product condition. Contact support before returning.</p>"
            "<h3>Refund Process</h3>"
            "<p>Approved refunds are processed to the original payment method or store credit after review.</p>"
            "<h3>Damaged / Wrong items</h3>"
            "<p>Report issues with photos within the stated window so we can open a claim with the supplier.</p>"
        ),
        "seo": {
            "meta_title": "Refund & Return Policy | TechPickly",
            "meta_description": "Refund and return policy for TechPickly.",
        },
    },
    {
        "id": "pg-contact",
        "name": "Contact Us",
        "slug": "contact",
        "description": "Contact TechPickly",
        "body_html": (
            "<p>Have a question about products, orders, or shipping? Reach our team using the form "
            "on this page or the contact details shown beside it.</p>"
            "<p>Bangladesh office: 32/B, Malibagh Chowdhury Para, Dhaka - 1219</p>"
        ),
        "seo": {
            "meta_title": "Contact Us | TechPickly",
            "meta_description": "Contact TechPickly support.",
        },
    },
    {
        "id": "pg-order-track",
        "name": "Order Track",
        "slug": "order-track",
        "description": "Track China-to-BD orders",
        "body_html": (
            "<p>Enter your order or consignment number to track status from China warehouse "
            "to Bangladesh delivery.</p>"
        ),
        "seo": {
            "meta_title": "Order Track | TechPickly",
            "meta_description": "Track your TechPickly order status.",
        },
    },
]


def seed_storefront_content_pages(db) -> int:
    """Upsert published CMS pages used by the storefront footer/content routes."""
    from app.models.website_page import dump_json as website_dump_json
    from app.models.website_settings import DEFAULT_WEBSITE_SETTINGS_ID, WebsiteSettings

    upserted = 0

    # Home Page — always present so admin Pages can open Live Edit → /website/live-edit/home
    home = db.get(WebsitePage, "pg-home")
    if not home:
        home = db.query(WebsitePage).filter(WebsitePage.url == "/").first()
    if not home:
        home = (
            db.query(WebsitePage)
            .filter(WebsitePage.slug.in_(["", "home", "/"]))
            .first()
        )
    home_flags = {
        "is_home": True,
        "is_system": False,
        "is_locked": True,
        "slug_locked": True,
        "delete_disabled": True,
    }
    home_seo = {
        "meta_title": "Againcart — Leading Computer, Laptop & Gadget Shop",
        "meta_description": "Shop computers, laptops, gaming PCs, and gadgets at Againcart.",
        "keywords": "againcart, laptop, computer, bangladesh",
        "og_title": "Againcart",
        "og_description": "Shop computers, laptops, gaming PCs, and gadgets.",
        "og_image": None,
        "canonical_url": "/",
        "indexable": True,
        "schema_type": "WebPage",
    }
    if home:
        changed = False
        if home.name != "Home Page":
            home.name = "Home Page"
            changed = True
        if home.slug not in ("", "home"):
            conflict = (
                db.query(WebsitePage)
                .filter(WebsitePage.slug == "", WebsitePage.id != home.id)
                .first()
            )
            if not conflict:
                home.slug = ""
                changed = True
        if home.url != "/":
            home.url = "/"
            changed = True
        if home.template != "Homepage":
            home.template = "Homepage"
            changed = True
        if home.status != "published":
            home.status = "published"
            changed = True
        if home.visibility != "public":
            home.visibility = "public"
            changed = True
        from app.models.website_page import load_json as wp_load_json

        flags = wp_load_json(home.flags_json, {})
        if not isinstance(flags, dict):
            flags = {}
        if not flags.get("is_home"):
            flags = {
                **home_flags,
                **flags,
                "is_home": True,
                "delete_disabled": True,
                "slug_locked": True,
                "is_locked": True,
            }
            home.flags_json = website_dump_json(flags)
            changed = True
        if changed:
            home.updated_by = "System"
            upserted += 1
    else:
        db.add(
            WebsitePage(
                id="pg-home",
                name="Home Page",
                slug="",
                url="/",
                page_type="website",
                layout="default",
                template="Homepage",
                language="en",
                description="Primary storefront homepage",
                visibility="public",
                status="published",
                seo_status="complete",
                creator="System",
                updated_by="System",
                published_at=datetime.utcnow(),
                body_html="",
                seo_json=website_dump_json(home_seo),
                flags_json=website_dump_json(home_flags),
            )
        )
        upserted += 1

    for item in CONTENT_PAGE_SEEDS:
        row = db.query(WebsitePage).filter(WebsitePage.slug == item["slug"]).first()
        if not row and item["id"]:
            row = db.get(WebsitePage, item["id"])
        seo = item.get("seo") or {}
        if row:
            changed = False
            if row.slug != item["slug"]:
                # Migrate legacy slugs (about-us → about, delivery → shipping-charge)
                conflict = (
                    db.query(WebsitePage)
                    .filter(WebsitePage.slug == item["slug"], WebsitePage.id != row.id)
                    .first()
                )
                if not conflict:
                    row.slug = item["slug"]
                    row.url = f"/{item['slug']}"
                    changed = True
            if row.name != item["name"]:
                row.name = item["name"]
                changed = True
            if not (row.body_html or "").strip():
                row.body_html = item["body_html"]
                changed = True
            if row.status != "published":
                row.status = "published"
                changed = True
            if row.visibility != "public":
                row.visibility = "public"
                changed = True
            if row.description != (item.get("description") or ""):
                row.description = item.get("description") or ""
                changed = True
            if changed:
                upserted += 1
            continue

        if item["slug"] == "about":
            legacy = db.query(WebsitePage).filter(WebsitePage.slug == "about-us").first()
            if legacy:
                legacy.slug = "about"
                legacy.url = "/about"
                legacy.name = item["name"]
                if not (legacy.body_html or "").strip():
                    legacy.body_html = item["body_html"]
                legacy.status = "published"
                legacy.visibility = "public"
                upserted += 1
                continue

        if item["slug"] == "shipping-charge":
            legacy = db.query(WebsitePage).filter(WebsitePage.slug == "delivery").first()
            if legacy:
                legacy.slug = "shipping-charge"
                legacy.url = "/shipping-charge"
                legacy.name = item["name"]
                if not (legacy.body_html or "").strip():
                    legacy.body_html = item["body_html"]
                legacy.status = "published"
                legacy.visibility = "public"
                upserted += 1
                continue

        db.add(
            WebsitePage(
                id=item["id"],
                name=item["name"],
                slug=item["slug"],
                url=f"/{item['slug']}",
                page_type="website",
                layout="default",
                template="Default",
                language="en",
                description=item.get("description") or "",
                visibility="public",
                status="published",
                seo_status="complete",
                creator="System",
                updated_by="System",
                published_at=datetime.utcnow(),
                body_html=item["body_html"],
                seo_json=website_dump_json(seo),
            )
        )
        upserted += 1

    settings = db.get(WebsiteSettings, DEFAULT_WEBSITE_SETTINGS_ID)
    if settings:
        if not (settings.contact_phone or "").strip():
            settings.contact_phone = "+86 188 2376 9373"
            upserted += 1
        if not (settings.whatsapp_number or "").strip():
            settings.whatsapp_number = "+86 188 2376 9373"
            upserted += 1
        if not (settings.address or "").strip():
            settings.address = "32/B, Malibagh Chowdhury Para, Dhaka - 1219"
            upserted += 1
        email = (settings.contact_email or "").strip()
        if not email or email.endswith("@dropshop.local") or "monarch" in email.lower():
            settings.contact_email = "info@techpickly.com"
            upserted += 1

    drafts = (
        db.query(BlogPost)
        .filter(BlogPost.status == "draft")
        .order_by(BlogPost.created_at.asc())
        .limit(3)
        .all()
    )
    for post in drafts:
        post.status = "published"
        if not post.published_at:
            post.published_at = datetime.utcnow()
        upserted += 1

    if upserted:
        db.commit()
    return upserted


def ensure_item_foundation_columns() -> None:
    """Add catalog_products.item_id bridge column for Universal Item SSOT."""
    statements = [
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS item_id VARCHAR(36)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_service_item_columns() -> None:
    """Add Add-item form fields to service_items (description, category, rate, etc.)."""
    statements = [
        "ALTER TABLE service_items ADD COLUMN IF NOT EXISTS description TEXT",
        "ALTER TABLE service_items ADD COLUMN IF NOT EXISTS category VARCHAR(50)",
        "ALTER TABLE service_items ADD COLUMN IF NOT EXISTS unit_type VARCHAR(30)",
        "ALTER TABLE service_items ADD COLUMN IF NOT EXISTS rate NUMERIC(12,2) NOT NULL DEFAULT 0",
        "ALTER TABLE service_items ADD COLUMN IF NOT EXISTS show_in_client_portal BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE service_items ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)",
        "ALTER TABLE service_items ADD COLUMN IF NOT EXISTS created_by VARCHAR(36)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_service_category_columns() -> None:
    """Add parent_id to service_categories for the Add Category tree."""
    statements = [
        "ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS parent_id VARCHAR(36)",
        "ALTER TABLE service_categories DROP CONSTRAINT IF EXISTS uq_service_categories_company_name",
        "ALTER TABLE service_categories DROP CONSTRAINT IF EXISTS uq_service_categories_company_parent_name",
        "ALTER TABLE service_categories ADD CONSTRAINT uq_service_categories_company_parent_name "
        "UNIQUE (company_id, parent_id, name)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_party_foundation_columns() -> None:
    """Add commerce bridge columns for Universal Party SSOT."""
    statements = [
        "ALTER TABLE commerce_customers ADD COLUMN IF NOT EXISTS party_id VARCHAR(36)",
        "ALTER TABLE commerce_suppliers ADD COLUMN IF NOT EXISTS party_id VARCHAR(36)",
        "ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS party_id VARCHAR(36)",
        "ALTER TABLE vendors ADD COLUMN IF NOT EXISTS party_id VARCHAR(36)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def backfill_collaboration_from_parties(db) -> int:
    """Ensure collab ownership, approval, and active label for existing parties (CORE 03)."""
    from app.services.collaboration.collaboration_service import CollaborationService
    from app.services.collaboration.constants import ENTITY_TYPE_PARTY

    svc = CollaborationService(db)
    parties = db.query(Party).order_by(Party.created_at).all()
    count = 0
    for party in parties:
        if svc.get_ownership(ENTITY_TYPE_PARTY, party.id):
            continue
        svc.ensure_ownership(ENTITY_TYPE_PARTY, party.id, source="import")
        svc.ensure_approval(ENTITY_TYPE_PARTY, party.id, status="draft")
        svc.add_label(ENTITY_TYPE_PARTY, party.id, "active")
        count += 1
    if count:
        db.commit()
    return count


def backfill_parties_from_commerce(db) -> int:
    """Create party rows + role links for existing customers and suppliers."""
    from app.services.parties.commerce_party_bridge import (
        ensure_party_for_customer,
        ensure_party_for_supplier,
        ensure_party_for_vendor,
    )

    count = 0
    customers = (
        db.query(CommerceCustomer)
        .filter(CommerceCustomer.party_id.is_(None))
        .order_by(CommerceCustomer.created_at)
        .all()
    )
    for customer in customers:
        ensure_party_for_customer(db, customer)
        count += 1

    suppliers = (
        db.query(CommerceSupplier)
        .filter(CommerceSupplier.party_id.is_(None))
        .order_by(CommerceSupplier.created_at)
        .all()
    )
    for supplier in suppliers:
        ensure_party_for_supplier(db, supplier)
        count += 1

    from app.models.vendor.vendor import Vendor

    vendors = (
        db.query(Vendor)
        .filter(Vendor.party_id.is_(None))
        .order_by(Vendor.created_at)
        .all()
    )
    for vendor in vendors:
        ensure_party_for_vendor(db, vendor)
        count += 1

    if count:
        db.commit()
    return count


def seed_demo_parties(db) -> int:
    """Seed a multi-role demo party when none exists yet."""
    from app.services.parties.interfaces import PartyCreateInput
    from app.services.parties.party_repository import SqlAlchemyPartyRepository

    demo_id = "party_demo_dual_role"
    if db.get(Party, demo_id):
        return 0

    repo = SqlAlchemyPartyRepository(db)
    repo.create(
        PartyCreateInput(
            id=demo_id,
            company_id="default",
            type="organization",
            display_name="Metro Trading Co.",
            legal_name="Metro Trading Company Ltd",
            status="active",
            roles=("customer", "supplier"),
        ),
    )
    db.commit()
    return 1


def backfill_items_from_catalog(db) -> int:
    """Create items rows + ecommerce extension links for existing catalog products."""
    from app.services.items.catalog_item_bridge import ensure_item_for_catalog_product

    products = (
        db.query(CatalogProduct)
        .filter(CatalogProduct.item_id.is_(None))
        .order_by(CatalogProduct.created_at)
        .all()
    )
    count = 0
    for product in products:
        ensure_item_for_catalog_product(db, product)
        count += 1
    if count:
        db.commit()
    return count


def ensure_inventory_core_columns() -> None:
    """Additive inventory schema for STEP 03 — item_id, movements, UoM, extensions."""
    statements = [
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS city VARCHAR(100)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS state VARCHAR(100)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS zip_code VARCHAR(32)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS country VARCHAR(100)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS mobile VARCHAR(50)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS alternate_contact VARCHAR(50)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS email VARCHAR(255)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS website VARCHAR(255)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS invoice_layout VARCHAR(100)",
        "ALTER TABLE inventory_warehouses ADD COLUMN IF NOT EXISTS payment_option VARCHAR(100)",
        "ALTER TABLE inventory_stock_levels ADD COLUMN IF NOT EXISTS item_id VARCHAR(36)",
        "ALTER TABLE inventory_stock_levels ADD COLUMN IF NOT EXISTS reorder_level INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS inventory_status VARCHAR(20) NOT NULL DEFAULT 'active'",
        "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS track_stock BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS track_serial BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS track_batch BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS base_uom VARCHAR(20) NOT NULL DEFAULT 'ea'",
        "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS purchase_uom VARCHAR(20) NOT NULL DEFAULT 'ea'",
        "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS sales_uom VARCHAR(20) NOT NULL DEFAULT 'ea'",
        "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS purchase_conversion NUMERIC(12,4) NOT NULL DEFAULT 1",
        "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS sales_conversion NUMERIC(12,4) NOT NULL DEFAULT 1",
        "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS qr_code VARCHAR(255)",
        "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS scanner_ready BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS reorder_level INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS min_stock INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS max_stock INTEGER NOT NULL DEFAULT 0",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_ecommerce_columns() -> None:
    """Additive ecommerce schema for STEP 04."""
    statements = [
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS publish_status VARCHAR(20) NOT NULL DEFAULT 'draft'",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'public'",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS short_description TEXT",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS full_description TEXT",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS specifications_json TEXT",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS primary_category_id VARCHAR(36)",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS brand_id VARCHAR(36)",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS slug VARCHAR(255)",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS seo_title VARCHAR(255)",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS seo_description TEXT",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS seo_keywords_json TEXT NOT NULL DEFAULT '[]'",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS schema_ready BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS selling_price NUMERIC(12,2) NOT NULL DEFAULT 0",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC(12,2)",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS special_price NUMERIC(12,2)",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500)",
        "ALTER TABLE ecommerce_items ADD COLUMN IF NOT EXISTS featured_media_id VARCHAR(36)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def backfill_collaboration_from_items(db) -> int:
    """Ensure collab ownership, approval, and draft label for existing items (STEP 05)."""
    from app.services.collaboration.collaboration_service import CollaborationService
    from app.services.collaboration.constants import ENTITY_TYPE_ITEM

    svc = CollaborationService(db)
    items = db.query(Item).order_by(Item.created_at).all()
    count = 0
    for item in items:
        if svc.get_ownership(ENTITY_TYPE_ITEM, item.id):
            continue
        svc.ensure_ownership(ENTITY_TYPE_ITEM, item.id, source="import")
        svc.ensure_approval(ENTITY_TYPE_ITEM, item.id, status="draft")
        svc.add_label(ENTITY_TYPE_ITEM, item.id, "draft")
        count += 1
    if count:
        db.commit()
    return count


def ensure_commerce_order_lifecycle_columns() -> None:
    """Additive commerce order lifecycle schema for STEP 07."""
    statements = [
        "ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS billing_address_id VARCHAR(36)",
        "ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS shipping_address_id VARCHAR(36)",
        "ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS payment_id VARCHAR(36)",
        "ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(36)",
        "ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS primary_shipment_id VARCHAR(36)",
        "ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS warehouse_id VARCHAR(36)",
        "ALTER TABLE commerce_order_items ADD COLUMN IF NOT EXISTS quantity_shipped INTEGER NOT NULL DEFAULT 0",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_commerce_order_item_columns() -> None:
    """Additive order line schema for STEP 06 checkout."""
    statements = [
        "ALTER TABLE commerce_order_items ADD COLUMN IF NOT EXISTS item_id VARCHAR(36)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))
        conn.execute(
            text(
                """
                UPDATE commerce_order_items coi
                SET item_id = COALESCE(
                    coi.item_id,
                    (SELECT ei.item_id FROM ecommerce_items ei
                     WHERE ei.catalog_product_id = coi.product_id LIMIT 1),
                    coi.product_id
                )
                WHERE coi.item_id IS NULL
                """
            ),
        )


def ensure_storefront_cart_columns() -> None:
    """Additive cart schema for STEP 05 production cart."""
    statements = [
        "ALTER TABLE storefront_carts ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)",
        "ALTER TABLE storefront_carts ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(64)",
        "ALTER TABLE storefront_carts ADD COLUMN IF NOT EXISTS coupon_discount NUMERIC(12,2) NOT NULL DEFAULT 0",
        "ALTER TABLE storefront_carts ADD COLUMN IF NOT EXISTS warehouse_id VARCHAR(36)",
        "ALTER TABLE storefront_carts ADD COLUMN IF NOT EXISTS shipping_estimate NUMERIC(12,2)",
        "ALTER TABLE storefront_carts ADD COLUMN IF NOT EXISTS tax_total NUMERIC(12,2) NOT NULL DEFAULT 0",
        "ALTER TABLE storefront_carts ADD COLUMN IF NOT EXISTS ready_build_id VARCHAR(36)",
        "ALTER TABLE storefront_carts ADD COLUMN IF NOT EXISTS ready_build_discount NUMERIC(12,2) NOT NULL DEFAULT 0",
        "ALTER TABLE storefront_cart_items ADD COLUMN IF NOT EXISTS item_id VARCHAR(36)",
        "ALTER TABLE storefront_cart_items ADD COLUMN IF NOT EXISTS variant_id VARCHAR(36)",
        "ALTER TABLE storefront_cart_items ADD COLUMN IF NOT EXISTS attributes_json TEXT",
        "ALTER TABLE storefront_cart_items ADD COLUMN IF NOT EXISTS sku_snapshot VARCHAR(100)",
        "ALTER TABLE storefront_cart_items ADD COLUMN IF NOT EXISTS name_snapshot VARCHAR(255)",
        "ALTER TABLE storefront_cart_items ADD COLUMN IF NOT EXISTS variant_label VARCHAR(255)",
        "ALTER TABLE storefront_cart_items ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0",
        "ALTER TABLE storefront_cart_items ADD COLUMN IF NOT EXISTS line_total NUMERIC(12,2) NOT NULL DEFAULT 0",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))
        # Legacy column — only on DBs created before name_snapshot migration
        has_name = conn.execute(
            text(
                """
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'storefront_cart_items'
                  AND column_name = 'name'
                """
            )
        ).scalar()
        if has_name:
            conn.execute(text("ALTER TABLE storefront_cart_items ALTER COLUMN name DROP NOT NULL"))
            conn.execute(
                text(
                    """
                    UPDATE storefront_cart_items sci
                    SET name_snapshot = COALESCE(sci.name_snapshot, sci.name),
                        sku_snapshot = COALESCE(sci.sku_snapshot, sci.slug),
                        item_id = COALESCE(
                            sci.item_id,
                            (SELECT ei.item_id FROM ecommerce_items ei
                             WHERE ei.catalog_product_id = sci.product_id LIMIT 1),
                            sci.product_id
                        ),
                        line_total = COALESCE(NULLIF(sci.line_total, 0), sci.unit_price * sci.quantity)
                    WHERE sci.name_snapshot IS NULL OR sci.item_id IS NULL OR sci.line_total = 0
                    """
                ),
            )


def ensure_supplier_catalog_columns() -> None:
    """Additive supplier catalog schema for STEP 07."""
    statements = [
        "ALTER TABLE supplier_links ADD COLUMN IF NOT EXISTS supplier_product_id VARCHAR(36)",
        "ALTER TABLE supplier_links ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE supplier_links ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC(12,4) NOT NULL DEFAULT 1",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def seed_supplier_catalog(db) -> int:
    """Seed supplier_products, links, and unmapped feed SKUs (STEP 07)."""
    from app.services.supplier.supplier_catalog_service import (
        MapSupplierInput,
        SupplierCatalogService,
        SupplierProductInput,
    )

    if db.query(SupplierProduct).count() > 0:
        return 0

    svc = SupplierCatalogService(db)
    products = (
        db.query(CatalogProduct)
        .filter(CatalogProduct.item_id.isnot(None))
        .order_by(CatalogProduct.created_at)
        .limit(4)
        .all()
    )
    suppliers = (
        db.query(CommerceSupplier)
        .filter(CommerceSupplier.status != "inactive")
        .order_by(CommerceSupplier.name)
        .all()
    )
    if len(products) < 2 or len(suppliers) < 2:
        return 0

    primary = next((s for s in suppliers if s.id == "sup_001"), suppliers[0])
    alt = next((s for s in suppliers if s.id == "sup_004"), suppliers[1] if len(suppliers) > 1 else suppliers[0])

    mappings: list[tuple[CatalogProduct, CommerceSupplier, str, Decimal, int, bool, bool]] = [
        (products[0], primary, f"VND-{products[0].sku}", products[0].price * Decimal("0.72"), 420, True, True),
        (products[0], alt, f"ALT-{products[0].sku}", products[0].price * Decimal("0.68"), 186, False, False),
    ]
    if len(products) > 1:
        mappings.append(
            (products[1], primary, f"VND-{products[1].sku}", products[1].price * Decimal("0.70"), 310, True, True),
        )
    if len(products) > 2:
        mappings.append(
            (products[2], alt, f"ALT-{products[2].sku}", products[2].price * Decimal("0.65"), 92, True, False),
        )

    created = 0
    for product, supplier, sku, cost, stock, preferred, published in mappings:
        item_id = product.item_id or product.id
        svc.map_supplier_to_item(
            MapSupplierInput(
                item_id=item_id,
                supplier_id=supplier.id,
                supplier_sku=sku,
                supplier_title=product.name,
                supplier_price=cost,
                supplier_stock=stock,
                stock_status="in_stock" if stock > 50 else "low",
                lead_time_days=supplier.lead_time_days,
                min_order_qty=25,
                warranty="1 year",
                is_preferred=preferred,
                is_published=published,
                api_source="manual",
            ),
        )
        created += 1

    unmapped_feed = [
        (primary.id, "TP-CABLE-USB", "USB Cable Bulk Pack (100pc)", Decimal("45"), 2000, "manual"),
        (primary.id, "TP-PWR-ADP", "Power Adapter 65W OEM", Decimal("380"), 340, "manual"),
        (alt.id, "SZ-MISC-LED", "LED Strip 5m (wholesale)", Decimal("220"), 800, "1688"),
        (alt.id, "SZ-PB20", "Power Bank 20000mAh", Decimal("1100"), 186, "alibaba"),
    ]
    for supplier_id, sku, title, price, stock, source in unmapped_feed:
        svc.create_product(
            SupplierProductInput(
                supplier_id=supplier_id,
                supplier_sku=sku,
                supplier_title=title,
                supplier_price=price,
                supplier_stock=stock,
                stock_status="in_stock",
                lead_time_days=7,
                min_order_qty=50,
                api_source=source,
            ),
        )
        created += 1

    db.commit()
    return created


def seed_sales(db) -> int:
    """Seed quotations, sales orders, and customer pricing (STEP 08)."""
    from app.services.sales.sales_service import SalesLineInput, SalesService

    if db.query(SalesOrder).count() > 0:
        return 0

    customer = db.query(CommerceCustomer).filter(CommerceCustomer.status == "active").first()
    warehouse = (
        db.query(InventoryWarehouse)
        .filter(InventoryWarehouse.is_active.is_(True))
        .order_by(InventoryWarehouse.sort_order)
        .first()
    )
    products = (
        db.query(CatalogProduct)
        .filter(CatalogProduct.item_id.isnot(None))
        .order_by(CatalogProduct.created_at)
        .limit(3)
        .all()
    )
    if not customer or not warehouse or len(products) < 2:
        return 0

    svc = SalesService(db)
    created = 0

    quote = svc.create_quotation(
        customer_id=customer.id,
        warehouse_id=warehouse.id,
        company_id="default",
        sales_rep="Sales Team",
        notes="Seed quotation",
        lines=[
            SalesLineInput(
                item_id=products[0].item_id or products[0].id,
                quantity=10,
                unit_price=products[0].price * Decimal("0.95"),
                tax_rate=Decimal("5"),
            ),
            SalesLineInput(
                item_id=products[1].item_id or products[1].id,
                quantity=5,
                unit_price=products[1].price * Decimal("0.92"),
                tax_rate=Decimal("5"),
            ),
        ],
    )
    svc.update_quotation_status(quote.id, "sent", notes="Sent to customer")
    svc.update_quotation_status(quote.id, "approved", notes="Customer approved")
    created += 1

    svc.upsert_customer_price(
        customer_id=customer.id,
        item_id=products[0].item_id or products[0].id,
        unit_price=products[0].price * Decimal("0.95"),
        company_id="default",
        notes="VIP discount",
    )
    created += 1

    draft = svc.create_order(
        customer_id=customer.id,
        warehouse_id=warehouse.id,
        company_id="default",
        sales_rep="Sales Team",
        notes="Seed draft SO",
        lines=[
            SalesLineInput(
                item_id=products[0].item_id or products[0].id,
                quantity=8,
                unit_price=products[0].price,
                tax_rate=Decimal("5"),
            ),
        ],
    )
    created += 1

    confirmed = svc.convert_quotation_to_order(quote.id, warehouse_id=warehouse.id)
    created += 1

    db.commit()
    return created


def seed_pos(db) -> int:
    """Seed walk-in customer and open POS session (STEP 09)."""
    from app.services.pos.constants import DEFAULT_WALK_IN_CUSTOMER_CODE
    from app.services.pos.pos_service import PosService

    created = 0
    walk_in = (
        db.query(CommerceCustomer)
        .filter(CommerceCustomer.customer_code == DEFAULT_WALK_IN_CUSTOMER_CODE)
        .first()
    )
    if not walk_in:
        walk_in_row = CommerceCustomer(
            id="cust_walk_in",
            company_id="default",
            customer_code=DEFAULT_WALK_IN_CUSTOMER_CODE,
            name="Walk-in Customer",
            email="walkin@againerp.local",
            phone="",
            group="retail",
            status="active",
            customer_since=date.today(),
        )
        from app.services.parties.commerce_party_bridge import ensure_party_for_customer

        ensure_party_for_customer(db, walk_in_row)
        db.add(walk_in_row)
        created += 1

    if db.query(PosSession).count() > 0:
        if created:
            db.commit()
        return created

    warehouse = (
        db.query(InventoryWarehouse)
        .filter(InventoryWarehouse.is_active.is_(True))
        .order_by(InventoryWarehouse.sort_order)
        .first()
    )
    if not warehouse:
        if created:
            db.commit()
        return created

    svc = PosService(db)
    terminal = (
        db.query(PosTerminal)
        .filter(PosTerminal.company_id == "default", PosTerminal.code == "REG-1")
        .first()
    )
    if not terminal:
        terminal = svc.create_terminal(
            name="Front counter",
            code="REG-1",
            warehouse_id=warehouse.id,
            payment_methods=["cash", "card", "mobile_banking", "bank"],
        )
        created += 1
    session = svc.open_session(
        warehouse_id=warehouse.id,
        register_name="REG-1",
        opening_float=Decimal("5000"),
        cashier_name="POS Demo",
        notes="Seed POS session",
        terminal_id=terminal.id,
        opening_note="Seed POS session",
    )
    svc.get_or_create_active_cart(session.id)
    db.commit()
    return created + 1


def seed_finance(db) -> int:
    """Ensure default chart of accounts (STEP 10)."""
    from app.services.finance.finance_service import FinanceService

    before = db.query(FinanceAccount).count()
    FinanceService(db).ensure_accounts("default")
    db.commit()
    after = db.query(FinanceAccount).count()
    return after - before


def seed_purchase_orders(db) -> int:
    """Seed sample purchase orders with item_id lines (STEP 06)."""
    from datetime import date
    from decimal import Decimal

    from app.services.purchase.purchase_order_service import PurchaseLineInput, PurchaseOrderService

    if db.query(PurchaseOrder).count() > 0:
        return 0

    warehouse = (
        db.query(InventoryWarehouse)
        .filter(InventoryWarehouse.is_active.is_(True))
        .order_by(InventoryWarehouse.sort_order)
        .first()
    )
    supplier = db.query(CommerceSupplier).filter(CommerceSupplier.status != "inactive").first()
    products = db.query(CatalogProduct).order_by(CatalogProduct.created_at).limit(3).all()
    if not warehouse or not supplier or len(products) < 2:
        return 0

    svc = PurchaseOrderService(db)
    lines = []
    for product in products[:2]:
        item_id = product.item_id or product.id
        lines.append(
            PurchaseLineInput(
                item_id=item_id,
                quantity_ordered=50 if product == products[0] else 30,
                unit_cost=product.price,
                tax_rate=Decimal("5"),
            ),
        )

    draft = svc.create_order(
        supplier_id=supplier.id,
        warehouse_id=warehouse.id,
        lines=lines,
        order_date=date.today(),
        expected_date=date.today(),
        buyer_name=supplier.buyer_name,
        notes="Seed draft PO",
    )

    confirmed_lines = [
        PurchaseLineInput(
            item_id=products[2].item_id or products[2].id,
            quantity_ordered=20,
            unit_cost=products[2].price,
        ),
    ]
    confirmed = svc.create_order(
        supplier_id=supplier.id,
        warehouse_id=warehouse.id,
        lines=confirmed_lines,
        notes="Seed confirmed PO",
    )
    svc.confirm_order(confirmed.id)

    db.commit()
    return 2


def complete_p7_universal_item_migration(db) -> dict[str, int]:
    """
    P7 — Normalize Universal Item SSOT: every catalog product linked to items,
    identity mirrored, extensions synced. Idempotent.
    """
    from app.services.items.item_identity_service import ItemIdentityService
    from app.services.ecommerce.ecommerce_item_service import EcommerceItemService
    from app.services.inventory.inventory_item_service import InventoryItemService

    identity_svc = ItemIdentityService(db)
    ec_svc = EcommerceItemService(db)
    inv_svc = InventoryItemService(db)

    products = db.query(CatalogProduct).order_by(CatalogProduct.created_at).all()
    linked = 0
    ec_synced = 0
    inv_synced = 0

    for product in products:
        identity_svc.persist_and_mirror(product)
        linked += 1
        ec_svc.sync_content_from_catalog(product, mirror_publish=True)
        ec_synced += 1
        if product.track_quantity or product.stock > 0:
            inv_svc.ensure_for_catalog_product(product)
            inv_synced += 1

    stock_rows = db.query(InventoryStockLevel).filter(InventoryStockLevel.item_id.is_(None)).count()
    backfilled_stock = backfill_stock_item_ids(db)

    db.commit()
    return {
        "products_linked": linked,
        "ecommerce_synced": ec_synced,
        "inventory_extensions": inv_synced,
        "stock_item_id_backfill": backfilled_stock,
        "stock_missing_item_id_before": stock_rows,
    }


def backfill_ecommerce_items_from_catalog(db) -> int:
    from app.services.ecommerce.ecommerce_item_service import EcommerceItemService

    service = EcommerceItemService(db)
    products = db.query(CatalogProduct).order_by(CatalogProduct.created_at).all()
    count = 0
    for product in products:
        item_id = product.item_id or product.id
        existing = service.get_by_item_id(item_id)
        if existing and existing.slug:
            service.sync_content_from_catalog(product, row=existing, mirror_publish=True)
        else:
            service.sync_content_from_catalog(product, mirror_publish=True)
            count += 1
    if count:
        db.commit()
    elif products:
        db.commit()
    return count


UOM_SEED = [
    {"code": "ea", "name": "Each", "is_base": True},
    {"code": "box", "name": "Box", "is_base": False},
    {"code": "kg", "name": "Kilogram", "is_base": False},
    {"code": "m", "name": "Meter", "is_base": False},
]


def seed_uom(db) -> int:
    existing = {code for code, in db.query(InventoryUom.code).all()}
    inserted = 0
    for item in UOM_SEED:
        if item["code"] in existing:
            continue
        db.add(InventoryUom(company_id="default", **item))
        inserted += 1
    if inserted:
        db.commit()
    return inserted


SERVICE_CATEGORY_SEED = [
    "Installation",
    "Repair",
    "Warranty",
    "Maintenance",
    "Consulting",
    "Delivery",
    "Support",
    "Other",
]


def seed_service_categories(db) -> int:
    from app.models.service_category import ServiceCategory

    existing = {
        name.lower()
        for name, in db.query(ServiceCategory.name).filter(ServiceCategory.company_id == "default").all()
    }
    inserted = 0
    for name in SERVICE_CATEGORY_SEED:
        if name.lower() in existing:
            continue
        db.add(ServiceCategory(name=name, company_id="default"))
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def ensure_default_warehouse(db) -> int:
    if db.query(InventoryWarehouse).filter(InventoryWarehouse.is_default.is_(True)).count() > 0:
        return 0
    first = (
        db.query(InventoryWarehouse)
        .filter(InventoryWarehouse.is_active.is_(True))
        .order_by(InventoryWarehouse.sort_order, InventoryWarehouse.name)
        .first()
    )
    if not first:
        return 0
    first.is_default = True
    db.commit()
    return 1


def backfill_stock_item_ids(db) -> int:
    from app.services.items.catalog_item_bridge import ensure_item_for_catalog_product

    rows = db.query(InventoryStockLevel).filter(InventoryStockLevel.item_id.is_(None)).all()
    count = 0
    for row in rows:
        product = db.get(CatalogProduct, row.product_id)
        if not product:
            continue
        item_id = ensure_item_for_catalog_product(db, product)
        row.item_id = item_id
        if row.reorder_level == 0 and row.min_qty > 0:
            row.reorder_level = row.min_qty
        count += 1
    if count:
        db.commit()
    return count


def backfill_inventory_items(db) -> int:
    from app.services.inventory.inventory_item_service import InventoryItemService

    service = InventoryItemService(db)
    products = db.query(CatalogProduct).order_by(CatalogProduct.created_at).all()
    count = 0
    for product in products:
        if service.get_by_item_id(product.item_id or product.id):
            continue
        service.ensure_for_catalog_product(product)
        count += 1
    if count:
        db.commit()
    return count


def seed_opening_movements(db) -> int:
    if db.query(InventoryStockMovement).count() > 0:
        return 0
    rows = db.query(InventoryStockLevel).filter(InventoryStockLevel.item_id.isnot(None)).all()
    inserted = 0
    for row in rows:
        if row.on_hand <= 0:
            continue
        db.add(
            InventoryStockMovement(
                company_id=row.company_id,
                item_id=row.item_id,
                warehouse_id=row.warehouse_id,
                stock_level_id=row.id,
                movement_type="opening",
                quantity=row.on_hand,
                qty_before=0,
                qty_after=row.on_hand,
                notes="Opening stock (seed backfill)",
            ),
        )
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def ensure_catalog_category_columns() -> None:
    """SkyBuy-style China keyword browse + Catalog vs Dropshipping channel split."""
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE catalog_categories ADD COLUMN IF NOT EXISTS china_search_keyword VARCHAR(200)"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE catalog_categories ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'dropshipping'"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE catalog_categories ADD COLUMN IF NOT EXISTS show_price_comparison BOOLEAN NOT NULL DEFAULT TRUE"
            )
        )
        conn.execute(text("ALTER TABLE catalog_categories ADD COLUMN IF NOT EXISTS updated_by_id VARCHAR(36)"))
        conn.execute(text("ALTER TABLE catalog_categories ADD COLUMN IF NOT EXISTS updated_by_name VARCHAR(255)"))
        # One-time legacy backfill: only when no row is tagged with either channel yet.
        # A tree that is entirely `catalog` (own-stock store) must not be flipped on boot.
        tagged_count = conn.execute(
            text("SELECT COUNT(*) FROM catalog_categories WHERE channel IN ('dropshipping', 'catalog')")
        ).scalar()
        if not tagged_count:
            conn.execute(text("UPDATE catalog_categories SET channel = 'dropshipping'"))


def ensure_catalog_brand_columns() -> None:
    """Catalog vs Dropshipping channel split for brands (frontstore strip)."""
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE catalog_brands ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'dropshipping'"
            )
        )
        # Same one-time legacy backfill as categories — never flip an all-`catalog` set.
        tagged_count = conn.execute(
            text("SELECT COUNT(*) FROM catalog_brands WHERE channel IN ('dropshipping', 'catalog')")
        ).scalar()
        if not tagged_count:
            conn.execute(text("UPDATE catalog_brands SET channel = 'dropshipping'"))


def ensure_product_columns() -> None:
    """Migrate catalog_products for AgainERP-aligned fields."""
    statements = [
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS product_type VARCHAR(20) NOT NULL DEFAULT 'simple'",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'public'",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS brand_id VARCHAR(36)",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS category_id VARCHAR(36)",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS short_description TEXT",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS tags_json TEXT NOT NULL DEFAULT '[]'",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS seo_title VARCHAR(255)",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS seo_description TEXT",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS attribute_profile_id VARCHAR(36)",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS custom_specs_json TEXT",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS variant_attributes_json TEXT",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS track_quantity BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS stock_status VARCHAR(30)",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS warranty VARCHAR(200)",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS origin VARCHAR(200)",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS thumbnail VARCHAR(500)",
        # Elim / dropship enrichment
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS source_url VARCHAR(1000)",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS seller_info_json TEXT",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS dropship_meta_json TEXT",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS gallery_json TEXT",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS video_urls_json TEXT",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS model VARCHAR(200)",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS remarks TEXT",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS last_selling_price NUMERIC(12,2)",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12,2)",
        "ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS focus_keyphrase VARCHAR(200)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_product_variant_elim_columns() -> None:
    """Elim variation options + remote image URL on catalog_product_variants."""
    statements = [
        "ALTER TABLE catalog_product_variants ADD COLUMN IF NOT EXISTS options_json TEXT",
        "ALTER TABLE catalog_product_variants ADD COLUMN IF NOT EXISTS external_sku_id VARCHAR(100)",
        "ALTER TABLE catalog_product_variants ADD COLUMN IF NOT EXISTS image_url VARCHAR(1000)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_product_attribute_value_columns() -> None:
    """sort_order was added to the CatalogProductAttributeValue model without
    a matching migration here, so the live table stayed one column short —
    breaking both GET/PUT .../specs (silently, via a client-side .catch)."""
    statements = [
        "ALTER TABLE catalog_product_attribute_values ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_purchase_receipt_serial_columns() -> None:
    statements = [
        "ALTER TABLE purchase_receipt_lines ADD COLUMN IF NOT EXISTS serials_json TEXT NOT NULL DEFAULT '[]'",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_purchase_order_line_return_columns() -> None:
    statements = [
        "ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS quantity_returned INTEGER NOT NULL DEFAULT 0",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_seo_url_record_columns() -> None:
    statements = [
        "ALTER TABLE seo_url_records ADD COLUMN IF NOT EXISTS status_locked BOOLEAN NOT NULL DEFAULT FALSE",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_seo_audit_run_columns() -> None:
    statements = [
        "ALTER TABLE seo_audit_runs ADD COLUMN IF NOT EXISTS live_pages_crawled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE seo_audit_runs ADD COLUMN IF NOT EXISTS storefront_reachable BOOLEAN NOT NULL DEFAULT TRUE",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def _slugify_username(value: str) -> str:
    import re

    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9._-]", "", value)
    value = re.sub(r"[-_.]{2,}", "_", value)
    return value[:32].strip("_.-") or "user"


def ensure_auth_role_slug_scope() -> None:
    """Role slugs are unique per company, not globally.

    The original schema had a global unique index on `slug`, which stopped a
    second tenant from creating a role that another tenant already named.
    """
    statements = [
        "DROP INDEX IF EXISTS ix_auth_roles_slug",
        "CREATE INDEX IF NOT EXISTS ix_auth_roles_slug ON auth_roles (slug)",
        "ALTER TABLE auth_roles DROP CONSTRAINT IF EXISTS uq_auth_role_company_slug",
        "ALTER TABLE auth_roles ADD CONSTRAINT uq_auth_role_company_slug UNIQUE (company_id, slug)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_auth_user_columns() -> None:
    """Add username column and backfill legacy auth_users rows."""
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS username VARCHAR(64)"))

    db = SessionLocal()
    try:
        users = db.query(AuthUser).all()
        taken = {user.username for user in users if user.username}
        changed = False
        for user in users:
            if user.username:
                continue
            base = _slugify_username(user.email.split("@")[0])
            candidate = base
            suffix = 2
            while candidate in taken:
                candidate = f"{base}{suffix}"
                suffix += 1
            user.username = candidate
            taken.add(candidate)
            changed = True
        if changed:
            db.commit()
    finally:
        db.close()

    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE auth_users ALTER COLUMN username SET NOT NULL"))
        except Exception:
            pass
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_auth_users_username ON auth_users (username)"))


def link_product_taxonomy(db) -> int:
    """Backfill category_id / brand_id on products from denormalized names."""
    cat_by_name = {name: cid for name, cid in db.query(CatalogCategory.name, CatalogCategory.id).all()}
    brand_by_name = {name: bid for name, bid in db.query(CatalogBrand.name, CatalogBrand.id).all()}
    updated = 0
    for product in db.query(CatalogProduct).all():
        changed = False
        if product.category and not product.category_id:
            cid = cat_by_name.get(product.category)
            if cid:
                product.category_id = cid
                changed = True
        if product.brand and not product.brand_id:
            bid = brand_by_name.get(product.brand)
            if bid:
                product.brand_id = bid
                changed = True
        if changed:
            updated += 1
    if updated:
        db.commit()
    return updated


def seed_cloudflare_plugin(db) -> int:
    if db.get(CloudflarePlugin, "cf-default"):
        return 0
    db.add(CloudflarePlugin(id="cf-default"))
    db.commit()
    return 1


def seed_ai_connections(db) -> int:
    existing_ids = {row[0] for row in db.query(AiApiConnection.id).all()}
    inserted = 0
    for item in AI_CONNECTION_SEED:
        if item["id"] in existing_ids:
            continue
        db.add(
            AiApiConnection(
                id=item["id"],
                provider_id=item["provider_id"],
                provider_name=item["provider_name"],
                status=item["status"],
                base_url=item.get("base_url", ""),
            ),
        )
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def seed_ai_providers(db) -> int:
    existing_ids = {row[0] for row in db.query(AiProvider.id).all()}
    inserted = 0
    for item in AI_PROVIDER_SEED:
        if item["id"] in existing_ids:
            continue
        row = AiProvider(
            id=item["id"],
            name=item["name"],
            status=item["status"],
            latency_ms=item["latency_ms"],
            spend_pct=item["spend_pct"],
        )
        row.models = item["models"]
        db.add(row)
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def seed_ai_agents(db) -> int:
    existing_ids = {row[0] for row in db.query(AiAgent.id).all()}
    inserted = 0
    for item in AI_AGENT_SEED:
        if item["id"] in existing_ids:
            continue
        db.add(
            AiAgent(
                id=item["id"],
                name=item["name"],
                domain=item["domain"],
                status=item["status"],
                tools=item["tools"],
                runs_today=item["runs_today"],
                model=item["model"],
                description=item["description"],
            ),
        )
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def seed_ai_tools(db) -> int:
    existing_ids = {row[0] for row in db.query(AiTool.id).all()}
    inserted = 0
    for item in AI_TOOL_SEED:
        if item["id"] in existing_ids:
            continue
        db.add(
            AiTool(
                id=item["id"],
                name=item["name"],
                agent=item["agent"],
                category=item["category"],
                risk=item["risk"],
                description=item["description"],
            ),
        )
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def seed_coupons(db) -> int:
    """Insert new marketing coupons and refresh dates/status for known seed codes."""
    by_code = {row.code: row for row in db.query(MarketingCoupon).all()}
    inserted = 0
    updated = 0
    for item in COUPON_SEED:
        existing = by_code.get(item["code"])
        if existing:
            existing.name = item["name"]
            existing.discount_type = item["discount_type"]
            existing.discount_value = item["discount_value"]
            existing.discount_label = item["discount_label"]
            existing.status = item["status"]
            existing.redemption_limit = item.get("redemption_limit")
            existing.starts_at = item["starts_at"]
            existing.ends_at = item["ends_at"]
            existing.min_order_amount = item.get("min_order_amount")
            updated += 1
            continue
        db.add(MarketingCoupon(**item))
        inserted += 1
    if inserted or updated:
        db.commit()
    return inserted


def seed_campaigns(db) -> int:
    existing = {code for code, in db.query(MarketingCampaign.code).all()}
    inserted = 0
    for item in CAMPAIGN_SEED:
        if item["code"] in existing:
            continue
        db.add(MarketingCampaign(**item))
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def seed_audiences(db) -> int:
    existing = {row_id for row_id, in db.query(MarketingAudience.id).all()}
    inserted = 0
    for item in AUDIENCE_SEED:
        if item["id"] in existing:
            continue
        db.add(MarketingAudience(**item))
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def seed_journeys(db) -> int:
    existing = {row_id for row_id, in db.query(MarketingJourney.id).all()}
    inserted = 0
    for item in JOURNEY_SEED:
        if item["id"] in existing:
            continue
        db.add(MarketingJourney(**item))
        inserted += 1
    if inserted:
        db.commit()
    return inserted


def seed_auth_users(db) -> int:
    existing = {email for email, in db.query(AuthUser.email).all()}
    inserted = 0
    for item in AUTH_USERS_SEED:
        if item["email"] in existing:
            continue
        username = item.get("username") or _slugify_username(item["email"].split("@")[0])
        db.add(
            AuthUser(
                id=item["id"],
                email=item["email"],
                username=username,
                name=item["name"],
                role=item["role"],
                password_hash=hash_password(item["password"]),
                is_active=True,
            ),
        )
        inserted += 1
    if inserted:
        db.commit()
    # System roles + permission matrix + backfill user↔role links
    from app.services.rbac import seed_rbac

    seed_rbac(db)
    return inserted


def seed_seo_meta(db) -> int:
    if db.query(SeoMetaRecord).count() > 0:
        return 0
    for item in META_SEED:
        db.add(
            SeoMetaRecord(
                id=item["id"],
                entity_type=item["entity_type"],
                title=item["title"],
                url=item["url"],
                meta_title=item.get("meta_title", ""),
                meta_description=item.get("meta_description", ""),
                og_image=item.get("og_image"),
                canonical_url=item.get("canonical_url"),
                indexable=item.get("indexable", True),
                schema_type=item.get("schema_type", "WebPage"),
                score=item.get("score", 0),
                issues_json=dump_json_list_seo(item.get("issues", [])),
            ),
        )
    db.commit()
    return len(META_SEED)


def seed_seo_audit(db) -> int:
    if db.query(SeoAuditIssue).count() > 0:
        return 0
    from app.services.seo_audit_analyzer import run_seo_audit

    run = run_seo_audit(db)
    return run.issues_found


def seed_seo_redirects(db) -> int:
    if db.query(SeoRedirect).count() > 0:
        return 0
    for item in REDIRECT_SEED:
        db.add(
            SeoRedirect(
                id=item["id"],
                from_path=item["from_path"],
                to_path=item.get("to_path"),
                redirect_type=item.get("redirect_type", "301"),
                status=item.get("status", "active"),
                hits_30d=item.get("hits_30d", 0),
                note=item.get("note"),
            ),
        )
    db.commit()
    return len(REDIRECT_SEED)


def seed_seo_urls(db) -> int:
    from app.services.seo_url_sync import sync_seo_url_records

    return sync_seo_url_records(db)


def ensure_blog_columns() -> None:
    """Additive blog schema — category link on articles and category extras."""
    statements = [
        "ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS category_id VARCHAR(36)",
        "ALTER TABLE blog_categories ADD COLUMN IF NOT EXISTS parent_id VARCHAR(36)",
        "ALTER TABLE blog_categories ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(500)",
        "ALTER TABLE blog_categories ADD COLUMN IF NOT EXISTS seo_title VARCHAR(255)",
        "ALTER TABLE blog_categories ADD COLUMN IF NOT EXISTS seo_description TEXT",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_sales_columns() -> None:
    """Additive sales schema for STEP 01 functional UI."""
    statements = [
        "ALTER TABLE sales_quotations ADD COLUMN IF NOT EXISTS updated_by VARCHAR(36)",
        "ALTER TABLE sales_quotations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
        "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS updated_by VARCHAR(36)",
        "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_sales_order_stage_and_shipping_columns() -> None:
    """AgainPOS-style Pay term / Status / Shipping fields on the sales order."""
    statements = [
        "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(32)",
        "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS sale_stage VARCHAR(16) NOT NULL DEFAULT 'final'",
        "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS invoice_scheme VARCHAR(16) NOT NULL DEFAULT 'standard'",
        "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS shipping_status VARCHAR(16)",
        "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS delivered_to VARCHAR(120)",
        "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS delivery_person_id VARCHAR(36)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_sales_order_courier_columns() -> None:
    """Courier / tracking fields — set when a Pathao (or other) consignment is created."""
    statements = [
        "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS courier VARCHAR(60)",
        "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(120)",
        "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS tracking_url VARCHAR(500)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))


def ensure_sales_tax_fk() -> None:
    """Point sales_order_taxes line FK at sales_order_lines (not orphan sales_order_items)."""
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE sales_order_taxes "
                "DROP CONSTRAINT IF EXISTS sales_order_taxes_sales_order_line_id_fkey",
            ),
        )
        conn.execute(
            text(
                "ALTER TABLE sales_order_taxes "
                "ADD CONSTRAINT sales_order_taxes_sales_order_line_id_fkey "
                "FOREIGN KEY (sales_order_line_id) REFERENCES sales_order_lines(id) ON DELETE CASCADE",
            ),
        )


def seed_provider_import_staging(db) -> int:
    if db.query(ProviderImportJob).count() > 0:
        return 0

    import json
    from datetime import datetime, timedelta

    now = datetime.utcnow()
    job = ProviderImportJob(
        id="pi-job-seed-001",
        provider="elim",
        status="completed",
        user_email="admin@againerp.local",
        item_count=2,
        success_count=1,
        warning_count=1,
        error_count=0,
        source_label="STEP-04 seed",
        started_at=now - timedelta(minutes=5),
        completed_at=now - timedelta(minutes=4),
        duration_ms=4200,
    )
    db.add(job)

    universal_ok = {
        "id": "elim:683802263680",
        "provider": "elim",
        "providerProductId": "683802263680",
        "title": "Wireless Bluetooth Earbuds",
        "currency": "CNY",
        "basePrice": 89.0,
        "salePrice": 68.5,
        "description": "ANC sport earbuds",
        "brand": {"providerBrandId": "audiopro", "name": "AudioPro"},
        "category": {"providerCategoryId": "50011975", "name": "Bluetooth Earbuds", "path": ["Audio"], "level": 1},
        "supplier": {"supplierId": "shop_88231", "name": "Shenzhen Audio Tech Co."},
        "images": [{"id": "img1", "url": "https://placehold.co/600x600/png?text=Earbuds", "position": 0}],
        "variants": [{"id": "v1", "sku": "EB-PRO-BLK", "price": 68.5, "stock": 200}],
        "weight": 0.15,
        "rawData": {"id": "683802263680"},
    }
    universal_warn = {
        "id": "elim:mock-warning",
        "provider": "elim",
        "providerProductId": "mock-warning",
        "title": "USB-C Hub 7-in-1",
        "currency": "CNY",
        "basePrice": 45.0,
        "images": [{"id": "img1", "url": "https://placehold.co/400x400/png?text=Hub", "position": 0, "width": 150}],
        "variants": [{"id": "v1", "sku": "HUB-7-01", "price": 45.0}],
        "rawData": {"id": "mock-warning"},
    }

    items = [
        ("pi-item-seed-001", "683802263680", "validated", universal_ok, 0, 0),
        ("pi-item-seed-002", "mock-warning", "warning", universal_warn, 2, 0),
    ]
    for item_id, pid, status, uni, warnings, errors in items:
        item = ProviderImportItem(
            id=item_id,
            job_id=job.id,
            provider="elim",
            provider_product_id=pid,
            status=status,
            title=str(uni["title"]),
            currency="CNY",
            base_price=str(uni.get("basePrice")),
            sale_price=str(uni.get("salePrice")) if uni.get("salePrice") else None,
            brand_name=(uni.get("brand") or {}).get("name"),
            category_name=(uni.get("category") or {}).get("name"),
            supplier_name=(uni.get("supplier") or {}).get("name"),
            universal_json=json.dumps(uni),
            raw_json=json.dumps(uni.get("rawData")),
            validation_json=json.dumps({"valid": errors == 0, "warnings": warnings, "errors": errors}),
            warning_count=warnings,
            error_count=errors,
        )
        db.add(item)
        db.flush()
        for idx, img in enumerate(uni.get("images") or []):
            db.add(
                ProviderImportImage(
                    item_id=item.id,
                    url=img["url"],
                    thumbnail_url=img["url"],
                    position=idx,
                    width=img.get("width"),
                    is_primary=idx == 0,
                    status="pending",
                )
            )
        for v in uni.get("variants") or []:
            db.add(
                ProviderImportVariant(
                    item_id=item.id,
                    sku=v["sku"],
                    price=str(v.get("price")),
                    stock=v.get("stock"),
                    status="pending",
                )
            )

    db.add(
        ProviderImportLog(
            job_id=job.id,
            level="info",
            message="Seed import job created",
            context_json=json.dumps({"source": "init_db"}),
        )
    )
    db.add(
        ProviderImportHistory(
            job_id=job.id,
            action="created",
            actor_email="admin@againerp.local",
            actor_role="admin",
            to_status="completed",
        )
    )
    db.commit()
    return 1


def seed_provider_entity_mappings(db) -> int:
    if db.query(ProviderEntityMapping).count() > 0:
        return 0

    inserted = 0

    samsung = db.query(CatalogBrand).filter(CatalogBrand.slug == "samsung").first()
    audio_cat = db.query(CatalogCategory).filter(CatalogCategory.slug == "audio").first()
    color_attr = db.query(CatalogAttribute).filter(CatalogAttribute.code == "color").first()

    if samsung:
        db.add(
            ProviderMappingRule(
                id="pm-rule-samsung",
                entity_type="brand",
                provider="elim",
                pattern_type="contains",
                pattern_value="samsung",
                erp_entity_id=samsung.id,
                erp_entity_name=samsung.name,
                priority=10,
                notes="Rule-based brand alias",
            )
        )
        inserted += 1

    if audio_cat:
        db.add(
            ProviderMappingRule(
                id="pm-rule-audio",
                entity_type="category",
                provider=None,
                pattern_type="exact",
                pattern_value="Audio",
                erp_entity_id=audio_cat.id,
                erp_entity_name=audio_cat.name,
                priority=20,
                notes="Universal audio category",
            )
        )
        inserted += 1

    anker = db.query(CatalogBrand).filter(CatalogBrand.slug == "anker").first()
    if anker:
        mapping = ProviderEntityMapping(
            id="pm-map-seed-anker",
            provider="elim",
            entity_type="brand",
            provider_entity_id="audiopro",
            provider_name="AudioPro",
            erp_entity_id=anker.id,
            erp_entity_name=anker.name,
            status="suggested",
            match_method="ai",
            confidence=0.78,
            suggestion_json='[{"id":"%s","name":"%s","score":0.78,"source":"ai_suggestion"}]' % (anker.id, anker.name),
            metadata_json='{"ai_stub":true}',
        )
        db.add(mapping)
        db.flush()
        db.add(
            ProviderMappingHistory(
                mapping_id=mapping.id,
                action="detected",
                actor_email="admin@againerp.local",
                actor_role="admin",
                to_status="suggested",
                detail_json='{"seed":true}',
            )
        )
        inserted += 1

    if audio_cat:
        conflict = ProviderEntityMapping(
            id="pm-map-seed-category-conflict",
            provider="elim",
            entity_type="category",
            provider_entity_id="50011975",
            provider_name="Bluetooth Earbuds",
            provider_path_json='["Audio","Earbuds"]',
            status="conflict",
            match_method="exact",
            confidence=1.0,
            conflict_json='[{"id":"%s","name":"Audio","score":1.0},{"id":"%s","name":"Accessories","score":0.91}]'
            % (audio_cat.id, db.query(CatalogCategory).filter(CatalogCategory.slug == "accessories").first().id if db.query(CatalogCategory).filter(CatalogCategory.slug == "accessories").first() else audio_cat.id),
            source_item_id="pi-item-seed-001",
        )
        db.add(conflict)
        inserted += 1

    if color_attr:
        db.add(
            ProviderEntityMapping(
                id="pm-map-seed-color",
                provider="elim",
                entity_type="attribute",
                provider_entity_id="attr-color",
                provider_name="Color",
                erp_entity_id=color_attr.id,
                erp_entity_name=color_attr.name,
                status="auto_matched",
                match_method="exact",
                confidence=1.0,
            )
        )
        inserted += 1

    supplier = db.query(CommerceSupplier).first()
    if supplier:
        db.add(
            ProviderEntityMapping(
                id="pm-map-seed-supplier",
                provider="elim",
                entity_type="supplier",
                provider_entity_id="shop_88231",
                provider_name="Shenzhen Audio Tech Co.",
                status="suggested",
                match_method="none",
                confidence=0.0,
                suggestion_json="[]",
                metadata_json='{"reason":"no_match_create_suggestion"}',
            )
        )
        inserted += 1

    if inserted:
        db.commit()
    return inserted


def _dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def seed_website_pages(db) -> int:
    """Seed CMS website pages (stable IDs for admin UI)."""
    if db.query(WebsitePage).count() > 0:
        return 0

    def seo(**kwargs):
        base = {
            "meta_title": "",
            "meta_description": "",
            "keywords": "",
            "og_title": "",
            "og_description": "",
            "og_image": None,
            "canonical_url": None,
            "indexable": True,
            "schema_type": "WebPage",
        }
        base.update(kwargs)
        if not base.get("og_title"):
            base["og_title"] = base["meta_title"]
        if not base.get("og_description"):
            base["og_description"] = base["meta_description"]
        return base

    def advanced(**kwargs):
        base = {
            "css_class": "",
            "body_class": "",
            "cache_enabled": True,
            "lazy_load": True,
            "search_index": True,
        }
        base.update(kwargs)
        return base

    def access(owner="Admin", editors=None, view_access="Public", publish_permission="Editors"):
        return {
            "owner": owner,
            "editors": editors or [owner],
            "view_access": view_access,
            "publish_permission": publish_permission,
        }

    def stats(**kwargs):
        base = {
            "views": 0,
            "clicks": 0,
            "conversion": 0,
            "seo_score": 0,
            "performance_score": 0,
        }
        base.update(kwargs)
        return base

    def flags(**kwargs):
        base = {
            "is_home": False,
            "is_system": False,
            "is_locked": False,
            "slug_locked": False,
            "delete_disabled": False,
        }
        base.update(kwargs)
        return base

    def versions(items):
        rows = []
        for index, item in enumerate(items):
            rows.append(
                {
                    "id": f"ver-{item['version']}-{index}",
                    "version": item["version"],
                    "label": item["label"],
                    "status": item["status"],
                    "created_at": item["created_at"],
                    "author": item["author"],
                    "source": item["source"],
                }
            )
        return rows

    def system_page(page_id: str, name: str, slug: str, template: str, layout: str = "default"):
        return {
            "id": page_id,
            "name": name,
            "slug": slug,
            "url": f"/{slug}",
            "page_type": "system",
            "layout": layout,
            "template": template,
            "language": "en",
            "description": f"System page — {name}",
            "visibility": "public",
            "status": "published",
            "seo_status": "complete",
            "creator": "System",
            "updated_by": "Admin",
            "published_at": "2026-01-01",
            "scheduled_at": None,
            "expires_at": None,
            "current_version": 1,
            "created_at": "2026-01-01",
            "updated_at": "2026-07-01",
            "seo": seo(
                meta_title=f"{name} | AgainERP",
                meta_description=f"{name} system page",
                indexable=False,
            ),
            "advanced": advanced(search_index=False),
            "access": access("System"),
            "stats": stats(views=420, clicks=38, conversion=1.2, seo_score=72, performance_score=88),
            "flags": flags(is_system=True, is_locked=True, slug_locked=True, delete_disabled=True),
            "versions": versions(
                [
                    {
                        "version": 1,
                        "label": "Initial system release",
                        "status": "published",
                        "created_at": "2026-01-01",
                        "author": "System",
                        "source": "publish",
                    }
                ]
            ),
            "permissions": ["public_read"],
        }

    pages = [
        {
            "id": "pg-home",
            "name": "Home Page",
            "slug": "",
            "url": "/",
            "page_type": "website",
            "layout": "default",
            "template": "Homepage",
            "language": "en",
            "description": "Primary storefront homepage",
            "visibility": "public",
            "status": "published",
            "seo_status": "complete",
            "creator": "Admin",
            "updated_by": "Admin",
            "published_at": "2026-01-01",
            "scheduled_at": None,
            "expires_at": None,
            "current_version": 18,
            "created_at": "2026-01-01",
            "updated_at": "2026-07-09",
            "seo": seo(
                meta_title="AgainERP — Premium Commerce",
                meta_description="Shop electronics, fashion, and lifestyle products.",
                keywords="ecommerce, againerp, shop, bangladesh",
                og_title="AgainERP — Premium Commerce",
                og_description="Discover curated products with fast delivery.",
                og_image="/media/og-home.jpg",
                canonical_url="https://againerp.com/",
            ),
            "advanced": advanced(css_class="page-home", body_class="theme-commerce"),
            "access": access("Admin", ["Admin", "Rahim", "Sadia"]),
            "stats": stats(views=12450, clicks=1820, conversion=3.4, seo_score=91, performance_score=86),
            "flags": flags(is_home=True, is_locked=True, slug_locked=True, delete_disabled=True),
            "versions": versions(
                [
                    {
                        "version": 18,
                        "label": "Summer hero refresh",
                        "status": "published",
                        "created_at": "2026-07-09",
                        "author": "Admin",
                        "source": "publish",
                    },
                    {
                        "version": 17,
                        "label": "Featured categories update",
                        "status": "published",
                        "created_at": "2026-07-08",
                        "author": "Rahim",
                        "source": "manual",
                    },
                ]
            ),
            "permissions": ["public_read", "editor_write"],
        },
        {
            "id": "pg-about",
            "name": "About Us",
            "slug": "about-us",
            "url": "/about-us",
            "page_type": "website",
            "layout": "sidebar",
            "template": "Default",
            "language": "en",
            "description": "Company story and mission",
            "visibility": "public",
            "status": "published",
            "seo_status": "complete",
            "creator": "Admin",
            "updated_by": "Rahim",
            "published_at": "2026-02-15",
            "scheduled_at": None,
            "expires_at": None,
            "current_version": 5,
            "created_at": "2026-02-10",
            "updated_at": "2026-06-18",
            "seo": seo(
                meta_title="About Us | AgainERP",
                meta_description="Learn about AgainERP and our team.",
                schema_type="AboutPage",
            ),
            "advanced": advanced(),
            "access": access("Admin"),
            "stats": stats(views=3210, clicks=410, conversion=1.1, seo_score=88, performance_score=90),
            "flags": flags(),
            "versions": versions(
                [
                    {
                        "version": 5,
                        "label": "Team section added",
                        "status": "published",
                        "created_at": "2026-06-18",
                        "author": "Rahim",
                        "source": "manual",
                    }
                ]
            ),
            "permissions": ["public_read", "editor_write"],
        },
        {
            "id": "pg-contact",
            "name": "Contact",
            "slug": "contact",
            "url": "/contact",
            "page_type": "website",
            "layout": "default",
            "template": "Default",
            "language": "en",
            "description": "Contact form and office locations",
            "visibility": "public",
            "status": "published",
            "seo_status": "partial",
            "creator": "Admin",
            "updated_by": "Admin",
            "published_at": "2026-03-01",
            "scheduled_at": None,
            "expires_at": None,
            "current_version": 3,
            "created_at": "2026-02-10",
            "updated_at": "2026-06-15",
            "seo": seo(
                meta_title="Contact | AgainERP",
                meta_description="Get in touch with AgainERP support.",
                schema_type="ContactPage",
            ),
            "advanced": advanced(),
            "access": access("Admin"),
            "stats": stats(views=1840, clicks=220, conversion=4.2, seo_score=75, performance_score=84),
            "flags": flags(),
            "versions": versions(
                [
                    {
                        "version": 3,
                        "label": "Map widget added",
                        "status": "published",
                        "created_at": "2026-06-15",
                        "author": "Admin",
                        "source": "manual",
                    }
                ]
            ),
            "permissions": ["public_read"],
        },
        {
            "id": "pg-summer",
            "name": "Summer Sale 2026",
            "slug": "summer-2026",
            "url": "/summer-2026",
            "page_type": "landing",
            "layout": "landing",
            "template": "Landing Hero",
            "language": "en",
            "description": "Seasonal campaign landing page",
            "visibility": "public",
            "status": "review",
            "seo_status": "partial",
            "creator": "Sadia",
            "updated_by": "Sadia",
            "published_at": None,
            "scheduled_at": "2026-07-15",
            "expires_at": "2026-08-31",
            "current_version": 2,
            "created_at": "2026-07-01",
            "updated_at": "2026-07-08",
            "seo": seo(
                meta_title="Summer Sale 2026",
                meta_description="Up to 50% off selected items.",
            ),
            "advanced": advanced(css_class="page-landing-summer"),
            "access": access("Sadia", ["Sadia", "Admin"], publish_permission="Marketing"),
            "stats": stats(views=120, clicks=18, conversion=0, seo_score=55, performance_score=79),
            "flags": flags(),
            "versions": versions(
                [
                    {
                        "version": 2,
                        "label": "Countdown section",
                        "status": "review",
                        "created_at": "2026-07-08",
                        "author": "Sadia",
                        "source": "manual",
                    }
                ]
            ),
            "permissions": ["editor_write", "marketing_publish"],
        },
        {
            "id": "pg-shop",
            "name": "Shop",
            "slug": "shop",
            "url": "/shop",
            "page_type": "product_listing",
            "layout": "default",
            "template": "Category Grid",
            "language": "en",
            "description": "Main product listing",
            "visibility": "public",
            "status": "published",
            "seo_status": "complete",
            "creator": "Admin",
            "updated_by": "Admin",
            "published_at": "2026-01-20",
            "scheduled_at": None,
            "expires_at": None,
            "current_version": 8,
            "created_at": "2026-01-15",
            "updated_at": "2026-06-20",
            "seo": seo(
                meta_title="Shop All Products | AgainERP",
                meta_description="Browse our full catalog.",
                schema_type="CollectionPage",
            ),
            "advanced": advanced(),
            "access": access("Admin"),
            "stats": stats(views=8900, clicks=1200, conversion=2.8, seo_score=85, performance_score=82),
            "flags": flags(),
            "versions": versions(
                [
                    {
                        "version": 8,
                        "label": "Filter bar update",
                        "status": "published",
                        "created_at": "2026-06-20",
                        "author": "Admin",
                        "source": "publish",
                    }
                ]
            ),
            "permissions": ["public_read"],
        },
        {
            "id": "pg-category",
            "name": "Category",
            "slug": "laptops",
            "url": "/laptops",
            "page_type": "category",
            "layout": "default",
            "template": "Category Grid",
            "language": "en",
            "description": "Category PLP template — Live Edit preview uses a sample catalog category",
            "visibility": "public",
            "status": "published",
            "seo_status": "complete",
            "creator": "Admin",
            "updated_by": "Admin",
            "published_at": "2026-03-05",
            "scheduled_at": None,
            "expires_at": None,
            "current_version": 1,
            "created_at": "2026-03-01",
            "updated_at": "2026-07-12",
            "seo": seo(
                meta_title="Category | AgainERP",
                meta_description="Browse products by category.",
                schema_type="CollectionPage",
            ),
            "advanced": advanced(),
            "access": access("Admin"),
            "stats": stats(views=5600, clicks=780, conversion=2.1, seo_score=82, performance_score=85),
            "flags": flags(slug_locked=True, delete_disabled=True),
            "versions": versions(
                [
                    {
                        "version": 1,
                        "label": "Category live-edit shell",
                        "status": "published",
                        "created_at": "2026-07-12",
                        "author": "Admin",
                        "source": "manual",
                    }
                ]
            ),
            "permissions": ["public_read"],
        },
        system_page("pg-cart", "Cart", "cart", "Checkout Flow"),
        system_page("pg-checkout", "Checkout", "checkout", "Checkout Flow"),
    ]

    inserted = 0
    for item in pages:
        row = WebsitePage(
            id=item["id"],
            company_id="default",
            name=item["name"],
            slug=item["slug"],
            url=item["url"],
            page_type=item["page_type"],
            layout=item["layout"],
            template=item["template"],
            language=item["language"],
            description=item["description"],
            visibility=item["visibility"],
            status=item["status"],
            seo_status=item["seo_status"],
            creator=item["creator"],
            updated_by=item["updated_by"],
            published_at=_dt(item.get("published_at")),
            scheduled_at=_dt(item.get("scheduled_at")),
            expires_at=_dt(item.get("expires_at")),
            current_version=item["current_version"],
            seo_json=website_dump_json(item["seo"]),
            advanced_json=website_dump_json(item["advanced"]),
            access_json=website_dump_json(item["access"]),
            stats_json=website_dump_json(item["stats"]),
            flags_json=website_dump_json(item["flags"]),
            versions_json=website_dump_json(item["versions"]),
            permissions_json=website_dump_json(item["permissions"]),
            created_at=_dt(item.get("created_at")) or datetime.utcnow(),
            updated_at=_dt(item.get("updated_at")) or datetime.utcnow(),
        )
        db.add(row)
        inserted += 1

    if inserted:
        db.commit()
    return inserted


def ensure_website_category_page(db) -> int:
    """Upsert Category template page so Live Edit preview matches Monarch /{slug}."""
    page_id = "pg-category"
    row = db.get(WebsitePage, page_id)
    legacy = db.get(WebsitePage, "pg-cat-electronics")
    changed = 0

    if legacy and not row:
        # Replace legacy Electronics CMS row with Category template.
        db.delete(legacy)
        db.flush()
        legacy = None
        changed = 1

    if not row:
        now = datetime.utcnow()
        db.add(
            WebsitePage(
                id=page_id,
                company_id="default",
                name="Category",
                slug="laptops",
                url="/laptops",
                page_type="category",
                layout="default",
                template="Category Grid",
                language="en",
                description="Category PLP template — Live Edit preview uses a sample catalog category",
                visibility="public",
                status="published",
                seo_status="complete",
                creator="Admin",
                updated_by="Admin",
                published_at=now,
                current_version=1,
                seo_json=website_dump_json(
                    {
                        "meta_title": "Category | AgainERP",
                        "meta_description": "Browse products by category.",
                        "keywords": "",
                        "og_title": "Category | AgainERP",
                        "og_description": "Browse products by category.",
                        "og_image": None,
                        "canonical_url": None,
                        "indexable": True,
                        "schema_type": "CollectionPage",
                    }
                ),
                advanced_json=website_dump_json(
                    {
                        "css_class": "",
                        "body_class": "",
                        "cache_enabled": True,
                        "lazy_load": True,
                        "search_index": True,
                    }
                ),
                access_json=website_dump_json(
                    {
                        "owner": "Admin",
                        "editors": ["Admin"],
                        "view_access": "Public",
                        "publish_permission": "Editors",
                    }
                ),
                stats_json=website_dump_json(
                    {
                        "views": 0,
                        "clicks": 0,
                        "conversion": 0,
                        "seo_score": 0,
                        "performance_score": 0,
                    }
                ),
                flags_json=website_dump_json(
                    {
                        "is_home": False,
                        "is_system": False,
                        "is_locked": False,
                        "slug_locked": True,
                        "delete_disabled": True,
                    }
                ),
                versions_json=website_dump_json([]),
                permissions_json=website_dump_json(["public_read"]),
                created_at=now,
                updated_at=now,
            )
        )
        changed = 1
    elif row.slug != "laptops" or row.url != "/laptops" or row.name != "Category":
        row.name = "Category"
        row.slug = "laptops"
        row.url = "/laptops"
        row.page_type = "category"
        row.updated_at = datetime.utcnow()
        changed = 1

    if changed:
        db.commit()
    return changed


def seed_website_layouts(db) -> int:
    """Seed reusable header/footer/sidebar templates."""
    if db.query(WebsiteLayout).count() > 0:
        return 0

    layouts = [
        {
            "id": "layout-1",
            "name": "Default Layout",
            "description": "Standard header + extended footer, no sidebar. Used for most pages.",
            "header_style": "standard",
            "footer_style": "extended",
            "sidebar_position": "none",
            "status": "active",
            "is_default": True,
            "pages_count": 5,
            "thumbnail": "default",
        },
        {
            "id": "layout-2",
            "name": "Landing Page",
            "description": "Minimal header + minimal footer. No distractions for conversion pages.",
            "header_style": "minimal",
            "footer_style": "minimal",
            "sidebar_position": "none",
            "status": "active",
            "is_default": False,
            "pages_count": 2,
            "thumbnail": "landing",
        },
        {
            "id": "layout-3",
            "name": "Blog / Article",
            "description": "Standard header + sidebar on right for related posts and widgets.",
            "header_style": "standard",
            "footer_style": "standard",
            "sidebar_position": "right",
            "status": "active",
            "is_default": False,
            "pages_count": 1,
            "thumbnail": "blog",
        },
        {
            "id": "layout-4",
            "name": "Shop / Ecommerce",
            "description": "Mega menu header + dark footer. Optimized for product browsing.",
            "header_style": "mega",
            "footer_style": "dark",
            "sidebar_position": "left",
            "status": "active",
            "is_default": False,
            "pages_count": 3,
            "thumbnail": "shop",
        },
        {
            "id": "layout-5",
            "name": "Full Width",
            "description": "Centered logo header + standard footer. Great for visual storytelling.",
            "header_style": "centered",
            "footer_style": "standard",
            "sidebar_position": "none",
            "status": "draft",
            "is_default": False,
            "pages_count": 0,
            "thumbnail": "fullwidth",
        },
    ]

    inserted = 0
    for item in layouts:
        db.add(WebsiteLayout(company_id="default", **item))
        inserted += 1

    if inserted:
        db.commit()
    return inserted


def _builder_properties(content=None):
    return {
        "name": "",
        "containerWidth": "boxed",
        "alignment": "left",
        "style": {
            "background": "transparent",
            "textColor": "inherit",
            "borderColor": "transparent",
            "borderRadius": 0,
            "shadow": "none",
            "overlay": "transparent",
            "align": "left",
        },
        "spacing": {
            "margin": {"top": 0, "right": 0, "bottom": 0, "left": 0},
            "padding": {"top": 24, "right": 24, "bottom": 24, "left": 24},
            "gap": 16,
        },
        "animation": {"type": "none", "duration": 400, "delay": 0},
        "visibility": {
            "desktop": True,
            "tablet": True,
            "mobile": True,
            "loggedIn": True,
            "guests": True,
            "customerGroups": [],
        },
        "advanced": {"cssId": "", "cssClass": "", "customAttributes": ""},
        "content": content or {},
    }


def _builder_section(section_id, section_type, label, content=None, hidden=False):
    return {
        "id": section_id,
        "type": section_type,
        "label": label,
        "hidden": hidden,
        "properties": _builder_properties(content),
        "widgets": [],
    }


def seed_website_builder_documents(db) -> int:
    """Seed one example Builder Layout JSON document (pg-home)."""
    if db.query(WebsiteBuilderDocument).count() > 0:
        return 0

    sections = [
        _builder_section(
            "sec-hero",
            "hero_banner",
            "Hero",
            {
                "heading": "Summer Collection 2026",
                "subheading": "Discover curated products with free shipping over ৳2,000.",
                "ctaLabel": "Shop Now",
                "ctaUrl": "/shop",
                "image": "/media/hero-summer.jpg",
            },
        ),
        _builder_section(
            "sec-featured",
            "product_grid",
            "Featured Products",
            {"heading": "Featured Products", "limit": 8, "columns": 4, "source": "featured"},
        ),
        _builder_section(
            "sec-flash",
            "countdown",
            "Flash Sale",
            {"heading": "Flash Sale Ends In", "endDate": "2026-08-01"},
        ),
        _builder_section("sec-brands", "brand_slider", "Brands", {"heading": "Shop by Brand"}),
        _builder_section(
            "sec-banner",
            "image_banner",
            "Banner",
            {"image": "/media/promo-banner.jpg", "alt": "Mid-season promo", "link": "/summer-2026"},
        ),
        _builder_section(
            "sec-newsletter",
            "newsletter",
            "Newsletter",
            {"heading": "Stay in the loop", "placeholder": "Enter your email", "buttonLabel": "Subscribe"},
        ),
        _builder_section(
            "sec-footer",
            "rich_text",
            "Footer",
            {"body": "© 2026 AgainERP · Privacy · Terms · Support"},
        ),
    ]

    document = {
        "pageId": "pg-home",
        "pageName": "Home Page",
        "slug": "/",
        "version": 12,
        "device": "desktop",
        "zoom": 100,
        "updatedAt": datetime.utcnow().isoformat(),
        "layout": {
            "id": "layout-home",
            "name": "Homepage Layout",
            "sections": sections,
        },
    }

    db.add(
        WebsiteBuilderDocument(
            page_id="pg-home",
            company_id="default",
            document_json=builder_dump_json(document),
            version=1,
            updated_by="Admin",
        )
    )
    db.commit()
    return 1


def main() -> None:
    print("Checking database connection…")
    info = check_database_connection()
    print(f"  Connected: {info}")

    print("Creating tables…")
    Base.metadata.create_all(bind=engine)
    ensure_catalog_product_updated_by_columns()
    ensure_role_publish_column()
    ensure_role_export_column()
    try:  # trigram indexes for the AI's record search (ai.md step 2.1) - optional, never blocks startup
        from scripts.ensure_search_indexes import ensure_search_indexes

        print("  " + ensure_search_indexes())
    except Exception as exc:  # noqa: BLE001
        print(f"  search indexes skipped: {exc}")
    ensure_cloudflare_plugin_columns()
    ensure_catalog_attribute_filter_columns()
    ensure_catalog_review_columns()
    ensure_catalog_category_columns()
    ensure_catalog_brand_columns()
    ensure_product_columns()
    ensure_product_attribute_value_columns()
    ensure_item_foundation_columns()
    ensure_service_item_columns()
    ensure_service_category_columns()
    ensure_party_foundation_columns()
    ensure_inventory_core_columns()
    ensure_ecommerce_columns()
    ensure_storefront_cart_columns()
    ensure_commerce_order_item_columns()
    ensure_commerce_order_lifecycle_columns()
    ensure_commerce_customer_finance_columns()
    ensure_commerce_supplier_finance_columns()
    ensure_item_barcode_type_column()
    ensure_catalog_product_pos_fields_columns()
    ensure_catalog_product_variant_purchase_price_column()
    ensure_catalog_product_combo_components_column()
    ensure_supplier_catalog_columns()
    ensure_auth_user_columns()
    ensure_seo_audit_run_columns()
    ensure_seo_url_record_columns()
    ensure_purchase_receipt_serial_columns()
    ensure_purchase_order_line_return_columns()
    ensure_sales_columns()
    ensure_sales_order_stage_and_shipping_columns()
    ensure_blog_columns()
    ensure_sales_tax_fk()
    print("  Tables ready.")

    db = SessionLocal()
    try:
        before_products = db.query(CatalogProduct).count()
        inserted_products = seed_products(db)
        after_products = db.query(CatalogProduct).count()
        print(
            f"  Products: {after_products} ({inserted_products} new, {before_products} before seed).",
        )

        before_blog = db.query(BlogPost).count()
        before_blog_categories = db.query(BlogCategory).count()
        before_blog_comments = db.query(BlogComment).count()
        inserted_blog_settings = seed_blog_settings(db)
        if inserted_blog_settings:
            print("  Blog settings: default configuration row created.")

        inserted_website_settings = seed_website_settings(db)
        if inserted_website_settings:
            print("  Website settings: default configuration row created.")

        try:
            from scripts.seed_workspace_site import seed_primary_site

            inserted_site = seed_primary_site(db)
            if inserted_site:
                print("  Workspace site: primary Againcart site (co1) created.")
            else:
                print("  Workspace site: primary Againcart site (co1) upserted.")
        except Exception as exc:  # noqa: BLE001
            print(f"  Workspace site seed skipped: {exc}")

        inserted_website_homepage = seed_website_homepage(db)
        if inserted_website_homepage:
            print("  Website homepage: default hero content row created.")

        inserted_website_category_page = seed_website_category_page(db)
        if inserted_website_category_page:
            print("  Website category page: default PLP template created.")

        inserted_website_menus = seed_website_menus(db)
        if inserted_website_menus:
            print(f"  Website menus: {inserted_website_menus} system menu(s) seeded.")

        before_items = db.query(Item).count()
        backfilled_items = backfill_items_from_catalog(db)
        after_items = db.query(Item).count()
        print(
            f"  Items (SSOT): {after_items} ({backfilled_items} backfilled, {before_items} before backfill).",
        )

        before_ec = db.query(EcommerceItem).count()
        backfilled_ec = backfill_ecommerce_items_from_catalog(db)
        after_ec = db.query(EcommerceItem).count()
        print(
            f"  Ecommerce items: {after_ec} ({backfilled_ec} synced, {before_ec} before backfill).",
        )

        p7_stats = complete_p7_universal_item_migration(db)
        print(
            f"  P7 Universal Item: {p7_stats['products_linked']} product(s) linked, "
            f"{p7_stats['ecommerce_synced']} ecommerce sync, "
            f"{p7_stats['inventory_extensions']} inventory extension(s), "
            f"{p7_stats['stock_item_id_backfill']} stock item_id backfill.",
        )

        backfilled_collab = backfill_collaboration_from_items(db)
        after_collab = db.query(CollabOwnership).count()
        print(
            f"  Collaboration ownership: {after_collab} ({backfilled_collab} backfilled).",
        )

        before_reviews = db.query(CatalogProductReview).count()
        inserted_reviews = seed_reviews(db)
        after_reviews = db.query(CatalogProductReview).count()
        print(
            f"  Product reviews: {after_reviews} ({inserted_reviews} new, {before_reviews} before seed).",
        )

        before_qa = db.query(CatalogProductQa).count()
        inserted_qa = seed_product_qa(db)
        after_qa = db.query(CatalogProductQa).count()
        print(
            f"  Product Q&A: {after_qa} ({inserted_qa} upserted, {before_qa} before seed).",
        )

        before_categories = db.query(CatalogCategory).count()
        inserted_categories = seed_categories(db)
        upserted_catalog_categories = seed_catalog_channel_categories(db)
        after_categories = db.query(CatalogCategory).count()
        catalog_channel_count = (
            db.query(CatalogCategory).filter(CatalogCategory.channel == "catalog").count()
        )
        print(
            f"  Categories: {after_categories} ({inserted_categories} dropshipping new, "
            f"{upserted_catalog_categories} catalog-channel upserted, "
            f"{catalog_channel_count} catalog channel total, {before_categories} before seed).",
        )

        if blog_has_mock_seed(db):
            blog_reseed = reseed_blog_from_catalog(db)
            after_blog_categories = db.query(BlogCategory).count()
            after_blog = db.query(BlogPost).count()
            after_blog_comments = db.query(BlogComment).count()
            print(
                f"  Blog reseeded from catalog: {blog_reseed['categories']} categories, "
                f"{blog_reseed['articles']} articles, {blog_reseed['comments']} comments "
                f"({after_blog_categories} categories, {after_blog} articles, {after_blog_comments} comments total).",
            )
        else:
            inserted_blog_categories = seed_blog_categories(db)
            inserted_blog = seed_blog(db)
            backfilled_blog_categories = backfill_blog_post_categories(db)
            inserted_blog_comments = seed_blog_comments(db)
            after_blog_categories = db.query(BlogCategory).count()
            after_blog = db.query(BlogPost).count()
            after_blog_comments = db.query(BlogComment).count()
            print(
                f"  Blog categories: {after_blog_categories} ({inserted_blog_categories} new, {before_blog_categories} before seed).",
            )
            print(
                f"  Blog articles: {after_blog} ({inserted_blog} new, {before_blog} before seed, {backfilled_blog_categories} category links backfilled).",
            )
            print(
                f"  Blog comments: {after_blog_comments} ({inserted_blog_comments} new, {before_blog_comments} before seed).",
            )

        before_brands = db.query(CatalogBrand).count()
        inserted_brands = seed_brands(db)
        upserted_catalog_brands = seed_catalog_channel_brands(db)
        after_brands = db.query(CatalogBrand).count()
        catalog_brand_count = (
            db.query(CatalogBrand).filter(CatalogBrand.channel == "catalog").count()
        )
        print(
            f"  Brands: {after_brands} ({inserted_brands} dropshipping new, "
            f"{upserted_catalog_brands} catalog-channel upserted, "
            f"{catalog_brand_count} catalog channel total, {before_brands} before seed).",
        )

        before_collections = db.query(CatalogCollection).count()
        inserted_collections = seed_collections(db)
        after_collections = db.query(CatalogCollection).count()
        print(
            f"  Collections: {after_collections} ({inserted_collections} new, {before_collections} before seed).",
        )

        before_filters = db.query(CatalogFilter).count()
        inserted_filters = seed_filters(db)
        after_filters = db.query(CatalogFilter).count()
        print(
            f"  Filters: {after_filters} ({inserted_filters} new, {before_filters} before seed).",
        )

        before_cfg_profiles = db.query(ConfiguratorProfile).count()
        inserted_cfg_profiles = seed_configurator_profiles(db)
        after_cfg_profiles = db.query(ConfiguratorProfile).count()
        print(
            f"  Configurator profiles: {after_cfg_profiles} ({inserted_cfg_profiles} new, {before_cfg_profiles} before seed).",
        )

        before_cfg_categories = db.query(ConfiguratorCategory).count()
        inserted_cfg_categories = seed_configurator_categories(db)
        after_cfg_categories = db.query(ConfiguratorCategory).count()
        print(
            f"  Configurator categories: {after_cfg_categories} ({inserted_cfg_categories} new, {before_cfg_categories} before seed).",
        )

        before_cfg_templates = db.query(ConfiguratorTemplate).count()
        inserted_cfg_templates = seed_configurator_templates(db)
        after_cfg_templates = db.query(ConfiguratorTemplate).count()
        print(
            f"  Configurator templates: {after_cfg_templates} ({inserted_cfg_templates} new, {before_cfg_templates} before seed).",
        )

        before_cfg_builds = db.query(ConfiguratorBuild).count()
        inserted_cfg_builds = seed_configurator_builds(db)
        after_cfg_builds = db.query(ConfiguratorBuild).count()
        print(
            f"  Configurator builds: {after_cfg_builds} ({inserted_cfg_builds} new, {before_cfg_builds} before seed).",
        )

        linked = link_product_taxonomy(db)
        if linked:
            print(f"  Linked taxonomy on {linked} product(s).")

        before_profiles = db.query(CatalogAttributeProfile).count()
        inserted_profiles = seed_attribute_profiles(db)
        after_profiles = db.query(CatalogAttributeProfile).count()
        after_groups = db.query(CatalogAttributeGroup).count()
        after_attrs = db.query(CatalogAttribute).count()
        print(
            f"  Attribute profiles: {after_profiles} ({inserted_profiles} upserted, "
            f"{after_groups} groups, {after_attrs} attributes, {before_profiles} before seed).",
        )

        before_variants = db.query(CatalogProductVariant).count()
        inserted_variants = seed_variants(db)
        after_variants = db.query(CatalogProductVariant).count()
        print(
            f"  Variants: {after_variants} ({inserted_variants} new, {before_variants} before seed).",
        )

        before_media = db.query(Media).count()
        inserted_media = seed_media(db)
        inserted_side_icons = seed_side_menu_media(db)
        inserted_header_media = seed_header_media(db)
        inserted_footer_media = seed_footer_media(db)
        after_media = db.query(Media).count()
        print(
            f"  Media: {after_media} ({inserted_media} new, {before_media} before seed; "
            f"side-menu icons {inserted_side_icons} new; header media {inserted_header_media} new; "
            f"footer media {inserted_footer_media} new).",
        )

        before_warehouses = db.query(InventoryWarehouse).count()
        inserted_warehouses = seed_warehouses(db)
        after_warehouses = db.query(InventoryWarehouse).count()
        print(
            f"  Warehouses: {after_warehouses} ({inserted_warehouses} new, {before_warehouses} before seed).",
        )

        before_pickings = db.query(InventoryStockPicking).count()
        inserted_pickings = seed_stock_pickings(db)
        after_pickings = db.query(InventoryStockPicking).count()
        print(
            f"  Stock pickings: {after_pickings} ({inserted_pickings} new, {before_pickings} before seed).",
        )

        before_quants = db.query(InventoryStockQuant).count()
        inserted_quants = seed_stock_quants(db)
        after_quants = db.query(InventoryStockQuant).count()
        print(
            f"  Stock quants: {after_quants} ({inserted_quants} new, {before_quants} before seed).",
        )

        before_scraps = db.query(InventoryStockScrap).count()
        inserted_scraps = seed_stock_scraps(db)
        after_scraps = db.query(InventoryStockScrap).count()
        print(
            f"  Stock scraps: {after_scraps} ({inserted_scraps} new, {before_scraps} before seed).",
        )

        before_orderpoints = db.query(InventoryOrderpoint).count()
        inserted_orderpoints = seed_orderpoints(db)
        after_orderpoints = db.query(InventoryOrderpoint).count()
        print(
            f"  Orderpoints: {after_orderpoints} ({inserted_orderpoints} new, {before_orderpoints} before seed).",
        )

        before_stock = db.query(InventoryStockLevel).count()
        inserted_stock = seed_stock_levels(db)
        after_stock = db.query(InventoryStockLevel).count()
        print(
            f"  Stock levels: {after_stock} ({inserted_stock} new, {before_stock} before seed).",
        )

        backfilled_stock_items = backfill_stock_item_ids(db)
        if backfilled_stock_items:
            print(f"  Stock item_id backfill: {backfilled_stock_items} row(s).")

        backfilled_inv_items = backfill_inventory_items(db)
        if backfilled_inv_items:
            print(f"  Inventory item extensions: {backfilled_inv_items} new.")

        default_wh = ensure_default_warehouse(db)
        if default_wh:
            print("  Default warehouse set.")

        before_uom = db.query(InventoryUom).count()
        inserted_uom = seed_uom(db)
        after_uom = db.query(InventoryUom).count()
        print(f"  UOM: {after_uom} ({inserted_uom} new, {before_uom} before seed).")

        inserted_service_categories = seed_service_categories(db)
        print(f"  Service categories: {inserted_service_categories} new.")

        opening_moves = seed_opening_movements(db)
        if opening_moves:
            print(f"  Opening stock movements: {opening_moves} seeded.")

        before_customers = db.query(CommerceCustomer).count()
        inserted_customers = seed_customers(db)
        after_customers = db.query(CommerceCustomer).count()
        print(
            f"  Customers: {after_customers} ({inserted_customers} new, {before_customers} before seed).",
        )

        before_orders = db.query(CommerceOrder).count()
        inserted_orders = seed_orders(db)
        linked_orders = link_seed_orders_to_customers(db)
        after_orders = db.query(CommerceOrder).count()
        print(
            f"  Orders: {after_orders} ({inserted_orders} new, {linked_orders} customer-linked, {before_orders} before seed).",
        )
        account_demo = seed_account_demo_data(db)
        print(
            f"  Account demo: payments={account_demo['payments']}, cases={account_demo['cases']}, customers_enriched={account_demo['customers_enriched']}.",
        )

        before_suppliers = db.query(CommerceSupplier).count()
        inserted_suppliers = seed_suppliers(db)
        after_suppliers = db.query(CommerceSupplier).count()
        print(
            f"  Suppliers: {after_suppliers} ({inserted_suppliers} new, {before_suppliers} before seed).",
        )

        inserted_vendor_types = seed_vendor_types(db)
        print(f"  Vendor types: {db.query(VendorType).count()} ({inserted_vendor_types} new).")

        before_parties = db.query(Party).count()
        backfilled_parties = backfill_parties_from_commerce(db)
        seeded_demo_parties = seed_demo_parties(db)
        after_parties = db.query(Party).count()
        print(
            f"  Parties (SSOT): {after_parties} ({backfilled_parties} backfilled, {seeded_demo_parties} demo, {before_parties} before).",
        )

        from app.services.parties.commerce_workspace_bridge import backfill_party_workspace_from_commerce

        backfilled_collab_parties = backfill_collaboration_from_parties(db)
        backfilled_workspace = backfill_party_workspace_from_commerce(db)
        if backfilled_collab_parties or backfilled_workspace:
            print(
                f"  Party workspace: {backfilled_collab_parties} collab init, {backfilled_workspace} profile backfill.",
            )

        before_pos = db.query(PurchaseOrder).count()
        inserted_pos = seed_purchase_orders(db)
        after_pos = db.query(PurchaseOrder).count()
        print(
            f"  Purchase orders: {after_pos} ({inserted_pos} new, {before_pos} before seed).",
        )

        # Seed admin/staff before optional catalog steps so login works even if a later seed fails.
        before_users = db.query(AuthUser).count()
        inserted_users = seed_auth_users(db)
        after_users = db.query(AuthUser).count()
        print(f"  Auth users: {after_users} ({inserted_users} new, {before_users} before seed).")

        before_sp = db.query(SupplierProduct).count()
        try:
            inserted_sp = seed_supplier_catalog(db)
            after_sp = db.query(SupplierProduct).count()
            print(
                f"  Supplier catalog: {after_sp} products ({inserted_sp} new, {before_sp} before seed).",
            )
        except ModuleNotFoundError as exc:
            print(f"  Supplier catalog: skipped ({exc}).")

        before_so = db.query(SalesOrder).count()
        inserted_so = seed_sales(db)
        after_so = db.query(SalesOrder).count()
        print(
            f"  Sales orders: {after_so} ({inserted_so} new, {before_so} before seed).",
        )

        before_pos_sess = db.query(PosSession).count()
        inserted_pos = seed_pos(db)
        after_pos_sess = db.query(PosSession).count()
        print(
            f"  POS sessions: {after_pos_sess} ({inserted_pos} new, {before_pos_sess} before seed).",
        )

        before_fin = db.query(FinanceAccount).count()
        inserted_fin = seed_finance(db)
        after_fin = db.query(FinanceAccount).count()
        print(
            f"  Finance accounts: {after_fin} ({inserted_fin} new, {before_fin} before seed).",
        )

        before_returns = db.query(CommerceOrderReturn).count()
        inserted_returns = seed_returns(db)
        after_returns = db.query(CommerceOrderReturn).count()
        print(
            f"  Order returns: {after_returns} ({inserted_returns} new, {before_returns} before seed).",
        )

        before_refunds = db.query(CommerceOrderRefund).count()
        inserted_refunds = seed_refunds(db)
        after_refunds = db.query(CommerceOrderRefund).count()
        print(
            f"  Order refunds: {after_refunds} ({inserted_refunds} new, {before_refunds} before seed).",
        )

        before_approvals = db.query(AiApproval).count()
        inserted_approvals = seed_ai_approvals(db)
        after_approvals = db.query(AiApproval).count()
        print(
            f"  AI approvals: {after_approvals} ({inserted_approvals} new, {before_approvals} before seed).",
        )

        before_audit_logs = db.query(AiAuditLog).count()
        inserted_audit_logs = seed_ai_audit_logs(db)
        after_audit_logs = db.query(AiAuditLog).count()
        print(
            f"  AI audit logs: {after_audit_logs} ({inserted_audit_logs} new, {before_audit_logs} before seed).",
        )

        before_providers = db.query(AiProvider).count()
        inserted_providers = seed_ai_providers(db)
        after_providers = db.query(AiProvider).count()
        print(
            f"  AI providers: {after_providers} ({inserted_providers} new, {before_providers} before seed).",
        )

        before_connections = db.query(AiApiConnection).count()
        inserted_connections = seed_ai_connections(db)
        after_connections = db.query(AiApiConnection).count()
        print(
            f"  AI API connections: {after_connections} ({inserted_connections} new, {before_connections} before seed).",
        )
        inserted_cloudflare = seed_cloudflare_plugin(db)
        print(f"  Cloudflare plugin: {inserted_cloudflare} new row(s).")

        before_agents = db.query(AiAgent).count()
        inserted_agents = seed_ai_agents(db)
        after_agents = db.query(AiAgent).count()
        print(
            f"  AI agents: {after_agents} ({inserted_agents} new, {before_agents} before seed).",
        )

        before_tools = db.query(AiTool).count()
        inserted_tools = seed_ai_tools(db)
        after_tools = db.query(AiTool).count()
        print(
            f"  AI tools: {after_tools} ({inserted_tools} new, {before_tools} before seed).",
        )

        before_journeys = db.query(MarketingJourney).count()
        inserted_journeys = seed_journeys(db)
        after_journeys = db.query(MarketingJourney).count()
        print(
            f"  Journeys: {after_journeys} ({inserted_journeys} new, {before_journeys} before seed).",
        )

        before_audiences = db.query(MarketingAudience).count()
        inserted_audiences = seed_audiences(db)
        after_audiences = db.query(MarketingAudience).count()
        print(
            f"  Audiences: {after_audiences} ({inserted_audiences} new, {before_audiences} before seed).",
        )

        before_campaigns = db.query(MarketingCampaign).count()
        inserted_campaigns = seed_campaigns(db)
        after_campaigns = db.query(MarketingCampaign).count()
        print(
            f"  Campaigns: {after_campaigns} ({inserted_campaigns} new, {before_campaigns} before seed).",
        )

        before_coupons = db.query(MarketingCoupon).count()
        inserted_coupons = seed_coupons(db)
        after_coupons = db.query(MarketingCoupon).count()
        print(f"  Coupons: {after_coupons} ({inserted_coupons} new, {before_coupons} before seed).")

        before_meta = db.query(SeoMetaRecord).count()
        inserted_meta = seed_seo_meta(db)
        after_meta = db.query(SeoMetaRecord).count()
        print(f"  SEO meta: {after_meta} ({inserted_meta} new, {before_meta} before seed).")

        before_audit = db.query(SeoAuditIssue).count()
        try:
            inserted_audit = seed_seo_audit(db)
            after_audit = db.query(SeoAuditIssue).count()
            print(f"  SEO audit issues: {after_audit} ({inserted_audit} detected, {before_audit} before seed).")
        except ModuleNotFoundError as exc:
            db.rollback()
            print(f"  SEO audit issues: skipped ({exc}).")

        before_redirects = db.query(SeoRedirect).count()
        inserted_redirects = seed_seo_redirects(db)
        after_redirects = db.query(SeoRedirect).count()
        print(f"  SEO redirects: {after_redirects} ({inserted_redirects} new, {before_redirects} before seed).")

        before_urls = db.query(SeoUrlRecord).count()
        try:
            inserted_urls = seed_seo_urls(db)
            after_urls = db.query(SeoUrlRecord).count()
            print(f"  SEO URLs: {after_urls} ({inserted_urls} synced, {before_urls} before seed).")
        except ModuleNotFoundError as exc:
            db.rollback()
            print(f"  SEO URLs: skipped ({exc}).")

        before_staging = db.query(ProviderImportJob).count()
        inserted_staging = seed_provider_import_staging(db)
        after_staging = db.query(ProviderImportJob).count()
        print(f"  Provider import staging: {after_staging} jobs ({inserted_staging} new, {before_staging} before seed).")

        before_mappings = db.query(ProviderEntityMapping).count()
        inserted_mappings = seed_provider_entity_mappings(db)
        after_mappings = db.query(ProviderEntityMapping).count()
        print(f"  Provider entity mappings: {after_mappings} ({inserted_mappings} new, {before_mappings} before seed).")

        before_website_pages = db.query(WebsitePage).count()
        inserted_website_pages = seed_website_pages(db)
        ensured_category_page = ensure_website_category_page(db)
        after_website_pages = db.query(WebsitePage).count()
        print(
            f"  Website pages: {after_website_pages} ({inserted_website_pages} new, "
            f"{ensured_category_page} category template upsert, {before_website_pages} before seed).",
        )

        before_website_layouts = db.query(WebsiteLayout).count()
        inserted_website_layouts = seed_website_layouts(db)
        after_website_layouts = db.query(WebsiteLayout).count()
        print(
            f"  Website layouts: {after_website_layouts} ({inserted_website_layouts} new, {before_website_layouts} before seed).",
        )

        before_builder_docs = db.query(WebsiteBuilderDocument).count()
        inserted_builder_docs = seed_website_builder_documents(db)
        after_builder_docs = db.query(WebsiteBuilderDocument).count()
        print(
            f"  Website builder documents: {after_builder_docs} ({inserted_builder_docs} new, {before_builder_docs} before seed).",
        )

        before_compat_rules = db.query(ConfiguratorCompatibilityRule).count()
        inserted_compat_rules = seed_configurator_compatibility_rules(db)
        after_compat_rules = db.query(ConfiguratorCompatibilityRule).count()
        print(
            f"  Configurator compatibility rules: {after_compat_rules} ({inserted_compat_rules} new, {before_compat_rules} before seed).",
        )
        # HRM ships 87 tables and a fully wired UI but never had seed data, so
        # every HRM screen rendered empty on a fresh install.
        try:
            from scripts.seed_hrm import seed_hrm

            hrm_created = seed_hrm(db)
            print(f"  HRM: {sum(hrm_created.values())} new row(s) across {len(hrm_created)} entities.")
        except Exception as exc:  # noqa: BLE001 — seeding must not block startup
            db.rollback()
            print(f"  HRM seed skipped: {exc}")

        try:
            from scripts.seed_rma import seed_rma

            rma_created = seed_rma(db)
            print(f"  RMA: {rma_created.get('tickets', 0)} claim(s) seeded.")
        except Exception as exc:  # noqa: BLE001 — seeding must not block startup
            db.rollback()
            print(f"  RMA seed skipped: {exc}")

        try:
            from scripts.seed_serials import seed_serials

            serial_created = seed_serials(db)
            print(f"  Serial registry: {serial_created.get('total', 0)} serial(s) seeded.")
        except Exception as exc:  # noqa: BLE001 — seeding must not block startup
            db.rollback()
            print(f"  Serial registry seed skipped: {exc}")
    finally:
        db.close()

    print("Done.")


if __name__ == "__main__":
    main()
