"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BarChart3,
  Box,
  CheckCircle2,
  List,
  UserCheck,
  Wrench,
} from "lucide-react";
import {
  formatAssetMoney,
  pctOfTotal,
} from "@/lib/mock-data/hrm-assets-dashboard";
import {
  getAssetsDashboardData,
  type AssetsDashboardData,
} from "@/lib/api/hrm-assets";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

const EMPTY_DASHBOARD: AssetsDashboardData = {
  stats: {
    totalAssets: 0,
    available: 0,
    assigned: 0,
    underMaintenance: 0,
    totalPurchaseValue: 0,
    totalCurrentValue: 0,
    totalDepreciation: 0,
  },
  distribution: [],
  recentAssignments: [],
  upcomingMaintenance: [],
  expiringWarranties: [],
};

export function HrmAssetsDashboard() {
  const [data, setData] = useState<AssetsDashboardData>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const next = await getAssetsDashboardData();
        if (!cancelled) setData(next);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load dashboard");
          setData(EMPTY_DASHBOARD);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = data.stats;
  const availablePct = pctOfTotal(stats.available, stats.totalAssets);
  const assignedPct = pctOfTotal(stats.assigned, stats.totalAssets);
  const maintenancePct = pctOfTotal(stats.underMaintenance, stats.totalAssets);
  const depreciationPct = pctOfTotal(stats.totalDepreciation, stats.totalPurchaseValue);
  const maxCategory = useMemo(
    () => Math.max(...data.distribution.map((d) => d.count), 1),
    [data.distribution],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Asset Dashboard
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild type="button" variant="outline" size="sm" className="h-9 rounded-none">
            <Link href="/hrm/assets">
              <List className="size-3.5" />
              Asset List
            </Link>
          </Button>
          <Button asChild type="button" variant="outline" size="sm" className="h-9 rounded-none">
            <Link href="/hrm/assets/depreciation">
              <BarChart3 className="size-3.5" />
              Depreciation Report
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-none border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          Loading dashboard...
        </div>
      ) : null}

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Assets"
          value={String(stats.totalAssets)}
          subtitle="All registered assets"
          icon={<Box className="size-4" />}
          iconClass="border-border bg-muted/50 text-muted-foreground"
        />
        <KpiCard
          title="Available"
          value={String(stats.available)}
          subtitle={`${availablePct}% of total`}
          icon={<CheckCircle2 className="size-4" />}
          iconClass="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          progress={availablePct}
          progressClass="bg-emerald-500"
        />
        <KpiCard
          title="Assigned"
          value={String(stats.assigned)}
          subtitle={`${assignedPct}% of total`}
          icon={<UserCheck className="size-4" />}
          iconClass="border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
          progress={assignedPct}
          progressClass="bg-sky-500"
        />
        <KpiCard
          title="Under Maintenance"
          value={String(stats.underMaintenance)}
          subtitle={`${maintenancePct}% of total`}
          icon={<Wrench className="size-4" />}
          iconClass="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          progress={maintenancePct}
          progressClass="bg-amber-500"
        />
      </div>

      {/* Value summary */}
      <div className="rounded-none border border-border bg-card p-4">
        <div className="mb-4 text-sm font-semibold text-foreground">Asset Value Summary</div>
        <div className="grid gap-4 sm:grid-cols-3">
          <ValueStat
            label="Total Purchase Value"
            value={formatAssetMoney(stats.totalPurchaseValue)}
          />
          <ValueStat
            label="Total Current Value"
            value={formatAssetMoney(stats.totalCurrentValue)}
          />
          <ValueStat
            label="Total Depreciation"
            value={formatAssetMoney(stats.totalDepreciation)}
            valueClass="text-red-600 dark:text-red-400"
          />
        </div>
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Depreciation Progress</span>
            <span className="tabular-nums">{depreciationPct}%</span>
          </div>
          <div className="h-2 w-full rounded-none bg-muted">
            <div
              className="h-full rounded-none bg-red-500/80"
              style={{ width: `${depreciationPct}%` }}
            />
          </div>
        </div>
        <div className="mt-4">
          <Button asChild type="button" size="sm" className={cn("h-9", GREEN_BTN)}>
            <Link href="/hrm/assets/depreciation">View Depreciation Report</Link>
          </Button>
        </div>
      </div>

      {/* Distribution + Recent */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-none border border-border bg-card p-4">
          <div className="mb-3 text-sm font-semibold text-foreground">Asset Distribution</div>
          {data.distribution.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assets yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.distribution.map((item) => (
                <li key={item.category} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-foreground">{item.category}</span>
                    <span className="tabular-nums text-muted-foreground">{item.count}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-none bg-muted">
                    <div
                      className="h-full rounded-none bg-[#4caf50]"
                      style={{ width: `${(item.count / maxCategory) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-none border border-border bg-card p-4">
          <div className="mb-3 text-sm font-semibold text-foreground">Recent Assignments</div>
          {data.recentAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent assignments.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentAssignments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {a.assetName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.employeeName} · {a.assignedDate}
                    </div>
                  </div>
                  <Button
                    asChild
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 rounded-none text-sky-600 dark:text-sky-400"
                  >
                    <Link href="/hrm/assets">View</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Maintenance + Warranties */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-none border border-border bg-card p-4">
          <div className="mb-3 text-sm font-semibold text-foreground">Upcoming Maintenance</div>
          {data.upcomingMaintenance.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming maintenance.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.upcomingMaintenance.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {m.assetName}
                    </div>
                    <div className="text-xs text-muted-foreground">{m.type}</div>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {m.dueDate}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-none border border-border bg-card p-4">
          <div className="mb-3 text-sm font-semibold text-foreground">Expiring Warranties</div>
          {data.expiringWarranties.length === 0 ? (
            <p className="text-sm text-muted-foreground">No warranties expiring soon.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.expiringWarranties.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {w.assetName}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-amber-700 dark:text-amber-300">
                    {w.expiryDate}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  iconClass,
  progress,
  progressClass,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  iconClass: string;
  progress?: number;
  progressClass?: string;
}) {
  return (
    <div className="rounded-none border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">{title}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
        </div>
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-none border",
            iconClass,
          )}
        >
          {icon}
        </div>
      </div>
      {typeof progress === "number" ? (
        <div className="mt-3 h-1.5 w-full rounded-none bg-muted">
          <div
            className={cn("h-full rounded-none", progressClass)}
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function ValueStat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold tabular-nums text-foreground", valueClass)}>
        {value}
      </div>
    </div>
  );
}
