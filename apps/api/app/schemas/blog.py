from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

BlogArticleStatus = Literal["draft", "published", "archived"]
BlogCategoryStatus = Literal["active", "inactive"]


class BlogRelatedProductRead(BaseModel):
    product_id: str
    product_name: str
    product_slug: str
    sort_order: int = 0


class BlogArticleBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=255)
    excerpt: Optional[str] = None
    content: Optional[str] = None
    status: BlogArticleStatus = "draft"
    category_id: Optional[str] = None
    category_name: Optional[str] = Field(default=None, max_length=120)
    author_name: Optional[str] = Field(default=None, max_length=120)
    cover_image_url: Optional[str] = Field(default=None, max_length=500)
    seo_title: Optional[str] = Field(default=None, max_length=255)
    seo_description: Optional[str] = None


class BlogArticleCreate(BlogArticleBase):
    related_product_ids: List[str] = Field(default_factory=list)


class BlogArticleUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=255)
    excerpt: Optional[str] = None
    content: Optional[str] = None
    status: Optional[BlogArticleStatus] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = Field(default=None, max_length=120)
    author_name: Optional[str] = Field(default=None, max_length=120)
    cover_image_url: Optional[str] = Field(default=None, max_length=500)
    seo_title: Optional[str] = Field(default=None, max_length=255)
    seo_description: Optional[str] = None
    related_product_ids: Optional[List[str]] = None


class BlogArticleRead(BlogArticleBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    category_id: Optional[str] = None
    related_product_count: int = 0
    related_products: List[BlogRelatedProductRead] = Field(default_factory=list)
    published_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class BlogArticleListMeta(BaseModel):
    count: int


class BlogArticleListResponse(BaseModel):
    data: List[BlogArticleRead]
    meta: BlogArticleListMeta
    errors: List[str] = []


class BlogArticleResponse(BaseModel):
    data: BlogArticleRead
    errors: List[str] = []


class BlogCategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str = Field(min_length=1, max_length=120)
    description: Optional[str] = None
    status: BlogCategoryStatus = "active"
    sort_order: int = Field(default=0, ge=0)
    parent_id: Optional[str] = None
    cover_image_url: Optional[str] = Field(default=None, max_length=500)
    seo_title: Optional[str] = Field(default=None, max_length=255)
    seo_description: Optional[str] = None


class BlogCategoryCreate(BlogCategoryBase):
    related_article_ids: List[str] = Field(default_factory=list)


class BlogCategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    slug: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = None
    status: Optional[BlogCategoryStatus] = None
    sort_order: Optional[int] = Field(default=None, ge=0)
    parent_id: Optional[str] = None
    cover_image_url: Optional[str] = Field(default=None, max_length=500)
    seo_title: Optional[str] = Field(default=None, max_length=255)
    seo_description: Optional[str] = None
    related_article_ids: Optional[List[str]] = None


class BlogRelatedArticleRead(BaseModel):
    post_id: str
    post_title: str
    post_slug: str
    sort_order: int = 0


class BlogCategoryRead(BlogCategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    article_count: int = 0
    related_article_count: int = 0
    related_articles: List[BlogRelatedArticleRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class BlogCategoryListMeta(BaseModel):
    count: int


class BlogCategoryListResponse(BaseModel):
    data: List[BlogCategoryRead]
    meta: BlogCategoryListMeta
    errors: List[str] = []


class BlogCategoryResponse(BaseModel):
    data: BlogCategoryRead
    errors: List[str] = []


BlogCommentStatus = Literal["pending", "approved", "rejected", "spam"]


class BlogCommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    post_id: str
    article_title: str
    author_name: str
    author_email: Optional[str] = None
    body: str
    status: BlogCommentStatus
    parent_id: Optional[str] = None
    moderated_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class BlogCommentUpdate(BaseModel):
    status: Optional[BlogCommentStatus] = None
    moderated_by: Optional[str] = Field(default=None, max_length=120)


class BlogCommentListMeta(BaseModel):
    count: int
    pending_count: int = 0


class BlogCommentListResponse(BaseModel):
    data: List[BlogCommentRead]
    meta: BlogCommentListMeta
    errors: List[str] = []


class BlogCommentResponse(BaseModel):
    data: BlogCommentRead
    errors: List[str] = []


class BlogSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    enabled: bool
    posts_per_page: int
    comments_enabled: bool
    moderate_comments: bool
    rss_enabled: bool
    rss_items_limit: int
    default_author: str
    show_related_products: bool
    seo_index_blog: bool
    blog_base_slug: str
    created_at: datetime
    updated_at: datetime


class BlogSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    posts_per_page: Optional[int] = Field(default=None, ge=1, le=100)
    comments_enabled: Optional[bool] = None
    moderate_comments: Optional[bool] = None
    rss_enabled: Optional[bool] = None
    rss_items_limit: Optional[int] = Field(default=None, ge=1, le=100)
    default_author: Optional[str] = Field(default=None, max_length=120)
    show_related_products: Optional[bool] = None
    seo_index_blog: Optional[bool] = None
    blog_base_slug: Optional[str] = Field(default=None, min_length=1, max_length=80)


class BlogSettingsResponse(BaseModel):
    data: BlogSettingsRead
    errors: List[str] = []
