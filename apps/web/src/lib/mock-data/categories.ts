export type Category = {
  id: string;
  /** Full category name — e.g. "HP Laptop" */
  name: string;
  /** Short menu label — e.g. "HP" (shown in website menu) */
  caption: string;
  /** SEO URL path */
  slug: string;
  parentId: string | null;
  /** Catalog vs Dropshipping (frontstore) tree — mirrors product channel */
  channel?: "catalog" | "dropshipping";
  /** Menu / list order within same parent — set by drag-and-drop, not manual field */
  sortOrder: number;
  productCount: number;
  /** On/off — category visible on storefront */
  active: boolean;
  /** Show in website top menu */
  showInTopMenu: boolean;
  /** Storefront: show live price comparison / price list under PLP */
  showPriceComparison?: boolean;
  updatedAt: string;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  iconUrl?: string;
  bannerUrl?: string;
  /** Canonical media library reference — survives rename via central store */
  iconMediaId?: string;
  bannerMediaId?: string;
  /** SkyBuy-style: live China search keyword (empty = local catalog PLP only) */
  chinaSearchKeyword?: string;
};

export type CategoryNode = Category & { children: CategoryNode[] };

const flat: Category[] = [
  {
    id: "cat_apparel",
    name: "Apparel",
    caption: "Fashion",
    slug: "apparel",
    parentId: null,
    sortOrder: 0,
    productCount: 342,
    active: true,
    showInTopMenu: true,
    updatedAt: "2026-06-10",
    description: "Clothing and fashion for everyone.",
    iconUrl: "https://picsum.photos/seed/cat-app/64/64",
    bannerUrl: "https://picsum.photos/seed/banner-app/800/200",
  },
  {
    id: "cat_electronics",
    name: "Electronics",
    caption: "Electronics",
    slug: "electronics",
    parentId: null,
    sortOrder: 1,
    productCount: 218,
    active: true,
    showInTopMenu: true,
    updatedAt: "2026-06-10",
    description: "All electronic devices and gadgets.",
    metaTitle: "Electronics — UrbanWear",
    metaDescription: "Shop electronics online.",
    metaKeywords: "electronics, gadgets",
    iconUrl: "https://picsum.photos/seed/cat-elec/64/64",
    bannerUrl: "https://picsum.photos/seed/banner-elec/800/200",
  },
  {
    id: "cat_home",
    name: "Home & Living",
    caption: "Home",
    slug: "home",
    parentId: null,
    sortOrder: 2,
    productCount: 89,
    active: true,
    showInTopMenu: true,
    updatedAt: "2026-06-02",
    bannerUrl: "https://picsum.photos/seed/banner-home/800/200",
  },
  {
    id: "cat_beauty",
    name: "Beauty",
    caption: "Beauty",
    slug: "beauty",
    parentId: null,
    sortOrder: 3,
    productCount: 67,
    active: true,
    showInTopMenu: false,
    updatedAt: "2026-05-28",
  },
  {
    id: "cat_sports",
    name: "Sports",
    caption: "Sports",
    slug: "sports",
    parentId: null,
    sortOrder: 4,
    productCount: 54,
    active: false,
    showInTopMenu: false,
    updatedAt: "2026-05-20",
  },
  {
    id: "cat_books",
    name: "Books",
    caption: "Books",
    slug: "books",
    parentId: null,
    sortOrder: 5,
    productCount: 31,
    active: false,
    showInTopMenu: false,
    updatedAt: "2026-05-15",
  },
  {
    id: "cat_hp_laptop",
    name: "HP Laptop",
    caption: "HP",
    slug: "hp-laptop",
    parentId: "cat_gaming_laptop",
    sortOrder: 0,
    productCount: 24,
    active: true,
    showInTopMenu: true,
    updatedAt: "2026-06-09",
    description: "HP laptops and notebooks for work and gaming.",
    metaTitle: "HP Laptops — Best Prices",
    metaDescription: "Buy HP laptops with warranty.",
    metaKeywords: "hp, laptop, notebook",
    iconUrl: "https://picsum.photos/seed/cat-hp/64/64",
    bannerUrl: "https://picsum.photos/seed/banner-hp/800/200",
  },
  {
    id: "cat_laptops",
    name: "Laptops",
    caption: "Laptops",
    slug: "laptops",
    parentId: "cat_electronics",
    sortOrder: 1,
    productCount: 42,
    active: true,
    showInTopMenu: false,
    updatedAt: "2026-06-08",
    iconUrl: "https://picsum.photos/seed/cat-lap/64/64",
  },
  {
    id: "cat_gaming_laptop",
    name: "Gaming Laptop",
    caption: "Gaming",
    slug: "gaming-laptop",
    parentId: "cat_laptops",
    sortOrder: 0,
    productCount: 18,
    active: true,
    showInTopMenu: false,
    updatedAt: "2026-06-09",
  },
  {
    id: "cat_phones",
    name: "Phones",
    caption: "Phones",
    slug: "phones",
    parentId: "cat_electronics",
    sortOrder: 2,
    productCount: 64,
    active: true,
    showInTopMenu: true,
    updatedAt: "2026-06-07",
    iconUrl: "https://picsum.photos/seed/cat-phone/64/64",
  },
  {
    id: "cat_mens",
    name: "Men's Clothing",
    caption: "Men",
    slug: "mens-clothing",
    parentId: "cat_apparel",
    sortOrder: 0,
    productCount: 128,
    active: true,
    showInTopMenu: false,
    updatedAt: "2026-06-09",
  },
  {
    id: "cat_womens",
    name: "Women's Clothing",
    caption: "Women",
    slug: "womens-clothing",
    parentId: "cat_apparel",
    sortOrder: 1,
    productCount: 156,
    active: true,
    showInTopMenu: false,
    updatedAt: "2026-06-08",
  },
  {
    id: "cat_kids",
    name: "Kids",
    caption: "Kids",
    slug: "kids",
    parentId: "cat_apparel",
    sortOrder: 2,
    productCount: 58,
    active: true,
    showInTopMenu: false,
    updatedAt: "2026-06-07",
  },
  {
    id: "cat_tshirts",
    name: "T-Shirts",
    caption: "T-Shirts",
    slug: "t-shirts",
    parentId: "cat_mens",
    sortOrder: 0,
    productCount: 45,
    active: true,
    showInTopMenu: false,
    updatedAt: "2026-06-06",
  },
  {
    id: "cat_kitchen",
    name: "Kitchen",
    caption: "Kitchen",
    slug: "kitchen",
    parentId: "cat_home",
    sortOrder: 0,
    productCount: 34,
    active: true,
    showInTopMenu: false,
    updatedAt: "2026-06-01",
  },
];

export const categoriesFlat: Category[] = flat;

export function buildCategoryTree(items: Category[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  items.forEach((c) => map.set(c.id, { ...c, children: [] }));
  const roots: CategoryNode[] = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sort = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

export function flattenCategoryTree(
  nodes: CategoryNode[],
  depth = 0,
  expanded: Set<string>,
): { node: CategoryNode; depth: number; hasChildren: boolean; expanded: boolean }[] {
  const out: { node: CategoryNode; depth: number; hasChildren: boolean; expanded: boolean }[] = [];
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    out.push({ node, depth, hasChildren, expanded: isExpanded });
    if (hasChildren && isExpanded) {
      out.push(...flattenCategoryTree(node.children, depth + 1, expanded));
    }
  }
  return out;
}

export function getCategoryById(id: string, items = categoriesFlat) {
  return items.find((c) => c.id === id);
}

export function getCategoryBySlug(slug: string, items = categoriesFlat) {
  return items.find((c) => c.slug === slug);
}

export function getCategoryBreadcrumbs(slug: string, items = categoriesFlat): Category[] {
  const crumbs: Category[] = [];
  let current = getCategoryBySlug(slug, items);
  while (current) {
    crumbs.unshift(current);
    current = current.parentId ? getCategoryById(current.parentId, items) : undefined;
  }
  return crumbs;
}

export function getChildCategories(parentId: string, items = categoriesFlat) {
  return items.filter((c) => c.parentId === parentId && c.active).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getRootCategories(items = categoriesFlat) {
  return items.filter((c) => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export const emptyCategory = (): Omit<Category, "id" | "productCount" | "updatedAt" | "sortOrder"> => ({
  name: "",
  caption: "",
  slug: "",
  parentId: null,
  active: true,
  showInTopMenu: false,
  description: "",
  metaTitle: "",
  metaDescription: "",
  metaKeywords: "",
});

export function getDisplayOrder(items: Category[]): Category[] {
  const out: Category[] = [];
  const walk = (parentId: string | null) => {
    items
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .forEach((c) => {
        out.push(c);
        walk(c.id);
      });
  };
  walk(null);
  return out;
}

/** Backfill sortOrder for persisted rows missing the field */
export function ensureSortOrder(items: Category[]): Category[] {
  const byParent = new Map<string | null, Category[]>();
  for (const c of items) {
    const key = c.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push({ ...c });
  }

  const orderMap = new Map<string, number>();
  byParent.forEach((siblings) => {
    siblings
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
      .forEach((c, i) => orderMap.set(c.id, i));
  });

  return items.map((c) => ({
    ...c,
    sortOrder: orderMap.get(c.id) ?? c.sortOrder ?? 0,
  }));
}
