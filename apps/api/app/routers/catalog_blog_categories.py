from __future__ import annotations

from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.blog_category import BlogCategory
from app.models.blog_category_post import BlogCategoryPost
from app.models.blog_post import BlogPost
from app.schemas.blog import (
    BlogCategoryCreate,
    BlogCategoryListMeta,
    BlogCategoryListResponse,
    BlogCategoryRead,
    BlogCategoryResponse,
    BlogCategoryUpdate,
    BlogRelatedArticleRead,
)

router = APIRouter(prefix="/blog/categories", tags=["catalog-blog"])


def _article_counts(db: Session) -> Dict[str, int]:
    rows = (
        db.query(BlogPost.category_id, func.count(BlogPost.id))
        .filter(BlogPost.category_id.isnot(None))
        .group_by(BlogPost.category_id)
        .all()
    )
    return {category_id: count for category_id, count in rows}


def _validate_parent(db: Session, category_id: str | None, parent_id: str | None) -> None:
    if parent_id is None:
        return
    if parent_id == "":
        return
    if category_id and parent_id == category_id:
        raise HTTPException(status_code=400, detail="Category cannot be its own parent")
    parent = db.get(BlogCategory, parent_id)
    if not parent:
        raise HTTPException(status_code=400, detail="Unknown parent category id")


def _related_articles(db: Session, category: BlogCategory) -> List[BlogRelatedArticleRead]:
    if not category.related_posts:
        return []
    post_ids = [link.post_id for link in category.related_posts]
    posts = db.query(BlogPost).filter(BlogPost.id.in_(post_ids)).all()
    post_map = {post.id: post for post in posts}
    rows: List[BlogRelatedArticleRead] = []
    for link in category.related_posts:
        post = post_map.get(link.post_id)
        if not post:
            continue
        rows.append(
            BlogRelatedArticleRead(
                post_id=post.id,
                post_title=post.title,
                post_slug=post.slug,
                sort_order=link.sort_order,
            )
        )
    return rows


def _to_read(
    db: Session,
    row: BlogCategory,
    counts: Dict[str, int],
    include_related: bool = False,
) -> BlogCategoryRead:
    related = _related_articles(db, row) if include_related else []
    return BlogCategoryRead(
        id=row.id,
        company_id=row.company_id,
        name=row.name,
        slug=row.slug,
        description=row.description,
        status=row.status,
        sort_order=row.sort_order,
        parent_id=row.parent_id,
        cover_image_url=row.cover_image_url,
        seo_title=row.seo_title,
        seo_description=row.seo_description,
        article_count=counts.get(row.id, 0),
        related_article_count=len(row.related_posts or []),
        related_articles=related,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _sync_related_articles(db: Session, category: BlogCategory, post_ids: List[str]) -> None:
    unique_ids: list[str] = []
    for post_id in post_ids:
        if post_id not in unique_ids:
            unique_ids.append(post_id)

    if unique_ids:
        existing = {row.id for row in db.query(BlogPost.id).filter(BlogPost.id.in_(unique_ids)).all()}
        missing = [pid for pid in unique_ids if pid not in existing]
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown article ids: {', '.join(missing)}")

    category.related_posts.clear()
    for index, post_id in enumerate(unique_ids):
        category.related_posts.append(
            BlogCategoryPost(category_id=category.id, post_id=post_id, sort_order=index)
        )


@router.get("", response_model=BlogCategoryListResponse)
def list_categories(db: Session = Depends(get_db)) -> BlogCategoryListResponse:
    rows = (
        db.query(BlogCategory)
        .options(joinedload(BlogCategory.related_posts))
        .order_by(BlogCategory.sort_order, BlogCategory.name)
        .all()
    )
    counts = _article_counts(db)
    data = [_to_read(db, row, counts) for row in rows]
    return BlogCategoryListResponse(data=data, meta=BlogCategoryListMeta(count=len(data)))


@router.get("/{category_id}", response_model=BlogCategoryResponse)
def get_category(category_id: str, db: Session = Depends(get_db)) -> BlogCategoryResponse:
    row = (
        db.query(BlogCategory)
        .options(joinedload(BlogCategory.related_posts))
        .filter(BlogCategory.id == category_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")
    counts = _article_counts(db)
    return BlogCategoryResponse(data=_to_read(db, row, counts, include_related=True))


@router.post("", response_model=BlogCategoryResponse, status_code=201)
def create_category(
    payload: BlogCategoryCreate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> BlogCategoryResponse:
    existing = db.query(BlogCategory).filter(BlogCategory.slug == payload.slug).first()
    if existing:
        raise HTTPException(status_code=409, detail="Category slug already exists")

    _validate_parent(db, None, payload.parent_id)

    data = payload.model_dump(exclude={"related_article_ids"})
    row = BlogCategory(**data)
    db.add(row)
    db.flush()
    _sync_related_articles(db, row, payload.related_article_ids)
    db.commit()
    db.refresh(row)
    return BlogCategoryResponse(data=_to_read(db, row, {}, include_related=True))


@router.patch("/{category_id}", response_model=BlogCategoryResponse)
def update_category(
    category_id: str,
    payload: BlogCategoryUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> BlogCategoryResponse:
    row = (
        db.query(BlogCategory)
        .options(joinedload(BlogCategory.related_posts))
        .filter(BlogCategory.id == category_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")

    changes = payload.model_dump(exclude_unset=True)
    related_article_ids = changes.pop("related_article_ids", None)
    parent_id = changes.pop("parent_id", None)

    if not changes and related_article_ids is None and parent_id is None:
        counts = _article_counts(db)
        return BlogCategoryResponse(data=_to_read(db, row, counts, include_related=True))

    if parent_id is not None:
        _validate_parent(db, category_id, parent_id)
        row.parent_id = parent_id if parent_id else None

    slug = changes.get("slug", row.slug)
    if slug != row.slug:
        conflict = (
            db.query(BlogCategory)
            .filter(BlogCategory.slug == slug, BlogCategory.id != category_id)
            .first()
        )
        if conflict:
            raise HTTPException(status_code=409, detail="Category slug already exists")

    for key, value in changes.items():
        setattr(row, key, value)

    if "name" in changes:
        (
            db.query(BlogPost)
            .filter(BlogPost.category_id == category_id)
            .update({BlogPost.category_name: changes["name"]}, synchronize_session=False)
        )

    if related_article_ids is not None:
        _sync_related_articles(db, row, related_article_ids)

    db.commit()
    db.refresh(row)
    counts = _article_counts(db)
    return BlogCategoryResponse(data=_to_read(db, row, counts, include_related=True))
