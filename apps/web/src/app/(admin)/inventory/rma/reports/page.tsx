"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { fetchRmaReports, RESOLUTION_LABEL, WARRANTY_LABEL, type RmaReports } from "@/lib/api/rma";
import { cn, formatCurrency } from "@/lib/utils";

function CountTable({
  title,
  rows,
  labelFor,
}: {
  title: string;
  rows: Record<string, number>;
  labelFor?: (key: string) => string;
}) {
  const entries = Object.entries(rows).sort((a, b) => b[1] - a[1]);
  return (
    <section className="min-h-0 border-r border-border last:border-r-0">
      <div className="border-b border-border bg-muted/30 px-3 py-1.5">
        <h2 className="text-xs font-semibold">{title}</h2>
      </div>
      {entries.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {entries.map(([key, count]) => (
              <tr key={key} className="border-b border-border last:border-b-0">
                <td className="px-3 py-1.5">{labelFor ? labelFor(key) : key}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function RmaReportsPage() {
  const [data, setData] = useState<RmaReports | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchRmaReports());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load RMA reports");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () => [
      { label: "Total RMA", value: String(data?.total ?? 0) },
      { label: "Open", value: String(data?.open ?? 0) },
      { label: "Refund amount", value: formatCurrency(Number(data?.refund_amount ?? 0)) },
      { label: "Repair charges", value: formatCurrency(Number(data?.repair_charges ?? 0)) },
      { label: "Avg resolution (days)", value: data ? String(data.avg_resolution_days) : "—" },
    ],
    [data],
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div
        data-component="product-grid-filters"
        className="product-grid-filters flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-2"
      >
        <div className="flex shrink-0 items-center gap-2 border-r border-border bg-background pr-2">
          <ListGridHeaderStart title="RMA reports">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-[26px] w-[26px] shrink-0 rounded-none"
                  aria-label="Settings"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[11rem]">
                <DropdownMenuItem onClick={() => void load()} disabled={loading}>
                  <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
                  Refresh
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ListGridHeaderStart>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 border-b border-border bg-muted/30 text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Metric</th>
              <th className="px-3 py-1.5 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((row) => (
              <tr key={row.label} className="border-b border-border">
                <td className="px-3 py-1.5">{row.label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid min-h-0 grid-cols-1 border-b border-border lg:grid-cols-2">
          <CountTable title="By reason" rows={data?.by_reason ?? {}} />
          <CountTable
            title="By warranty"
            rows={data?.by_warranty ?? {}}
            labelFor={(key) => WARRANTY_LABEL[key as keyof typeof WARRANTY_LABEL] ?? key}
          />
          <CountTable
            title="By resolution"
            rows={data?.by_resolution ?? {}}
            labelFor={(key) => RESOLUTION_LABEL[key] ?? key}
          />
          <section>
            <div className="border-b border-border bg-muted/30 px-3 py-1.5">
              <h2 className="text-xs font-semibold">By product</h2>
            </div>
            {(data?.by_product ?? []).length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">No data yet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="border-b border-border text-left text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">SKU</th>
                    <th className="px-3 py-1.5 font-medium">Product</th>
                    <th className="px-3 py-1.5 text-right font-medium">RMA</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.by_product ?? []).map((row) => (
                    <tr key={`${row.sku}-${row.name}`} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-1.5 font-mono">{row.sku || "—"}</td>
                      <td className="px-3 py-1.5">{row.name || "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
