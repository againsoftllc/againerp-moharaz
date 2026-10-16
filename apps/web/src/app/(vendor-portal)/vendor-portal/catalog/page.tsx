"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LineNumericInput } from "@/components/sales/sales-order-line-row-cells";
import { VendorPortalChrome } from "@/components/vendor-portal/vendor-portal-chrome";
import {
  fetchVendorPortalProducts,
  setVendorPortalCartItem,
  type VendorPortalProduct,
} from "@/lib/api/vendor-portal";
import { cn, formatMoney } from "@/lib/utils";

const STOCK_TONE: Record<string, string> = {
  in_stock: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  low_stock: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  out_of_stock: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  unavailable: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

function money(value: string | number) {
  return formatMoney(value);
}

export default function VendorPortalCatalogPage() {
  const [products, setProducts] = useState<VendorPortalProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, number>>({});
  const [addingId, setAddingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchVendorPortalProducts({ search: search.trim() || undefined, limit: 100 });
      setProducts(res.data);
      setTotal(res.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the catalog");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const handle = setTimeout(() => void load(), 250);
    return () => clearTimeout(handle);
  }, [load]);

  async function addToCart(p: VendorPortalProduct) {
    if (!p.item_id) return;
    const qty = Math.max(p.min_order_quantity, qtyDrafts[p.id] ?? p.min_order_quantity);
    setAddingId(p.id);
    try {
      await setVendorPortalCartItem(p.item_id, qty);
      toast.success(`${p.sku} added to cart`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add to cart");
    } finally {
      setAddingId(null);
    }
  }

  return (
    <VendorPortalChrome>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-sm font-semibold">Catalog</h1>
        <span className="text-[11px] text-muted-foreground">{total} products</span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 rounded-none"
          aria-label="Refresh"
          onClick={() => void load()}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
        <div className="relative ml-auto w-[240px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="rounded-none pl-7"
          />
        </div>
      </div>

      <div className="border border-border">
        {loading ? (
          <p className="px-3 py-6 text-xs text-muted-foreground">Loading…</p>
        ) : products.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <ShoppingCart className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm font-medium">No products found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-xs">
              <thead className="border-b border-border bg-muted/40 text-left text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 font-medium">SKU</th>
                  <th className="px-3 py-1.5 font-medium">Product</th>
                  <th className="px-3 py-1.5 font-medium">Brand</th>
                  <th className="px-3 py-1.5 text-right font-medium">Price</th>
                  <th className="px-3 py-1.5 font-medium">Stock</th>
                  <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                  <th className="px-3 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const qty = qtyDrafts[p.id] ?? p.min_order_quantity;
                  const discounted = Number(p.discount_percent) > 0;
                  return (
                    <tr key={p.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-1.5 font-mono text-[11px]">{p.sku}</td>
                      <td className="max-w-[240px] truncate px-3 py-1.5">{p.name}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{p.brand ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {discounted && (
                          <span className="mr-1.5 text-muted-foreground line-through">{money(p.list_price)}</span>
                        )}
                        <span className="font-medium">{money(p.unit_price)}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge variant="outline" className={cn("rounded-none text-[10px]", STOCK_TONE[p.stock_status] ?? STOCK_TONE.unavailable)}>
                          {p.stock_label}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="ml-auto w-[72px]">
                          <LineNumericInput
                            value={qty}
                            min={p.min_order_quantity}
                            onChange={(next) => setQtyDrafts((prev) => ({ ...prev, [p.id]: next }))}
                            className="w-full border border-input bg-transparent px-1.5 py-0.5 text-right text-[11px] outline-none focus:border-primary"
                            steppers
                          />
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Button
                          size="sm"
                          className="h-6 rounded-none text-[11px]"
                          disabled={!p.orderable || !p.item_id || addingId === p.id}
                          onClick={() => void addToCart(p)}
                        >
                          {addingId === p.id ? "Adding…" : "Add"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </VendorPortalChrome>
  );
}
