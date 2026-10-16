"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchReorderSuggestions, type ApiReorderSuggestion } from "@/lib/api/inventory";
import { purchaseOrderCreateHref } from "@/lib/purchase/purchase-paths";
import { cn } from "@/lib/utils";

export default function ReorderSuggestionsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ApiReorderSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchReorderSuggestions());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reorder suggestions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "inventory-reorder-api" });
  }, [error]);

  return (
    <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-2">
        <span className="text-xs text-muted-foreground">
          Items where available stock has dropped to or below the reorder level.
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-background px-3 py-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border bg-background">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead className="sticky top-0 z-[1] border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Warehouse</th>
                  <th className="px-3 py-2 text-right font-medium">Available</th>
                  <th className="px-3 py-2 text-right font-medium">Reorder level</th>
                  <th className="px-3 py-2 text-right font-medium">Suggested qty</th>
                  <th className="px-3 py-2 font-medium">Preferred supplier</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                      Nothing needs reordering right now.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={`${row.item_id}:${row.warehouse_id}`}
                      className="border-b border-border/60 last:border-b-0 hover:bg-muted/30"
                    >
                      <td className="px-3 py-2 font-mono text-[11px]">{row.sku}</td>
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.warehouse_name}</td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          row.available <= 0 && "font-medium text-red-600 dark:text-red-400",
                        )}
                      >
                        {row.available}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {row.reorder_level}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{row.suggested_qty}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.preferred_supplier_name ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 rounded-none text-[11px]"
                          onClick={() =>
                            router.push(
                              purchaseOrderCreateHref({
                                supplierId: row.preferred_supplier_id,
                                warehouseId: row.warehouse_id,
                                lines: [{ sku: row.sku, qty: row.suggested_qty }],
                              }),
                            )
                          }
                        >
                          <ShoppingCart className="mr-1 h-3 w-3" /> Create PO
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex h-[34px] shrink-0 items-center gap-2 border-t border-border bg-background px-2.5">
        <span className="text-sm font-medium">Reorder suggestions</span>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} aria-label="Refresh">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{loading ? "…" : `${rows.length} items`}</span>
      </div>
    </div>
  );
}
