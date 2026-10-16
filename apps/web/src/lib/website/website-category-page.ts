/** Category / brand PLP template (shared across storefront listings). */

export type LoadMode = "load_more" | "pagination";
export type SortOptionId = "default" | "price-asc" | "price-desc";
export type AvailabilityId = "in_stock" | "pre_order" | "upcoming" | "out_of_stock";

export type CatalogSettings = {
  productsPerPage: number;
  loadMode: LoadMode;
  loadMoreCount: number;
  gridColsMd: number;
  gridColsLg: number;
  defaultSort: SortOptionId;
  showBreadcrumbs: boolean;
  filterLayout: "drawer";
  emptyTitle: string;
  emptyMessage: string;
  emptyFilterMessage: string;
};

export type SortOption = {
  id: SortOptionId;
  label: string;
  hidden?: boolean;
};

export type SortingSection = {
  hidden?: boolean;
  options: SortOption[];
};

export type FiltersSection = {
  hidden?: boolean;
  buttonLabel: string;
  price: { enabled: boolean; label: string };
  availability: {
    enabled: boolean;
    label: string;
    options: { id: AvailabilityId; label: string; hidden?: boolean }[];
  };
};

export type ProductCardSection = {
  showRating: boolean;
  showReviewCount: boolean;
  showCompareAt: boolean;
  showDiscountBadge: boolean;
  showBuyNow: boolean;
  showWishlist: boolean;
  showCompare: boolean;
};

export type StatsSection = {
  hidden?: boolean;
};

export type DescriptionSection = {
  hidden?: boolean;
  collapseEnabled: boolean;
  titleTemplate: string;
  bodyHtml: string;
};

export type CategoryPageContent = {
  settings: CatalogSettings;
  sorting: SortingSection;
  filters: FiltersSection;
  productCard: ProductCardSection;
  stats: StatsSection;
  description: DescriptionSection;
};

export type WebsiteCategoryPage = {
  id: string;
  companyId: string;
  content: CategoryPageContent;
  createdAt: string;
  updatedAt: string;
};

export function defaultCatalogSettings(): CatalogSettings {
  return {
    productsPerPage: 16,
    loadMode: "load_more",
    loadMoreCount: 10,
    gridColsMd: 3,
    gridColsLg: 4,
    defaultSort: "default",
    showBreadcrumbs: true,
    filterLayout: "drawer",
    emptyTitle: "No products found",
    emptyMessage:
      "Product listings for this category are being added. Please check back soon.",
    emptyFilterMessage: "No products match the selected filters.",
  };
}

export function defaultSortingSection(): SortingSection {
  return {
    hidden: false,
    options: [
      { id: "default", label: "Default", hidden: false },
      { id: "price-asc", label: "Price (Low > High)", hidden: false },
      { id: "price-desc", label: "Price (High > Low)", hidden: false },
    ],
  };
}

export function defaultFiltersSection(): FiltersSection {
  return {
    hidden: false,
    buttonLabel: "Filter By",
    price: { enabled: true, label: "Price Range" },
    availability: {
      enabled: true,
      label: "Availability",
      options: [
        { id: "in_stock", label: "In Stock", hidden: false },
        { id: "pre_order", label: "Pre Order", hidden: false },
        { id: "upcoming", label: "Up Coming", hidden: false },
        { id: "out_of_stock", label: "Out of Stock", hidden: false },
      ],
    },
  };
}

export function defaultProductCardSection(): ProductCardSection {
  return {
    showRating: true,
    showReviewCount: true,
    showCompareAt: true,
    showDiscountBadge: true,
    showBuyNow: true,
    showWishlist: true,
    showCompare: true,
  };
}

export function defaultStatsSection(): StatsSection {
  return { hidden: false };
}

export function defaultDescriptionSection(): DescriptionSection {
  return {
    hidden: false,
    collapseEnabled: true,
    titleTemplate: "About {category}",
    bodyHtml: "",
  };
}

export function defaultCategoryPageContent(): CategoryPageContent {
  return {
    settings: defaultCatalogSettings(),
    sorting: defaultSortingSection(),
    filters: defaultFiltersSection(),
    productCard: defaultProductCardSection(),
    stats: defaultStatsSection(),
    description: defaultDescriptionSection(),
  };
}

/** Snake_case payload for Monarch preview / storefront. */
export function categoryPageContentToStorefrontPayload(content: CategoryPageContent) {
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
