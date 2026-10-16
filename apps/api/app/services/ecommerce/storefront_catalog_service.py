"""Storefront product catalog — queries ecommerce_items only (STEP 04)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Callable, Dict, List, Optional, Tuple

from sqlalchemy import and_, case, desc, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.models.catalog_brand import CatalogBrand
from app.models.catalog_category import CatalogCategory
from app.models.catalog_product import CatalogProduct
from app.models.catalog_attribute import CatalogAttribute
from app.models.catalog_filter import CatalogFilter
from app.models.catalog_product_attribute_value import CatalogProductAttributeValue
from app.models.commerce_order_item import CommerceOrderItem
from app.models.ecommerce_item import EcommerceItem
from app.models.ecommerce_item_category import EcommerceItemCategory
from app.models.item import Item
from app.schemas.attribute_profile import parse_json_list
from app.services.ecommerce.constants import STOREFRONT_LIVE_STATUSES
from app.services.ecommerce.ecommerce_item_service import EcommerceItemService, StorefrontProductView


def value_slug(value: str) -> str:
    """A filter value as it appears in a shop URL: "AMD B650" → "amd-b650", "M.2" → "m-2", "FM2+" → "fm2plus".
    The storefront's valueSlug (lib/shop/listing.ts) is the same function."""
    s = (value or "").strip().lower().replace("+", "plus")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


SORT_NEWEST = "newest"
SORT_PRICE_ASC = "price_asc"
SORT_PRICE_DESC = "price_desc"
SORT_BESTSELLING = "bestselling"
SORT_FEATURED = "featured"
# what a shopper can buy first: in stock with a price → call for price (no price) →
# pre-order / coming soon → out of stock; newest first inside each group
SORT_AVAILABILITY = "availability"


@dataclass(frozen=True)
class StorefrontListResult:
    items: List[StorefrontProductView]
    total: int


class StorefrontCatalogService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._items = EcommerceItemService(db)

    def _direct_query(self):
        """Products reachable by their own URL: the listed ones plus unlisted ("hidden") ones — e.g. the
        old shop's discontinued products, whose pages stayed online and indexed. Lists, search and
        facets use _base_query, so these never show up there. Drafts stay unreachable."""
        return (
            self._db.query(EcommerceItem)
            .join(Item, Item.id == EcommerceItem.item_id)
            .filter(
                EcommerceItem.publish_status.in_(STOREFRONT_LIVE_STATUSES | {"hidden"}),
                EcommerceItem.visibility.in_(("public", "private")),
            )
        )

    def _base_query(self):
        return (
            self._db.query(EcommerceItem)
            .join(Item, Item.id == EcommerceItem.item_id)
            .filter(
                EcommerceItem.publish_status.in_(STOREFRONT_LIVE_STATUSES),
                EcommerceItem.visibility == "public",
            )
        )

    def _apply_filters(
        self,
        query,
        *,
        search: Optional[str] = None,
        category_id: Optional[str] = None,
        category_slug: Optional[str] = None,
        brand_id: Optional[str] = None,
        brand_slug: Optional[str] = None,
        brand_slugs: Optional[List[str]] = None,
        featured: Optional[bool] = None,
        on_sale: Optional[bool] = None,
        price_min: Optional[Decimal] = None,
        price_max: Optional[Decimal] = None,
        in_stock: Optional[bool] = None,
        attribute_filters: Optional[Dict[str, List[str]]] = None,
    ):
        if category_slug and not category_id:
            from sqlalchemy import case

            cat = (
                self._db.query(CatalogCategory)
                .filter(CatalogCategory.slug == category_slug)
                .order_by(
                    case((CatalogCategory.channel == "catalog", 0), else_=1),
                    CatalogCategory.sort_order.asc(),
                )
                .first()
            )
            if cat:
                category_id = cat.id
        if brand_slug and not brand_id:
            brand = (
                self._db.query(CatalogBrand)
                .filter(CatalogBrand.slug == brand_slug)
                .first()
            )
            if brand:
                brand_id = brand.id

        if search:
            # every word has to match somewhere — name, slug, SKU, SEO title, brand or category — so
            # "asus monitor" finds "ASUS ProArt Display … Monitor" (the whole phrase as one term found nothing)
            for word in self._search_words(search):
                term = f"%{word}%"
                query = query.filter(
                    (EcommerceItem.slug.ilike(term))
                    | (Item.name.ilike(term))
                    | (Item.sku.ilike(term))
                    | (EcommerceItem.seo_title.ilike(term))
                    | EcommerceItem.brand_id.in_(select(CatalogBrand.id).where(CatalogBrand.name.ilike(term)))
                    | EcommerceItem.primary_category_id.in_(
                        select(CatalogCategory.id).where(CatalogCategory.name.ilike(term)),
                    ),
                )
        if category_id:
            # A section page lists its whole branch — "Laptop" shows every laptop,
            # not only the ones pinned directly on the parent.
            category_ids = self._category_branch_ids(category_id)
            query = query.filter(
                (EcommerceItem.primary_category_id.in_(category_ids))
                | EcommerceItem.item_id.in_(
                    self._db.query(EcommerceItemCategory.item_id).filter(
                        EcommerceItemCategory.category_id.in_(category_ids),
                    ),
                ),
            )
        if brand_slugs:
            brand_ids = [
                b.id
                for b in self._db.query(CatalogBrand)
                .filter(CatalogBrand.slug.in_(brand_slugs))
                .all()
            ]
            query = query.filter(EcommerceItem.brand_id.in_(brand_ids or ["__none__"]))
        elif brand_id:
            query = query.filter(EcommerceItem.brand_id == brand_id)
        if featured is not None:
            query = query.filter(EcommerceItem.featured == featured)
        if on_sale:
            query = query.filter(
                EcommerceItem.compare_at_price.isnot(None),
                EcommerceItem.compare_at_price > EcommerceItem.selling_price,
            )
        if price_min is not None:
            query = query.filter(EcommerceItem.selling_price >= price_min)
        if price_max is not None:
            query = query.filter(EcommerceItem.selling_price <= price_max)
        if in_stock is not None:
            query = query.join(
                CatalogProduct,
                CatalogProduct.id == EcommerceItem.catalog_product_id,
            )
            # the product's stock status when it has one (imported catalogues keep placeholder quantities and
            # carry real availability in stock_status); otherwise quantity, and only tracked products run out
            by_quantity = or_(
                CatalogProduct.track_quantity.is_(False),
                CatalogProduct.stock > 0,
            )
            has_status = and_(CatalogProduct.stock_status.isnot(None), CatalogProduct.stock_status != "")
            available = or_(
                and_(has_status, CatalogProduct.stock_status == "in_stock"),
                and_(~has_status, by_quantity),
            )
            query = query.filter(available if in_stock else ~available)
        if attribute_filters:
            for code, values in attribute_filters.items():
                cleaned = [v.strip() for v in values if v and v.strip()]
                if not cleaned:
                    continue
                # one filter code can be the same spec in several product-type profiles
                attr_ids = [
                    a_id
                    for (a_id,) in self._db.query(CatalogAttribute.id)
                    .filter(CatalogAttribute.code == code, CatalogAttribute.is_filterable.is_(True))
                    .all()
                ]
                if not attr_ids:
                    # not a filter (a stray URL parameter such as utm_source read as one): ignored
                    continue
                matching_ids = {
                    row.product_id
                    for row in self._db.query(CatalogProductAttributeValue)
                    .filter(CatalogProductAttributeValue.attribute_id.in_(attr_ids))
                    .all()
                    if self._value_matches_options(row.value or "", cleaned)
                }
                query = query.filter(
                    EcommerceItem.catalog_product_id.in_(matching_ids or ["__none__"]),
                )
        return query

    @staticmethod
    def _search_words(search: str) -> List[str]:
        """Search words (up to 8): "monitors" also finds "Monitor"; LIKE wildcards are taken literally."""
        words = []
        for raw in search.split()[:8]:
            w = raw.strip(" ,.;:!?()\"'").replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            if len(w) > 4 and w.lower().endswith("s") and not w.lower().endswith("ss"):
                w = w[:-1]
            if w:
                words.append(w)
        return words or [search.strip()]

    @staticmethod
    def _value_matches_options(stored: str, options: List[str]) -> bool:
        """A product's value matches when it, or one of its comma-separated parts, is a wanted option — compared
        as URL slugs, so the shop's readable filter links (?chipset=amd-b650&special-feature=m-2) and the values
        themselves ("AMD B650", "M.2") both match."""
        wanted = {value_slug(o) for o in options}
        if value_slug(stored) in wanted:
            return True
        return any(value_slug(p) in wanted for p in stored.split(",") if p.strip())

    @staticmethod
    def _stock_rank():
        """0 = in stock, 1 = not — the same rule as the product views' `in_stock` (out of stock / coming soon
        by status, or a tracked quantity at 0; no catalogue product counts as out). An aliased, correlated
        subquery, so it never clashes with a filter's join on the catalogue product."""
        cp = aliased(CatalogProduct)
        out = or_(
            func.lower(func.coalesce(cp.stock_status, "")).in_(("out_of_stock", "coming_soon")),
            and_(cp.track_quantity.is_(True), cp.stock <= 0),
        )
        rank = select(case((out, 1), else_=0)).where(cp.id == EcommerceItem.catalog_product_id).correlate(EcommerceItem).scalar_subquery()
        return func.coalesce(rank, 1)

    def _apply_sort(self, query, sort: str):
        # every list — category, brand, search, home rails — shows what can be bought first, whatever the sort
        query = query.order_by(self._stock_rank())
        if sort == SORT_PRICE_ASC:
            return query.order_by(EcommerceItem.selling_price.asc(), EcommerceItem.slug)
        if sort == SORT_PRICE_DESC:
            return query.order_by(EcommerceItem.selling_price.desc(), EcommerceItem.slug)
        if sort == SORT_AVAILABILITY:
            # stock status lives on the catalogue product; an aliased, explicitly correlated subquery keeps
            # this clear of the in-stock filter's join on the same table (unaliased, the subquery correlated
            # CatalogProduct too and lost its FROM — "In stock" + default sort answered 500)
            cp = aliased(CatalogProduct)
            stock = (
                select(cp.stock_status)
                .where(cp.id == EcommerceItem.catalog_product_id)
                .correlate(EcommerceItem)
                .scalar_subquery()
            )
            rank = case(
                (or_(EcommerceItem.selling_price.is_(None), EcommerceItem.selling_price <= 0), 1),
                (stock == "in_stock", 0),
                (stock.in_(("pre_order", "coming_soon")), 2),
                else_=3,
            )
            return query.order_by(rank, desc(EcommerceItem.updated_at), EcommerceItem.slug)
        if sort == SORT_FEATURED:
            return query.order_by(
                desc(EcommerceItem.featured),
                EcommerceItem.sort_order,
                desc(EcommerceItem.updated_at),
            )
        if sort == SORT_BESTSELLING:
            sales = (
                self._db.query(
                    CommerceOrderItem.product_id.label("product_id"),
                    func.sum(CommerceOrderItem.quantity).label("qty"),
                )
                .group_by(CommerceOrderItem.product_id)
                .subquery()
            )
            return query.outerjoin(
                sales,
                sales.c.product_id == EcommerceItem.catalog_product_id,
            ).order_by(desc(func.coalesce(sales.c.qty, 0)), desc(EcommerceItem.updated_at))
        return query.order_by(desc(EcommerceItem.updated_at), EcommerceItem.slug)

    def list_products(
        self,
        *,
        page: int = 1,
        per_page: int = 48,
        search: Optional[str] = None,
        category_id: Optional[str] = None,
        category_slug: Optional[str] = None,
        brand_id: Optional[str] = None,
        brand_slug: Optional[str] = None,
        brand_slugs: Optional[List[str]] = None,
        featured: Optional[bool] = None,
        on_sale: Optional[bool] = None,
        price_min: Optional[Decimal] = None,
        price_max: Optional[Decimal] = None,
        in_stock: Optional[bool] = None,
        attribute_filters: Optional[Dict[str, List[str]]] = None,
        sort: str = SORT_NEWEST,
        include_hidden: bool = False,
    ) -> StorefrontListResult:
        # include_hidden: the sitemap lists every product page that answers, unlisted ones too
        query = self._apply_filters(
            self._direct_query() if include_hidden else self._base_query(),
            search=search,
            category_id=category_id,
            category_slug=category_slug,
            brand_id=brand_id,
            brand_slug=brand_slug,
            brand_slugs=brand_slugs,
            featured=featured,
            on_sale=on_sale,
            price_min=price_min,
            price_max=price_max,
            in_stock=in_stock,
            attribute_filters=attribute_filters,
        )
        total = query.count()
        rows = (
            self._apply_sort(query, sort)
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )
        _held = self._preload(rows)  # noqa: F841 — keeps the batch-loaded rows in the session while views are built
        views = [v for ec in rows if (v := self._items.resolve_storefront_from_ecommerce(ec, unlisted_ok=include_hidden))]
        return StorefrontListResult(items=views, total=total)

    def _preload(self, rows: List[EcommerceItem]) -> list:
        """Load the products, items, brands and categories of a page of rows in four queries.

        resolve_storefront_from_ecommerce looks each one up with Session.get, which answers from the
        session's identity map — so one batch per table instead of four queries per product. The
        returned list holds the rows (the identity map only keeps weak references)."""
        held: list = []
        for model, ids in (
            (CatalogProduct, {r.catalog_product_id for r in rows if r.catalog_product_id}),
            (Item, {r.item_id for r in rows if r.item_id}),
            (CatalogBrand, {r.brand_id for r in rows if r.brand_id}),
            (CatalogCategory, {r.primary_category_id for r in rows if r.primary_category_id}),
        ):
            if ids:
                held.extend(self._db.query(model).filter(model.id.in_(ids)).all())
        return held

    def get_by_slug(self, slug: str) -> Optional[StorefrontProductView]:
        ec = (
            self._direct_query()
            .filter(EcommerceItem.slug == slug)
            .first()
        )
        if not ec:
            return None
        view = self._items.resolve_storefront_from_ecommerce(ec, unlisted_ok=True)
        if not view or view.slug != slug:
            return None
        return view

    def get_ec_by_slug(self, slug: str) -> Optional[EcommerceItem]:
        return self._direct_query().filter(EcommerceItem.slug == slug).first()

    def featured(self, *, limit: int = 12) -> List[StorefrontProductView]:
        result = self.list_products(featured=True, sort=SORT_FEATURED, per_page=limit, page=1)
        if result.items:
            return result.items
        return self.list_products(sort=SORT_FEATURED, per_page=limit, page=1).items

    def newest(self, *, limit: int = 12) -> List[StorefrontProductView]:
        return self.list_products(sort=SORT_NEWEST, per_page=limit, page=1).items

    def bestsellers(self, *, limit: int = 12) -> List[StorefrontProductView]:
        return self.list_products(sort=SORT_BESTSELLING, per_page=limit, page=1).items

    def _category_branch_ids(self, category_id: str) -> List[str]:
        """The category plus every category below it."""
        cat = self._db.get(CatalogCategory, category_id)
        if cat is None:
            return [category_id]
        if cat.path:
            rows = (
                self._db.query(CatalogCategory.id)
                .filter(CatalogCategory.path.like(f"{cat.path}%"))
                .all()
            )
            return [r[0] for r in rows] or [category_id]

        # Older rows may predate materialised paths — walk parent links instead.
        ids = [category_id]
        frontier = [category_id]
        while frontier:
            rows = (
                self._db.query(CatalogCategory.id)
                .filter(CatalogCategory.parent_id.in_(frontier))
                .all()
            )
            frontier = [r[0] for r in rows if r[0] not in ids]
            ids.extend(frontier)
        return ids

    def _category_related_ids(self, category_id: Optional[str]) -> List[str]:
        """Same category + siblings + descendants under the same parent (IT-shop related)."""
        if not category_id:
            return []
        cat = self._db.get(CatalogCategory, category_id)
        if not cat:
            return [category_id]

        ids: List[str] = [cat.id]

        # Siblings (same parent) — e.g. Keyboard ↔ Mouse under Accessories
        if cat.parent_id:
            sibling_ids = [
                row.id
                for row in self._db.query(CatalogCategory.id)
                .filter(
                    CatalogCategory.parent_id == cat.parent_id,
                    CatalogCategory.is_active.is_(True),
                    CatalogCategory.id != cat.id,
                )
                .all()
            ]
            ids.extend(sibling_ids)
            parent = self._db.get(CatalogCategory, cat.parent_id)
            if parent:
                ids.append(parent.id)
                # Cousins under the same grandparent when still sparse (Laptop → Gaming Laptop)
                if parent.parent_id:
                    cousin_ids = [
                        row.id
                        for row in self._db.query(CatalogCategory.id)
                        .filter(
                            CatalogCategory.parent_id == parent.parent_id,
                            CatalogCategory.is_active.is_(True),
                        )
                        .all()
                    ]
                    ids.extend(cousin_ids)
        else:
            # Top-level: include direct children (Laptop → All Laptop / Gaming Laptop)
            child_ids = [
                row.id
                for row in self._db.query(CatalogCategory.id)
                .filter(
                    CatalogCategory.parent_id == cat.id,
                    CatalogCategory.is_active.is_(True),
                )
                .all()
            ]
            ids.extend(child_ids)

        # De-dupe, keep order
        seen: set[str] = set()
        ordered: List[str] = []
        for cid in ids:
            if cid not in seen:
                seen.add(cid)
                ordered.append(cid)
        return ordered

    def related(self, slug: str, *, limit: int = 8) -> List[StorefrontProductView]:
        """Auto-related products: same category tree → same brand in-tree (no random global fill)."""
        ec = self.get_ec_by_slug(slug)
        if not ec:
            return []

        collected: List[StorefrontProductView] = []
        seen: set[str] = {ec.item_id}

        def _append(rows: List[EcommerceItem]) -> None:
            for row in rows:
                if row.item_id in seen:
                    continue
                view = self._items.resolve_storefront_from_ecommerce(row)
                if not view:
                    continue
                seen.add(row.item_id)
                collected.append(view)
                if len(collected) >= limit:
                    return

        base = self._base_query().filter(EcommerceItem.item_id != ec.item_id)
        order = (self._stock_rank(), desc(EcommerceItem.featured), desc(EcommerceItem.updated_at))
        related_cat_ids = self._category_related_ids(ec.primary_category_id)

        # 1) Exact same category
        if ec.primary_category_id:
            _append(
                base.filter(EcommerceItem.primary_category_id == ec.primary_category_id)
                .order_by(*order)
                .limit(limit)
                .all(),
            )

        # 2) Sibling / parent / cousin categories in the same IT branch
        if len(collected) < limit and related_cat_ids:
            _append(
                base.filter(EcommerceItem.primary_category_id.in_(related_cat_ids))
                .order_by(*order)
                .limit(limit)
                .all(),
            )

        # 3) Same brand, but only inside the related category tree (avoid Brand PC next to earbuds)
        if len(collected) < limit and ec.brand_id and related_cat_ids:
            _append(
                base.filter(
                    EcommerceItem.brand_id == ec.brand_id,
                    EcommerceItem.primary_category_id.in_(related_cat_ids),
                )
                .order_by(*order)
                .limit(limit)
                .all(),
            )

        return sorted(collected[:limit], key=lambda v: 0 if v.in_stock else 1)  # in stock first, order kept within

    def facets(
        self,
        *,
        category_id: Optional[str] = None,
        category_slug: Optional[str] = None,
        search: Optional[str] = None,
        brand_slugs: Optional[List[str]] = None,
        price_min_filter: Optional[Decimal] = None,
        price_max_filter: Optional[Decimal] = None,
        in_stock: Optional[bool] = None,
        attribute_filters: Optional[Dict[str, List[str]]] = None,
    ) -> Dict:
        """Brand list, price bounds, and filterable attribute options (category-scoped).

        Counts narrow with the active filters. A group never constrains itself, so
        the shopper can still see the other options inside the group they just used.
        """

        def scoped(
            *,
            skip_brands: bool = False,
            skip_price: bool = False,
            skip_attr_code: Optional[str] = None,
        ):
            attrs = dict(attribute_filters or {})
            if skip_attr_code:
                attrs.pop(skip_attr_code, None)
            return self._apply_filters(
                self._base_query(),
                search=search,
                category_id=category_id,
                category_slug=category_slug,
                brand_slugs=None if skip_brands else brand_slugs,
                price_min=None if skip_price else price_min_filter,
                price_max=None if skip_price else price_max_filter,
                in_stock=in_stock,
                attribute_filters=attrs,
            )

        price_min, price_max = (
            scoped(skip_price=True)
            .with_entities(
                func.min(EcommerceItem.selling_price),
                func.max(EcommerceItem.selling_price),
            )
            .first()
            or (None, None)
        )

        brand_query = scoped(skip_brands=True)
        brand_counts = dict(
            brand_query.with_entities(EcommerceItem.brand_id, func.count(EcommerceItem.item_id))
            .filter(EcommerceItem.brand_id.isnot(None))
            .group_by(EcommerceItem.brand_id)
            .all(),
        )
        brands = []
        if brand_counts:
            for brand in self._db.query(CatalogBrand).filter(CatalogBrand.id.in_(brand_counts.keys())).all():
                brands.append(
                    {
                        "id": brand.id,
                        "slug": brand.slug,
                        "name": brand.name,
                        "count": brand_counts.get(brand.id, 0),
                    },
                )
            brands.sort(key=lambda b: b["name"])

        # A group is counted against the other groups' filters only, so only the
        # groups that are filtered right now need their own product set; every
        # other group shares one. (Per-group queries made a 13k-product catalogue's
        # facets take ~20 s with ~80 filterable attributes.)
        id_sets: Dict[Optional[str], List[str]] = {}

        def product_ids_for(attr_code: str) -> List[str]:
            key = attr_code if attr_code in (attribute_filters or {}) else None
            if key not in id_sets:
                id_sets[key] = [
                    pid
                    for (pid,) in scoped(skip_attr_code=key)
                    .with_entities(EcommerceItem.catalog_product_id)
                    .filter(EcommerceItem.catalog_product_id.isnot(None))
                    .distinct()
                    .all()
                    if pid
                ]
            return id_sets[key]

        attributes = self._attribute_facets(product_ids_for)

        return {
            "brands": brands,
            "price_min": price_min if price_min is not None else Decimal("0"),
            "price_max": price_max if price_max is not None else Decimal("0"),
            "attributes": attributes,
        }

    def _attribute_facets(self, product_ids_for: Callable[[str], List[str]]) -> List[dict]:
        configured = (
            self._db.query(CatalogFilter)
            .filter(
                CatalogFilter.source == "attribute",
                CatalogFilter.attribute_id.isnot(None),
            )
            .order_by(CatalogFilter.sort_order.asc(), CatalogFilter.name.asc())
            .all()
        )
        attrs = (
            self._db.query(CatalogAttribute)
            .filter(
                CatalogAttribute.is_filterable.is_(True),
                CatalogAttribute.is_active.is_(True),
            )
            .order_by(CatalogAttribute.sort_order.asc(), CatalogAttribute.name.asc())
            .all()
        )
        # A filter is a code: the same spec can be an attribute in several product-type profiles,
        # and they share one facet. Its Catalog → Filters row (any of its attributes) sets the order
        # and visibility; without one, the attribute's storefront flag decides.
        code_of = {a.id: a.code for a in attrs}
        code_cfg: Dict[str, Tuple[bool, int, object]] = {}
        for row in configured:
            code = code_of.get(row.attribute_id or "")
            if code and code not in code_cfg:
                code_cfg[code] = (bool(row.is_active and row.storefront_visible), int(row.sort_order or 0), row)
        attrs = [
            a
            for a in attrs
            if code_cfg.get(a.code, (bool(getattr(a, "storefront_filter_visible", True)), 0, None))[0]
        ]
        attrs.sort(key=lambda a: (code_cfg.get(a.code, (True, 10_000 + (a.sort_order or 0), None))[1], a.name))
        if not attrs:
            return []

        # Values of every attribute that shares a product set, in one query per set.
        by_set: Dict[int, Tuple[List[str], List[str]]] = {}
        for attr in attrs:
            ids = product_ids_for(attr.code)
            by_set.setdefault(id(ids), (ids, []))[1].append(attr.id)
        values: Dict[str, List[Tuple[str, str]]] = {}
        for ids, attr_ids in by_set.values():
            if not ids:
                continue
            rows = (
                self._db.query(
                    CatalogProductAttributeValue.attribute_id,
                    CatalogProductAttributeValue.product_id,
                    CatalogProductAttributeValue.value,
                )
                .filter(
                    CatalogProductAttributeValue.attribute_id.in_(attr_ids),
                    CatalogProductAttributeValue.product_id.in_(ids),
                )
                .all()
            )
            for attr_id, product_id, value in rows:
                values.setdefault(attr_id, []).append((product_id, value))

        # one facet per code: every attribute with that code (one per product-type profile) feeds it
        members: Dict[str, List[CatalogAttribute]] = {}
        for attr in attrs:
            members.setdefault(attr.code, []).append(attr)

        out: List[dict] = []
        place: Dict[str, Tuple[int, str]] = {}
        for code, group in members.items():
            # the attribute of the product type this listing shows most of leads: its label, its place among
            # the filters (each type lists its own filters in its own order)
            lead = max(group, key=lambda a: len(values.get(a.id, [])))
            with_value = {pid for a in group for pid, v in values.get(a.id, []) if (v or "").strip()}
            listed = product_ids_for(code)
            # a filter only a few listed products carry (a keyboard filed under mice) is noise here
            if listed and len(with_value) < max(2, 0.10 * len(listed)):
                continue
            place[code] = (int(lead.sort_order or 0), lead.name)
            seen: Dict[str, set] = {}
            label_of: Dict[str, str] = {}
            for attr in group:
                for product_id, value in values.get(attr.id, []):
                    raw = (value or "").strip()
                    if not raw:
                        continue
                    for part in [p.strip() for p in raw.split(",") if p.strip()] or [raw]:
                        key = part.lower()
                        label_of.setdefault(key, part)
                        seen.setdefault(key, set()).add(product_id)

            # The filter's options are its attributes' options (filter values, plus every value an admin
            # saves on a product). Free spec text outside them stays a spec, not a filter choice; a filter
            # without options (dynamic) lists whatever products carry.
            predefined: List[str] = []
            # a code shared by product types (capacity: RAM, SSD, HDD) lists its options in the order of the type
            # this listing shows most of
            for attr in sorted(group, key=lambda a: -len(values.get(a.id, []))):
                for val in parse_json_list(attr.predefined_values):
                    if val.lower() not in {p.lower() for p in predefined}:
                        predefined.append(val)
            if predefined:
                ordered = [(v.lower(), v) for v in predefined]
            else:
                ordered = [(k, label_of[k]) for k in sorted(seen)]
            options = [
                {"value": val, "label": val.replace("_", " "), "count": len(seen[key])}
                for key, val in ordered
                if seen.get(key)
            ]

            cfg_row = code_cfg.get(code, (True, 0, None))[2]
            display_type = (cfg_row.display_type if cfg_row is not None and cfg_row.display_type else None) or (
                getattr(lead, "filter_display_type", None) or "multi_select"
            )
            if display_type == "boolean" and not options and seen:
                options = [
                    {"value": label_of[k], "label": label_of[k].replace("_", " "), "count": len(pids)}
                    for k, pids in sorted(seen.items())
                ]
            if not options and display_type not in ("range", "boolean"):
                continue
            if len(options) < 2 and display_type not in ("range", "boolean"):
                continue  # one choice is no choice
            if not options and display_type == "range":
                # Range still shown when numeric product values exist (options carry bounds).
                nums = []
                for key, pids in seen.items():
                    try:
                        nums.append((float("".join(ch for ch in key if ch.isdigit() or ch == ".")), len(pids)))
                    except ValueError:
                        continue
                if not nums:
                    continue
                lo = min(n for n, _ in nums)
                hi = max(n for n, _ in nums)
                options = [
                    {"value": str(lo), "label": "min", "count": sum(c for _, c in nums)},
                    {"value": str(hi), "label": "max", "count": sum(c for _, c in nums)},
                ]
            out.append(
                {
                    "id": lead.id,
                    "code": code,
                    "name": cfg_row.name if cfg_row is not None else lead.name,
                    "display_type": display_type,
                    "options": options,
                },
            )
        # each product type's filters in its own order (its Key Specifications order)
        out.sort(key=lambda f: place.get(f["code"], (10_000, "")))
        return out

    def filter_attributes_for_products(self, product_ids: List[str]) -> Dict[str, Dict[str, str]]:
        """Map catalog product id → { attribute_code: stored_value } for filterable attrs."""
        ids = [pid for pid in product_ids if pid]
        if not ids:
            return {}
        rows = (
            self._db.query(CatalogProductAttributeValue, CatalogAttribute)
            .join(
                CatalogAttribute,
                CatalogAttribute.id == CatalogProductAttributeValue.attribute_id,
            )
            .filter(
                CatalogProductAttributeValue.product_id.in_(ids),
                CatalogAttribute.is_filterable.is_(True),
                CatalogAttribute.is_active.is_(True),
            )
            .all()
        )
        out: Dict[str, Dict[str, str]] = {}
        for pav, attr in rows:
            value = (pav.value or "").strip()
            if not value:
                continue
            out.setdefault(pav.product_id, {})[attr.code] = value
        return out

    def all_attributes_for_products(self, product_ids: List[str]) -> Dict[str, Dict[str, str]]:
        """All stored spec values, including non-filterable fields used by PC Builder."""
        ids = [pid for pid in product_ids if pid]
        if not ids:
            return {}
        rows = (
            self._db.query(CatalogProductAttributeValue, CatalogAttribute)
            .join(
                CatalogAttribute,
                CatalogAttribute.id == CatalogProductAttributeValue.attribute_id,
            )
            .filter(
                CatalogProductAttributeValue.product_id.in_(ids),
                CatalogAttribute.is_active.is_(True),
            )
            .all()
        )
        out: Dict[str, Dict[str, str]] = {}
        for pav, attr in rows:
            value = (pav.value or "").strip()
            if not value:
                continue
            code = (attr.code or "").strip() or (attr.name or "").strip().lower().replace(" ", "_")
            if code:
                out.setdefault(pav.product_id, {})[code] = value
            label = (attr.name or "").strip().lower()
            if label and label != code:
                out.setdefault(pav.product_id, {})[label.replace(" ", "_")] = value
        return out

    def list_categories(self, channel: str = "dropshipping") -> List[dict]:
        """Active category tree for storefront nav (roots + children).

        channel: ``catalog`` (admin Catalog → Categories) or ``dropshipping``
        (frontstore / China tree). Live Edit Auto menu uses ``catalog``.
        """
        channel_key = channel if channel in ("catalog", "dropshipping") else "dropshipping"
        rows = (
            self._db.query(CatalogCategory)
            .filter(
                CatalogCategory.is_active.is_(True),
                CatalogCategory.channel == channel_key,
            )
            .order_by(CatalogCategory.sort_order.asc(), CatalogCategory.name.asc())
            .all()
        )
        by_parent: Dict[Optional[str], List[CatalogCategory]] = {}
        for row in rows:
            by_parent.setdefault(row.parent_id, []).append(row)

        def node(row: CatalogCategory) -> dict:
            children = [node(child) for child in by_parent.get(row.id, [])]
            return {
                "id": row.id,
                "slug": row.slug,
                "name": row.name,
                "parent_id": row.parent_id,
                "icon_url": row.icon_url,
                "banner_url": row.banner_url,
                "show_in_top_menu": row.show_in_top_menu,
                "china_search_keyword": row.china_search_keyword,
                "children": children,
            }

        return [node(row) for row in by_parent.get(None, [])]

    def list_brands(self, channel: str = "dropshipping") -> List[dict]:
        """Active brands for storefront brand strip / nav.

        channel: ``catalog`` (own-stock brands) or ``dropshipping`` (frontstore strip).
        """
        channel_key = channel if channel in ("catalog", "dropshipping") else "dropshipping"
        rows = (
            self._db.query(CatalogBrand)
            .filter(
                CatalogBrand.is_active.is_(True),
                CatalogBrand.channel == channel_key,
            )
            .order_by(CatalogBrand.sort_order.asc(), CatalogBrand.name.asc())
            .all()
        )
        return [
            {
                "id": row.id,
                "slug": row.slug,
                "name": row.name,
                "logo_url": row.logo_url,
            }
            for row in rows
        ]

    def resolve_slug(self, slug: str) -> Optional[dict]:
        """Resolve flat URL slug to entity type for Next.js routing."""
        normalized = slug.strip().lower()
        if not normalized:
            return None

        product = self.get_by_slug(normalized)
        if product:
            ec = self.get_ec_by_slug(normalized)
            return {
                "type": "product",
                "slug": normalized,
                "product": product,
                "seo_title": ec.seo_title if ec else None,
                "seo_description": ec.seo_description if ec else None,
            }

        from sqlalchemy import case

        # Prefer catalog channel (admin Catalog → Categories / menu) over dropshipping
        # when the same slug exists in both. Brand is last so /msi opens the MSI category.
        category = (
            self._db.query(CatalogCategory)
            .filter(
                CatalogCategory.slug == normalized,
                CatalogCategory.is_active.is_(True),
            )
            .order_by(
                case((CatalogCategory.channel == "catalog", 0), else_=1),
                CatalogCategory.sort_order.asc(),
            )
            .first()
        )
        if category:
            return {
                "type": "category",
                "slug": normalized,
                "category": {
                    "id": category.id,
                    "slug": category.slug,
                    "name": category.name,
                    "description": category.description,
                    "meta_title": category.meta_title,
                    "meta_description": category.meta_description,
                    "china_search_keyword": getattr(category, "china_search_keyword", None),
                    "parent_id": category.parent_id,
                    "show_price_comparison": bool(
                        getattr(category, "show_price_comparison", True)
                    ),
                },
            }

        brand = (
            self._db.query(CatalogBrand)
            .filter(CatalogBrand.slug == normalized, CatalogBrand.is_active.is_(True))
            .first()
        )
        if brand:
            return {
                "type": "brand",
                "slug": normalized,
                "brand": {
                    "id": brand.id,
                    "slug": brand.slug,
                    "name": brand.name,
                    "description": brand.description,
                    "meta_title": brand.meta_title,
                    "meta_description": brand.meta_description,
                    "logo_url": brand.logo_url,
                },
            }

        return None
