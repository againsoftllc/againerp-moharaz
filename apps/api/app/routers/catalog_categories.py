from __future__ import annotations

import uuid
from typing import Dict, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps.auth import require_write_access
from app.database import get_db
from app.models.catalog_category import CatalogCategory
from app.models.catalog_product import CatalogProduct
from app.schemas.category import (
    CategoryCreate,
    CategoryListMeta,
    CategoryListResponse,
    CategoryRead,
    CategoryReorderRequest,
    CategoryResponse,
    CategoryTreeNode,
    CategoryTreeResponse,
    CategoryUpdate,
)

router = APIRouter(prefix="/categories", tags=["catalog-categories"])


def _product_counts_by_name(db: Session) -> Dict[str, int]:
    rows = (
        db.query(CatalogProduct.category, CatalogProduct.id)
        .filter(CatalogProduct.category.isnot(None))
        .all()
    )
    counts: Dict[str, int] = {}
    for name, _ in rows:
        if name:
            counts[name] = counts.get(name, 0) + 1
    return counts


def _to_read(row: CatalogCategory, product_counts: Dict[str, int]) -> CategoryRead:
    data = CategoryRead.model_validate(row)
    data.product_count = product_counts.get(row.name, 0)
    return data


def _validate_parent(
    db: Session,
    category_id: Optional[str],
    parent_id: Optional[str],
    *,
    channel: Optional[str] = None,
) -> Optional[CatalogCategory]:
    if parent_id is None:
        return None

    if category_id and parent_id == category_id:
        raise HTTPException(status_code=400, detail="Category cannot be its own parent")

    parent = db.get(CatalogCategory, parent_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Parent category not found")

    if channel and parent.channel != channel:
        raise HTTPException(
            status_code=400,
            detail="Parent category must be in the same channel",
        )

    if category_id:
        current = db.get(CatalogCategory, category_id)
        if current and current.path.startswith(f"{parent.path}{category_id}/"):
            raise HTTPException(status_code=400, detail="Cannot move category under its descendant")

    return parent


def _apply_path_depth(row: CatalogCategory, parent: Optional[CatalogCategory]) -> None:
    if parent:
        row.parent_id = parent.id
        row.depth = parent.depth + 1
        row.path = f"{parent.path}{row.id}/"
    else:
        row.parent_id = None
        row.depth = 0
        row.path = f"/{row.id}/"


def _refresh_descendant_paths(db: Session, row: CatalogCategory) -> None:
    children = db.query(CatalogCategory).filter(CatalogCategory.parent_id == row.id).all()
    for child in children:
        child.depth = row.depth + 1
        child.path = f"{row.path}{child.id}/"
        _refresh_descendant_paths(db, child)


def _next_sort_order(db: Session, parent_id: Optional[str]) -> int:
    query = db.query(CatalogCategory.sort_order).filter(
        CatalogCategory.parent_id == parent_id,
    )
    max_order = query.order_by(CatalogCategory.sort_order.desc()).first()
    return (max_order[0] + 1) if max_order else 0


def _collect_descendant_ids(db: Session, root_ids: List[str]) -> Set[str]:
    to_delete: Set[str] = set()
    queue = list(root_ids)
    while queue:
        current = queue.pop()
        if current in to_delete:
            continue
        to_delete.add(current)
        children = (
            db.query(CatalogCategory.id)
            .filter(CatalogCategory.parent_id == current)
            .all()
        )
        queue.extend(child[0] for child in children)
    return to_delete


def _build_tree(rows: List[CategoryRead]) -> List[CategoryTreeNode]:
    nodes: Dict[str, CategoryTreeNode] = {}
    for row in rows:
        nodes[row.id] = CategoryTreeNode(**row.model_dump(), children=[])

    roots: List[CategoryTreeNode] = []
    for node in nodes.values():
        if node.parent_id and node.parent_id in nodes:
            nodes[node.parent_id].children.append(node)
        else:
            roots.append(node)

    def sort_children(node: CategoryTreeNode) -> None:
        node.children.sort(key=lambda c: c.sort_order)
        for child in node.children:
            sort_children(child)

    roots.sort(key=lambda c: c.sort_order)
    for root in roots:
        sort_children(root)
    return roots


@router.get("", response_model=CategoryListResponse)
def list_categories(
    db: Session = Depends(get_db),
    channel: Optional[str] = Query(
        default=None,
        pattern="^(catalog|dropshipping)$",
        description="Filter Catalog vs Dropshipping (frontstore) category trees",
    ),
) -> CategoryListResponse:
    query = db.query(CatalogCategory)
    if channel:
        query = query.filter(CatalogCategory.channel == channel)
    rows = query.order_by(CatalogCategory.path, CatalogCategory.sort_order).all()
    product_counts = _product_counts_by_name(db)
    data = [_to_read(r, product_counts) for r in rows]
    return CategoryListResponse(data=data, meta=CategoryListMeta(count=len(data)))


@router.get("/tree", response_model=CategoryTreeResponse)
def category_tree(
    db: Session = Depends(get_db),
    channel: Optional[str] = Query(
        default=None,
        pattern="^(catalog|dropshipping)$",
    ),
) -> CategoryTreeResponse:
    query = db.query(CatalogCategory)
    if channel:
        query = query.filter(CatalogCategory.channel == channel)
    rows = query.order_by(CatalogCategory.path, CatalogCategory.sort_order).all()
    product_counts = _product_counts_by_name(db)
    flat = [_to_read(r, product_counts) for r in rows]
    return CategoryTreeResponse(data=_build_tree(flat))


@router.patch("/reorder", response_model=CategoryListResponse)
def reorder_categories(
    payload: CategoryReorderRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> CategoryListResponse:
    rows = (
        db.query(CatalogCategory)
        .filter(CatalogCategory.parent_id == payload.parent_id)
        .all()
    )
    row_map = {r.id: r for r in rows}

    if set(payload.ordered_ids) != set(row_map.keys()):
        raise HTTPException(status_code=400, detail="ordered_ids must match sibling categories")

    for index, category_id in enumerate(payload.ordered_ids):
        row_map[category_id].sort_order = index

    db.commit()

    all_rows = db.query(CatalogCategory).order_by(CatalogCategory.path, CatalogCategory.sort_order).all()
    product_counts = _product_counts_by_name(db)
    data = [_to_read(r, product_counts) for r in all_rows]
    return CategoryListResponse(data=data, meta=CategoryListMeta(count=len(data)))


@router.get("/{category_id}", response_model=CategoryResponse)
def get_category(category_id: str, db: Session = Depends(get_db)) -> CategoryResponse:
    row = db.get(CatalogCategory, category_id)
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")
    product_counts = _product_counts_by_name(db)
    return CategoryResponse(data=_to_read(row, product_counts))


@router.post("", response_model=CategoryResponse, status_code=201)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> CategoryResponse:
    new_id = str(uuid.uuid4())
    slug = (payload.slug or "").strip() or new_id
    existing = db.query(CatalogCategory).filter(CatalogCategory.slug == slug).first()
    if existing:
        raise HTTPException(status_code=409, detail="Category slug already exists")

    parent = _validate_parent(
        db,
        None,
        payload.parent_id,
        channel=payload.channel or "catalog",
    )
    row = CatalogCategory(
        id=new_id,
        name=payload.name,
        caption=payload.caption or payload.name,
        slug=slug,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
        show_in_top_menu=payload.show_in_top_menu,
        description=payload.description,
        meta_title=payload.meta_title,
        meta_description=payload.meta_description,
        meta_keywords=payload.meta_keywords,
        show_price_comparison=payload.show_price_comparison,
        icon_url=payload.icon_url,
        banner_url=payload.banner_url,
        icon_media_id=payload.icon_media_id,
        banner_media_id=payload.banner_media_id,
        china_search_keyword=(payload.china_search_keyword or None),
        channel=payload.channel or "catalog",
    )
    db.add(row)
    db.flush()

    if payload.sort_order == 0:
        row.sort_order = _next_sort_order(db, parent.id if parent else None)

    _apply_path_depth(row, parent)
    db.commit()
    db.refresh(row)

    product_counts = _product_counts_by_name(db)
    return CategoryResponse(data=_to_read(row, product_counts))


@router.patch("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: str,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> CategoryResponse:
    row = db.get(CatalogCategory, category_id)
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        product_counts = _product_counts_by_name(db)
        return CategoryResponse(data=_to_read(row, product_counts))

    slug = changes.get("slug", row.slug)
    if slug != row.slug:
        conflict = (
            db.query(CatalogCategory)
            .filter(CatalogCategory.slug == slug, CatalogCategory.id != category_id)
            .first()
        )
        if conflict:
            raise HTTPException(status_code=409, detail="Category slug already exists")

    parent_changed = "parent_id" in changes and changes["parent_id"] != row.parent_id
    if parent_changed:
        next_channel = changes.get("channel", row.channel)
        parent = _validate_parent(db, category_id, changes["parent_id"], channel=next_channel)
        _apply_path_depth(row, parent)
        _refresh_descendant_paths(db, row)

    for key, value in changes.items():
        if key == "parent_id":
            continue
        setattr(row, key, value)

    db.commit()
    db.refresh(row)

    product_counts = _product_counts_by_name(db)
    return CategoryResponse(data=_to_read(row, product_counts))


@router.delete("/{category_id}", status_code=204)
def delete_category(
    category_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> None:
    row = db.get(CatalogCategory, category_id)
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")

    ids = _collect_descendant_ids(db, [category_id])
    db.query(CatalogCategory).filter(CatalogCategory.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
