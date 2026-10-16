"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  fetchServiceDashboard,
  SERVICE_JOB_STATUS_LABEL,
  type ServiceDashboard,
} from "@/lib/api/service-jobs";
import { cn, formatCurrency } from "@/lib/utils";

const STATUS_ORDER = [
  "received",
  "diagnosis",
  "waiting_approval",
  "approved",
  "in_progress",
  "waiting_parts",
  "ready_for_qc",
  "ready_for_delivery",
  "completed",
  "on_hold",
  "cancelled",
  "rejected",
];

function Kpi({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "danger";
  onClick?: () => void;
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "danger"
          ? "text-red-600 dark:text-red-400"
          : "";
  const body = (
    <div className="border border-border bg-background px-4 py-3 hover:bg-muted/30">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", toneClass)}>{value}</p>
    </div>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="text-left">
      {body}
    </button>
  ) : (
    body
  );
}

export default function ServiceDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<ServiceDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchServiceDashboard());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load service dashboard");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const overdue = data?.overdue ?? 0;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div
        data-component="product-grid-filters"
        className="product-grid-filters flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-2"
      >
        <div className="flex shrink-0 items-center gap-2 border-r border-border bg-background pr-2">
          <ListGridHeaderStart title="Service dashboard">
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Total job cards" value={String(data?.total ?? 0)} />
          <Kpi label="Today" value={String(data?.today ?? 0)} />
          <Kpi
            label="Open"
            value={String(data?.open ?? 0)}
            onClick={() => router.push("/service/jobs")}
          />
          <Kpi
            label="Overdue"
            value={String(overdue)}
            tone={overdue > 0 ? "danger" : "good"}
            onClick={() => router.push("/service/jobs?status=overdue")}
          />
          <Kpi
            label="Completed"
            value={String(data?.completed ?? 0)}
            tone="good"
            onClick={() => router.push("/service/jobs?status=completed")}
          />
          <Kpi label="Billed amount" value={formatCurrency(Number(data?.billed_amount ?? 0))} tone="good" />
        </div>

        <div className="mt-5">
          <div className="border border-border">
            <div className="border-b border-border px-3 py-2">
              <span className="text-xs font-semibold">By status</span>
            </div>
            <div className="divide-y divide-border/60">
              {STATUS_ORDER.map((status) => {
                const count = data?.status_breakdown[status] ?? 0;
                if (!count && !["received", "in_progress", "completed"].includes(status)) return null;
                return (
                  <button
                    key={status}
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-muted/30"
                    onClick={() => router.push(`/service/jobs?status=${status}`)}
                  >
                    <span>{SERVICE_JOB_STATUS_LABEL[status] ?? status}</span>
                    <span className="tabular-nums font-medium">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
