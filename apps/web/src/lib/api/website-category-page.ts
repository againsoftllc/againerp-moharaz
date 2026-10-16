import { apiFetch } from "@/lib/api/client";
import type {
  CategoryPageContent,
  WebsiteCategoryPage,
} from "@/lib/website/website-category-page";
import {
  defaultCategoryPageContent,
  defaultCatalogSettings,
  defaultDescriptionSection,
  defaultFiltersSection,
  defaultProductCardSection,
  defaultSortingSection,
  defaultStatsSection,
} from "@/lib/website/website-category-page";

type ApiSortOption = { id: string; label?: string; hidden?: boolean };
type ApiAvailabilityOption = { id: string; label?: string; hidden?: boolean };

type ApiCategoryPageContent = {
  settings?: Record<string, unknown>;
  sorting?: { hidden?: boolean; options?: ApiSortOption[] };
  filters?: {
    hidden?: boolean;
    button_label?: string;
    price?: { enabled?: boolean; label?: string };
    availability?: {
      enabled?: boolean;
      label?: string;
      options?: ApiAvailabilityOption[];
    };
  };
  product_card?: Record<string, unknown>;
  stats?: { hidden?: boolean };
  description?: Record<string, unknown>;
};

type ApiWebsiteCategoryPage = {
  id: string;
  company_id: string;
  content: ApiCategoryPageContent;
  created_at: string;
  updated_at: string;
};

type ApiResponse = { data: ApiWebsiteCategoryPage; errors: string[] };

function mapContent(raw: ApiCategoryPageContent | undefined): CategoryPageContent {
  const base = defaultCategoryPageContent();
  if (!raw) return base;
  const s = raw.settings ?? {};
  const card = raw.product_card ?? {};
  const desc = raw.description ?? {};
  const sortDefault = defaultSortingSection();
  const filtersDefault = defaultFiltersSection();

  const loadMode = s.load_mode === "pagination" ? "pagination" : "load_more";
  const defaultSort =
    s.default_sort === "price-asc" || s.default_sort === "price-desc"
      ? s.default_sort
      : "default";

  return {
    settings: {
      ...defaultCatalogSettings(),
      productsPerPage: Number(s.products_per_page ?? 16) || 16,
      loadMode,
      loadMoreCount: Number(s.load_more_count ?? 10) || 10,
      gridColsMd: Number(s.grid_cols_md ?? 3) || 3,
      gridColsLg: Number(s.grid_cols_lg ?? 4) || 4,
      defaultSort,
      showBreadcrumbs: s.show_breadcrumbs !== false,
      filterLayout: "drawer",
      emptyTitle: String(s.empty_title ?? base.settings.emptyTitle),
      emptyMessage: String(s.empty_message ?? base.settings.emptyMessage),
      emptyFilterMessage: String(s.empty_filter_message ?? base.settings.emptyFilterMessage),
    },
    sorting: {
      hidden: Boolean(raw.sorting?.hidden),
      options: (raw.sorting?.options?.length ? raw.sorting.options : sortDefault.options).map(
        (o) => ({
          id:
            o.id === "price-asc" || o.id === "price-desc" || o.id === "default"
              ? o.id
              : "default",
          label: o.label || o.id,
          hidden: Boolean(o.hidden),
        }),
      ),
    },
    filters: {
      hidden: Boolean(raw.filters?.hidden),
      buttonLabel: raw.filters?.button_label || filtersDefault.buttonLabel,
      price: {
        enabled: raw.filters?.price?.enabled !== false,
        label: raw.filters?.price?.label || filtersDefault.price.label,
      },
      availability: {
        enabled: raw.filters?.availability?.enabled !== false,
        label: raw.filters?.availability?.label || filtersDefault.availability.label,
        options: (
          raw.filters?.availability?.options?.length
            ? raw.filters.availability.options
            : filtersDefault.availability.options
        ).map((o) => ({
          id: (["in_stock", "pre_order", "upcoming", "out_of_stock"].includes(o.id)
            ? o.id
            : "in_stock") as "in_stock" | "pre_order" | "upcoming" | "out_of_stock",
          label: o.label || o.id,
          hidden: Boolean(o.hidden),
        })),
      },
    },
    productCard: {
      ...defaultProductCardSection(),
      showRating: card.show_rating !== false,
      showReviewCount: card.show_review_count !== false,
      showCompareAt: card.show_compare_at !== false,
      showDiscountBadge: card.show_discount_badge !== false,
      showBuyNow: card.show_buy_now !== false,
      showWishlist: card.show_wishlist !== false,
      showCompare: card.show_compare !== false,
    },
    stats: { ...defaultStatsSection(), hidden: Boolean(raw.stats?.hidden) },
    description: {
      ...defaultDescriptionSection(),
      hidden: Boolean(desc.hidden),
      collapseEnabled: desc.collapse_enabled !== false,
      titleTemplate: String(desc.title_template ?? "About {category}"),
      bodyHtml: String(desc.body_html ?? ""),
    },
  };
}

function toApiContent(content: CategoryPageContent): ApiCategoryPageContent {
  return {
    settings: {
      products_per_page: content.settings.productsPerPage,
      load_mode: content.settings.loadMode,
      load_more_count: content.settings.loadMoreCount,
      grid_cols_md: content.settings.gridColsMd,
      grid_cols_lg: content.settings.gridColsLg,
      default_sort: content.settings.defaultSort,
      show_breadcrumbs: content.settings.showBreadcrumbs,
      filter_layout: content.settings.filterLayout,
      empty_title: content.settings.emptyTitle,
      empty_message: content.settings.emptyMessage,
      empty_filter_message: content.settings.emptyFilterMessage,
    },
    sorting: {
      hidden: Boolean(content.sorting.hidden),
      options: content.sorting.options.map((o) => ({
        id: o.id,
        label: o.label,
        hidden: Boolean(o.hidden),
      })),
    },
    filters: {
      hidden: Boolean(content.filters.hidden),
      button_label: content.filters.buttonLabel,
      price: {
        enabled: content.filters.price.enabled,
        label: content.filters.price.label,
      },
      availability: {
        enabled: content.filters.availability.enabled,
        label: content.filters.availability.label,
        options: content.filters.availability.options.map((o) => ({
          id: o.id,
          label: o.label,
          hidden: Boolean(o.hidden),
        })),
      },
    },
    product_card: {
      show_rating: content.productCard.showRating,
      show_review_count: content.productCard.showReviewCount,
      show_compare_at: content.productCard.showCompareAt,
      show_discount_badge: content.productCard.showDiscountBadge,
      show_buy_now: content.productCard.showBuyNow,
      show_wishlist: content.productCard.showWishlist,
      show_compare: content.productCard.showCompare,
    },
    stats: { hidden: Boolean(content.stats.hidden) },
    description: {
      hidden: Boolean(content.description.hidden),
      collapse_enabled: content.description.collapseEnabled,
      title_template: content.description.titleTemplate,
      body_html: content.description.bodyHtml,
    },
  };
}

export function apiCategoryPageToWebsite(row: ApiWebsiteCategoryPage): WebsiteCategoryPage {
  return {
    id: row.id,
    companyId: row.company_id,
    content: mapContent(row.content),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchWebsiteCategoryPage(): Promise<WebsiteCategoryPage> {
  const res = await apiFetch<ApiResponse>("/api/v1/website/category-page");
  return apiCategoryPageToWebsite(res.data);
}

export async function updateWebsiteCategoryPage(input: {
  content: CategoryPageContent;
}): Promise<WebsiteCategoryPage> {
  const res = await apiFetch<ApiResponse>("/api/v1/website/category-page", {
    method: "PATCH",
    body: JSON.stringify({ content: toApiContent(input.content) }),
  });
  return apiCategoryPageToWebsite(res.data);
}
