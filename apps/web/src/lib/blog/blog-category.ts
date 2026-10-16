export type BlogCategoryStatus = "active" | "inactive";

export type BlogCategoryRelatedArticle = {
  postId: string;
  postTitle: string;
  postSlug: string;
  sortOrder: number;
};

export type BlogCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: BlogCategoryStatus;
  sortOrder: number;
  parentId: string | null;
  coverImageUrl: string | null;
  seoTitle: string;
  seoDescription: string;
  relatedArticleIds: string[];
  articleCount: number;
  createdAt: string;
  updatedAt: string;
};
