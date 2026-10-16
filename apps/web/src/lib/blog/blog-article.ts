export type BlogArticleStatus = "draft" | "published" | "archived";

export type BlogRelatedProduct = {
  productId: string;
  productName: string;
  productSlug: string;
  sortOrder: number;
};

export type BlogArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  status: BlogArticleStatus;
  categoryId: string | null;
  categoryName: string;
  authorName: string;
  coverImageUrl: string | null;
  seoTitle: string;
  seoDescription: string;
  relatedProductCount: number;
  relatedProducts: BlogRelatedProduct[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
