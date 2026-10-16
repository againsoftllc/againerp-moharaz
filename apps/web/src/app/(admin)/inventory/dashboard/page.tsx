"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Coins,
  PackageX,
  Repeat,
  ShoppingBag,
  SlidersHorizontal,
  Warehouse,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchInventoryDashboardPeriod, type InventoryDashboardPeriod } from "@/lib/api/inventory";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { formatCurrency } from "@/lib/utils";
import {
  Change,
  DashboardHeader,
  Kpi,
  Panel,
  ShareBars,
  compact,
  periodLabel,
  periodRange,
  type PeriodId,
} from "@/components/dashboard/period-dashboard";

/** product availability as the shop shows it (catalogue stock status) */
const AVAILABILITY: Record<string, { label: string; color: string }> = {
  in_stock: { label: "In stock", color: "#10b981" },
  out_of_stock: { label: "Out of stock", color: "#ef4444" },
  coming_soon: { label: "Coming soon", color: "#6366f1" },
  pre_order: { label: "Pre-order", color: "#f59e0b" },
  call_for_price: { label: "Call for price", color: "#0ea5e9" },
  discontinued: { label: "Discontinued", color: "#94a3b8" },
};
const availabilityOf = (s: string) =>
  AVAILABILITY[s] ?? { label: s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), color: "#a1a1aa" };

const MOVEMENT_LABELS: Record<string, string> = {
  opening: "Opening stock",
  opening_stock: "Opening stock",
  purchase_receipt: "Purchase receipt",
  receipt: "Receipt",
  sale: "Sale",
  sales_delivery: "Sales delivery",
  delivery: "Delivery",
  sales_return: "Sales return",
  purchase_return: "Purchase return",
  adjustment: "Adjustment",
  adjustment_in: "Adjustment (in)",
  adjustment_out: "Adjustment (out)",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  stock_count: "Stock count",
  pos_sale: "POS sale",
};
const movementLabel = (t: string) => MOVEMENT_LABELS[t] ?? t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const n = (v: number | string | undefined | null) => Number(v ?? 0);
const fmt = (v: number) => v.toLocaleString("en-US");

export default function InventoryDashboardPage() {
  const [period, setPeriod] = useUserScopedState<PeriodId>("inventory-dashboard:period", "30d");
  const range = useMemo(() => periodRange(period), [period]);
  const [data, setData] = useState<InventoryDashboardPeriod | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loading = loadedFor !== `${period}:${reloadKey}`;

  useEffect(() => {
    let live = true;
    const key = `${period}:${reloadKey}`;
    void fetchInventoryDashboardPeriod(range.from, range.to)
      .then((d) => {
        if (!live) return;
        setData(d);
        setLoadedFor(key);
      })
      .catch((err) => {
        if (!live) return;
        setLoadedFor(key);
        toast.error(err instanceof Error ? err.message : "Couldn't load the inventory summary");
      });
    return () => {
      live = false;
    };
  }, [period, range.from, range.to, reloadKey]);

  const cur = data?.current;
  const prev = data?.previous;
  const label = periodLabel(period);
  const snap = data?.snapshot;
  const att = data?.attention;
  const hasTrend = (data?.series ?? []).some((p) => p.units_in || p.units_out);
  const availabilityRows = useMemo(
    () =>
      Object.entries(data?.availability ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([status, count]) => ({ key: status, n: count, ...availabilityOf(status) })),
    [data],
  );
  const byType = useMemo(
    () =>
      Object.entries(cur?.by_type ?? {})
        .map(([t, v]) => ({ type: t, ...v }))
        .sort((a, b) => b.units_in + b.units_out - (a.units_in + a.units_out)),
    [cur],
  );
  const snapshotLoading = !data;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto p-4">
      <DashboardHeader
        title="Inventory Dashboard"
        period={period}
        onPeriod={setPeriod}
        onRefresh={() => setReloadKey((k) => k + 1)}
        loading={loading}
      />

      {/* stock movement in the period */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          icon={<ArrowDownToLine className="h-4 w-4" />}
          label="Stock in (units)"
          tone="good"
          value={fmt(cur?.units_in ?? 0)}
          foot={<Change now={cur?.units_in ?? 0} before={prev?.units_in} label={range.compare} />}
          href="/inventory/movements"
          loading={loading}
        />
        <Kpi
          icon={<ArrowUpFromLine className="h-4 w-4" />}
          label="Stock out (units)"
          tone="warn"
          value={fmt(cur?.units_out ?? 0)}
          foot={<Change now={cur?.units_out ?? 0} before={prev?.units_out} label={range.compare} />}
          href="/inventory/movements"
          loading={loading}
        />
        <Kpi
          icon={<Repeat className="h-4 w-4" />}
          label="Net change (units)"
          value={`${(cur?.units_in ?? 0) - (cur?.units_out ?? 0) >= 0 ? "+" : ""}${fmt((cur?.units_in ?? 0) - (cur?.units_out ?? 0))}`}
          foot={<span className="text-muted-foreground">in − out, {label.toLowerCase()}</span>}
          loading={loading}
        />
        <Kpi
          icon={<ArrowLeftRight className="h-4 w-4" />}
          label="Movements"
          value={fmt(cur?.movement_count ?? 0)}
          foot={<Change now={cur?.movement_count ?? 0} before={prev?.movement_count} label={range.compare} />}
          href="/inventory/movements"
          loading={loading}
        />
      </div>

      {/* trend + availability */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel
          title={`Stock in / out · ${data?.by_month ? "by month" : "by day"}`}
          className="lg:col-span-2"
          action={
            <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#10b981]" />In</span>
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#f59e0b]" />Out</span>
            </span>
          }
        >
          {loading ? (
            <div className="fb-shimmer h-[240px] w-full rounded" />
          ) : !hasTrend ? (
            <div className="flex h-[240px] flex-col items-center justify-center gap-1 text-center">
              <ArrowLeftRight className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">No stock movements {label.toLowerCase()}</p>
              <p className="text-xs text-muted-foreground">Receipts, deliveries, adjustments and transfers show here.</p>
            </div>
          ) : (
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.series ?? []} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} minTickGap={16} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => compact(Number(v))} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(value, name) => [fmt(Number(value)), name === "units_in" ? "In" : "Out"]}
                  />
                  <Bar dataKey="units_in" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="units_out" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          title="Product availability"
          action={<Link href="/inventory/catalog" className="text-xs text-[#00a09d] hover:underline">Catalog</Link>}
        >
          {snapshotLoading ? (
            <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="fb-shimmer h-6 rounded" />)}</div>
          ) : (
            <ShareBars rows={availabilityRows} empty="No products yet." />
          )}
        </Panel>
      </div>

      {/* stock right now */}
      <Panel title="Stock right now" action={<Link href="/inventory/stock" className="text-xs text-[#00a09d] hover:underline">Stock levels</Link>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Kpi icon={<Boxes className="h-4 w-4" />} label="SKUs in stock list" value={fmt(snap?.total_skus ?? 0)} href="/inventory/stock" loading={snapshotLoading} />
          <Kpi icon={<ClipboardList className="h-4 w-4" />} label="Units on hand" value={fmt(snap?.total_units ?? 0)} href="/inventory/stock" loading={snapshotLoading} />
          <Kpi
            icon={<Coins className="h-4 w-4" />}
            label="Stock value"
            value={formatCurrency(n(snap?.total_value))}
            foot={n(snap?.total_value) === 0 ? <span className="text-muted-foreground">add unit costs to see value</span> : <span className="text-muted-foreground">at unit cost</span>}
            href="/inventory/stock"
            loading={snapshotLoading}
          />
          <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Low stock" tone={snap?.low_stock_count ? "warn" : "good"} value={fmt(snap?.low_stock_count ?? 0)} href="/inventory/stock?status=low_stock" loading={snapshotLoading} />
          <Kpi icon={<PackageX className="h-4 w-4" />} label="Out of stock" tone={snap?.out_of_stock_count ? "bad" : "good"} value={fmt(snap?.out_of_stock_count ?? 0)} href="/inventory/stock?status=out_of_stock" loading={snapshotLoading} />
          <Kpi icon={<Warehouse className="h-4 w-4" />} label="Warehouses" value={fmt(snap?.warehouse_count ?? 0)} href="/inventory/warehouses" loading={snapshotLoading} />
        </div>
      </Panel>

      {/* latest movements + needs attention */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel
          title={`Latest movements · ${label.toLowerCase()}`}
          className="lg:col-span-2"
          action={<Link href="/inventory/movements" className="text-xs text-[#00a09d] hover:underline">View all</Link>}
        >
          {loading ? (
            <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="fb-shimmer h-7 rounded" />)}</div>
          ) : (data?.recent_movements ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No stock movements {label.toLowerCase()}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Date</th>
                    <th className="py-1.5 pr-2 font-medium">Product</th>
                    <th className="py-1.5 pr-2 font-medium">Type</th>
                    <th className="py-1.5 pr-2 font-medium">Warehouse</th>
                    <th className="py-1.5 text-right font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recent_movements ?? []).map((m) => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">{m.date ?? "—"}</td>
                      <td className="max-w-[280px] py-1.5 pr-2">
                        <span className="block truncate" title={m.name}>{m.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{m.sku}{m.reference ? ` · ${m.reference}` : ""}</span>
                      </td>
                      <td className="py-1.5 pr-2">{movementLabel(m.movement_type)}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{m.warehouse}</td>
                      <td className={`py-1.5 text-right font-medium tabular-nums ${m.change >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {m.change >= 0 ? "+" : ""}{fmt(m.change)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Needs attention · right now">
          <div className="grid grid-cols-2 gap-2">
            <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="To reorder" tone={att?.reorder_suggestions ? "warn" : "good"} value={fmt(att?.reorder_suggestions ?? 0)} foot={<span className="text-muted-foreground">at / below reorder level</span>} href="/inventory/reorder-suggestions" loading={snapshotLoading} />
            <Kpi icon={<ShoppingBag className="h-4 w-4" />} label="Open purchase orders" tone={att?.open_purchase_orders ? "warn" : "good"} value={fmt(att?.open_purchase_orders ?? 0)} foot={<span className="text-muted-foreground">not fully received</span>} href="/inventory/purchase/orders" loading={snapshotLoading} />
            <Kpi icon={<ArrowLeftRight className="h-4 w-4" />} label="Transfers" tone={att?.transfers_in_transit ? "warn" : "good"} value={fmt(att?.transfers_in_transit ?? 0)} foot={<span className="text-muted-foreground">draft / in transit</span>} href="/inventory/transfers" loading={snapshotLoading} />
            <Kpi icon={<ClipboardCheck className="h-4 w-4" />} label="Stock counts" tone={att?.stock_counts_open ? "warn" : "good"} value={fmt(att?.stock_counts_open ?? 0)} foot={<span className="text-muted-foreground">in progress</span>} href="/inventory/stock-counts" loading={snapshotLoading} />
            <Kpi icon={<SlidersHorizontal className="h-4 w-4" />} label="Adjustments" tone={att?.adjustments_draft ? "warn" : "good"} value={fmt(att?.adjustments_draft ?? 0)} foot={<span className="text-muted-foreground">draft, not applied</span>} href="/inventory/adjustments" loading={snapshotLoading} />
            <Kpi icon={<PackageX className="h-4 w-4" />} label="Out of stock" tone={snap?.out_of_stock_count ? "bad" : "good"} value={fmt(snap?.out_of_stock_count ?? 0)} foot={<span className="text-muted-foreground">in the stock list</span>} href="/inventory/stock?status=out_of_stock" loading={snapshotLoading} />
          </div>
        </Panel>
      </div>

      {/* movement types · most moved · by warehouse · lowest stock */}
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <Panel title={`Movement types · ${label.toLowerCase()}`}>
          {loading ? (
            <div className="fb-shimmer h-24 rounded" />
          ) : byType.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">None {label.toLowerCase()}.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {byType.map((t) => (
                <li key={t.type} className="flex items-center justify-between gap-2 border-b pb-1.5 last:border-0">
                  <span className="truncate font-medium">{movementLabel(t.type)}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {t.units_in ? <span className="text-emerald-600 dark:text-emerald-400">+{fmt(t.units_in)}</span> : null}
                    {t.units_in && t.units_out ? " / " : ""}
                    {t.units_out ? <span className="text-amber-600 dark:text-amber-400">−{fmt(t.units_out)}</span> : null}
                    {" "}· {fmt(t.count)}×
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Most moved · ${label.toLowerCase()}`}>
          {loading ? (
            <div className="fb-shimmer h-24 rounded" />
          ) : (data?.top_moved ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">None {label.toLowerCase()}.</p>
          ) : (
            <ol className="space-y-1.5 text-xs">
              {(data?.top_moved ?? []).map((p, i) => (
                <li key={p.item_id} className="flex items-center gap-2 border-b pb-1.5 last:border-0">
                  <span className="w-4 shrink-0 text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate" title={p.name}>{p.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{fmt(p.units_in + p.units_out)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Stock by warehouse" action={<Link href="/inventory/warehouses" className="text-xs text-[#00a09d] hover:underline">Warehouses</Link>}>
          {snapshotLoading ? (
            <div className="fb-shimmer h-24 rounded" />
          ) : (data?.by_warehouse ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No stock recorded yet.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {(data?.by_warehouse ?? []).map((w) => (
                <li key={w.warehouse} className="flex items-center justify-between gap-2 border-b pb-1.5 last:border-0">
                  <span className="truncate font-medium">{w.warehouse}</span>
                  <span className="shrink-0 text-right tabular-nums text-muted-foreground">
                    {fmt(w.units)} units · {fmt(w.skus)} SKUs
                    {n(w.value) ? <span className="block">{formatCurrency(n(w.value))}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Lowest stock" action={<Link href="/inventory/reorder-suggestions" className="text-xs text-[#00a09d] hover:underline">Reorder</Link>}>
          {snapshotLoading ? (
            <div className="fb-shimmer h-24 rounded" />
          ) : (data?.low_stock ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing low or out of stock.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {(data?.low_stock ?? []).map((r) => (
                <li key={`${r.sku}-${r.warehouse}`} className="flex items-center gap-2 border-b pb-1.5 last:border-0">
                  <span className="min-w-0 flex-1 truncate" title={r.name}>{r.name}</span>
                  <span className={`shrink-0 tabular-nums font-medium ${r.status === "out_of_stock" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {fmt(r.on_hand)}
                    {r.reorder_level ? <span className="font-normal text-muted-foreground"> / {fmt(r.reorder_level)}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
