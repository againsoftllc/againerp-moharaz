from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.blog_post import BlogPost
from app.models.blog_post_product import BlogPostProduct
from app.models.blog_category import BlogCategory
from app.models.catalog_product import CatalogProduct
from app.schemas.blog import (
    BlogArticleCreate,
    BlogArticleListMeta,
    BlogArticleListResponse,
    BlogArticleRead,
    BlogArticleResponse,
    BlogArticleUpdate,
    BlogRelatedProductRead,
)

router = APIRouter(prefix="/blog/articles", tags=["catalog-blog"])


def _apply_category(db: Session, post: BlogPost, category_id: str | None) -> None:
    if category_id is None:
        return
    if category_id == "":
        post.category_id = None
        post.category_name = None
        return
    category = db.get(BlogCategory, category_id)
    if not category:
        raise HTTPException(status_code=400, detail="Unknown category id")
    post.category_id = category.id
    post.category_name = category.name


def _related_products(db: Session, post: BlogPost) -> List[BlogRelatedProductRead]:
    if not post.related_products:
        return []
    product_ids = [link.product_id for link in post.related_products]
    products = db.query(CatalogProduct).filter(CatalogProduct.id.in_(product_ids)).all()
    product_map = {p.id: p for p in products}
    rows: List[BlogRelatedProductRead] = []
    for link in post.related_products:
        product = product_map.get(link.product_id)
        if not product:
            continue
        rows.append(
            BlogRelatedProductRead(
                product_id=product.id,
                product_name=product.name,
                product_slug=product.slug,
                sort_order=link.sort_order,
            )
        )
    return rows


def _to_read(db: Session, post: BlogPost, include_products: bool = False) -> BlogArticleRead:
    related = _related_products(db, post) if include_products else []
    return BlogArticleRead(
        id=post.id,
        company_id=post.company_id,
        title=post.title,
        slug=post.slug,
        excerpt=post.excerpt,
        content=post.content,
        status=post.status,
        category_id=post.category_id,
        category_name=post.category_name,
        author_name=post.author_name,
        cover_image_url=post.cover_image_url,
        seo_title=post.seo_title,
        seo_description=post.seo_description,
        related_product_count=len(post.related_products or []),
        related_products=related,
        published_at=post.published_at,
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


def _sync_related_products(db: Session, post: BlogPost, product_ids: List[str]) -> None:
    unique_ids: list[str] = []
    for product_id in product_ids:
        if product_id not in unique_ids:
            unique_ids.append(product_id)

    if unique_ids:
        existing = {
            row.id
            for row in db.query(CatalogProduct.id).filter(CatalogProduct.id.in_(unique_ids)).all()
        }
        missing = [pid for pid in unique_ids if pid not in existing]
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown product ids: {', '.join(missing)}")

    post.related_products.clear()
    for index, product_id in enumerate(unique_ids):
        post.related_products.append(
            BlogPostProduct(post_id=post.id, product_id=product_id, sort_order=index)
        )


@router.get("", response_model=BlogArticleListResponse)
def list_articles(db: Session = Depends(get_db)) -> BlogArticleListResponse:
    rows = (
        db.query(BlogPost)
        .options(joinedload(BlogPost.related_products))
        .order_by(BlogPost.published_at.desc().nulls_last(), BlogPost.created_at.desc())
        .all()
    )
    data = [_to_read(db, row) for row in rows]
    return BlogArticleListResponse(data=data, meta=BlogArticleListMeta(count=len(data)))


@router.get("/{article_id}", response_model=BlogArticleResponse)
def get_article(article_id: str, db: Session = Depends(get_db)) -> BlogArticleResponse:
    row = (
        db.query(BlogPost)
        .options(joinedload(BlogPost.related_products))
        .filter(BlogPost.id == article_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")
    return BlogArticleResponse(data=_to_read(db, row, include_products=True))


@router.post("", response_model=BlogArticleResponse, status_code=201)
def create_article(
    payload: BlogArticleCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> BlogArticleResponse:
    existing = db.query(BlogPost).filter(BlogPost.slug == payload.slug).first()
    if existing:
        raise HTTPException(status_code=409, detail="Article slug already exists")

    row = BlogPost(
        title=payload.title,
        slug=payload.slug,
        excerpt=payload.excerpt,
        content=payload.content,
        status=payload.status,
        category_id=payload.category_id,
        category_name=payload.category_name,
        author_name=payload.author_name,
        cover_image_url=payload.cover_image_url,
        seo_title=payload.seo_title,
        seo_description=payload.seo_description,
        published_at=datetime.now(timezone.utc).replace(tzinfo=None)
        if payload.status == "published"
        else None,
    )
    db.add(row)
    db.flush()
    if payload.category_id is not None:
        _apply_category(db, row, payload.category_id)
    _sync_related_products(db, row, payload.related_product_ids)
    db.commit()
    db.refresh(row)
    return BlogArticleResponse(data=_to_read(db, row, include_products=True))


@router.patch("/{article_id}", response_model=BlogArticleResponse)
def update_article(
    article_id: str,
    payload: BlogArticleUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> BlogArticleResponse:
    row = (
        db.query(BlogPost)
        .options(joinedload(BlogPost.related_products))
        .filter(BlogPost.id == article_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")

    changes = payload.model_dump(exclude_unset=True)
    related_product_ids = changes.pop("related_product_ids", None)
    category_id = changes.pop("category_id", None)

    if not changes and related_product_ids is None and category_id is None:
        return BlogArticleResponse(data=_to_read(db, row, include_products=True))

    slug = changes.get("slug", row.slug)
    if slug != row.slug:
        conflict = db.query(BlogPost).filter(BlogPost.slug == slug, BlogPost.id != article_id).first()
        if conflict:
            raise HTTPException(status_code=409, detail="Article slug already exists")

    for key, value in changes.items():
        setattr(row, key, value)

    if category_id is not None:
        _apply_category(db, row, category_id)

    if "status" in changes:
        if changes["status"] == "published" and not row.published_at:
            row.published_at = datetime.now(timezone.utc).replace(tzinfo=None)
        if changes["status"] == "draft":
            row.published_at = None

    if related_product_ids is not None:
        _sync_related_products(db, row, related_product_ids)

    db.commit()
    db.refresh(row)
    return BlogArticleResponse(data=_to_read(db, row, include_products=True))
