"""Public storefront configurator API (PC Builder)."""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.storefront_cart import StorefrontCart
from app.schemas.storefront import (
    StorefrontCartRead,
    StorefrontCartResponse,
    StorefrontProductListMeta,
    StorefrontProductListResponse,
)
from app.services.ttl_cache import TTLCache
from app.services.ecommerce.storefront_cart_service import CartError, StorefrontCartService
from app.services.ecommerce.storefront_configurator_service import (
    ConfiguratorError,
    StorefrontConfiguratorService,
)
from app.services.ecommerce.storefront_feature_flags import require_storefront_flag
from app.services.ecommerce import ready_build_service

router = APIRouter(prefix="/configurator", tags=["storefront-configurator"])

CART_HEADER = "X-Cart-Token"
STOREFRONT_CACHE = "private, no-store"


class ConfiguratorCategoryRead(BaseModel):
    id: str
    slug: str
    name: str
    description: Optional[str] = None
    sort_order: int
    is_required: bool
    selection_mode: str
    multi: bool = False
    catalog_category_slug: str = ""
    # How the shop groups and shows the slot (set in the admin's Tabs & Slots).
    tab_id: Optional[str] = None
    tab_slug: str = ""
    tab_name: str = ""
    tab_sort: int = 0
    icon: str = ""
    kind: str = "product"
    min_select: int = 0
    max_select: int = 1
    default_sort: str = "popular"


class ConfiguratorProfileRead(BaseModel):
    id: str
    slug: str
    name: str
    description: Optional[str] = None
    profile_type: str
    categories: List[ConfiguratorCategoryRead]
    settings: Dict[str, Any] = Field(default_factory=dict)


class ConfiguratorProfileResponse(BaseModel):
    data: ConfiguratorProfileRead


class ConfiguratorProductRead(BaseModel):
    id: str
    item_id: str
    slug: str
    name: str
    price: float
    compare_at_price: Optional[float] = None
    discount_pct: int = 0
    brand: str
    thumbnail: Optional[str] = None
    in_stock: bool = True
    stock_status: Optional[str] = None
    platform: Optional[str] = None
    category_slug: str
    specs: List[str] = Field(default_factory=list)
    attributes: Dict[str, str] = Field(default_factory=dict)
    # Stored values of the filterable attributes, keyed by attribute code (what the filter drawer matches on).
    filter_values: Dict[str, str] = Field(default_factory=dict)


class ConfiguratorProductListResponse(BaseModel):
    data: List[ConfiguratorProductRead]
    meta: dict


class BuildComponentInput(BaseModel):
    category_slug: str = Field(min_length=1, max_length=64)
    product_id: str = Field(min_length=1, max_length=36)
    item_id: Optional[str] = Field(default=None, max_length=36)
    quantity: int = Field(default=1, ge=1, le=9)


class BuildCreateRequest(BaseModel):
    profile_slug: str = Field(default="pc-builder", min_length=1, max_length=64)
    name: str = Field(default="My PC Build", min_length=1, max_length=255)
    customer_name: Optional[str] = Field(default=None, max_length=255)
    components: List[BuildComponentInput] = Field(min_length=1)


class BuildProductEmbedded(BaseModel):
    id: str
    item_id: str
    slug: str
    name: str
    price: float
    compare_at_price: Optional[float] = None
    discount_pct: int = 0
    brand: str
    thumbnail: Optional[str] = None
    in_stock: bool = True
    platform: Optional[str] = None
    category_slug: Optional[str] = None


class BuildComponentRead(BaseModel):
    category_id: Optional[str] = None
    category_slug: Optional[str] = None
    category_name: str = ""
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    quantity: int = 1
    product: Optional[BuildProductEmbedded] = None


class BuildRead(BaseModel):
    id: str
    profile_slug: Optional[str] = None
    name: str
    build_code: str
    total_price: float
    compatibility_status: str
    status: str
    components: List[BuildComponentRead]


class BuildResponse(BaseModel):
    data: BuildRead


class AddBuildToCartRequest(BaseModel):
    profile_slug: str = Field(default="pc-builder", min_length=1, max_length=64)
    components: List[BuildComponentInput] = Field(min_length=1)


def _svc(db: Session) -> StorefrontConfiguratorService:
    return StorefrontConfiguratorService(db)


def _cart_context(
    response: Response,
    db: Session = Depends(get_db),
    x_cart_token: Optional[str] = Header(default=None, alias=CART_HEADER),
) -> StorefrontCart:
    response.headers["Cache-Control"] = STOREFRONT_CACHE
    return StorefrontCartService(db).get_or_create_cart(cart_token=x_cart_token, user=None)


@router.get("/profiles/{slug}", response_model=ConfiguratorProfileResponse)
def get_configurator_profile(slug: str, db: Session = Depends(get_db)) -> ConfiguratorProfileResponse:
    require_storefront_flag("pc_builder")
    try:
        profile = _svc(db).get_profile(slug)
    except ConfiguratorError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    cats = _svc(db).list_categories(profile)
    from app.models.configurator_slot_tab import ConfiguratorSlotTab

    tabs = {t.id: t for t in db.query(ConfiguratorSlotTab).filter(ConfiguratorSlotTab.profile_id == profile.id).all()}
    return ConfiguratorProfileResponse(
        data=ConfiguratorProfileRead(
            id=profile.id,
            slug=profile.slug,
            name=profile.name,
            description=profile.description,
            profile_type=profile.profile_type,
            settings=_svc(db).storefront_settings(),
            categories=[
                ConfiguratorCategoryRead(
                    id=c.id,
                    slug=c.slug,
                    name=c.name,
                    description=c.description,
                    sort_order=c.sort_order,
                    is_required=c.is_required,
                    selection_mode=c.selection_mode,
                    multi=c.selection_mode == "multiple",
                    catalog_category_slug=getattr(c, "catalog_category_slug", "") or "",
                    tab_id=c.tab_id,
                    tab_slug=tabs[c.tab_id].slug if c.tab_id in tabs else "",
                    tab_name=tabs[c.tab_id].name if c.tab_id in tabs else "",
                    tab_sort=tabs[c.tab_id].sort_order if c.tab_id in tabs else 999,
                    icon=c.icon or "",
                    kind=c.kind or "product",
                    min_select=max(c.min_select or 0, 1 if c.is_required else 0),
                    max_select=max(c.max_select or 1, 2 if c.selection_mode == "multiple" else 1),
                    default_sort=c.default_sort or "popular",
                )
                for c in cats
            ],
        )
    )


def _with_filter_values(db: Session, rows: List[dict]) -> List[dict]:
    from app.services.ecommerce.storefront_catalog_service import StorefrontCatalogService

    values = StorefrontCatalogService(db).filter_attributes_for_products([r["id"] for r in rows])
    return [{**r, "filter_values": values.get(r["id"], {})} for r in rows]


@router.get("/profiles/{slug}/categories/{category_slug}/filters")
def slot_filters(slug: str, category_slug: str, db: Session = Depends(get_db)) -> dict:
    require_storefront_flag("pc_builder")
    try:
        profile = _svc(db).get_profile(slug)
        data = _svc(db).slot_filters(profile, category_slug)
    except ConfiguratorError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"data": data}


@router.get("/profiles/{slug}/products")
def list_all_slot_products(
    slug: str,
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict:
    """Every slot's products in one response — lets the builder page render in a single
    round trip instead of one request per slot."""
    require_storefront_flag("pc_builder")
    svc = _svc(db)
    try:
        profile = svc.get_profile(slug)
    except ConfiguratorError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    out: dict = {}
    for category in svc.list_categories(profile):
        try:
            rows = svc.list_slot_products(profile, category.slug, limit=limit)
        except ConfiguratorError:
            rows = []
        out[category.slug] = [ConfiguratorProductRead(**row).model_dump() for row in _with_filter_values(db, rows)]
    return {"data": out, "meta": {"slots": len(out)}}


@router.get(
    "/profiles/{slug}/categories/{category_slug}/listing",
    response_model=StorefrontProductListResponse,
)
def slot_listing(
    slug: str,
    category_slug: str,
    response: Response,
    limit: int = Query(2000, ge=1, le=3000),
    db: Session = Depends(get_db),
) -> StorefrontProductListResponse:
    """A slot's products as the admin set the slot up (category or attribute profile, identifying
    conditions, Include / Exclude; only in-stock ones when General → hide out-of-stock is on) — in the same shape as GET /storefront/products, so the storefront PC
    builder shows them like its other product lists."""
    require_storefront_flag("pc_builder")
    from app.routers.storefront_products import _attach_review_stats

    try:
        profile = _svc(db).get_profile(slug)
        views = _svc(db).slot_member_views(profile, category_slug, limit=limit)
    except ConfiguratorError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    # Website → PC Builder → General: "hide out-of-stock parts" and "show Coming soon products"
    settings = _svc(db).storefront_settings()
    coming_soon = lambda v: (v.stock_status or "") == "coming_soon"
    if settings["hide_out_of_stock"]:
        # Coming soon parts aren't out of stock: the other switch decides on them
        views = [v for v in views if (v.in_stock and (v.stock_status or "in_stock") == "in_stock") or coming_soon(v)]
    if not settings["show_coming_soon"]:
        views = [v for v in views if not coming_soon(v)]
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    return StorefrontProductListResponse(
        data=_attach_review_stats(db, views),
        meta=StorefrontProductListMeta(count=len(views), page=1, per_page=limit),
    )


@router.get(
    "/profiles/{slug}/categories/{category_slug}/products",
    response_model=ConfiguratorProductListResponse,
)
def list_configurator_products(
    slug: str,
    category_slug: str,
    search: Optional[str] = Query(None),
    platform: Optional[str] = Query(None, description="AMD or Intel"),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db),
) -> ConfiguratorProductListResponse:
    require_storefront_flag("pc_builder")
    try:
        profile = _svc(db).get_profile(slug)
        products = _svc(db).list_slot_products(
            profile,
            category_slug,
            search=search,
            platform=platform,
            limit=limit,
        )
    except ConfiguratorError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ConfiguratorProductListResponse(
        data=[ConfiguratorProductRead(**p) for p in _with_filter_values(db, products)],
        meta={"count": len(products)},
    )


class ConfiguratorRuleRead(BaseModel):
    id: str
    name: str
    code: str
    configurator_profile_id: str
    priority: int
    active: bool
    body: dict


class ConfiguratorRuleListResponse(BaseModel):
    data: List[ConfiguratorRuleRead]
    meta: dict


@router.get("/profiles/{slug}/rules", response_model=ConfiguratorRuleListResponse)
def list_configurator_rules(slug: str, db: Session = Depends(get_db)) -> ConfiguratorRuleListResponse:
    require_storefront_flag("pc_builder")
    from app.models.configurator_compatibility_rule import (
        ConfiguratorCompatibilityRule,
        load_json,
    )
    from app.services.pc_builder_rules import ensure_pc_builder_rules, pc_builder_profile_ids

    ensure_pc_builder_rules(db)
    rows = (
        db.query(ConfiguratorCompatibilityRule)
        .filter(
            ConfiguratorCompatibilityRule.active.is_(True),
            ConfiguratorCompatibilityRule.configurator_profile_id.in_(pc_builder_profile_ids(slug)),
        )
        .order_by(ConfiguratorCompatibilityRule.priority, ConfiguratorCompatibilityRule.name)
        .all()
    )
    return ConfiguratorRuleListResponse(
        data=[
            ConfiguratorRuleRead(
                id=row.id,
                name=row.name,
                code=row.code,
                configurator_profile_id=row.configurator_profile_id,
                priority=row.priority,
                active=row.active,
                body=load_json(row.body_json, {}),
            )
            for row in rows
        ],
        meta={"count": len(rows)},
    )


class EvaluateRequest(BaseModel):
    components: List[BuildComponentInput] = Field(min_length=1)


class RuleResultRead(BaseModel):
    rule_id: str
    rule_name: str
    matched: bool
    status: str
    message: str
    branch: str


class EvaluateResultRead(BaseModel):
    status: str
    results: List[RuleResultRead]


class EvaluateResponse(BaseModel):
    data: EvaluateResultRead


class SlotCompatRequest(BaseModel):
    slot: str = Field(min_length=1, max_length=64)
    components: List[BuildComponentInput] = Field(default_factory=list)
    replace: bool = True


@router.post("/profiles/{slug}/slot-compat")
def slot_compatibility(slug: str, payload: SlotCompatRequest, db: Session = Depends(get_db)) -> dict:
    """Per product of one slot: the Error / Warning rules it would trip with the parts the
    customer already picked. Drives the chooser's hide / grey-out of mismatched products."""
    require_storefront_flag("pc_builder")
    try:
        profile = _svc(db).get_profile(slug)
    except ConfiguratorError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    data = _svc(db).slot_compatibility(
        profile, payload.slot, [c.model_dump() for c in payload.components], replace=payload.replace
    )
    return {"data": data, "meta": {"flagged": len(data)}}


@router.post("/profiles/{slug}/evaluate", response_model=EvaluateResponse)
def evaluate_configurator_build(
    slug: str,
    payload: EvaluateRequest,
    db: Session = Depends(get_db),
) -> EvaluateResponse:
    """Live compatibility check as the customer picks parts — the same rule
    engine create_build uses to set compatibility_status, run before they
    commit to a build so an Error-severity mismatch can block Add to Cart
    instead of only being discovered afterwards."""
    require_storefront_flag("pc_builder")
    try:
        profile = _svc(db).get_profile(slug)
        result = _svc(db).evaluate_components(profile, [c.model_dump() for c in payload.components])
    except ConfiguratorError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return EvaluateResponse(data=EvaluateResultRead(**result))


@router.post("/builds", response_model=BuildResponse)
def create_configurator_build(payload: BuildCreateRequest, db: Session = Depends(get_db)) -> BuildResponse:
    require_storefront_flag("pc_builder")
    try:
        profile = _svc(db).get_profile(payload.profile_slug)
        build = _svc(db).create_build(
            profile,
            name=payload.name,
            customer_name=payload.customer_name,
            components=[c.model_dump() for c in payload.components],
        )
        data = _svc(db).build_to_dict(build, profile)
    except ConfiguratorError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return BuildResponse(data=BuildRead(**data))


@router.get("/builds/{build_code}", response_model=BuildResponse)
def get_configurator_build(build_code: str, db: Session = Depends(get_db)) -> BuildResponse:
    require_storefront_flag("pc_builder")
    try:
        build = _svc(db).get_build(build_code)
        data = _svc(db).build_to_dict(build)
    except ConfiguratorError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return BuildResponse(data=BuildRead(**data))


@router.post("/add-to-cart", response_model=StorefrontCartResponse)
def add_configurator_to_cart(
    payload: AddBuildToCartRequest,
    cart: StorefrontCart = Depends(_cart_context),
    db: Session = Depends(get_db),
) -> StorefrontCartResponse:
    require_storefront_flag("pc_builder")
    try:
        components = [c.model_dump() for c in payload.components]
        profile = _svc(db).get_profile(payload.profile_slug)
        evaluation = _svc(db).evaluate_components(profile, components)
        if evaluation["status"] == "incompatible":
            failing = next((r for r in evaluation["results"] if r["status"] == "incompatible"), None)
            message = failing["message"] if failing else "This build has an incompatible combination of parts."
            raise HTTPException(status_code=400, detail=message)
        cart = _svc(db).add_build_to_cart(cart, components)
    except ConfiguratorError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except CartError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    read = StorefrontCartService(db).build_read_model(cart)
    return StorefrontCartResponse(data=StorefrontCartRead(**read))


# ------------------------------------------------------------- ready builds --

# a ready-build card names these parts first
_CARD_SLOT_ORDER = ("cpu", "graphics-card", "memory", "ssd", "hdd", "storage", "motherboard", "power-supply", "cpu-cooler", "casing")


def _build_card(db: Session, entry: dict) -> dict:
    build = entry["build"]
    from app.models.catalog_product import CatalogProduct

    from app.models.configurator_category import ConfiguratorCategory

    # the parts a card names first (CPU, GPU, RAM, storage …), each with its slot so the shop can show its icon
    order = {slug: i for i, slug in enumerate(_CARD_SLOT_ORDER)}
    parts = []
    for slot in ready_build_service.slots_of(db, build.id):
        if slot.mode == "hidden":
            continue
        items = ready_build_service.items_of(db, slot.id)
        default_item = next((i for i in items if i.is_default), items[0] if items else None)
        if default_item:
            product = db.get(CatalogProduct, default_item.product_id)
            cat = db.get(ConfiguratorCategory, slot.category_id)
            if product:
                parts.append({"slot": cat.slug if cat else "", "name": product.name})
    parts.sort(key=lambda p: order.get(p["slot"], len(order)))
    highlights = [p["name"] for p in parts]

    return {
        "id": build.id,
        "name": build.name,
        "slug": build.slug,
        "category": build.category,
        "tags": entry["tags"],
        "fps_label": build.fps_label,
        "images": json.loads(build.images_json or "[]"),
        "show_timer": build.show_timer,
        "ends_at": build.ends_at.isoformat() if build.ends_at else None,
        "highlights": highlights[:4],
        "parts": parts[:4],
        "totals": entry["totals"],
        "cpu_brand": entry.get("brands", {}).get("cpu_brand"),
        "gpu_brand": entry.get("brands", {}).get("gpu_brand"),
    }


_ready_builds_cache = TTLCache(ttl=60)


@router.get("/ready-builds")
def list_ready_builds(
    profile_slug: str = Query(default="pc-builder"),
    tag: Optional[str] = Query(default=None),
    min_price: Optional[float] = Query(default=None),
    max_price: Optional[float] = Query(default=None),
    cpu_brand: Optional[str] = Query(default=None),
    gpu_brand: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> dict:
    require_storefront_flag("pc_builder")
    # the home page and /pc-builder ask for this on every render and it takes ~1.5 s: kept a minute per worker
    cache_key = (profile_slug, tag, min_price, max_price, cpu_brand, gpu_brand)
    cached = _ready_builds_cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        profile = _svc(db).get_profile(profile_slug)
    except ConfiguratorError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    entries = ready_build_service.list_published(
        db, profile.id, tag=tag, min_price=min_price, max_price=max_price, cpu_brand=cpu_brand, gpu_brand=gpu_brand,
    )
    result = {"data": [_build_card(db, e) for e in entries], "meta": {"count": len(entries)}}
    _ready_builds_cache.set(cache_key, result)
    return result


@router.get("/ready-builds/{slug}")
def get_ready_build_detail(slug: str, db: Session = Depends(get_db)) -> dict:
    require_storefront_flag("pc_builder")
    try:
        build = ready_build_service.get_build_by_slug(db, slug)
    except ready_build_service.ReadyBuildError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if build.status != "published":
        raise HTTPException(status_code=404, detail="Ready Build not found")

    from app.models.catalog_product import CatalogProduct
    from app.models.configurator_category import ConfiguratorCategory

    categories = {c.id: c for c in db.query(ConfiguratorCategory).filter(ConfiguratorCategory.profile_id == build.profile_id).all()}
    slots_out = []
    for slot in ready_build_service.slots_of(db, build.id):
        if slot.mode == "hidden":
            continue
        cat = categories.get(slot.category_id)
        items_out = []
        for item in ready_build_service.items_of(db, slot.id):
            product = db.get(CatalogProduct, item.product_id)
            items_out.append({
                "product_id": item.product_id,
                "name": product.name if product else "",
                "thumbnail": product.thumbnail if product else None,
                "price": float(item.build_price if item.build_price is not None else (product.price if product else 0)),
                "is_default": item.is_default,
            })
        slots_out.append({
            "category_id": slot.category_id,
            "category_name": cat.name if cat else "",
            "category_slug": cat.slug if cat else "",
            "mode": slot.mode,
            "items": items_out,
        })

    return {
        "data": {
            "id": build.id,
            "name": build.name,
            "slug": build.slug,
            "category": build.category,
            "tags": json.loads(build.tags_json or "[]"),
            "fps_label": build.fps_label,
            "images": json.loads(build.images_json or "[]"),
            "discount_type": build.discount_type,
            "discount_value": float(build.discount_value),
            "discount_on_change": build.discount_on_change,
            "show_timer": build.show_timer,
            "ends_at": build.ends_at.isoformat() if build.ends_at else None,
            "slots": slots_out,
            "totals": ready_build_service.compute_totals(db, build),
        },
    }


class ReadyBuildAddToCartRequest(BaseModel):
    selection: Dict[str, str] = Field(default_factory=dict)


@router.post("/ready-builds/{slug}/add-to-cart", response_model=StorefrontCartResponse)
def add_ready_build_to_cart(
    slug: str,
    payload: ReadyBuildAddToCartRequest,
    cart: StorefrontCart = Depends(_cart_context),
    db: Session = Depends(get_db),
) -> StorefrontCartResponse:
    require_storefront_flag("pc_builder")
    try:
        build = ready_build_service.get_build_by_slug(db, slug)
    except ready_build_service.ReadyBuildError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if build.status != "published":
        raise HTTPException(status_code=404, detail="Ready Build not found")

    resolved = ready_build_service.resolve_selection(db, build, payload.selection)
    if not resolved:
        raise HTTPException(status_code=400, detail="This build has no parts to add")

    from app.models.configurator_category import ConfiguratorCategory

    categories = {c.id: c for c in db.query(ConfiguratorCategory).filter(ConfiguratorCategory.profile_id == build.profile_id).all()}
    components = []
    for pick in resolved:
        cat = categories.get(pick["category_id"])
        components.append({"category_slug": cat.slug if cat else "", "product_id": pick["product_id"], "quantity": 1})

    try:
        profile = _svc(db).get_profile("pc-builder")
        evaluation = _svc(db).evaluate_components(profile, components)
        if evaluation["status"] == "incompatible":
            failing = next((r for r in evaluation["results"] if r["status"] == "incompatible"), None)
            message = failing["message"] if failing else "This build has an incompatible combination of parts."
            raise HTTPException(status_code=400, detail=message)
        cart = _svc(db).add_build_to_cart(cart, components)
    except ConfiguratorError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except CartError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # add_build_to_cart just added every part at its own catalog price (the
    # only path that never risks the cart's live-price resync clobbering a
    # per-line override) — the Ready Build's discount is applied as one lump
    # sum on the cart instead, the same way a coupon is, rather than on the
    # lines themselves.
    totals = ready_build_service.compute_totals(db, build, payload.selection)
    discount_amount = Decimal(str(totals["regular"])) - Decimal(str(totals["final"]))
    if discount_amount > 0:
        cart.ready_build_id = build.id
        cart.ready_build_discount = discount_amount
        db.commit()

    read = StorefrontCartService(db).build_read_model(cart)
    return StorefrontCartResponse(data=StorefrontCartRead(**read))
