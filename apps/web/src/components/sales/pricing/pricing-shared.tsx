"use client";

import * as React from "react";
import { toast } from "sonner";
import { ProductSearchAdd } from "@/components/products/product-search-add";
import { searchCatalogProducts } from "@/lib/api/catalog-products";

export const PRICING_SECTION_TITLE =
  "mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

export const PRICING_DATE_INPUT =
  "h-7 w-full border-0 border-b border-border bg-transparent text-xs outline-none focus:border-primary disabled:opacity-70";

/** digits and one dot */
export const decimalText = (v: string) => v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
export const intText = (v: string) => v.replace(/\D/g, "");
/** "12.50" → "12.5", null → "" */
export const fromApiNumber = (v: string | number | null | undefined) => (v == null || v === "" ? "" : String(Number(v)));

export async function runWithToast(setBusy: (b: boolean) => void, action: () => Promise<void>) {
  setBusy(true);
  try {
    await action();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not save");
  } finally {
    setBusy(false);
  }
}

export type PricingProduct = { id: string; sku: string; name: string; price: number | null };

/** The product-add bar of a pricing drawer: searches the whole catalog on the server as you type. */
export function PricingProductAdd({ portalHost, onPick }: { portalHost: HTMLElement | null; onPick: (product: PricingProduct) => void }) {
  // sales lines carry the item id, so that is what a price is kept against
  const [items, setItems] = React.useState<{ id: string; sku: string; name: string; price?: number }[]>([]);
  const seq = React.useRef(0);
  const search = React.useCallback((query: string) => {
    const term = query.trim();
    const mine = ++seq.current;
    if (term.length < 2) {
      setItems([]);
      return;
    }
    void searchCatalogProducts(term, 25)
      .then((rows) => {
        if (mine === seq.current) setItems(rows.map((p) => ({ id: p.itemId ?? p.id, sku: p.sku, name: p.name, price: p.price })));
      })
      .catch(() => undefined);
  }, []);
  // a scanned / exact code comes back without a price: take the searched row when it is there
  const pick = (p: { id?: string; itemId?: string; sku: string; name: string; price?: number }) => {
    const full = items.find((i) => i.id === (p.id ?? p.itemId) || i.sku === p.sku) ?? p;
    onPick({ id: full.id ?? p.itemId ?? "", sku: full.sku, name: full.name, price: full.price ?? null });
  };
  return <ProductSearchAdd items={items} portalHost={portalHost} onPick={pick} onQueryChange={search} />;
}
