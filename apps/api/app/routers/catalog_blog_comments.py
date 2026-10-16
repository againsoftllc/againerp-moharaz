from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_write_access
from app.models.blog_comment import BlogComment
from app.schemas.blog import (
    BlogCommentListMeta,
    BlogCommentListResponse,
    BlogCommentRead,
    BlogCommentResponse,
    BlogCommentUpdate,
)

router = APIRouter(prefix="/blog/comments", tags=["catalog-blog"])


def _to_read(row: BlogComment) -> BlogCommentRead:
    return BlogCommentRead.model_validate(row)


@router.get("", response_model=BlogCommentListResponse)
def list_comments(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
) -> BlogCommentListResponse:
    query = db.query(BlogComment).order_by(BlogComment.created_at.desc())

    if status:
        query = query.filter(BlogComment.status == status)
    if search:
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            BlogComment.article_title.ilike(term)
            | BlogComment.author_name.ilike(term)
            | BlogComment.author_email.ilike(term)
            | BlogComment.body.ilike(term),
        )

    rows = query.all()
    data = [_to_read(row) for row in rows]
    pending = sum(1 for row in rows if row.status == "pending")
    return BlogCommentListResponse(
        data=data,
        meta=BlogCommentListMeta(count=len(data), pending_count=pending),
    )


@router.get("/{comment_id}", response_model=BlogCommentResponse)
def get_comment(comment_id: str, db: Session = Depends(get_db)) -> BlogCommentResponse:
    row = db.get(BlogComment, comment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Comment not found")
    return BlogCommentResponse(data=_to_read(row))


@router.patch("/{comment_id}", response_model=BlogCommentResponse)
def update_comment(
    comment_id: str,
    payload: BlogCommentUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(require_write_access),
) -> BlogCommentResponse:
    row = db.get(BlogComment, comment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Comment not found")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return BlogCommentResponse(data=_to_read(row))

    for key, value in updates.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return BlogCommentResponse(data=_to_read(row))
