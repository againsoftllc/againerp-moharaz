from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BlogCategoryPost(Base):
    """Related blog articles linked to a category."""

    __tablename__ = "blog_category_posts"
    __table_args__ = (UniqueConstraint("category_id", "post_id", name="uq_blog_category_post"),)

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    category_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("blog_categories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    post_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("blog_posts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    category: Mapped["BlogCategory"] = relationship("BlogCategory", back_populates="related_posts")
    post: Mapped["BlogPost"] = relationship("BlogPost")
