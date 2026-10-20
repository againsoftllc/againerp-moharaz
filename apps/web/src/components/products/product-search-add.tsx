"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ListFilter, Plus, Search, X } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { FilterSelect } from "@/components/shared/filter-select";
import { categoryNamesWithDescendants } from "@/components/categories/category-tree-filter";
import { CategoryCombobox } from "@/components/categories/category-combobox";
import { useCatalogCategories } from "@/lib/api/use-catalog-categories";
import { useCatalogBrands } from "@/lib/api/use-catalog-brands";
import { SearchDropdown } from "@/components/again/again-search-dropdown";

import { findItemByScan, scanProductCode, type ScanProductHit } from "@/lib/api/product-scan";

export type ProductSearchItem = {
  sku: string;
  name: string;
  brand?: string;
  category?: string;
  model?: string;
  stock?: number;
  /** False when stock isn't tracked — stock 0 then isn't "out of stock". */
  trackQuantity?: boolean;
  /** Units carry serial numbers; a scanned serial attaches to the picked line. */
  trackSerial?: boolean;
  price?: number;
  purchasePrice?: number;
  imageUrl?: string;
  barcode?: string | null;
  itemId?: string;
  id?: string;
};

const SECONDARY_SPLIT = "\u0000";

function matchProducts<T extends ProductSearchItem>(items: T[], query: string, requireQuery = false) {
  const q = query.trim().toLowerCase();
  if (!q) return requireQuery ? [] : items.slice(0, 12);
  // every typed word, in any order ("msi b650m" finds "MSI PRO B650M-B")
  const words = q.split(/\s+/).filter(Boolean);
  const hits = items.filter((item) => {
    const haystack = [item.sku, item.name, item.model, item.brand, item.category, item.barcode]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
  return rankProducts(hits, words);
}

/**
 * Real products first. A big catalog also holds imported / placeholder rows (no stock, no price) that match almost any
 * short query; they must not push the products the shop actually sells out of the short result list.
 * Stable: ties keep the order the list came in.
 */
function rankProducts<T extends ProductSearchItem>(items: T[], words: string[]): T[] {
  const score = (item: ProductSearchItem) => {
    let n = 0;
    if ((item.stock ?? 0) > 0) n += 4;
    if ((item.price ?? 0) > 0) n += 2;
    const name = item.name.toLowerCase();
    const sku = item.sku.toLowerCase();
    if (words.length && (name.startsWith(words[0]) || sku.startsWith(words[0]))) n += 3;
    else if (words.length && name.split(/[\s\-_/]+/).some((part) => part.startsWith(words[0]))) n += 1;
    return n;
  };
  return items
    .map((item, index) => ({ item, index, rank: score(item) }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map((row) => row.item);
}

function localExact<T extends ProductSearchItem>(items: T[], query: string): T | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return items.find((item) => {
    if (item.sku.toLowerCase() === q) return true;
    if (item.name.toLowerCase() === q) return true;
    if ((item.barcode ?? "").trim().toLowerCase() === q) return true;
    return false;
  });
}

function itemFromScan<T extends ProductSearchItem>(items: T[], hit: ScanProductHit): T {
  return (
    findItemByScan(items, hit) ??
    ({
      sku: hit.sku,
      name: hit.name,
      barcode: hit.barcode,
      itemId: hit.item_id ?? undefined,
      id: hit.item_id ?? undefined,
    } as T)
  );
}

/** Canonical product-add bar: filter + SKU search + plus. See docs/ERP-UI-COMMON.md §6. */
export function ProductSearchAdd<T extends ProductSearchItem>({
  items,
  portalHost,
  onPick,
  onAddNew,
  onQueryChange,
  onFilterChange,
}: {
  items: T[];
  portalHost: HTMLElement | null;
  /** `scan` is set when the pick came from a resolved code (barcode/serial). */
  onPick: (item: T, scan?: ScanProductHit | null) => void;
  /** the + button (add a new product); left out when the screen only picks existing products */
  onAddNew?: () => void;
  /** told what is typed (e.g. to search the server for products not loaded yet) */
  onQueryChange?: (query: string) => void;
  /** told the chosen brand / categories (a category with its sub-categories) so the screen can load THOSE products from the
   * database - the loaded list is only a slice of the catalog */
  onFilterChange?: (filter: { brand: string; categories: string[] }) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [brand, setBrand] = useState("");
  // the categories ticked in the tree (ids); a ticked parent also lists the products of its sub-categories
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onPickRef = useRef(onPick);
  useLayoutEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);
  const [scanFound, setScanHit] = useState<ScanProductHit | null>(null);
  // a code lookup only stands while the box holds a code (2+ characters)
  const scanHit = query.trim().length >= 2 ? scanFound : null;
  const scanQueryRef = useRef("");

  // the brand list is the catalog's own (database), not just the brands of the few products loaded on this screen
  const { brands: catalogBrands } = useCatalogBrands({ channel: "catalog" });
  const brands = useMemo(() => {
    const set = new Set<string>();
    // only a screen that loads the filtered products from the database (onFilterChange) can use the whole brand list
    for (const b of onFilterChange ? catalogBrands : []) {
      const value = b.name?.trim();
      if (value) set.add(value);
    }
    for (const item of items) {
      const value = item.brand?.trim();
      if (value) set.add(value);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [items, catalogBrands, onFilterChange]);

  const { categories: categoryTree } = useCatalogCategories({ channel: "catalog" });
  const categoryLabels = useMemo(
    () => categoryIds.map((id) => categoryTree.find((c) => c.id === id)?.name).filter((n): n is string => Boolean(n)),
    [categoryIds, categoryTree],
  );
  const category = categoryLabels.join(", ");
  /** The ticked categories and their sub-categories, by name (what a product carries). */
  const categoryNames = useMemo(() => {
    const names = new Set<string>();
    for (const label of categoryLabels) for (const n of categoryNamesWithDescendants(label, categoryTree)) names.add(n);
    return names;
  }, [categoryLabels, categoryTree]);

  const filteredItems = useMemo(() => {
    const wanted = categoryNames.size ? categoryNames : null;
    return items.filter((item) => {
      if (brand && (item.brand ?? "") !== brand) return false;
      if (wanted && !wanted.has(item.category ?? "")) return false;
      return true;
    });
  }, [items, brand, categoryNames]);

  const hasFilter = Boolean(brand || categoryIds.length);
  const onFilterChangeRef = useRef(onFilterChange);
  useLayoutEffect(() => {
    onFilterChangeRef.current = onFilterChange;
  }, [onFilterChange]);
  useEffect(() => {
    if (!brand && categoryNames.size === 0) return;
    onFilterChangeRef.current?.({ brand, categories: [...categoryNames] });
  }, [brand, categoryNames]);
  /** Opening the filter panel closes the results list and the other way round, so the two never overlap. */
  const toggleFilter = () => {
    setFilterOpen((next) => {
      if (!next) setOpen(false);
      return !next;
    });
  };
  const matches = matchProducts(filteredItems, query, !hasFilter).slice(0, 40);

  const pick = (item: T, scan?: ScanProductHit | null) => {
    onPickRef.current(item, scan);
    setQuery("");
    setScanHit(null);
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const pickFromCode = async (raw: string) => {
    const code = raw.trim();
    if (!code) return false;
    const exact = localExact(filteredItems, code);
    if (exact) {
      pick(exact);
      return true;
    }
    const hit = await scanProductCode(code);
    if (!hit) return false;
    pick(itemFromScan(filteredItems, hit), hit);
    return true;
  };

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;

    const timer = window.setTimeout(() => {
      const hits = matchProducts(filteredItems, query, true);
      if (hits.length === 1) {
        pick(hits[0]);
        return;
      }
      if (hits.length > 0) return;
      scanQueryRef.current = q;
      void scanProductCode(q).then((hit) => {
        if (scanQueryRef.current !== q) return;
        setScanHit(hit);
        if (hit && !q.includes(" ")) pick(itemFromScan(filteredItems, hit), hit);
      });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, filteredItems]);

  useEffect(() => {
    // Capture phase: Sheet/Dialog dismiss-layers can stop mousedown from ever
    // bubbling to a document-level bubble listener, which left this panel
    // stuck open when clicking outside it inside a drawer.
    function onDoc(event: PointerEvent) {
      const target = event.target as Element | null;
      if (!target) return;
      if (wrapRef.current?.contains(target)) return;
      // the category picker's menu is portalled out of this panel (data-portal-popover): a click in it is not "outside"
      if (target.closest("[data-radix-popper-content-wrapper], [role='listbox'], [data-portal-popover]")) return;
      setFilterOpen(false);
    }
    document.addEventListener("pointerdown", onDoc, true);
    return () => document.removeEventListener("pointerdown", onDoc, true);
  }, []);

  return (
    <div ref={wrapRef} className="@container relative flex min-w-0 flex-1 items-stretch gap-0">
      <div
        ref={searchBoxRef}
        className="flex h-9 min-w-0 flex-1 items-center border border-input bg-background"
      >
        <Search className="ml-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
        {brand ? (
          <span className="ml-1.5 inline-flex h-5 max-w-[9rem] shrink-0 items-center gap-1 bg-[#00a09d]/10 px-1.5 text-[11px] text-[#00807e] dark:text-[#4fd1ce]" title={`Brand: ${brand}`}>
            <span className="truncate">Brand: {brand}</span>
            <button type="button" className="shrink-0 hover:text-destructive" aria-label="Clear brand filter" onMouseDown={(e) => e.preventDefault()} onClick={() => setBrand("")}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : null}
        {category ? (
          <span className="ml-1.5 inline-flex h-5 max-w-[10rem] shrink-0 items-center gap-1 bg-[#00a09d]/10 px-1.5 text-[11px] text-[#00807e] dark:text-[#4fd1ce]" title={`Category: ${category}`}>
            <span className="truncate">Category: {category}</span>
            <button type="button" className="shrink-0 hover:text-destructive" aria-label="Clear category filter" onMouseDown={(e) => e.preventDefault()} onClick={() => setCategoryIds([])}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : null}
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setFilterOpen(false);
            const next = event.target.value;
            // an exact SKU / name / barcode (typed or scanned) is picked at once
            const exact = next.trim().length >= 2 ? localExact(filteredItems, next) : undefined;
            if (exact) {
              pick(exact);
              return;
            }
            setQuery(next);
            onQueryChange?.(next);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setFilterOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void pickFromCode(query).then((ok) => {
                if (!ok && matches[0]) pick(matches[0]);
              });
            } else if (event.key === "Escape") {
              setOpen(false);
              setFilterOpen(false);
            }
          }}
          placeholder={
            hasFilter ? "Search in filtered products…" : "Name, SKU, barcode, or serial"
          }
          className="h-9 min-w-0 flex-1 bg-transparent px-2 text-[14px] outline-none placeholder:text-muted-foreground"
          aria-label="Search product, barcode, or serial"
          autoComplete="off"
        />
        {onAddNew ? (
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Add a new product"
            title="Add a new product"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setOpen(false);
              onAddNew();
            }}
          >
            <Plus className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="relative w-[30%] min-w-[200px] shrink-0">
        <button
          type="button"
          className={cn(
            "inline-flex h-9 w-full shrink-0 items-center gap-1.5 border border-l-0 border-input px-3 text-[13px] font-medium",
            hasFilter
              ? "bg-[#00a09d] text-white hover:bg-[#00c4bf]"
              : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            filterOpen && !hasFilter && "bg-muted text-foreground",
          )}
          aria-label={
            hasFilter
              ? `Filters active (${[brand, category].filter(Boolean).join(", ")})`
              : "Filter by brand or category"
          }
          aria-expanded={filterOpen}
          title={hasFilter ? "Filters applied — click to edit" : "Filter by brand or category"}
          onClick={toggleFilter}
        >
          <ListFilter className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">
            {hasFilter ? [brand, category].filter(Boolean).join(", ") : "Filter"}
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 opacity-70 transition-transform", filterOpen && "rotate-180")} />
        </button>
        {hasFilter ? (
          <button
            type="button"
            className="absolute -right-px -top-px z-10 inline-flex h-4 w-4 items-center justify-center border border-border bg-background text-foreground hover:bg-destructive hover:text-white"
            aria-label="Clear filters"
            title="Clear filters"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setBrand("");
              setCategoryIds([]);
              setFilterOpen(false);
            }}
          >
            <X className="h-2.5 w-2.5" strokeWidth={2.5} />
          </button>
        ) : null}
      </div>
      {filterOpen ? (
        <div className="absolute right-0 top-full z-[300] mt-0.5 w-[30%] min-w-[240px] border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between border-b border-border/80 px-3 py-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Filter products</p>
            {hasFilter ? (
              <button
                type="button"
                className="text-[12px] text-[#00a09d] hover:underline"
                onClick={() => {
                  setBrand("");
                  setCategoryIds([]);
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
          <div className="flex flex-col gap-5 px-4 py-4">
            <div className="min-w-0 space-y-1.5">
              <p className="text-[12px] font-medium text-muted-foreground">Category</p>
              {/* the same picker as the Products list filter: a tree with check boxes, several categories, search */}
              <CategoryCombobox
                multiple
                categories={categoryTree}
                values={categoryIds}
                onChange={setCategoryIds}
                placeholder="All categories"
                chips={false}
                listFilter
                className="w-full [&>button]:h-8 [&>button]:text-[14px]" /* the picker draws its own 12px trigger: same height and font as Brand */
                menuFontSize={14}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <p className="text-[12px] font-medium text-muted-foreground">Brand</p>
              <FilterSelect
                value={brand}
                onChange={setBrand}
                width="w-full"
                className={cn("h-8 text-[14px]", !brand && "text-muted-foreground")}
                menuFontSize={14}
                avoidCollisions
                ariaLabel="Brand"
                placeholder="All brands"
                options={[
                  { value: "", label: "All brands" },
                  ...brands.map((value) => ({ value, label: value })),
                ]}
              />
            </div>
          </div>
        </div>
      ) : null}
      <SearchDropdown
        open={open && (query.trim().length >= 1 || hasFilter)}
        placement="bottom"
        getAnchor={() => searchBoxRef.current}
        portalContainer={portalHost}
        items={[
          ...matches.map((item) => {
            const left = [item.sku, item.barcode, item.model, item.brand, item.category]
              .filter(Boolean)
              .join(" · ");
            const right = [
              item.price != null ? formatCurrency(item.price) : null,
              item.stock != null ? `Stock ${item.stock}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return {
              id: item.sku,
              primary: item.name,
              imageUrl: item.imageUrl,
              secondary: [left, right].join(SECONDARY_SPLIT),
            };
          }),
          ...(scanHit &&
          !matches.some((row) => row.sku.toLowerCase() === scanHit.sku.toLowerCase())
            ? [
                {
                  id: `scan:${scanHit.sku}`,
                  primary: scanHit.name,
                  secondary: [
                    scanHit.sku,
                    scanHit.serial_number ? `Serial ${scanHit.serial_number}` : null,
                    scanHit.match === "barcode" ? "Barcode" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") + SECONDARY_SPLIT,
                },
              ]
            : []),
        ]}
        renderItem={(item) => {
          const full = matches.find((row) => row.sku === item.id);
          const hasStock = full != null && full.stock != null;
          const outOfStock = hasStock && full.trackQuantity !== false && (full.stock as number) <= 0;
          const [left, right] = (item.secondary ?? "").split(SECONDARY_SPLIT);
          const prices = full
            ? [
                full.purchasePrice != null ? `Cost ${formatCurrency(full.purchasePrice)}` : null,
                full.price != null ? `Sale ${formatCurrency(full.price)}` : null,
              ].filter(Boolean)
            : right
              ? [right]
              : [];
          return (
            <div className="flex min-w-0 w-full items-start gap-2.5 text-left">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt=""
                  className="mt-0.5 h-9 w-9 shrink-0 border border-border bg-muted object-cover"
                />
              ) : (
                <span className="mt-0.5 h-9 w-9 shrink-0 border border-border bg-muted" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium leading-snug text-foreground">
                  {item.primary}
                </p>
                {left || prices.length || hasStock ? (
                  <p className="mt-0.5 flex items-center justify-between gap-2 text-[11px] leading-snug text-muted-foreground">
                    <span className="min-w-0 truncate">{left}</span>
                    <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                      {prices.length ? <span>{prices.join(" · ")}</span> : null}
                      {hasStock ? (
                        outOfStock ? (
                          <span className="rounded-none border border-red-500/40 bg-red-500/10 px-1 font-medium text-red-600 dark:text-red-400">
                            Out of stock
                          </span>
                        ) : (
                          <span>Stock {full?.stock}</span>
                        )
                      ) : null}
                    </span>
                  </p>
                ) : null}
              </div>
            </div>
          );
        }}
        onSelect={(sku) => {
          if (sku.startsWith("scan:") && scanHit) {
            pick(itemFromScan(filteredItems, scanHit), scanHit);
            return;
          }
          const item = filteredItems.find((row) => row.sku === sku) ?? items.find((row) => row.sku === sku);
          if (item) pick(item);
        }}
      />
    </div>
  );
}
