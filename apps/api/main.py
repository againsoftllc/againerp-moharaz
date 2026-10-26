import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles  # noqa: F401

from app.config import get_settings
from app.database import SessionLocal
from app.deps.auth import get_current_user, require_admin_user
from app.services.r2_static import R2FallbackStaticFiles
from app.middleware.approval_gate import ApprovalGateMiddleware
from app.middleware.rbac_guard import RbacGuardMiddleware
from app.routers import (
    auth,
    auth_roles,
    auth_users,
    company_registration,
    super_admin_auth,
    super_admin_companies,
    super_admin_plans,
    catalog_ai,
    ephemeral_store,
    catalog_attribute_profiles,
    catalog_brands,
    catalog_warranties,
    catalog_categories,
    catalog_bundles,
    catalog_collections,
    catalog_filters,
    catalog_products,
    catalog_variants,
    digital_files,
    catalog_reviews,
    catalog_qa,
    catalog_blog,
    catalog_blog_categories,
    catalog_blog_comments,
    catalog_blog_settings,
    commerce_orders,
    commerce_inventory,
    inventory_locations,
    inventory_movements,
    inventory_product_history,
    inventory_serials,
    inventory_stock_adjustments,
    inventory_stock_counts,
    inventory_stock_levels,
    inventory_reports,
    inventory_stock_transfers,
    inventory_warehouses,
    inventory_settings,
    commerce_suppliers,
    supplier_catalog,
    purchase_orders,
    purchase_rfq,
    purchase_bills,
    purchase_receipts,
    purchase_reports,
    purchase_returns,
    sales_returns,
    portal,
    supplier_portal_admin,
    rma,
    rma_claims,
    rma_deliveries,
    rma_settlements,
    rma_receipts,
    service_jobs,
    service_categories,
    seo,
    finance,
    catalog_duplicates,
    catalog_sitemap_import,
    finance_cheques,
    finance_cheque_books,
    finance_allocation,
    finance_periods,
    core_sequences,
    approval_limits,
    approvals,
    ai_gateway,
    ai_billing,
    crm,
    finance_expenses,
    commerce_customers,
    commerce_returns,
    commerce_refunds,
    vendor_admin,
    vendor_catalog_admin,
    vendor_order_admin,
    vendor_portal,
    vendor_portal_cart,
    vendor_portal_catalog,
    vendor_portal_notifications,
    vendor_portal_quotation,
    vendor_quotation_admin,
    collaboration,
    configurator_builds,
    configurator_categories,
    configurator_compatibility_rules,
    configurator_field_sources,
    configurator_lookups,
    configurator_overview,
    configurator_profiles,
    configurator_ready_builds,
    configurator_slot_products,
    configurator_slot_tabs,
    configurator_templates,
    health,
    workspace_company,
    hrm_branches,
    hrm_departments,
    hrm_designations,
    hrm_document_types,
    hrm_employees,
    hrm_employee_documents,
    hrm_award_types,
    hrm_awards,
    hrm_leave_types,
    hrm_leave_policies,
    hrm_leave_applications,
    hrm_leave_balances,
    hrm_shifts,
    hrm_attendance_policies,
    hrm_attendance_records,
    hrm_attendance_regularizations,
    hrm_time_entries,
    hrm_holidays,
    hrm_salary_components,
    hrm_employee_salaries,
    hrm_payroll_runs,
    hrm_payroll_entries,
    hrm_payslips,
    hrm_job_categories,
    hrm_job_types,
    hrm_job_locations,
    hrm_job_requisitions,
    hrm_job_postings,
    hrm_candidate_sources,
    hrm_candidates,
    hrm_interview_types,
    hrm_interview_rounds,
    hrm_interviews,
    hrm_interview_feedback,
    hrm_candidate_assessments,
    hrm_offer_templates,
    hrm_offers,
    hrm_onboarding,
    hrm_custom_questions,
    hrm_performance,
    hrm_lifecycle,
    hrm_training,
    hrm_assets,
    hrm_meetings,
    hrm_announcements,
    hrm_documents,
    hrm_contracts,
    hrm_ip_restrictions,
    hrm_biometric,
    ecommerce_items,
    elim_import,
    amazon_import,
    dropship,
    items,
    parties,
    party_workspace,
    media,
    plugins_alibaba,
    plugins_again_drop_api,
    plugins_again_builder,
    plugins_smart_pc_builder,
    plugins_bkash,
    plugins_sslcommerz,
    plugins_paypal,
    plugins_stripe,
    plugins_zkteco,
    plugins_pathao,
    plugins_marketing_tracking,
    plugins_cloudflare,
    plugins_sms_gateway,
    plugins_price_update,
    ui_preferences,
    zkteco_iclock,
    provider_import_staging,
    provider_mapping,
    platform_settings,
    marketing_coupons,
    marketing_happy_hours,
    marketing_offers,
    storefront_account,
    storefront_auth,
    storefront_cart,
    storefront_checkout,
    storefront_china,
    storefront_amazon,
    storefront_homepage,
    storefront_category_page,
    storefront_menus,
    storefront_nav,
    storefront_media,
    storefront_cms,
    storefront_orders,
    storefront_payments_bkash,
    storefront_payments_sslcommerz,
    storefront_payments_paypal,
    storefront_payments_stripe,
    storefront_products,
    storefront_redirects,
    storefront_resolve,
    storefront_wishlist,
    storefront_configurator,
    storefront_bundles,
    storefront_sitemap,
    storefront_content,
    storefront_tracking,
    storefront_ai_search,
    storefront_offer_pages,
    storefront_happy_hour,
    storefront_chat,
    website_builder_documents,
    website_homepage,
    website_category_page,
    website_layouts,
    website_menus,
    website_pages,
    website_settings,
    workspace_sites,
    sales,
    sales_invoices,
    pos,
    public_invoices,
    erp_billing,
)

settings = get_settings()
logger = logging.getLogger(__name__)

require_admin = [Depends(get_current_user)]


def _bootstrap() -> None:
    db = SessionLocal()
    try:
        import scripts.init_db  # noqa: F401 — register all models
        from app.database import Base, engine
        from app.models.auth_user import AuthUser
        from app.models.auth_role import AuthRole  # noqa: F401
        from app.models.auth_role_permission import AuthRolePermission  # noqa: F401
        from app.models.auth_user_role import AuthUserRole  # noqa: F401
        from app.models.auth_user_warehouse import AuthUserWarehouse  # noqa: F401
        from app.models.approval_request import ApprovalRequest  # noqa: F401
        from scripts.ensure_hrm_asset_columns import ensure_hrm_asset_columns
        from scripts.ensure_hrm_employee_columns import ensure_hrm_employee_columns
        from app.models.builder_plugin import BuilderPlugin  # noqa: F401
        from app.models.ephemeral_blob import EphemeralBlob  # noqa: F401 — register metadata
        from scripts.init_db import (
            ensure_ai_audit_log_columns,
            ensure_auth_role_slug_scope,
            ensure_auth_user_columns,
            ensure_blog_columns,
            ensure_catalog_attribute_filter_columns,
            ensure_catalog_brand_columns,
            ensure_catalog_category_columns,
            ensure_catalog_product_pos_fields_columns,
            ensure_catalog_product_updated_by_columns,
            ensure_approval_request_target_columns,
            ensure_role_approve_column,
            ensure_role_export_column,
            ensure_role_publish_column,
            ensure_catalog_review_columns,
            ensure_cloudflare_plugin_columns,
            ensure_product_columns,
            ensure_product_variant_elim_columns,
            ensure_commerce_order_item_columns,
            ensure_commerce_order_lifecycle_columns,
            ensure_storefront_cart_columns,
            ensure_storefront_customer_case_columns,
            ensure_commerce_customer_finance_columns,
            ensure_commerce_supplier_finance_columns,
            ensure_vendor_terms_columns,
            ensure_purchase_receipt_serial_columns,
            ensure_purchase_order_line_return_columns,
            ensure_purchase_return_serial_columns,
            ensure_seo_audit_run_columns,
            ensure_seo_url_record_columns,
            ensure_website_menu_columns,
            ensure_website_page_columns,
            seed_storefront_content_pages,
            ensure_zkteco_plugin_columns,
            main as seed_database,
        )
        from app.models.pos import (  # noqa: F401 — register POS metadata before create_all
            PosCart,
            PosCashMovement,
            PosReceipt,
            PosReturn,
            PosSession,
            PosSetting,
            PosTerminal,
        )
        from app.models.finance import (  # noqa: F401 — register allocation tables before create_all
            FinanceAccount,
            FinanceAllocationRule,
            FinanceAllocationRuleLine,
            FinanceCheque,
            FinanceChequeEvent,
            FinanceCostCenter,
        )
        from app.models.subscription_plan import SubscriptionPlan  # noqa: F401
        from app.models.super_admin_user import SuperAdminUser  # noqa: F401
        from app.models.super_admin_session import SuperAdminSession  # noqa: F401
        from app.models.catalog_attribute_profile_category import CatalogAttributeProfileCategory  # noqa: F401
        from app.models.configurator_attribute_alias import ConfiguratorAttributeAlias  # noqa: F401
        from app.models.configurator_category_product_override import (  # noqa: F401
            ConfiguratorCategoryProductOverride,
        )
        from app.models.configurator_chipset_lookup import ConfiguratorChipsetLookup  # noqa: F401
        from app.models.configurator_field_source import ConfiguratorFieldSource  # noqa: F401
        from app.models.configurator_product_override import ConfiguratorProductOverride  # noqa: F401
        from app.models.configurator_slot_tab import ConfiguratorSlotTab  # noqa: F401
        from app.models.ready_build import ReadyBuild  # noqa: F401
        from app.models.smart_pc_builder_plugin import SmartPcBuilderPlugin  # noqa: F401
        from app.models.sms_gateway_plugin import SmsGatewayPlugin  # noqa: F401 — SMS gateway plugin table

        Base.metadata.create_all(bind=engine)
        from scripts.ensure_tenant_seed_data import ensure_tenant_seed_data
        from scripts.ensure_super_admin_bootstrap import ensure_super_admin_bootstrap
        from scripts.ensure_company_columns import ensure_company_columns

        ensure_company_columns()
        from sqlalchemy import text

        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS public_key VARCHAR(64)"))
            # Admin product list pages sort by (updated_at DESC, id) within a company;
            # without this every page sorts the whole catalog.
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_catalog_products_company_updated "
                    "ON catalog_products (company_id, updated_at DESC, id)"
                )
            )
            # old-shop image URLs are looked up by where the imported copy came from
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_media_source_url ON media (source_url)"))
            # Price Compare search-method switches (free on, paid off by default).
            for column, default in (
                ("use_site_search", "TRUE"),
                ("use_sitemap_match", "TRUE"),
                ("use_google_search", "FALSE"),
                ("use_google_price", "FALSE"),
                ("use_ai_pick", "FALSE"),
                ("use_ai_price_read", "FALSE"),
                ("use_ai_web_search", "FALSE"),
            ):
                conn.execute(
                    text(f"ALTER TABLE plugin_price_update ADD COLUMN IF NOT EXISTS {column} BOOLEAN NOT NULL DEFAULT {default}")
                )
            conn.execute(text("ALTER TABLE plugin_price_update ADD COLUMN IF NOT EXISTS auto_sync_hours INTEGER NOT NULL DEFAULT 6"))
            conn.execute(text("ALTER TABLE plugin_price_update ADD COLUMN IF NOT EXISTS last_auto_sync_at TIMESTAMP"))
            # Price Compare: links an admin checked by hand are never replaced automatically.
            conn.execute(text("ALTER TABLE plugin_price_update_matches ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE"))
            conn.execute(text("ALTER TABLE plugin_price_update_matches ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP"))
            conn.execute(text("ALTER TABLE plugin_price_update_matches ADD COLUMN IF NOT EXISTS verified_by VARCHAR(255)"))
            conn.execute(text("ALTER TABLE plugin_price_update_matches ADD COLUMN IF NOT EXISTS stock_label VARCHAR(80)"))
            # Rows saved before stock_label existed: recover the wording from their status message.
            conn.execute(
                text(
                    "UPDATE plugin_price_update_matches "
                    "SET stock_label = LEFT(split_part(status_message, ' on this site — ', 1), 80) "
                    "WHERE stock_label IS NULL AND status = 'no_price' "
                    "AND status_message LIKE '% on this site — no price listed right now'"
                )
            )
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_sales_orders_public_key ON sales_orders (public_key)"
                )
            )
        ensure_tenant_seed_data()
        ensure_super_admin_bootstrap()
        ensure_cloudflare_plugin_columns()
        from app.services.configurator_lookup_defaults import ensure_lookup_defaults_on_startup

        ensure_lookup_defaults_on_startup()  # PC Builder chipset lookup rows (once per version)
        ensure_catalog_attribute_filter_columns()
        ensure_catalog_review_columns()
        ensure_catalog_category_columns()
        ensure_catalog_brand_columns()
        ensure_product_columns()
        # additive columns added with the AI / catalog work (2026-10-18); every one is IF NOT EXISTS, safe on each start
        ensure_catalog_product_pos_fields_columns()
        ensure_catalog_product_updated_by_columns()
        ensure_role_publish_column()
        ensure_role_export_column()
        ensure_role_approve_column()
        ensure_approval_request_target_columns()
        ensure_product_variant_elim_columns()
        ensure_ai_audit_log_columns()
        ensure_auth_role_slug_scope()
        ensure_auth_user_columns()
        ensure_hrm_asset_columns()
        ensure_hrm_employee_columns()
        ensure_storefront_cart_columns()
        ensure_storefront_customer_case_columns()
        ensure_commerce_customer_finance_columns()
        ensure_commerce_supplier_finance_columns()
        ensure_vendor_terms_columns()
        ensure_commerce_order_item_columns()
        ensure_commerce_order_lifecycle_columns()
        ensure_blog_columns()
        ensure_seo_audit_run_columns()
        ensure_seo_url_record_columns()
        ensure_purchase_receipt_serial_columns()
        ensure_purchase_order_line_return_columns()
        ensure_purchase_return_serial_columns()
        ensure_website_menu_columns()
        ensure_website_page_columns()
        ensure_zkteco_plugin_columns()
        from app.routers.workspace_sites import ensure_order_site_column
        from app.services.dropship_fulfillment import ensure_dropship_order_columns
        from app.services.finance.finance_service import (
            ensure_finance_expense_allocation_columns,
            ensure_finance_expense_party_link_column,
            ensure_finance_payment_account_columns,
            ensure_finance_project_link_columns,
        )
        from app.services.crm.crm_service import (
            ensure_crm_lead_columns,
            ensure_crm_milestone_columns,
            ensure_crm_task_columns,
        )
        from app.services.inventory.stock_movement_service import (
            ensure_inventory_stock_movement_columns,
        )
        from app.services.inventory.warehouse_service import ensure_warehouse_location_columns
        from app.services.rbac import seed_rbac
        from scripts.init_db import (
            ensure_catalog_product_combo_components_column,
            ensure_catalog_product_pos_fields_columns,
            ensure_catalog_product_variant_purchase_price_column,
            ensure_commerce_order_vendor_columns,
            ensure_sales_order_courier_columns,
            ensure_sales_order_stage_and_shipping_columns,
            ensure_sales_return_discount_column,
            ensure_sales_return_line_discount_column,
            ensure_vendor_credit_columns,
            ensure_vendor_pricing_columns,
            ensure_vendor_quotation_revision_columns,
            ensure_workspace_site_company_id_column,
            ensure_ecommerce_columns,
            ensure_inventory_core_columns,
            ensure_item_barcode_type_column,
            ensure_item_foundation_columns,
            ensure_party_foundation_columns,
            ensure_product_attribute_value_columns,
            ensure_inventory_settings_columns,
            ensure_sales_columns,
            ensure_sales_line_serial_columns,
            ensure_sales_order_pricing_columns,
            ensure_service_item_columns,
            ensure_supplier_catalog_columns,
        )

        ensure_dropship_order_columns()
        ensure_order_site_column()
        from app.models.configurator_category import ensure_configurator_category_catalog_column
        from app.models.configurator_profile import ConfiguratorProfile
        from app.services.builder_slot_packs import ensure_builder_slots_for_profile

        ensure_configurator_category_catalog_column()
        try:
            pc_profile = (
                db.query(ConfiguratorProfile)
                .filter(ConfiguratorProfile.slug == "pc-builder")
                .first()
            )
            if pc_profile:
                ensure_builder_slots_for_profile(db, pc_profile)
                db.commit()
        except Exception:
            db.rollback()
            logger.exception("Bootstrap: ensure PC Builder slot catalog binds failed")
        ensure_workspace_site_company_id_column()
        # Additive ADD COLUMN IF NOT EXISTS migrations that only ran on a fresh
        # database (init_db.main) — the live DB kept missing columns the models
        # already read (items.barcode_type 500 on /catalog/products, etc.).
        for ensure_columns in (
            ensure_ecommerce_columns,
            ensure_inventory_core_columns,
            ensure_item_barcode_type_column,
            ensure_item_foundation_columns,
            ensure_party_foundation_columns,
            ensure_product_attribute_value_columns,
            ensure_inventory_settings_columns,
            ensure_sales_columns,
            ensure_sales_line_serial_columns,
            ensure_sales_order_pricing_columns,
            ensure_service_item_columns,
            ensure_supplier_catalog_columns,
        ):
            try:
                ensure_columns()
            except Exception:
                logger.exception("Bootstrap: %s failed", ensure_columns.__name__)
        ensure_finance_payment_account_columns()
        ensure_finance_expense_allocation_columns()
        ensure_finance_project_link_columns()
        ensure_finance_expense_party_link_column()
        try:
            from app.services.finance.finance_service import FinanceService

            finance = FinanceService(db)
            finance.ensure_accounts("default")
            finance.ensure_cost_centers("default")
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Bootstrap: finance cost-center seed failed")
        ensure_crm_lead_columns()
        ensure_crm_task_columns()
        ensure_crm_milestone_columns()
        ensure_inventory_stock_movement_columns()
        ensure_warehouse_location_columns()
        ensure_sales_order_stage_and_shipping_columns()
        ensure_sales_order_courier_columns()
        ensure_catalog_product_pos_fields_columns()
        ensure_catalog_product_variant_purchase_price_column()
        ensure_catalog_product_combo_components_column()
        ensure_sales_return_discount_column()
        ensure_sales_return_line_discount_column()
        try:
            from app.services.rma.schema import ensure_rma_columns, seed_rma_reasons
            from app.models.rma import RmaReason  # noqa: F401
            from app.models.service_job import ServiceJob, ServiceJobHistory, ServiceJobLine  # noqa: F401
            from app.services.service.schema import ensure_service_job_columns

            ensure_rma_columns()
            ensure_service_job_columns()
            seed_rma_reasons(db)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Bootstrap: RMA schema/seed failed")
        try:
            from app.services.pos.schema import ensure_pos_columns

            ensure_pos_columns()
        except Exception:
            logger.exception("Bootstrap: POS schema patch failed")
        ensure_vendor_pricing_columns()
        ensure_commerce_order_vendor_columns()
        ensure_vendor_credit_columns()
        ensure_vendor_quotation_revision_columns()

        if db.query(AuthUser).count() == 0:
            db.close()
            seed_database()
        else:
            try:
                seed_rbac(db)
            except Exception:
                db.rollback()
                logger.exception("Bootstrap: seed_rbac failed")
            try:
                seed_storefront_content_pages(db)
            except Exception:
                db.rollback()
                logger.exception("Bootstrap: seed_storefront_content_pages failed")
            try:
                # HRM was never seeded, so databases created before the HRM seed
                # existed still render every HRM screen empty. The seed matches
                # on natural keys, so running it on each boot only fills gaps.
                from scripts.seed_hrm import seed_hrm

                hrm_created = seed_hrm(db)
                added = sum(hrm_created.values())
                if added:
                    logger.info("Bootstrap: HRM seed added %s row(s)", added)
            except Exception:
                db.rollback()
                logger.exception("Bootstrap: seed_hrm failed")
            try:
                from scripts.seed_rma import seed_rma

                rma_created = seed_rma(db)
                if rma_created.get("tickets"):
                    logger.info("Bootstrap: RMA seed added %s claim(s)", rma_created["tickets"])
            except Exception:
                db.rollback()
                logger.exception("Bootstrap: seed_rma failed")
            try:
                # The serial registry backfills from whatever RMA tickets exist,
                # so it must run after seed_rma above on the same boot.
                from scripts.seed_serials import seed_serials

                serial_created = seed_serials(db)
                if serial_created.get("total"):
                    logger.info(
                        "Bootstrap: serial registry seeded %s unit(s)", serial_created["total"]
                    )
            except Exception:
                db.rollback()
                logger.exception("Bootstrap: seed_serials failed")
            try:
                # Vendor types are seeded on natural key (code), so running
                # this on every boot only fills gaps — same as the HRM seed.
                from scripts.init_db import seed_vendor_types

                vendor_types_added = seed_vendor_types(db)
                if vendor_types_added:
                    logger.info("Bootstrap: seeded %s vendor type(s)", vendor_types_added)
            except Exception:
                db.rollback()
                logger.exception("Bootstrap: seed_vendor_types failed")
            try:
                # SEO analysis never ran on databases seeded before the analyzer
                # existed. The URL sync is an upsert and the audit replaces its
                # own previous output, so both are safe on every boot.
                from scripts.init_db import seed_seo_audit, seed_seo_urls

                synced = seed_seo_urls(db)
                if synced:
                    logger.info("Bootstrap: SEO sync wrote %s URL record(s)", synced)
                detected = seed_seo_audit(db)
                if detected:
                    logger.info("Bootstrap: SEO audit found %s issue(s)", detected)
            except Exception:
                db.rollback()
                logger.exception("Bootstrap: SEO seed failed")
    except Exception:
        # Startup must not be blocked by a bootstrap failure, but swallowing it
        # silently hid real schema/seed errors for a long time — log it loudly.
        logger.exception("Bootstrap failed; the API is starting with an unverified schema")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Register ORM models before accepting traffic. Bootstrap used to import them
    # only in a background thread, which raced with early requests and left
    # SQLAlchemy stuck after a half-configured InventoryStockMove mapper.
    try:
        import scripts.init_db  # noqa: F401 — register all models
    except Exception:
        logger.exception("Could not import scripts.init_db — ORM models may be unregistered")
    try:
        # Must run before refresh_site_cors_origins below, which queries
        # WorkspaceSite synchronously — _bootstrap()'s copy of this runs in a
        # background thread and can lose that race on a cold start.
        from scripts.init_db import ensure_workspace_site_company_id_column

        ensure_workspace_site_company_id_column()
    except Exception:
        logger.exception("Could not ensure workspace_sites.company_id column")
    try:
        # Columns the code now selects on every product / role query: they must exist before the first request, not when the
        # background bootstrap gets to them (every one is ADD COLUMN IF NOT EXISTS - fast and safe on each start).
        from scripts.init_db import (
            ensure_catalog_product_pos_fields_columns,
            ensure_catalog_product_updated_by_columns,
            ensure_approval_request_target_columns,
            ensure_role_approve_column,
            ensure_role_export_column,
            ensure_role_publish_column,
        )

        ensure_catalog_product_pos_fields_columns()
        ensure_catalog_product_updated_by_columns()
        ensure_role_publish_column()
        ensure_role_export_column()
        ensure_role_approve_column()
        ensure_approval_request_target_columns()
    except Exception:
        logger.exception("Could not ensure the catalog / role columns")
    try:
        from app.database import SessionLocal
        from app.services.site_cors import refresh_site_cors_origins

        _cors_db = SessionLocal()
        try:
            refresh_site_cors_origins(_cors_db)
        finally:
            _cors_db.close()
    except Exception:
        logger.exception("Could not load site CORS origins")
    import threading

    # With several worker processes (WEB_CONCURRENCY) the seeding bootstrap and the price auto-sync loop run in one
    # of them only — the one holding this advisory lock for its lifetime; the others just serve requests.
    if _hold_leader_lock():
        threading.Thread(target=_bootstrap, daemon=True).start()
        try:
            from app.services.plugins.price_auto_sync import start_background_loop

            start_background_loop()
        except Exception:
            logger.exception("Could not start the Price Compare auto-sync loop")
    yield


_LEADER_LOCK_ID = 727_001
_leader_conn = None


def _hold_leader_lock() -> bool:
    """True in exactly one worker process (always true for a single worker or a non-Postgres database)."""
    global _leader_conn
    from app.database import engine

    if engine.dialect.name != "postgresql":
        return True
    try:
        conn = engine.raw_connection()
        cur = conn.cursor()
        cur.execute("SELECT pg_try_advisory_lock(%s)", (_LEADER_LOCK_ID,))
        got = bool(cur.fetchone()[0])
        conn.commit()
        if got:
            _leader_conn = conn  # kept open: the lock lasts as long as this connection
        else:
            conn.close()
        return got
    except Exception:
        logger.exception("Could not take the bootstrap leader lock; running bootstrap here")
        return True


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]


class SiteAwareCORSMiddleware(CORSMiddleware):
    """Env CORS + Vercel regex + origins from workspace_sites URLs."""

    def is_allowed_origin(self, origin: str) -> bool:
        if super().is_allowed_origin(origin):
            return True
        try:
            from app.services.site_cors import is_site_cors_origin

            return is_site_cors_origin(origin)
        except Exception:
            return False


# Added before CORS so the CORS middleware stays outermost and still decorates 403s.
app.add_middleware(ApprovalGateMiddleware)
app.add_middleware(RbacGuardMiddleware)

# JSON lists (products, orders…) shrink ~5-10x; Starlette leaves text/event-stream
# (AI chat streaming) uncompressed.
app.add_middleware(GZipMiddleware, minimum_size=1024)

app.add_middleware(
    SiteAwareCORSMiddleware,
    allow_origins=origins or ["*"],
    # Vercel production + preview deployments (admin / storefront)
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(company_registration.router, prefix="/api/v1")
app.include_router(workspace_company.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(super_admin_auth.router, prefix="/api/v1")
app.include_router(super_admin_companies.router, prefix="/api/v1")
app.include_router(super_admin_plans.router, prefix="/api/v1")
app.include_router(
    auth_roles.router,
    prefix="/api/v1/auth",
    dependencies=[Depends(require_admin_user)],
)
app.include_router(
    auth_users.router,
    prefix="/api/v1/auth",
    dependencies=[Depends(require_admin_user)],
)
app.include_router(catalog_products.router, prefix="/api/v1/catalog", dependencies=require_admin)
app.include_router(elim_import.router, prefix="/api/v1/catalog", dependencies=require_admin)
app.include_router(amazon_import.router, prefix="/api/v1/catalog", dependencies=require_admin)
app.include_router(items.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(parties.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(party_workspace.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(collaboration.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(catalog_categories.router, prefix="/api/v1/catalog", dependencies=require_admin)
app.include_router(catalog_collections.router, prefix="/api/v1/catalog", dependencies=require_admin)
app.include_router(catalog_bundles.router, prefix="/api/v1/catalog", dependencies=require_admin)
app.include_router(catalog_filters.router, prefix="/api/v1/catalog", dependencies=require_admin)
app.include_router(catalog_brands.router, prefix="/api/v1/catalog", dependencies=require_admin)
app.include_router(catalog_warranties.router, prefix="/api/v1/catalog", dependencies=require_admin)
app.include_router(catalog_attribute_profiles.router, prefix="/api/v1/catalog", dependencies=require_admin)
app.include_router(catalog_ai.router, prefix="/api/v1/catalog", dependencies=require_admin)
# Vercel BFF commerce workflow state (UUID keys; no admin JWT — cross-instance reads).
app.include_router(ephemeral_store.router, prefix="/api/v1")
app.include_router(catalog_variants.router, prefix="/api/v1/catalog", dependencies=require_admin)
app.include_router(catalog_reviews.router, prefix="/api/v1/catalog", dependencies=require_admin)
app.include_router(catalog_qa.router, prefix="/api/v1/catalog", dependencies=require_admin)
app.include_router(catalog_blog.router, prefix="/api/v1/catalog", dependencies=require_admin)
app.include_router(catalog_blog_categories.router, prefix="/api/v1/catalog", dependencies=require_admin)
app.include_router(catalog_blog_comments.router, prefix="/api/v1/catalog", dependencies=require_admin)
app.include_router(catalog_blog_settings.router, prefix="/api/v1/catalog", dependencies=require_admin)
app.include_router(digital_files.router, dependencies=require_admin)
app.include_router(commerce_orders.router, prefix="/api/v1/commerce", dependencies=require_admin)
app.include_router(dropship.router, prefix="/api/v1/commerce", dependencies=require_admin)
app.include_router(commerce_inventory.router, prefix="/api/v1/commerce", dependencies=require_admin)
app.include_router(inventory_warehouses.router, prefix="/api/v1/inventory", dependencies=require_admin)
app.include_router(inventory_settings.router, prefix="/api/v1/inventory", dependencies=require_admin)
app.include_router(inventory_locations.router, prefix="/api/v1/inventory", dependencies=require_admin)
app.include_router(inventory_stock_counts.router, prefix="/api/v1/inventory", dependencies=require_admin)
app.include_router(inventory_stock_adjustments.router, prefix="/api/v1/inventory", dependencies=require_admin)
app.include_router(inventory_stock_transfers.router, prefix="/api/v1/inventory", dependencies=require_admin)
app.include_router(inventory_stock_levels.router, prefix="/api/v1/inventory", dependencies=require_admin)
app.include_router(inventory_reports.router, prefix="/api/v1/inventory", dependencies=require_admin)
app.include_router(inventory_movements.router, prefix="/api/v1/inventory", dependencies=require_admin)
app.include_router(inventory_serials.router, prefix="/api/v1/inventory", dependencies=require_admin)
app.include_router(inventory_product_history.router, prefix="/api/v1/inventory", dependencies=require_admin)
app.include_router(commerce_suppliers.router, prefix="/api/v1/commerce", dependencies=require_admin)
app.include_router(supplier_catalog.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(purchase_orders.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(purchase_rfq.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(purchase_bills.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(purchase_reports.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(purchase_receipts.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(purchase_returns.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(sales_returns.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(supplier_portal_admin.router, prefix="/api/v1/commerce", dependencies=require_admin)
app.include_router(rma.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(rma_claims.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(rma_receipts.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(rma_deliveries.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(rma_settlements.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(service_jobs.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(service_categories.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(seo.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(finance.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(finance_cheques.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(finance_cheque_books.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(catalog_duplicates.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(catalog_sitemap_import.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(finance_allocation.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(finance_periods.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(core_sequences.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(approval_limits.router, prefix="/api/v1", dependencies=require_admin)
# open to every signed-in user: makers see their own requests, approvers see the queue they can decide
app.include_router(approvals.router, prefix="/api/v1")
app.include_router(ai_gateway.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(ai_billing.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(finance_expenses.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(crm.router, prefix="/api/v1", dependencies=require_admin)
# Supplier portal carries its own session auth — must NOT take the admin dependency.
app.include_router(portal.router, prefix="/api/v1")
app.include_router(commerce_customers.router, prefix="/api/v1/commerce", dependencies=require_admin)
app.include_router(vendor_order_admin.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(vendor_quotation_admin.router, prefix="/api/v1", dependencies=require_admin)
# Static /vendors/catalog-visibility and /vendors/product-prices paths must be
# registered before vendor_admin's /vendors/{vendor_id} catch-all below.
app.include_router(vendor_catalog_admin.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(vendor_admin.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(vendor_portal.router, prefix="/api/v1")
app.include_router(vendor_portal_catalog.router, prefix="/api/v1")
app.include_router(vendor_portal_cart.router, prefix="/api/v1")
app.include_router(vendor_portal_quotation.router, prefix="/api/v1")
app.include_router(vendor_portal_notifications.router, prefix="/api/v1")
app.include_router(commerce_returns.router, prefix="/api/v1/commerce", dependencies=require_admin)
app.include_router(commerce_refunds.router, prefix="/api/v1/commerce", dependencies=require_admin)
app.include_router(plugins_alibaba.router, prefix="/api/v1")
app.include_router(plugins_again_drop_api.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(plugins_again_builder.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(plugins_smart_pc_builder.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(plugins_bkash.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(plugins_sslcommerz.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(plugins_paypal.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(plugins_stripe.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(plugins_zkteco.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(hrm_branches.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_departments.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_designations.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_document_types.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_employees.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_employee_documents.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_award_types.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_awards.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_leave_types.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_leave_policies.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_leave_applications.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_leave_balances.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_shifts.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_attendance_policies.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_attendance_records.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_attendance_regularizations.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_time_entries.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_holidays.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_salary_components.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_employee_salaries.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_payroll_runs.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_payroll_entries.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_payslips.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_job_categories.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_job_types.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_job_locations.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_job_requisitions.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_job_postings.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_candidate_sources.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_candidates.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_interview_types.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_interview_rounds.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_interviews.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_interview_feedback.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_candidate_assessments.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_offer_templates.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_offers.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_onboarding.checklists_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_onboarding.items_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_onboarding.onboarding_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_custom_questions.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_performance.categories_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_performance.indicators_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_performance.goal_types_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_performance.employee_goals_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_performance.review_cycles_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_performance.employee_reviews_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_lifecycle.resignations_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_lifecycle.promotions_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_lifecycle.terminations_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_lifecycle.warnings_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_lifecycle.complaints_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_lifecycle.transfers_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_lifecycle.trips_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_lifecycle.trip_expenses_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_training.training_types_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_training.programs_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_training.sessions_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_training.attendance_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_training.employee_trainings_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_training.assessments_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_training.assessment_results_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_assets.asset_types_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_assets.assets_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_assets.assignments_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_assets.maintenances_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_assets.depreciations_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_meetings.meeting_types_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_meetings.rooms_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_meetings.meetings_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_meetings.attendees_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_meetings.minutes_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_meetings.action_items_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_announcements.announcements_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_announcements.views_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_documents.categories_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_documents.hr_documents_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_documents.templates_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_documents.acknowledgments_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_contracts.contract_types_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_contracts.contract_templates_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_contracts.employee_contracts_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_contracts.contract_renewals_router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_ip_restrictions.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(hrm_biometric.router, prefix="/api/v1/hrm", dependencies=require_admin)
app.include_router(plugins_pathao.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(plugins_marketing_tracking.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(plugins_cloudflare.router, prefix="/api/v1")
app.include_router(plugins_sms_gateway.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(plugins_price_update.router, prefix="/api/v1")
app.include_router(ui_preferences.router, prefix="/api/v1")
app.include_router(zkteco_iclock.router)
app.include_router(
    provider_import_staging.router,
    prefix="/api/v1/plugins/china-import",
    dependencies=require_admin,
)
app.include_router(
    provider_mapping.router,
    prefix="/api/v1/plugins/china-import",
    dependencies=require_admin,
)
app.include_router(media.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(ecommerce_items.router, prefix="/api/v1/ecommerce", dependencies=require_admin)
app.include_router(sales.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(sales_invoices.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(public_invoices.router, prefix="/api/v1")
app.include_router(erp_billing.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(erp_billing.public_router, prefix="/api/v1")
app.include_router(pos.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(platform_settings.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(marketing_coupons.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(marketing_offers.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(marketing_happy_hours.router, prefix="/api/v1", dependencies=require_admin)
app.include_router(configurator_profiles.router, prefix="/api/v1/configurator", dependencies=require_admin)
app.include_router(configurator_categories.router, prefix="/api/v1/configurator", dependencies=require_admin)
app.include_router(configurator_templates.router, prefix="/api/v1/configurator", dependencies=require_admin)
app.include_router(configurator_builds.router, prefix="/api/v1/configurator", dependencies=require_admin)
app.include_router(configurator_compatibility_rules.router, prefix="/api/v1/configurator", dependencies=require_admin)
app.include_router(configurator_slot_tabs.router, prefix="/api/v1/configurator", dependencies=require_admin)
app.include_router(configurator_lookups.router, prefix="/api/v1/configurator", dependencies=require_admin)
app.include_router(configurator_field_sources.router, prefix="/api/v1/configurator", dependencies=require_admin)
app.include_router(configurator_overview.router, prefix="/api/v1/configurator", dependencies=require_admin)
app.include_router(configurator_slot_products.router, prefix="/api/v1/configurator", dependencies=require_admin)
app.include_router(configurator_ready_builds.router, prefix="/api/v1/configurator", dependencies=require_admin)
app.include_router(storefront_products.router, prefix="/api/v1/storefront")
app.include_router(storefront_china.router, prefix="/api/v1/storefront")
app.include_router(storefront_amazon.router, prefix="/api/v1/storefront")
app.include_router(storefront_nav.router, prefix="/api/v1/storefront")
app.include_router(storefront_media.router, prefix="/api/v1/storefront")
app.include_router(storefront_cms.router, prefix="/api/v1/storefront")
app.include_router(storefront_homepage.router, prefix="/api/v1/storefront")
app.include_router(storefront_category_page.router, prefix="/api/v1/storefront")
app.include_router(storefront_menus.router, prefix="/api/v1/storefront")
app.include_router(storefront_resolve.router, prefix="/api/v1/storefront")
app.include_router(storefront_redirects.router, prefix="/api/v1/storefront")
app.include_router(storefront_cart.router, prefix="/api/v1/storefront")
app.include_router(storefront_wishlist.router, prefix="/api/v1/storefront")
app.include_router(storefront_configurator.router, prefix="/api/v1/storefront")
app.include_router(storefront_bundles.router, prefix="/api/v1/storefront")
app.include_router(storefront_sitemap.router, prefix="/api/v1/storefront")
app.include_router(storefront_content.router, prefix="/api/v1/storefront")
app.include_router(storefront_tracking.router, prefix="/api/v1/storefront")
app.include_router(storefront_ai_search.router, prefix="/api/v1/storefront")
app.include_router(storefront_offer_pages.router, prefix="/api/v1/storefront")
app.include_router(storefront_happy_hour.router, prefix="/api/v1/storefront")
app.include_router(storefront_chat.router, prefix="/api/v1/storefront")
app.include_router(storefront_auth.router, prefix="/api/v1/storefront")
app.include_router(storefront_account.router, prefix="/api/v1/storefront")
app.include_router(storefront_checkout.router, prefix="/api/v1/storefront")
app.include_router(storefront_payments_bkash.router, prefix="/api/v1/storefront")
app.include_router(storefront_payments_sslcommerz.router, prefix="/api/v1/storefront")
app.include_router(storefront_payments_paypal.router, prefix="/api/v1/storefront")
app.include_router(storefront_payments_stripe.router, prefix="/api/v1/storefront")
app.include_router(storefront_orders.router, prefix="/api/v1/storefront")
app.include_router(website_pages.router, prefix="/api/v1/website", dependencies=require_admin)
app.include_router(website_layouts.router, prefix="/api/v1/website", dependencies=require_admin)
app.include_router(website_builder_documents.router, prefix="/api/v1/website", dependencies=require_admin)
app.include_router(website_settings.router, prefix="/api/v1/website", dependencies=require_admin)
app.include_router(website_homepage.router, prefix="/api/v1/website", dependencies=require_admin)
app.include_router(website_category_page.router, prefix="/api/v1/website", dependencies=require_admin)
app.include_router(website_menus.router, prefix="/api/v1/website", dependencies=require_admin)
app.include_router(workspace_sites.router, prefix="/api/v1", dependencies=require_admin)

UPLOAD_ROOT = Path(__file__).resolve().parent / "uploads"
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", R2FallbackStaticFiles(directory=str(UPLOAD_ROOT)), name="uploads")


@app.get("/")
def root() -> dict:
    return {
        "app": settings.app_name,
        "docs": "/docs",
        "health": "/health",
        "catalog": {
            "products": "/api/v1/catalog/products",
            "categories": "/api/v1/catalog/categories",
            "brands": "/api/v1/catalog/brands",
            "attribute_profiles": "/api/v1/catalog/attribute-profiles",
            "variants": "/api/v1/catalog/variants",
            "reviews": "/api/v1/catalog/reviews",
        },
        "media": "/api/v1/media",
        "ecommerce": {
            "items": "/api/v1/ecommerce/items",
        },
        "commerce": {
            "orders": "/api/v1/commerce/orders",
            "customers": "/api/v1/commerce/customers",
            "returns": "/api/v1/commerce/returns",
            "refunds": "/api/v1/commerce/refunds",
            "dropship": "/api/v1/commerce/dropship",
        },
        "auth": {
            "login": "/api/v1/auth/login",
            "me": "/api/v1/auth/me",
            "logout": "/api/v1/auth/logout",
        },
        "storefront": {
            "products": "/api/v1/storefront/products",
            "china_search": "/api/v1/storefront/china/search",
            "china_product": "/api/v1/storefront/china/products/{elim_id}",
            "china_cache": "/api/v1/storefront/china/cache",
            "amazon_status": "/api/v1/storefront/amazon/status",
            "amazon_marketplaces": "/api/v1/storefront/amazon/marketplaces",
            "amazon_catalog_search": "/api/v1/storefront/amazon/catalog/search",
            "amazon_catalog_item": "/api/v1/storefront/amazon/catalog/items/{asin}",
            "categories": "/api/v1/storefront/categories",
            "brands": "/api/v1/storefront/brands",
            "cart": "/api/v1/storefront/cart",
            "checkout": "/api/v1/storefront/checkout",
        },
    }
