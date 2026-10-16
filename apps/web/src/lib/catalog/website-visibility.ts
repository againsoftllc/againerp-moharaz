import { categoriesFlat } from "@/lib/mock-data/categories";
import type { Category } from "@/lib/mock-data/categories";
import type { Product, ProductStatus, ProductVisibility } from "@/lib/mock-data/products";

export type WebsiteBlockReason =
  | "not_published"
  | "private_visibility"
  | "inactive_category"
  | "archived";

export type WebsiteVisibilityResult = {
  onWebsite: boolean;
  reason?: WebsiteBlockReason;
};

function categoryActiveMap(categories?: Category[]) {
  const source = categories ?? categoriesFlat;
  return new Map(source.map((c) => [c.name, c.active] as const));
}

export function getProductVisibility(product: Product): ProductVisibility {
  return product.visibility ?? "public";
}

export function isCategoryActiveForProduct(categoryName: string, categories?: Category[]): boolean {
  const active = categoryActiveMap(categories).get(categoryName);
  return active !== false;
}

export function getWebsiteVisibility(product: Product, categories?: Category[]): WebsiteVisibilityResult {
  if (product.status === "archived") {
    return { onWebsite: false, reason: "archived" };
  }
  if (product.status !== "published") {
    return { onWebsite: false, reason: "not_published" };
  }
  if (getProductVisibility(product) !== "public") {
    return { onWebsite: false, reason: "private_visibility" };
  }
  if (!isCategoryActiveForProduct(product.category, categories)) {
    return { onWebsite: false, reason: "inactive_category" };
  }
  return { onWebsite: true };
}

export function isProductOnWebsite(product: Product, categories?: Category[]): boolean {
  return getWebsiteVisibility(product, categories).onWebsite;
}

export function websiteBlockReasonLabel(reason: WebsiteBlockReason): string {
  switch (reason) {
    case "not_published":
      return "Not published";
    case "private_visibility":
      return "Private visibility";
    case "inactive_category":
      return "Category inactive";
    case "archived":
      return "Archived";
  }
}

export function publishProductToWebsite<T extends Product>(product: T): T {
  return {
    ...product,
    status: "published" satisfies ProductStatus,
    visibility: "public",
  };
}

export function removeProductFromWebsite<T extends Product>(product: T): T {
  if (product.status === "archived") return product;
  return {
    ...product,
    status: "draft",
    visibility: "private",
  };
}
