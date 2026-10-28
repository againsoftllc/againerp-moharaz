"""Price / discount masters (OnerERP roadmap §14 Phase 2, part D).

What a line's price should be: the customer's own price (CustomerItemPrice) first, then a price type — from the most
specific matching pricing rule, else the customer group's default — that has a price for the item at that quantity, else
the catalog price. A price type can fix the price or bound it (lower / upper %); a discount type gives a default % and can
cap the line discount. Sales order and quotation lines are checked against those bounds on save.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.catalog_product import CatalogProduct
from app.models.commerce_customer import CommerceCustomer
from app.models.item import Item
from app.models.sales import CustomerItemPrice
from app.models.sales_pricing import (
    CustomerGroup,
    DiscountType,
    DiscountTypeItem,
    PriceType,
    PriceTypeItem,
    PricingRule,
)

ZERO = Decimal("0")
HUNDRED = Decimal("100")
CENT = Decimal("0.01")

# the groups the customer drawer has always offered (lib/mock-data/customers.ts CUSTOMER_GROUP_LABELS)
BUILT_IN_GROUPS = [
    ("retail", "Retail"),
    ("wholesale", "Wholesale"),
    ("dealer", "Dealer"),
    ("corporate", "Corporate"),
    ("vip", "VIP"),
    ("employee", "Employee"),
    ("partner", "Partner"),
]


def _q(value: Decimal) -> Decimal:
    return Decimal(value).quantize(CENT)


def _in_dates(valid_from: Optional[date], valid_to: Optional[date], on: date) -> bool:
    return (valid_from is None or valid_from <= on) and (valid_to is None or valid_to >= on)


def _http(status: int, detail: str) -> HTTPException:
    return HTTPException(status_code=status, detail=detail)


def product_for_item(db: Session, item_id: str) -> Optional[CatalogProduct]:
    """The catalog product behind a sales item (sales lines carry the item id; older rows share one id)."""
    return (
        db.query(CatalogProduct).filter(CatalogProduct.item_id == item_id).first()
        or db.get(CatalogProduct, item_id)
    )


# ── Customer groups ──────────────────────────────────────────────────────────


def ensure_customer_groups(db: Session, company_id: str) -> None:
    """Seed the built-in groups, plus any group code customers already carry (free text before this master existed)."""
    have = {code for (code,) in db.query(CustomerGroup.code).filter(CustomerGroup.company_id == company_id).all()}
    used = {
        (code or "").strip()
        for (code,) in db.query(CommerceCustomer.group).filter(CommerceCustomer.company_id == company_id).distinct().all()
    }
    order = len(have)
    for code, name in BUILT_IN_GROUPS + [(c, c.replace("_", " ").replace("-", " ").title()) for c in sorted(used)]:
        if code and code not in have:
            order += 1
            db.add(CustomerGroup(company_id=company_id, code=code, name=name, sort_order=order))
            have.add(code)
    db.flush()


def list_groups(db: Session, company_id: str) -> list[CustomerGroup]:
    return (
        db.query(CustomerGroup)
        .filter(CustomerGroup.company_id == company_id)
        .order_by(CustomerGroup.sort_order, CustomerGroup.name)
        .all()
    )


def save_group(db: Session, company_id: str, group: Optional[CustomerGroup], **values) -> CustomerGroup:
    if group is None:
        code = (values.get("code") or "").strip().lower().replace(" ", "_")
        if not code:
            raise _http(400, "A group code is required")
        if db.query(CustomerGroup).filter(CustomerGroup.company_id == company_id, CustomerGroup.code == code).first():
            raise _http(409, f"Customer group {code} already exists")
        group = CustomerGroup(company_id=company_id, code=code, name=code, sort_order=len(list_groups(db, company_id)) + 1)
        db.add(group)
    values.pop("code", None)  # the code is what customers hold: it never changes
    if "name" in values:
        name = (values.pop("name") or "").strip()
        if not name:
            raise _http(400, "A group name is required")
        group.name = name
    _check_refs(db, company_id, values.get("price_type_id"), values.get("discount_type_id"))
    for key in ("price_type_id", "discount_type_id", "is_active", "sort_order"):
        if key in values:
            setattr(group, key, values[key])
    db.flush()
    return group


def _check_refs(db: Session, company_id: str, price_type_id: Optional[str], discount_type_id: Optional[str]) -> None:
    if price_type_id:
        row = db.get(PriceType, price_type_id)
        if row is None or row.company_id != company_id:
            raise _http(404, "Price type not found")
    if discount_type_id:
        row = db.get(DiscountType, discount_type_id)
        if row is None or row.company_id != company_id:
            raise _http(404, "Discount type not found")


# ── Price types / discount types ─────────────────────────────────────────────


def _clean_code(code: Optional[str], name: str) -> str:
    return ((code or "").strip() or name.strip()).upper().replace(" ", "_")[:40]


def _pct(value, label: str) -> Optional[Decimal]:
    if value is None or value == "":
        return None
    pct = Decimal(str(value))
    if pct < 0 or pct > HUNDRED:
        raise _http(400, f"{label} must be between 0 and 100")
    return pct


def _dates(valid_from: Optional[date], valid_to: Optional[date], label: str) -> None:
    if valid_from and valid_to and valid_to < valid_from:
        raise _http(400, f"{label}: valid to is before valid from")


def price_type_items(db: Session, price_type_id: str) -> list[PriceTypeItem]:
    return (
        db.query(PriceTypeItem)
        .filter(PriceTypeItem.price_type_id == price_type_id)
        .order_by(PriceTypeItem.item_id, PriceTypeItem.min_qty)
        .all()
    )


def save_price_type(db: Session, company_id: str, row: Optional[PriceType], *, items: Optional[list[dict]] = None, **values) -> PriceType:
    name = (values.get("name") if "name" in values else (row.name if row else "")) or ""
    if not name.strip():
        raise _http(400, "A price type name is required")
    code = _clean_code(values.get("code") if "code" in values else (row.code if row else None), name)
    clash = db.query(PriceType).filter(PriceType.company_id == company_id, PriceType.code == code)
    if row is not None:
        clash = clash.filter(PriceType.id != row.id)
    if clash.first():
        raise _http(409, f"Price type {code} already exists")
    if row is None:
        row = PriceType(company_id=company_id, code=code, name=name.strip())
        db.add(row)
    row.code = code
    row.name = name.strip()
    if "description" in values:
        row.description = (values["description"] or "").strip() or None
    if "allow_change" in values:
        row.allow_change = bool(values["allow_change"])
    if "lower_limit_pct" in values:
        row.lower_limit_pct = _pct(values["lower_limit_pct"], "Lower limit")
    if "upper_limit_pct" in values:
        row.upper_limit_pct = _pct(values["upper_limit_pct"], "Upper limit")
    if "is_active" in values:
        row.is_active = bool(values["is_active"])
    db.flush()
    if items is not None:
        seen: set[tuple[str, int]] = set()
        clean: list[PriceTypeItem] = []
        for item in items:
            item_id = item.get("item_id")
            if not item_id or (product_for_item(db, item_id) is None and db.get(Item, item_id) is None):
                raise _http(404, "Product not found")
            min_qty = max(int(item.get("min_qty") or 1), 1)
            price = Decimal(str(item.get("price") if item.get("price") is not None else "0"))
            if price < 0:
                raise _http(400, "A price cannot be negative")
            _dates(item.get("valid_from"), item.get("valid_to"), "Price")
            key = (item_id, min_qty)
            if key in seen and not (item.get("valid_from") or item.get("valid_to")):
                raise _http(400, "The same product is listed twice for one quantity")
            seen.add(key)
            clean.append(
                PriceTypeItem(
                    price_type_id=row.id, item_id=item_id, min_qty=min_qty, price=_q(price),
                    valid_from=item.get("valid_from"), valid_to=item.get("valid_to"),
                )
            )
        db.query(PriceTypeItem).filter(PriceTypeItem.price_type_id == row.id).delete(synchronize_session=False)
        db.add_all(clean)
        db.flush()
    return row


def discount_type_items(db: Session, discount_type_id: str) -> list[DiscountTypeItem]:
    return (
        db.query(DiscountTypeItem)
        .filter(DiscountTypeItem.discount_type_id == discount_type_id)
        .order_by(DiscountTypeItem.min_qty)
        .all()
    )


def save_discount_type(db: Session, company_id: str, row: Optional[DiscountType], *, items: Optional[list[dict]] = None, **values) -> DiscountType:
    name = (values.get("name") if "name" in values else (row.name if row else "")) or ""
    if not name.strip():
        raise _http(400, "A discount type name is required")
    code = _clean_code(values.get("code") if "code" in values else (row.code if row else None), name)
    clash = db.query(DiscountType).filter(DiscountType.company_id == company_id, DiscountType.code == code)
    if row is not None:
        clash = clash.filter(DiscountType.id != row.id)
    if clash.first():
        raise _http(409, f"Discount type {code} already exists")
    if row is None:
        row = DiscountType(company_id=company_id, code=code, name=name.strip())
        db.add(row)
    row.code = code
    row.name = name.strip()
    if "description" in values:
        row.description = (values["description"] or "").strip() or None
    if "max_pct" in values:
        row.max_pct = _pct(values["max_pct"], "Max discount")
    if "is_active" in values:
        row.is_active = bool(values["is_active"])
    db.flush()
    if items is not None:
        clean: list[DiscountTypeItem] = []
        for item in items:
            targets = [k for k in ("item_id", "brand_id", "category_id") if item.get(k)]
            if len(targets) != 1:
                raise _http(400, "Each discount line is for one product, one brand or one category")
            pct = _pct(item.get("discount_pct"), "Discount")
            if pct is None:
                raise _http(400, "Each discount line needs a %")
            if row.max_pct is not None and pct > row.max_pct:
                raise _http(400, f"A {pct}% line is above this type's {row.max_pct}% maximum")
            _dates(item.get("valid_from"), item.get("valid_to"), "Discount")
            clean.append(
                DiscountTypeItem(
                    discount_type_id=row.id, item_id=item.get("item_id"), brand_id=item.get("brand_id"),
                    category_id=item.get("category_id"), min_qty=max(int(item.get("min_qty") or 1), 1),
                    discount_pct=pct, valid_from=item.get("valid_from"), valid_to=item.get("valid_to"),
                )
            )
        db.query(DiscountTypeItem).filter(DiscountTypeItem.discount_type_id == row.id).delete(synchronize_session=False)
        db.add_all(clean)
        db.flush()
    return row


RULE_FIELDS = ("customer_group", "warehouse_id", "user_id", "brand_id", "category_id")


def save_rule(db: Session, company_id: str, row: Optional[PricingRule], **values) -> PricingRule:
    if row is None:
        row = PricingRule(company_id=company_id, name="")
        db.add(row)
    for key in ("name", "price_type_id", "discount_type_id", *RULE_FIELDS, "valid_from", "valid_to", "priority", "is_active"):
        if key in values:
            value = values[key]
            if isinstance(value, str):
                value = value.strip() or None
            setattr(row, key, value)
    if not (row.name or "").strip():
        raise _http(400, "A rule name is required")
    if not row.price_type_id and not row.discount_type_id:
        raise _http(400, "A rule sets a price type, a discount type or both")
    _check_refs(db, company_id, row.price_type_id, row.discount_type_id)
    _dates(row.valid_from, row.valid_to, "Rule")
    row.priority = int(row.priority or 0)
    db.flush()
    return row


# ── Resolver ─────────────────────────────────────────────────────────────────


@dataclass
class PriceQuote:
    item_id: str
    quantity: int
    list_price: Decimal  # catalog price
    price: Decimal  # what the line should start at
    source: str  # customer_price | price_type | catalog
    price_type_id: Optional[str] = None
    price_type_name: Optional[str] = None
    allow_change: bool = True
    min_price: Optional[Decimal] = None
    max_price: Optional[Decimal] = None
    discount_pct: Decimal = ZERO
    discount_type_id: Optional[str] = None
    discount_type_name: Optional[str] = None
    max_discount_pct: Optional[Decimal] = None
    rule_names: list[str] = field(default_factory=list)


def _matching_rules(
    db: Session, company_id: str, *, group: Optional[str], warehouse_id: Optional[str], user_id: Optional[str],
    product: Optional[CatalogProduct], on: date,
) -> list[PricingRule]:
    facts = {
        "customer_group": group,
        "warehouse_id": warehouse_id,
        "user_id": user_id,
        "brand_id": product.brand_id if product else None,
        "category_id": product.category_id if product else None,
    }
    rules = db.query(PricingRule).filter(PricingRule.company_id == company_id, PricingRule.is_active.is_(True)).all()
    hits = [
        r for r in rules
        if _in_dates(r.valid_from, r.valid_to, on)
        and all(getattr(r, k) in (None, "") or getattr(r, k) == facts[k] for k in RULE_FIELDS)
    ]
    # most conditions first, then priority, then the newest
    return sorted(
        hits,
        key=lambda r: (sum(1 for k in RULE_FIELDS if getattr(r, k)), r.priority or 0, str(r.created_at or "")),
        reverse=True,
    )


def _slab_price(db: Session, price_type_id: str, item_id: str, quantity: int, on: date) -> Optional[Decimal]:
    rows = (
        db.query(PriceTypeItem)
        .filter(PriceTypeItem.price_type_id == price_type_id, PriceTypeItem.item_id == item_id, PriceTypeItem.min_qty <= quantity)
        .order_by(PriceTypeItem.min_qty.desc())
        .all()
    )
    dated = [r for r in rows if _in_dates(r.valid_from, r.valid_to, on)]
    # a dated row beats an open-ended one at the same quantity
    dated.sort(key=lambda r: (r.min_qty, r.valid_from is not None or r.valid_to is not None), reverse=True)
    return Decimal(dated[0].price) if dated else None


def _discount_pct(db: Session, discount_type_id: str, product: Optional[CatalogProduct], item_id: str, quantity: int, on: date) -> Optional[Decimal]:
    rows = [
        r for r in db.query(DiscountTypeItem)
        .filter(DiscountTypeItem.discount_type_id == discount_type_id, DiscountTypeItem.min_qty <= quantity)
        .all()
        if _in_dates(r.valid_from, r.valid_to, on)
    ]
    targets = [("item_id", item_id), ("brand_id", product.brand_id if product else None), ("category_id", product.category_id if product else None)]
    for key, value in targets:
        if not value:
            continue
        hit = [r for r in rows if getattr(r, key) == value]
        if hit:
            return Decimal(max(hit, key=lambda r: r.min_qty).discount_pct)
    return None


def quote(
    db: Session,
    *,
    company_id: str,
    item_id: str,
    quantity: int = 1,
    customer_id: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    user_id: Optional[str] = None,
    on: Optional[date] = None,
) -> PriceQuote:
    on = on or date.today()
    quantity = max(int(quantity or 1), 1)
    product = product_for_item(db, item_id)
    list_price = Decimal(product.price or 0) if product else ZERO
    customer = db.get(CommerceCustomer, customer_id) if customer_id else None
    group_code = ((customer.group or "").strip() or None) if customer else None
    group = (
        db.query(CustomerGroup)
        .filter(CustomerGroup.company_id == company_id, CustomerGroup.code == group_code, CustomerGroup.is_active.is_(True))
        .first()
        if group_code
        else None
    )
    rules = _matching_rules(db, company_id, group=group_code, warehouse_id=warehouse_id, user_id=user_id, product=product, on=on)
    result = PriceQuote(item_id=item_id, quantity=quantity, list_price=_q(list_price), price=_q(list_price), source="catalog")

    # price: customer's own → first price type (rules, then the group's) that prices this item → catalog
    special = None
    if customer_id:
        special = (
            db.query(CustomerItemPrice)
            .filter(
                CustomerItemPrice.company_id == company_id,
                CustomerItemPrice.customer_id == customer_id,
                CustomerItemPrice.item_id == item_id,
                CustomerItemPrice.is_active.is_(True),
                CustomerItemPrice.min_qty <= quantity,
                or_(CustomerItemPrice.valid_from.is_(None), CustomerItemPrice.valid_from <= on),
                or_(CustomerItemPrice.valid_to.is_(None), CustomerItemPrice.valid_to >= on),
            )
            .order_by(CustomerItemPrice.min_qty.desc())
            .first()
        )
    if special is not None:
        result.price = _q(special.unit_price)
        result.source = "customer_price"
        if special.discount_pct:
            result.discount_pct = Decimal(special.discount_pct)
    else:
        candidates = [(r.price_type_id, r.name) for r in rules if r.price_type_id]
        if group and group.price_type_id:
            candidates.append((group.price_type_id, f"{group.name} group"))
        for price_type_id, via in candidates:
            price_type = db.get(PriceType, price_type_id)
            if price_type is None or not price_type.is_active:
                continue
            price = _slab_price(db, price_type_id, item_id, quantity, on)
            if price is None:
                continue
            result.price = _q(price)
            result.source = "price_type"
            result.price_type_id = price_type.id
            result.price_type_name = price_type.name
            result.allow_change = bool(price_type.allow_change)
            if not price_type.allow_change:
                result.min_price = result.max_price = result.price
            else:
                if price_type.lower_limit_pct is not None:
                    result.min_price = _q(price * (HUNDRED - Decimal(price_type.lower_limit_pct)) / HUNDRED)
                if price_type.upper_limit_pct is not None:
                    result.max_price = _q(price * (HUNDRED + Decimal(price_type.upper_limit_pct)) / HUNDRED)
            result.rule_names.append(via)
            break

    # discount: first discount type (rules, then the group's) that covers this item; its cap applies either way
    d_candidates = [(r.discount_type_id, r.name) for r in rules if r.discount_type_id]
    if group and group.discount_type_id:
        d_candidates.append((group.discount_type_id, f"{group.name} group"))
    for discount_type_id, via in d_candidates:
        discount_type = db.get(DiscountType, discount_type_id)
        if discount_type is None or not discount_type.is_active:
            continue
        result.discount_type_id = discount_type.id
        result.discount_type_name = discount_type.name
        result.max_discount_pct = Decimal(discount_type.max_pct) if discount_type.max_pct is not None else None
        pct = _discount_pct(db, discount_type_id, product, item_id, quantity, on)
        if pct is not None and result.source != "customer_price":
            result.discount_pct = pct
        if via not in result.rule_names:
            result.rule_names.append(via)
        break
    return result


def check_line(q: PriceQuote, *, label: str, unit_price: Decimal, quantity: int, discount_amount: Decimal) -> None:
    """Refuse a line outside its price type's bounds or above its discount type's cap."""
    unit_price = Decimal(unit_price or 0)
    if q.source == "price_type":
        if not q.allow_change and _q(unit_price) != q.price:
            raise _http(400, f"{label}: the {q.price_type_name} price is fixed at {q.price}; it cannot be changed")
        if q.min_price is not None and _q(unit_price) < q.min_price:
            raise _http(400, f"{label}: {unit_price} is below the lowest {q.price_type_name} price ({q.min_price})")
        if q.max_price is not None and _q(unit_price) > q.max_price:
            raise _http(400, f"{label}: {unit_price} is above the highest {q.price_type_name} price ({q.max_price})")
    gross = unit_price * Decimal(quantity or 0)
    if q.max_discount_pct is not None and gross > 0:
        cap = _q(gross * q.max_discount_pct / HUNDRED)
        if _q(Decimal(discount_amount or 0)) > cap:
            raise _http(
                400,
                f"{label}: a discount of {_q(Decimal(discount_amount))} is above the {q.discount_type_name} maximum of "
                f"{q.max_discount_pct}% ({cap})",
            )
