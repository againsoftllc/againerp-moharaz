import type {
  WebsiteManagedPage,
  WebsitePageFilterState,
  WebsitePageLanguage,
  WebsitePageStatus,
  WebsitePageType,
  WebsitePageVisibility,
} from "@/lib/website/pages/types";

export type WebsitePagesListFilters = WebsitePageFilterState & {
  status: WebsitePageStatus | "all";
  pageType: WebsitePageType | "all";
  visibility: WebsitePageVisibility | "all";
};

export const DEFAULT_WEBSITE_PAGES_FILTERS: WebsitePagesListFilters = {
  search: "",
  category: "all",
  language: "all",
  author: "all",
  status: "all",
  pageType: "all",
  visibility: "all",
};

export function countAdvancedPageFilters(f: WebsitePagesListFilters) {
  let n = 0;
  if (f.language !== "all") n++;
  if (f.author !== "all") n++;
  if (f.visibility !== "all") n++;
  if (f.category !== "all") n++;
  return n;
}

export function filterWebsitePages(
  pages: WebsiteManagedPage[],
  filters: WebsitePagesListFilters,
): WebsiteManagedPage[] {
  const q = filters.search.trim().toLowerCase();

  return pages.filter((page) => {
    if (q) {
      const haystack =
        `${page.name} ${page.slug} ${page.url} ${page.template} ${page.description}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    if (filters.status !== "all" && page.status !== filters.status) return false;
    if (filters.pageType !== "all" && page.pageType !== filters.pageType) return false;
    if (filters.visibility !== "all" && page.visibility !== filters.visibility) return false;
    if (filters.language !== "all" && page.language !== filters.language) return false;
    if (filters.author !== "all" && page.updatedBy !== filters.author) return false;

    switch (filters.category) {
      case "all":
        return true;
      case "website":
        return page.pageType === "website" || page.pageType === "custom";
      case "ecommerce":
        return ["category", "brand", "product_listing"].includes(page.pageType);
      case "landing":
        return page.pageType === "landing";
      case "system":
        return page.flags.isSystem;
      case "blog":
        return page.pageType === "blog";
      case "published":
      case "draft":
      case "review":
      case "scheduled":
      case "archived":
        return page.status === filters.category;
      default:
        return true;
    }
  });
}

export type { WebsitePageLanguage };
