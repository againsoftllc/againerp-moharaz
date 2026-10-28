from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_company_id, require_permission
from app.models.auth_user import AuthUser
from app.models.catalog_brand import CatalogBrand
from app.models.catalog_category import CatalogCategory
from app.models.catalog_product import CatalogProduct
from app.models.commerce_customer import CommerceCustomer
from app.models.item import Item
from app.models.sales_pricing import CustomerGroup, DiscountType, PriceType, PricingRule
from app.schemas.sales_pricing import (
    CustomerGroupListResponse,
    CustomerGroupRead,
    CustomerGroupResponse,
    CustomerGroupSave,
    DiscountTypeItemRow,
    DiscountTypeListResponse,
    DiscountTypeRead,
    DiscountTypeResponse,
    DiscountTypeSave,
    PriceQuoteRead,
    PriceQuoteResponse,
    PriceTypeItemRow,
    PriceTypeListResponse,
    PriceTypeRead,
    PriceTypeResponse,
    PriceTypeSave,
    PricingRuleListResponse,
    PricingRuleRead,
    PricingRuleResponse,
    PricingRuleSave,
)
from app.services.sales import pricing_service as pricing

router = APIRouter(prefix="/sales/pricing", tags=["sales-pricing"])


def _get(db: Session, model, row_id: str, company_id: str, label: str):
    row = db.get(model, row_id)
    if row is None or row.company_id != company_id:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return row


# ── customer groups ──────────────────────────────────────────────────────────


def _group_reads(db: Session, company_id: str, rows: list[CustomerGroup]) -> list[CustomerGroupRead]:
    counts = dict(
        db.query(CommerceCustomer.group, func.count(CommerceCustomer.id))
        .filter(CommerceCustomer.company_id == company_id)
        .group_by(CommerceCustomer.group)
        .all()
    )
    return [
        CustomerGroupRead(
            id=g.id, code=g.code, name=g.name, price_type_id=g.price_type_id, discount_type_id=g.discount_type_id,
            is_active=g.is_active, sort_order=g.sort_order, customer_count=counts.get(g.code, 0),
        )
        for g in rows
    ]


@router.get("/customer-groups", response_model=CustomerGroupListResponse)
def list_customer_groups(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerGroupListResponse:
    pricing.ensure_customer_groups(db, company_id)
    db.commit()
    return CustomerGroupListResponse(data=_group_reads(db, company_id, pricing.list_groups(db, company_id)))


@router.post("/customer-groups", response_model=CustomerGroupResponse, status_code=201)
def create_customer_group(
    payload: CustomerGroupSave,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerGroupResponse:
    pricing.ensure_customer_groups(db, company_id)
    values = payload.model_dump(exclude_unset=True)
    values.setdefault("name", values.get("code"))
    row = pricing.save_group(db, company_id, None, **values)
    db.commit()
    return CustomerGroupResponse(data=_group_reads(db, company_id, [row])[0])


@router.patch("/customer-groups/{group_id}", response_model=CustomerGroupResponse)
def update_customer_group(
    group_id: str,
    payload: CustomerGroupSave,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> CustomerGroupResponse:
    row = _get(db, CustomerGroup, group_id, company_id, "Customer group")
    pricing.save_group(db, company_id, row, **payload.model_dump(exclude_unset=True))
    db.commit()
    return CustomerGroupResponse(data=_group_reads(db, company_id, [row])[0])


# ── price types ──────────────────────────────────────────────────────────────


def _price_type_read(db: Session, row: PriceType) -> PriceTypeRead:
    items = pricing.price_type_items(db, row.id)
    ids = {i.item_id for i in items}
    products: dict = {}
    for p in db.query(CatalogProduct).filter(CatalogProduct.id.in_(ids)).all() if ids else []:
        products[p.id] = p
    for p in db.query(CatalogProduct).filter(CatalogProduct.item_id.in_(ids)).all() if ids else []:
        products[p.item_id] = p  # sales items: the item id
    # an item with no catalog product (sold, never listed): its own SKU and name
    bare = {i.id: i for i in db.query(Item).filter(Item.id.in_(ids - set(products))).all()} if ids - set(products) else {}
    return PriceTypeRead(
        id=row.id, code=row.code, name=row.name, description=row.description, allow_change=row.allow_change,
        lower_limit_pct=row.lower_limit_pct, upper_limit_pct=row.upper_limit_pct, is_active=row.is_active,
        items=[
            PriceTypeItemRow(
                item_id=i.item_id, min_qty=i.min_qty, price=i.price, valid_from=i.valid_from, valid_to=i.valid_to,
                sku=products[i.item_id].sku if i.item_id in products else getattr(bare.get(i.item_id), "sku", None),
                name=products[i.item_id].name if i.item_id in products else getattr(bare.get(i.item_id), "name", None),
                list_price=products[i.item_id].price if i.item_id in products else None,
            )
            for i in items
        ],
    )


@router.get("/price-types", response_model=PriceTypeListResponse)
def list_price_types(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PriceTypeListResponse:
    rows = db.query(PriceType).filter(PriceType.company_id == company_id).order_by(PriceType.name).all()
    return PriceTypeListResponse(data=[_price_type_read(db, r) for r in rows])


@router.post("/price-types", response_model=PriceTypeResponse, status_code=201)
def create_price_type(
    payload: PriceTypeSave,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PriceTypeResponse:
    values = payload.model_dump(exclude_unset=True)
    items = values.pop("items", None)
    row = pricing.save_price_type(db, company_id, None, items=items, **values)
    db.commit()
    return PriceTypeResponse(data=_price_type_read(db, row))


@router.patch("/price-types/{price_type_id}", response_model=PriceTypeResponse)
def update_price_type(
    price_type_id: str,
    payload: PriceTypeSave,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PriceTypeResponse:
    row = _get(db, PriceType, price_type_id, company_id, "Price type")
    values = payload.model_dump(exclude_unset=True)
    items = values.pop("items", None)
    pricing.save_price_type(db, company_id, row, items=items, **values)
    db.commit()
    return PriceTypeResponse(data=_price_type_read(db, row))


# ── discount types ───────────────────────────────────────────────────────────


def _discount_type_read(db: Session, row: DiscountType) -> DiscountTypeRead:
    items = pricing.discount_type_items(db, row.id)

    def names(model, ids: set[str]) -> dict[str, str]:
        ids = {i for i in ids if i}
        return dict(db.query(model.id, model.name).filter(model.id.in_(ids)).all()) if ids else {}

    item_ids = {i.item_id for i in items if i.item_id}
    products = names(CatalogProduct, item_ids)
    if item_ids:
        products.update(
            dict(db.query(CatalogProduct.item_id, CatalogProduct.name).filter(CatalogProduct.item_id.in_(item_ids)).all())
        )
        missing = item_ids - set(products)
        if missing:
            products.update(dict(db.query(Item.id, Item.name).filter(Item.id.in_(missing)).all()))
    brands = names(CatalogBrand, {i.brand_id for i in items})
    categories = names(CatalogCategory, {i.category_id for i in items})
    return DiscountTypeRead(
        id=row.id, code=row.code, name=row.name, description=row.description, max_pct=row.max_pct, is_active=row.is_active,
        items=[
            DiscountTypeItemRow(
                item_id=i.item_id, brand_id=i.brand_id, category_id=i.category_id, min_qty=i.min_qty,
                discount_pct=i.discount_pct, valid_from=i.valid_from, valid_to=i.valid_to,
                target_label=(
                    products.get(i.item_id) if i.item_id
                    else f"Brand: {brands.get(i.brand_id, '?')}" if i.brand_id
                    else f"Category: {categories.get(i.category_id, '?')}"
                ),
            )
            for i in items
        ],
    )


@router.get("/discount-types", response_model=DiscountTypeListResponse)
def list_discount_types(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
) -> DiscountTypeListResponse:
    rows = db.query(DiscountType).filter(DiscountType.company_id == company_id).order_by(DiscountType.name).all()
    return DiscountTypeListResponse(data=[_discount_type_read(db, r) for r in rows])


@router.post("/discount-types", response_model=DiscountTypeResponse, status_code=201)
def create_discount_type(
    payload: DiscountTypeSave,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> DiscountTypeResponse:
    values = payload.model_dump(exclude_unset=True)
    items = values.pop("items", None)
    if items is not None:
        items = [{k: v for k, v in i.items() if k != "target_label"} for i in items]
    row = pricing.save_discount_type(db, company_id, None, items=items, **values)
    db.commit()
    return DiscountTypeResponse(data=_discount_type_read(db, row))


@router.patch("/discount-types/{discount_type_id}", response_model=DiscountTypeResponse)
def update_discount_type(
    discount_type_id: str,
    payload: DiscountTypeSave,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> DiscountTypeResponse:
    row = _get(db, DiscountType, discount_type_id, company_id, "Discount type")
    values = payload.model_dump(exclude_unset=True)
    items = values.pop("items", None)
    if items is not None:
        items = [{k: v for k, v in i.items() if k != "target_label"} for i in items]
    pricing.save_discount_type(db, company_id, row, items=items, **values)
    db.commit()
    return DiscountTypeResponse(data=_discount_type_read(db, row))


# ── rules (price / discount configuration) ───────────────────────────────────


def _rule_read(row: PricingRule) -> PricingRuleRead:
    return PricingRuleRead(
        id=row.id, name=row.name, price_type_id=row.price_type_id, discount_type_id=row.discount_type_id,
        customer_group=row.customer_group, warehouse_id=row.warehouse_id, user_id=row.user_id, brand_id=row.brand_id,
        category_id=row.category_id, valid_from=row.valid_from, valid_to=row.valid_to, priority=row.priority,
        is_active=row.is_active,
    )


@router.get("/rules", response_model=PricingRuleListResponse)
def list_rules(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PricingRuleListResponse:
    rows = (
        db.query(PricingRule)
        .filter(PricingRule.company_id == company_id)
        .order_by(PricingRule.priority.desc(), PricingRule.name)
        .all()
    )
    return PricingRuleListResponse(data=[_rule_read(r) for r in rows])


@router.post("/rules", response_model=PricingRuleResponse, status_code=201)
def create_rule(
    payload: PricingRuleSave,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PricingRuleResponse:
    row = pricing.save_rule(db, company_id, None, **payload.model_dump(exclude_unset=True))
    db.commit()
    return PricingRuleResponse(data=_rule_read(row))


@router.patch("/rules/{rule_id}", response_model=PricingRuleResponse)
def update_rule(
    rule_id: str,
    payload: PricingRuleSave,
    db: Session = Depends(get_db),
    _: AuthUser = Depends(require_permission("sales", "write")),
    company_id: str = Depends(get_current_company_id),
) -> PricingRuleResponse:
    row = _get(db, PricingRule, rule_id, company_id, "Pricing rule")
    pricing.save_rule(db, company_id, row, **payload.model_dump(exclude_unset=True))
    db.commit()
    return PricingRuleResponse(data=_rule_read(row))


# ── quote ────────────────────────────────────────────────────────────────────


@router.get("/quote", response_model=PriceQuoteResponse)
def price_quote(
    item_id: str = Query(...),
    quantity: int = Query(1, ge=1),
    customer_id: Optional[str] = Query(None),
    warehouse_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: AuthUser = Depends(require_permission("sales", "read")),
    company_id: str = Depends(get_current_company_id),
) -> PriceQuoteResponse:
    """What a sales line for this item should start at, and the bounds it is checked against on save."""
    q = pricing.quote(
        db, company_id=company_id, item_id=item_id, quantity=quantity, customer_id=customer_id,
        warehouse_id=warehouse_id, user_id=str(user.id),
    )
    return PriceQuoteResponse(data=PriceQuoteRead(**q.__dict__))
