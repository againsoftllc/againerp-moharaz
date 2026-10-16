"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Package, Search, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import type { ApiCatalogProduct, ApiProductListResponse } from "@/lib/api/catalog-products";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** One line in a combo's composition — AgainPOS-style: which product, how many units. */
export type ComboComponent = {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  thumbnail?: string | null;
};

export function dumpComboComponents(components: ComboComponent[]): string {
  return JSON.stringify(components);
}

export function loadComboComponents(raw: string | null | undefined): ComboComponent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((c) => ({
        id: String(c.id ?? `combo_${Math.random().toString(36).slice(2)}`),
        product_id: String(c.product_id ?? ""),
        product_name: String(c.product_name ?? ""),
        sku: String(c.sku ?? ""),
        quantity: Number(c.quantity) || 1,
        unit_price: Number(c.unit_price) || 0,
        thumbnail: c.thumbnail ?? null,
      }))
      .filter((c) => c.product_id);
  } catch {
    return [];
  }
}

export function comboComponentsTotal(components: ComboComponent[]): number {
  return components.reduce((sum, c) => sum + c.quantity * c.unit_price, 0);
}

type Props = {
  components: ComboComponent[];
  onComponentsChange: (next: ComboComponent[]) => void;
  onApplyCostPrice?: (total: number) => void;
};

export function ComboComponentsSection({ components, onComponentsChange, onApplyCostPrice }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApiCatalogProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const needle = query.trim();
    if (!needle) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<ApiProductListResponse>(
          `/api/v1/catalog/products?q=${encodeURIComponent(needle)}&per_page=15`,
        );
        if (!cancelled) setResults(res.data.filter((p) => p.product_type !== "combo"));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const addComponent = useCallback(
    (p: ApiCatalogProduct) => {
      if (components.some((c) => c.product_id === p.id)) {
        setQuery("");
        setOpen(false);
        return;
      }
      const next: ComboComponent = {
        id: `combo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        product_id: p.id,
        product_name: p.name,
        sku: p.sku,
        quantity: 1,
        unit_price: parseFloat(p.purchase_price ?? p.price) || 0,
        thumbnail: p.thumbnail ?? null,
      };
      onComponentsChange([...components, next]);
      setQuery("");
      setResults([]);
      setOpen(false);
    },
    [components, onComponentsChange],
  );

  const updateQuantity = (id: string, quantity: number) => {
    onComponentsChange(
      components.map((c) => (c.id === id ? { ...c, quantity: Math.max(1, Math.floor(quantity) || 1) } : c)),
    );
  };

  const removeComponent = (id: string) => {
    onComponentsChange(components.filter((c) => c.id !== id));
  };

  const total = comboComponentsTotal(components);

  return (
    <div className="space-y-3">
      <div ref={boxRef} className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search a product to add as a component…"
            className="h-8 rounded-none pl-7"
          />
          {searching ? (
            <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        {open && query.trim() ? (
          <div className="absolute left-0 right-0 top-full z-[80] mt-1 max-h-64 overflow-y-auto rounded-none border border-input bg-popover shadow-md">
            {results.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-muted-foreground">
                {searching ? "Searching…" : "No products found"}
              </p>
            ) : (
              results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addComponent(p)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.sku}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatCurrency(parseFloat(p.price) || 0)}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      {components.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-none border border-dashed border-input bg-muted/20 px-4 py-6 text-center">
          <Package className="h-7 w-7 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No components yet</p>
          <p className="text-xs text-muted-foreground">Search above to add products that make up this combo</p>
        </div>
      ) : (
        <div className="rounded-none border border-input">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-input bg-muted/30 text-left text-[11px] uppercase text-muted-foreground">
                <th className="px-3 py-1.5 font-medium">Component</th>
                <th className="w-20 px-2 py-1.5 font-medium">Qty</th>
                <th className="w-24 px-2 py-1.5 font-medium">Unit price</th>
                <th className="w-24 px-2 py-1.5 font-medium">Total</th>
                <th className="w-8 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr key={c.id} className="border-b border-input/60 last:border-b-0">
                  <td className="px-3 py-1.5">
                    <p className="truncate font-medium">{c.product_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.sku}</p>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      min={1}
                      value={c.quantity}
                      onChange={(e) => updateQuantity(c.id, Number(e.target.value))}
                      className="h-7 w-16 rounded-none text-right"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {formatCurrency(c.unit_price)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                    {formatCurrency(c.quantity * c.unit_price)}
                  </td>
                  <td className="px-2 py-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 rounded-none p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeComponent(c.id)}
                      aria-label={`Remove ${c.product_name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-2 border-t border-input bg-muted/20 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Components cost total: <span className="font-medium text-foreground">{formatCurrency(total)}</span>
            </p>
            {onApplyCostPrice ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 rounded-none px-2 text-[11px]"
                onClick={() => onApplyCostPrice(total)}
              >
                Use as cost price
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
