"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  BookOpen,
  Boxes,
  Cpu,
  FolderTree,
  Globe,
  HelpCircle,
  MessageSquare,
  Minus,
  Package,
  Scale,
  Search,
  ShoppingCart,
  Star,
  Truck,
} from "lucide-react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCatalogProducts } from "@/lib/api/use-catalog-products";
import { useCatalogCategories } from "@/lib/api/use-catalog-categories";
import { useBlogArticles } from "@/lib/api/use-blog-articles";
import { useBlogComments } from "@/lib/api/use-blog-comments";
import { useConfiguratorProfiles } from "@/lib/api/use-configurator-profiles";
import { useCatalogReviews } from "@/lib/api/use-catalog-reviews";
import { useCatalogQa } from "@/lib/api/use-catalog-qa";
import { fetchPriceUpdateCompetitors } from "@/lib/api/price-update-plugin";
import { fetchSalesDashboardPeriod, type SalesDashboardPeriod } from "@/lib/api/sales-dashboard";
import { fetchSeoDashboard, type ApiSeoDashboard } from "@/lib/api/seo-audit";
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

/** one object for the pending lists (the hooks re-fetch when their params object changes) */
const PENDING = { status: "pending" };

/* ── order statuses ──────────────────────────────────────────────────────── */

const STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "New (unconfirmed)", color: "#64748b" },
  confirmed: { label: "Confirmed", color: "#3b82f6" },
  processing: { label: "Processing", color: "#f59e0b" },
  completed: { label: "Completed", color: "#10b981" },
  cancelled: { label: "Cancelled", color: "#ef4444" },
};
const statusOf = (s: string) => STATUS[s] ?? { label: s.charAt(0).toUpperCase() + s.slice(1), color: "#a1a1aa" };

/* ── page ────────────────────────────────────────────────────────────────── */

export default function WebsiteDashboardPage() {
  const [period, setPeriod] = useUserScopedState<PeriodId>("website-dashboard:period", "30d");
  const range = useMemo(() => periodRange(period), [period]);
  const [sales, setSales] = useState<SalesDashboardPeriod | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const salesLoading = loadedFor !== `${period}:${reloadKey}`;

  useEffect(() => {
    let live = true;
    const key = `${period}:${reloadKey}`;
    void fetchSalesDashboardPeriod(range.from, range.to)
      .then((data) => {
        if (!live) return;
        setSales(data);
        setLoadedFor(key);
      })
      .catch((err) => {
        if (!live) return;
        setLoadedFor(key);
        toast.error(err instanceof Error ? err.message : "Couldn't load the sales summary");
      });
    return () => {
      live = false;
    };
  }, [period, range.from, range.to, reloadKey]);

  const { total: productCount, loading: productsLoading } = useCatalogProducts({ channel: "catalog" });
  const { total: categoryCount, loading: categoriesLoading } = useCatalogCategories({ channel: "catalog" });
  const { total: articleCount, loading: articlesLoading } = useBlogArticles();
  const { pendingCount: pendingComments, loading: commentsLoading } = useBlogComments();
  const { total: builderProfileCount, loading: buildersLoading } = useConfiguratorProfiles();
  const { pendingCount: pendingReviews, loading: reviewsLoading } = useCatalogReviews(PENDING);
  const { pendingCount: pendingQuestions, loading: qaLoading } = useCatalogQa(PENDING);

  const [seo, setSeo] = useState<ApiSeoDashboard | null>(null);
  const [competitorCount, setCompetitorCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void fetchSeoDashboard().then((d) => live && setSeo(d)).catch(() => undefined);
    void fetchPriceUpdateCompetitors()
      .then((rows) => live && setCompetitorCount(rows.length))
      .catch(() => live && setCompetitorCount(0));
    return () => {
      live = false;
    };
  }, []);

  const cur = sales?.current;
  const prev = sales?.previous;
  const revenue = Number(cur?.revenue ?? 0);
  const breakdown = useMemo(() => {
    const entries = Object.entries(cur?.status_breakdown ?? {}).filter(([, n]) => n > 0);
    const total = entries.reduce((s, [, n]) => s + n, 0);
    const order = Object.keys(STATUS);
    return {
      total,
      rows: entries
        .sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99))
        .map(([status, n]) => ({ status, n, pct: total ? (n / total) * 100 : 0 })),
    };
  }, [cur]);
  const periodLabel = labelOf(period);
  const hasTrend = (sales?.series ?? []).some((p) => p.orders > 0);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto p-4">
      <DashboardHeader
        title="Website Dashboard"
        period={period}
        onPeriod={setPeriod}
        onRefresh={() => setReloadKey((k) => k + 1)}
        loading={salesLoading}
      />

      {/* sales in the period */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi
          icon={<BarChart3 className="h-4 w-4" />}
          label="Revenue"
          value={formatCurrency(revenue)}
          foot={<Change now={revenue} before={prev ? Number(prev.revenue) : null} label={range.compare} />}
          href="/website/orders"
          loading={salesLoading}
        />
        <Kpi
          icon={<ShoppingCart className="h-4 w-4" />}
          label="Orders"
          value={(cur?.order_count ?? 0).toLocaleString("en-US")}
          foot={<Change now={cur?.order_count ?? 0} before={prev?.order_count} label={range.compare} />}
          href="/website/orders"
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
          value={(cur?.completed_count ?? 0).toLocaleString("en-US")}
          foot={<Change now={cur?.completed_count ?? 0} before={prev?.completed_count} label={range.compare} />}
          href="/website/orders"
          loading={salesLoading}
        />
        <Kpi
          icon={<Minus className="h-4 w-4" />}
          label="Cancelled"
          tone="bad"
          value={(cur?.cancelled_count ?? 0).toLocaleString("en-US")}
          foot={<Change now={cur?.cancelled_count ?? 0} before={prev?.cancelled_count} label={range.compare} invert />}
          href="/website/orders"
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
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
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
                    formatter={(value, name) =>
                      name === "sales" ? [formatCurrency(Number(value)), "Revenue"] : [String(value), "Orders"]
                    }
                  />
                  <Bar yAxisId="ord" dataKey="orders" fill="#6366f1" opacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={22} />
                  <Area yAxisId="rev" type="monotone" dataKey="sales" stroke="#00a09d" strokeWidth={2} fill="url(#revFill)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Orders by status" action={<span className="text-[11px] text-muted-foreground">{breakdown.total.toLocaleString("en-US")} orders</span>}>
          {salesLoading ? (
            <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="fb-shimmer h-6 rounded" />)}</div>
          ) : (
            <ShareBars
              rows={breakdown.rows.map(({ status, n }) => ({ key: status, n, ...statusOf(status) }))}
              empty={`No orders ${periodLabel.toLowerCase()}.`}
            />
          )}
        </Panel>
      </div>

      {/* right now + recent orders */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title={`Latest orders · ${periodLabel.toLowerCase()}`} className="lg:col-span-2" action={<Link href="/website/orders" className="text-xs text-[#00a09d] hover:underline">View all</Link>}>
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
                        <Link href={`/website/orders?open=${encodeURIComponent(o.id)}`} className="font-medium text-[#00a09d] hover:underline">
                          {o.order_number}
                        </Link>
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
                      <td className="py-1.5 text-right tabular-nums">{formatCurrency(Number(o.total ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Needs attention · right now">
          <div className="grid grid-cols-2 gap-2">
            <Kpi icon={<ShoppingCart className="h-4 w-4" />} label="Open orders" tone="warn" value={(sales?.open_order_count ?? 0).toLocaleString("en-US")} foot={<span className="text-muted-foreground">to confirm / process</span>} href="/website/orders" loading={!sales} />
            <Kpi icon={<Truck className="h-4 w-4" />} label="To deliver" tone="warn" value={(sales?.pending_delivery_count ?? 0).toLocaleString("en-US")} foot={<span className="text-muted-foreground">confirmed, not shipped</span>} href="/website/orders" loading={!sales} />
            <Kpi icon={<Star className="h-4 w-4" />} label="Reviews to approve" tone={pendingReviews ? "warn" : "good"} value={String(pendingReviews)} foot={<span className="text-muted-foreground">pending</span>} href="/website/reviews?status=pending" loading={reviewsLoading} />
            <Kpi icon={<HelpCircle className="h-4 w-4" />} label="Questions to answer" tone={pendingQuestions ? "warn" : "good"} value={String(pendingQuestions)} foot={<span className="text-muted-foreground">pending</span>} href="/website/qa?status=pending" loading={qaLoading} />
            <Kpi icon={<MessageSquare className="h-4 w-4" />} label="Blog comments" tone={pendingComments ? "warn" : "good"} value={String(pendingComments)} foot={<span className="text-muted-foreground">pending</span>} href="/website/blog/comments" loading={commentsLoading} />
            <Kpi icon={<BookOpen className="h-4 w-4" />} label="Open quotations" value={(sales?.open_quotation_count ?? 0).toLocaleString("en-US")} foot={<span className="text-muted-foreground">not confirmed</span>} href="/website/quotations" loading={!sales} />
          </div>
        </Panel>
      </div>

      {/* store */}
      <Panel title="Store">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          <Kpi icon={<Boxes className="h-4 w-4" />} label="Products" value={productCount.toLocaleString("en-US")} href="/website/products" loading={productsLoading} />
          <Kpi icon={<FolderTree className="h-4 w-4" />} label="Categories" value={categoryCount.toLocaleString("en-US")} href="/website/categories" loading={categoriesLoading} />
          <Kpi icon={<BookOpen className="h-4 w-4" />} label="Blog articles" value={String(articleCount)} href="/website/blog" loading={articlesLoading} />
          <Kpi icon={<Cpu className="h-4 w-4" />} label="PC Builder profiles" value={String(builderProfileCount)} href="/website/pc-builder" loading={buildersLoading} />
          <Kpi
            icon={<Search className="h-4 w-4" />}
            label="SEO health"
            tone={(seo?.health_score ?? 0) >= 70 ? "good" : "warn"}
            value={`${Math.round(seo?.health_score ?? 0)}/100`}
            foot={<span className="text-muted-foreground">{(seo?.open_issues ?? 0).toLocaleString("en-US")} open issues</span>}
            href="/seo/audit"
            loading={!seo}
          />
          <Kpi
            icon={<Globe className="h-4 w-4" />}
            label="Indexable URLs"
            value={(seo?.indexable_count ?? 0).toLocaleString("en-US")}
            foot={<span className="text-muted-foreground">of {(seo?.url_count ?? 0).toLocaleString("en-US")}</span>}
            href="/seo"
            loading={!seo}
          />
          <Kpi icon={<Scale className="h-4 w-4" />} label="Competitor sites" value={competitorCount == null ? "…" : String(competitorCount)} href="/website/price-compare" loading={competitorCount == null} />
        </div>
      </Panel>
    </div>
  );
}
