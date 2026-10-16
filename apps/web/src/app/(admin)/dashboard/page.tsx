"use client";

/* The company dashboard (/dashboard) — same layout as Website → Dashboard: a period picker (Today … All time),
   sales for the period against the period before, the trend and status split, what needs attention right now,
   stock, and one card per enabled module. Modules the user can't see (module settings / permissions) are left
   out, exactly as in Reports. */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Boxes,
  ClipboardList,
  Coins,
  Minus,
  Package,
  PackageX,
  Scale,
  ShoppingCart,
  Truck,
  Warehouse,
} from "lucide-react";
import { Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "@/lib/api/client";
import { fetchSalesDashboardPeriod, type SalesDashboardPeriod } from "@/lib/api/sales-dashboard";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { useModuleSettingsStore } from "@/lib/store/module-settings-store";
import { isErpReportGroupVisible } from "@/lib/reports/erp-reports";
import { DASHBOARD_WIDGETS, type DashboardWidgetDef } from "@/lib/dashboard/dashboard-widgets";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { formatCurrency } from "@/lib/utils";
import {
  Change,
  DashboardHeader,
  Kpi,
  Panel,
  ShareBars,
  compact,
  periodLabel as labelOf,
  periodRange,
  type PeriodId,
} from "@/components/dashboard/period-dashboard";

type InventorySnapshot = {
  total_skus: number;
  total_units: number;
  total_value: number | string;
  low_stock_count: number;
  out_of_stock_count: number;
  warehouse_count: number;
  movement_count_7d: number;
};

type FinanceSnapshot = {
  receivable_balance: number | string;
  payable_balance: number | string;
  payments_inbound_total: number | string;
  tax_summary?: { net_tax_payable: number | string };
};

const STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "New (unconfirmed)", color: "#64748b" },
  confirmed: { label: "Confirmed", color: "#3b82f6" },
  processing: { label: "Processing", color: "#f59e0b" },
  completed: { label: "Completed", color: "#10b981" },
  cancelled: { label: "Cancelled", color: "#ef4444" },
};
const statusOf = (s: string) => STATUS[s] ?? { label: s.charAt(0).toUpperCase() + s.slice(1), color: "#a1a1aa" };

const fmt = (n: number) => n.toLocaleString("en-US");
const money = (v: unknown) => formatCurrency(Number(v) || 0);

/* the module cards: everything in DASHBOARD_WIDGETS except Finance, which has its own row above */
const MODULE_WIDGETS = DASHBOARD_WIDGETS.filter((w) => w.id !== "finance-summary");

export default function DashboardPage() {
  const [period, setPeriod] = useUserScopedState<PeriodId>("dashboard:period", "30d");
  const range = useMemo(() => periodRange(period), [period]);
  const [reloadKey, setReloadKey] = useState(0);

  /* who sees what — the same gating as Reports */
  const moduleEnabled = useModuleSettingsStore((s) => s.enabled);
  const permissions = useAdminAuth((s) => s.permissions);
  const role = useAdminAuth((s) => s.user?.role);
  const enabledModules = useAdminAuth((s) => s.enabledModules);
  const visibility = useMemo(
    () => ({ moduleEnabled, enabledModules, permissions, role }),
    [moduleEnabled, enabledModules, permissions, role],
  );
  const salesVisible = isErpReportGroupVisible({ moduleIds: ["sales"] }, visibility);
  const inventoryVisible = isErpReportGroupVisible({ moduleIds: ["inventory"] }, visibility);
  const financeVisible = isErpReportGroupVisible({ moduleIds: ["finance"] }, visibility);
  const widgets = useMemo(() => MODULE_WIDGETS.filter((w) => isErpReportGroupVisible(w, visibility)), [visibility]);

  /* sales for the period */
  const [sales, setSales] = useState<SalesDashboardPeriod | null>(null);
  const [salesFor, setSalesFor] = useState<string | null>(null);
  const salesKey = `${period}:${reloadKey}`;
  const salesLoading = salesVisible && salesFor !== salesKey;
  useEffect(() => {
    if (!salesVisible) return;
    let live = true;
    void fetchSalesDashboardPeriod(range.from, range.to)
      .then((d) => {
        if (!live) return;
        setSales(d);
        setSalesFor(salesKey);
      })
      .catch((err) => {
        if (!live) return;
        setSalesFor(salesKey);
        toast.error(err instanceof Error ? err.message : "Couldn't load the sales summary");
      });
    return () => {
      live = false;
    };
  }, [salesVisible, range.from, range.to, salesKey]);

  /* right-now snapshots: stock, money, modules (undefined = loading, null = failed) */
  const [stock, setStock] = useState<InventorySnapshot | null | undefined>(undefined);
  const [finance, setFinance] = useState<FinanceSnapshot | null | undefined>(undefined);
  const [moduleData, setModuleData] = useState<Record<string, unknown>>({});
  useEffect(() => {
    let live = true;
    if (inventoryVisible) {
      apiFetch<{ data: InventorySnapshot }>("/api/v1/inventory/dashboard")
        .then((r) => live && setStock(r.data))
        .catch(() => live && setStock(null));
    }
    if (financeVisible) {
      apiFetch<{ data: FinanceSnapshot }>("/api/v1/finance/dashboard")
        .then((r) => live && setFinance(r.data))
        .catch(() => live && setFinance(null));
    }
    for (const w of widgets) {
      w.fetch()
        .then((d) => live && setModuleData((prev) => ({ ...prev, [w.id]: d })))
        .catch(() => live && setModuleData((prev) => ({ ...prev, [w.id]: null })));
    }
    return () => {
      live = false;
    };
  }, [inventoryVisible, financeVisible, widgets, reloadKey]);

  const cur = sales?.current;
  const prev = sales?.previous;
  const revenue = Number(cur?.revenue ?? 0);
  const periodLabel = labelOf(period);
  const hasTrend = (sales?.series ?? []).some((p) => p.orders > 0);
  const breakdown = useMemo(() => {
    const order = Object.keys(STATUS);
    return Object.entries(cur?.status_breakdown ?? {})
      .filter(([, n]) => n > 0)
      .sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99))
      .map(([status, n]) => ({ key: status, n, ...statusOf(status) }));
  }, [cur]);
  const breakdownTotal = breakdown.reduce((s, r) => s + r.n, 0);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto p-4 [&>*]:shrink-0">
      <DashboardHeader
        title="Dashboard"
        period={period}
        onPeriod={setPeriod}
        onRefresh={() => setReloadKey((k) => k + 1)}
        loading={salesLoading}
      />

      {salesVisible && (
        <>
          {/* sales in the period (every channel: shop, POS, sales orders) */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Kpi
              icon={<BarChart3 className="h-4 w-4" />}
              label="Revenue"
              value={formatCurrency(revenue)}
              foot={<Change now={revenue} before={prev ? Number(prev.revenue) : null} label={range.compare} />}
              href="/sales/orders"
              loading={salesLoading}
            />
            <Kpi
              icon={<ShoppingCart className="h-4 w-4" />}
              label="Orders"
              value={fmt(cur?.order_count ?? 0)}
              foot={<Change now={cur?.order_count ?? 0} before={prev?.order_count} label={range.compare} />}
              href="/sales/orders"
              loading={salesLoading}
            />
            <Kpi
              icon={<Scale className="h-4 w-4" />}
              label="Avg. order value"
              value={formatCurrency(Number(cur?.avg_order_value ?? 0))}
              foot={<Change now={Number(cur?.avg_order_value ?? 0)} before={prev ? Number(prev.avg_order_value) : null} label={range.compare} />}
              loading={salesLoading}
            />
            <Kpi
              icon={<Package className="h-4 w-4" />}
              label="Completed"
              tone="good"
              value={fmt(cur?.completed_count ?? 0)}
              foot={<Change now={cur?.completed_count ?? 0} before={prev?.completed_count} label={range.compare} />}
              href="/sales/orders"
              loading={salesLoading}
            />
            <Kpi
              icon={<Minus className="h-4 w-4" />}
              label="Cancelled"
              tone="bad"
              value={fmt(cur?.cancelled_count ?? 0)}
              foot={<Change now={cur?.cancelled_count ?? 0} before={prev?.cancelled_count} label={range.compare} invert />}
              href="/sales/orders"
              loading={salesLoading}
            />
          </div>

          {/* trend + status */}
          <div className="grid gap-3 lg:grid-cols-3">
            <Panel
              title={`Sales trend · ${sales?.by_month ? "by month" : "by day"}`}
              className="lg:col-span-2"
              action={
                <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#00a09d]" />Revenue</span>
                  <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#6366f1]" />Orders</span>
                </span>
              }
            >
              {salesLoading ? (
                <div className="fb-shimmer h-[240px] w-full rounded" />
              ) : !hasTrend ? (
                <div className="flex h-[240px] flex-col items-center justify-center gap-1 text-center">
                  <ShoppingCart className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">No orders {periodLabel.toLowerCase()}</p>
                  <p className="text-xs text-muted-foreground">Try a longer period above.</p>
                </div>
              ) : (
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={sales?.series ?? []} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="dashRevFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00a09d" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#00a09d" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} minTickGap={16} />
                      <YAxis yAxisId="rev" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => compact(Number(v))} />
                      <YAxis yAxisId="ord" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        formatter={(value, name) => (name === "sales" ? [formatCurrency(Number(value)), "Revenue"] : [String(value), "Orders"])}
                      />
                      <Bar yAxisId="ord" dataKey="orders" fill="#6366f1" opacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={22} />
                      <Area yAxisId="rev" type="monotone" dataKey="sales" stroke="#00a09d" strokeWidth={2} fill="url(#dashRevFill)" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel title="Orders by status" action={<span className="text-[11px] text-muted-foreground">{fmt(breakdownTotal)} orders</span>}>
              {salesLoading ? (
                <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="fb-shimmer h-6 rounded" />)}</div>
              ) : (
                <ShareBars rows={breakdown} empty={`No orders ${periodLabel.toLowerCase()}.`} />
              )}
            </Panel>
          </div>
        </>
      )}

      {/* latest orders + right now */}
      <div className="grid gap-3 lg:grid-cols-3">
        {salesVisible && (
          <Panel
            title={`Latest orders · ${periodLabel.toLowerCase()}`}
            className="lg:col-span-2"
            action={<Link href="/sales/orders" className="text-xs text-[#00a09d] hover:underline">View all</Link>}
          >
            {salesLoading ? (
              <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="fb-shimmer h-7 rounded" />)}</div>
            ) : (sales?.recent_orders ?? []).length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No orders {periodLabel.toLowerCase()}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1.5 pr-2 font-medium">Order</th>
                      <th className="py-1.5 pr-2 font-medium">Date</th>
                      <th className="py-1.5 pr-2 font-medium">Customer</th>
                      <th className="py-1.5 pr-2 font-medium">Status</th>
                      <th className="py-1.5 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sales?.recent_orders ?? []).map((o) => (
                      <tr key={o.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="py-1.5 pr-2">
                          <Link href="/sales/orders" className="font-medium text-[#00a09d] hover:underline">{o.order_number}</Link>
                        </td>
                        <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">{o.order_date?.slice(0, 10)}</td>
                        <td className="max-w-[180px] truncate py-1.5 pr-2">{o.customer_name || "—"}</td>
                        <td className="py-1.5 pr-2">
                          <span
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
                            style={{ color: statusOf(o.status).color, background: `${statusOf(o.status).color}1a` }}
                          >
                            {statusOf(o.status).label}
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{money(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}

        <Panel title="Needs attention · right now" className={salesVisible ? undefined : "lg:col-span-3"}>
          <div className="grid grid-cols-2 gap-2">
            {salesVisible && (
              <>
                <Kpi icon={<ShoppingCart className="h-4 w-4" />} label="Open orders" tone="warn" value={fmt(sales?.open_order_count ?? 0)} foot={<span className="text-muted-foreground">to confirm / process</span>} href="/sales/orders" loading={!sales} />
                <Kpi icon={<Truck className="h-4 w-4" />} label="To deliver" tone="warn" value={fmt(sales?.pending_delivery_count ?? 0)} foot={<span className="text-muted-foreground">confirmed, not shipped</span>} href="/sales/orders" loading={!sales} />
                <Kpi icon={<BookOpen className="h-4 w-4" />} label="Open quotations" value={fmt(sales?.open_quotation_count ?? 0)} foot={<span className="text-muted-foreground">not confirmed</span>} href="/sales/quotations" loading={!sales} />
              </>
            )}
            {inventoryVisible && (
              <>
                <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Low stock" tone={stock?.low_stock_count ? "warn" : "good"} value={fmt(stock?.low_stock_count ?? 0)} href="/inventory/stock?status=low_stock" loading={stock === undefined} />
                <Kpi icon={<PackageX className="h-4 w-4" />} label="Out of stock" tone={stock?.out_of_stock_count ? "bad" : "good"} value={fmt(stock?.out_of_stock_count ?? 0)} href="/inventory/stock?status=out_of_stock" loading={stock === undefined} />
              </>
            )}
            {financeVisible && (
              <>
                <Kpi icon={<ArrowDownLeft className="h-4 w-4" />} label="To receive" tone="warn" value={money(finance?.receivable_balance)} foot={<span className="text-muted-foreground">receivables</span>} href="/finance/dashboard" loading={finance === undefined} />
                <Kpi icon={<ArrowUpRight className="h-4 w-4" />} label="To pay" tone="warn" value={money(finance?.payable_balance)} foot={<span className="text-muted-foreground">payables</span>} href="/finance/dashboard" loading={finance === undefined} />
                <Kpi icon={<Coins className="h-4 w-4" />} label="Net tax payable" value={money(finance?.tax_summary?.net_tax_payable)} href="/finance/dashboard" loading={finance === undefined} />
              </>
            )}
          </div>
        </Panel>
      </div>

      {/* stock */}
      {inventoryVisible && (
        <Panel title="Stock right now" action={<Link href="/inventory/dashboard" className="text-xs text-[#00a09d] hover:underline">Inventory dashboard</Link>}>
          {stock === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Couldn&apos;t load the stock summary.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
              <Kpi icon={<Boxes className="h-4 w-4" />} label="SKUs" value={fmt(stock?.total_skus ?? 0)} href="/inventory/stock" loading={stock === undefined} />
              <Kpi icon={<ClipboardList className="h-4 w-4" />} label="Units on hand" value={fmt(stock?.total_units ?? 0)} href="/inventory/stock" loading={stock === undefined} />
              <Kpi icon={<Coins className="h-4 w-4" />} label="Stock value" value={money(stock?.total_value)} href="/inventory/stock" loading={stock === undefined} />
              <Kpi icon={<Warehouse className="h-4 w-4" />} label="Warehouses" value={fmt(stock?.warehouse_count ?? 0)} href="/inventory/warehouses" loading={stock === undefined} />
              <Kpi icon={<Truck className="h-4 w-4" />} label="Movements" value={fmt(stock?.movement_count_7d ?? 0)} foot={<span className="text-muted-foreground">last 7 days</span>} href="/inventory/movements" loading={stock === undefined} />
            </div>
          )}
        </Panel>
      )}

      {/* one card per enabled module */}
      {widgets.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {widgets.map((w) => (
            <ModuleCard key={w.id} widget={w} data={moduleData[w.id]} />
          ))}
        </div>
      )}
    </div>
  );
}

/** a module's right-now numbers (undefined = loading, null = failed) */
function ModuleCard({ widget, data }: { widget: DashboardWidgetDef; data: unknown }) {
  const stats = data ? widget.mapToStats(data) : [];
  return (
    <Panel
      title={widget.title}
      action={<Link href={widget.href} className="text-xs text-[#00a09d] hover:underline">Open</Link>}
    >
      {data === null ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Couldn&apos;t load {widget.title}.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {(data === undefined ? [0, 1, 2] : stats).map((s, i) => (
            <Link key={typeof s === "number" ? i : s.id} href={widget.href} className="min-w-0 rounded-md border bg-muted/20 px-2.5 py-2 hover:border-primary/40">
              {typeof s === "number" ? (
                <>
                  <span className="fb-shimmer block h-3 w-14 rounded" />
                  <span className="fb-shimmer mt-1.5 block h-5 w-16 rounded" />
                </>
              ) : (
                <>
                  <span className="block truncate text-[11px] text-muted-foreground">{s.label}</span>
                  <span className="block truncate text-base font-semibold tabular-nums" title={s.value}>{s.value}</span>
                </>
              )}
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}
