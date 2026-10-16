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
import {
  fetchServiceReports,
  SERVICE_JOB_TYPE_LABEL,
  type ServiceReports,
} from "@/lib/api/service-jobs";
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

export default function ServiceReportsPage() {
  const [data, setData] = useState<ServiceReports | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchServiceReports());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load service reports");
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
      { label: "Total jobs", value: String(data?.total ?? 0) },
      { label: "Completed", value: String(data?.completed ?? 0) },
      { label: "Pending", value: String(data?.pending ?? 0) },
      { label: "Service revenue", value: formatCurrency(Number(data?.revenue ?? 0)) },
      { label: "Avg repair (days)", value: data ? String(data.avg_repair_days) : "—" },
      { label: "Warranty jobs", value: String(data?.warranty_jobs ?? 0) },
      { label: "Paid jobs", value: String(data?.paid_jobs ?? 0) },
      { label: "RMA-linked", value: String(data?.rma_linked ?? 0) },
      { label: "External product", value: String(data?.external ?? 0) },
    ],
    [data],
  );

  const techRows = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [name, row] of Object.entries(data?.by_technician ?? {})) {
      map[`${name} (done ${row.completed}/${row.assigned})`] = row.assigned;
    }
    return map;
  }, [data]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div
        data-component="product-grid-filters"
        className="product-grid-filters flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-2"
      >
        <div className="flex shrink-0 items-center gap-2 border-r border-border bg-background pr-2">
          <ListGridHeaderStart title="Service reports">
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
          <CountTable
            title="By type"
            rows={data?.by_type ?? {}}
            labelFor={(key) => SERVICE_JOB_TYPE_LABEL[key] ?? key}
          />
          <CountTable title="By warranty" rows={data?.by_warranty ?? {}} />
          <CountTable title="Technician performance" rows={techRows} />
          <section>
            <div className="border-b border-border bg-muted/30 px-3 py-1.5">
              <h2 className="text-xs font-semibold">Most used parts</h2>
            </div>
            {(data?.top_parts ?? []).length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">No data yet.</p>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {(data?.top_parts ?? []).map((row) => (
                    <tr key={row.sku} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-1.5 font-mono">{row.sku || "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section>
            <div className="border-b border-border bg-muted/30 px-3 py-1.5">
              <h2 className="text-xs font-semibold">Most requested services</h2>
            </div>
            {(data?.top_services ?? []).length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">No data yet.</p>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {(data?.top_services ?? []).map((row) => (
                    <tr key={row.name} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-1.5">{row.name}</td>
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
