import type { Brand } from "@/lib/mock-data/brands";
import type { Category } from "@/lib/mock-data/categories";
import type { CmsPage } from "@/lib/mock-data/cms-pages";
import type { Product } from "@/lib/mock-data/products";

export type StorefrontSlugEntityType = "category" | "product" | "brand" | "page";

export type ResolvedStorefrontSlug =
  | { type: "category"; slug: string; category: Category }
  | { type: "product"; slug: string; product: Product }
  | { type: "brand"; slug: string; brand: Brand }
  | { type: "page"; slug: string; page: CmsPage };
