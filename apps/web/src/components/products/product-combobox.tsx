"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { Product } from "@/lib/mock-data/products";
import { ProductSearchAdd, type ProductSearchItem } from "@/components/products/product-search-add";
import { apiFetch } from "@/lib/api/client";
import { apiProductToProduct, type ApiProductListResponse } from "@/lib/api/catalog-products";

type Props = {
  products: Product[];
  value: string;
  onChange: (id: string) => void;
  /** the whole picked product (name, SKU, price, image) — for callers that keep more than the id */
  onPick?: (product: Product) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

type Option = ProductSearchItem & { id: string };

/**
 * Picks one product. The search is the order screens' product bar (ProductSearchAdd): brand / category
 * filter, name · SKU · model · barcode · serial search, results only once something is typed (no list of
 * the whole catalogue), Enter takes the first match. What is typed is also searched on the server (every word
 * in name / SKU / brand / model), so products the page hasn't loaded yet are found too. A picked product shows
 * as a card with a clear button.
 */
export function ProductCombobox({ products, value, onChange, onPick, placeholder = "Select product…", className, disabled = false }: Props) {
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  // the results list renders inside the open sheet / dialog, so it stays clickable there
  const hostRef = useCallback((el: HTMLDivElement | null) => {
    setPortalHost(el ? ((el.closest("[role='dialog']") as HTMLElement | null) ?? document.body) : null);
  }, []);

  // products the server found for what is typed, merged with the ones the page loaded
  const [found, setFound] = useState<Product[]>([]);
  const [picked, setPicked] = useState<Product | null>(null);
  const searchTimer = useRef<number | undefined>(undefined);
  const searchSeq = useRef(0);
  const searchServer = useCallback((q: string) => {
    window.clearTimeout(searchTimer.current);
    const query = q.trim();
    if (query.length < 2) return;
    const seq = ++searchSeq.current;
    searchTimer.current = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query, per_page: "30", fields: "list", channel: "catalog" });
      void apiFetch<ApiProductListResponse>(`/api/v1/catalog/products?${params}`)
        .then((res) => {
          if (seq === searchSeq.current) setFound((res.data ?? []).map(apiProductToProduct));
        })
        .catch(() => undefined);
    }, 250);
  }, []);
  useEffect(() => () => window.clearTimeout(searchTimer.current), []);

  const pool = useMemo(() => {
    if (!found.length) return products;
    const known = new Set(products.map((p) => p.id));
    return [...found.filter((p) => !known.has(p.id)), ...products];
  }, [products, found]);

  const options = useMemo<Option[]>(
    () =>
      pool.map((p) => ({
        id: p.id,
        itemId: p.id,
        sku: p.sku || p.id,
        name: p.name,
        brand: p.brand || undefined,
        category: p.category || undefined,
        model: (p as Product & { model?: string }).model || undefined,
        barcode: (p as Product & { barcode?: string | null }).barcode ?? null,
        price: p.price,
        stock: p.stock,
        trackQuantity: (p as Product & { trackQuantity?: boolean }).trackQuantity,
        imageUrl: p.thumbnail || undefined,
      })),
    [pool],
  );
  const selected = useMemo(
    () => pool.find((p) => p.id === value) ?? (picked?.id === value ? picked : null),
    [pool, picked, value],
  );

  if (selected) {
    return (
      <div className={cn("flex min-w-0 w-full items-center gap-2 border border-input bg-background px-2 py-1.5", className)}>
        {selected.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selected.thumbnail} alt="" className="h-9 w-9 shrink-0 border border-border bg-muted object-cover" />
        ) : (
          <span className="h-9 w-9 shrink-0 border border-border bg-muted" aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{selected.name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {[selected.sku, selected.brand, selected.price != null ? formatCurrency(selected.price) : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        {!disabled ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Change product"
            title="Change product"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    );
  }

  if (disabled) {
    return (
      <div className={cn("flex h-8 w-full items-center border border-input bg-background px-2.5 text-xs text-muted-foreground opacity-50", className)}>
        {placeholder}
      </div>
    );
  }

  return (
    <div ref={hostRef} className={cn("relative flex min-w-0 w-full", className)}>
      <ProductSearchAdd<Option>
        items={options}
        portalHost={portalHost}
        onQueryChange={searchServer}
        onPick={(item) => {
          const product = pool.find((p) => p.id === item.id) ?? null;
          setPicked(product);
          onChange(item.id);
          if (product) onPick?.(product);
        }}
      />
    </div>
  );
}
