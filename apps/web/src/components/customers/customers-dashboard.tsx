"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Users,
  UserCheck,
  UserX,
  Crown,
  TrendingUp,
  ShoppingBag,
  Wallet,
  AlertTriangle,
  Zap,
  ArrowUpRight,
  Phone,
  Mail,
  BarChart3,
} from "lucide-react";
import { useCustomerStore } from "@/lib/store/customer-store";
import { countCustomersByStatus, type Customer } from "@/lib/mock-data/customers";
import { formatCurrency, formatDate, formatQuantity, cn } from "@/lib/utils";
import { CustomersNav } from "@/components/customers/customers-nav";

// ─── Mock chart data ──────────────────────────────────────────────────────────

const growthData = [
  { month: "Jan", new: 62, returning: 520 },
  { month: "Feb", new: 74, returning: 548 },
  { month: "Mar", new: 88, returning: 579 },
  { month: "Apr", new: 71, returning: 603 },
  { month: "May", new: 95, returning: 648 },
  { month: "Jun", new: 86, returning: 712 },
];

const segmentData = [
  { name: "Retail", value: 820, color: "#6366f1" },
  { name: "Wholesale", value: 210, color: "#10b981" },
  { name: "Corporate", value: 148, color: "#f59e0b" },
  { name: "Dealer", value: 62, color: "#3b82f6" },
  { name: "VIP", value: 44, color: "#ec4899" },
];

const cityData = [
  { city: "Dhaka", customers: 640 },
  { city: "Chittagong", customers: 210 },
  { city: "Sylhet", customers: 98 },
  { city: "Rajshahi", customers: 87 },
  { city: "Khulna", customers: 72 },
  { city: "Others", customers: 177 },
];

// ─── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  trend,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
  trend?: { value: string; up: boolean };
  href?: string;
}) {
  const inner = (
    <div className="group flex flex-col gap-3 rounded-xl border border-input bg-card p-4 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className={`rounded-lg p-2.5 ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        {trend && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              trend.up
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
            )}
          >
            {trend.up ? "↑" : "↓"} {trend.value}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
        {sub && <p className="mt-0.5 text-[11px] text-muted-foreground/70">{sub}</p>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

// ─── Risk dot ────────────────────────────────────────────────────────────────
function riskColor(level: string) {
  if (level === "high") return "bg-destructive/10 text-destructive";
  if (level === "medium") return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
  return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
}

// ─── Loyalty tier pill ────────────────────────────────────────────────────────
function loyaltyPill(tier: string) {
  if (tier === "platinum" || tier === "vip")
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  if (tier === "gold")
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-input bg-background p-2.5 shadow-lg text-xs">
      <p className="mb-1.5 font-semibold">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground capitalize">{p.name}:</span>
          <span className="font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CustomersDashboard({
  customers: customersProp,
  loading = false,
}: {
  customers?: Customer[];
  loading?: boolean;
}) {
  const storeCustomers = useCustomerStore((s) => s.customers);
  const customers = customersProp ?? storeCustomers;

  const recentCustomers = useMemo(
    () =>
      [...customers]
        .sort((a, b) => new Date(b.customerSince).getTime() - new Date(a.customerSince).getTime())
        .slice(0, 5),
    [customers],
  );

  const atRisk = useMemo(
    () => customers.filter((c) => c.riskLevel === "high").slice(0, 4),
    [customers],
  );

  const topSpenders = useMemo(
    () => [...customers].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 5),
    [customers],
  );

  const statusCounts = countCustomersByStatus(customers);
  const totalSpend = customers.reduce((sum, c) => sum + c.totalSpend, 0);
  const avgOrderValue = customers.length
    ? customers.reduce((sum, c) => sum + c.avgOrderValue, 0) / customers.length
    : 0;
  const avgLtv = customers.length ? totalSpend / customers.length : 0;
  const kpis = {
    total: customers.length,
    active: statusCounts.active ?? 0,
    vip: statusCounts.vip ?? 0,
    inactive: statusCounts.inactive ?? 0,
    blocked: statusCounts.blocked ?? 0,
    newThisMonth: customers.filter((c) => c.customerSince >= "2026-06-01").length,
    returning: customers.filter((c) => c.totalOrders > 1).length,
    totalSpend,
    avgOrderValue,
    avgLtv,
  };

  return (
    <div className="space-y-6">
      <CustomersNav />

      {/* ── KPI Row 1 ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Total Customers"
          value={loading ? "…" : formatQuantity(kpis.total)}
          sub={`+${kpis.newThisMonth} this month`}
          icon={Users}
          color="bg-blue-500"
          trend={{ value: "6.7%", up: true }}
          href="/customers/all"
        />
        <KpiCard
          label="Active Customers"
          value={formatQuantity(kpis.active)}
          sub="Currently engaged"
          icon={UserCheck}
          color="bg-emerald-500"
          trend={{ value: "2.1%", up: true }}
          href="/customers/all?status=active"
        />
        <KpiCard
          label="VIP Customers"
          value={kpis.vip}
          sub="Platinum & VIP tier"
          icon={Crown}
          color="bg-yellow-500"
          trend={{ value: "12%", up: true }}
          href="/customers/loyalty"
        />
        <KpiCard
          label="Inactive"
          value={formatQuantity(kpis.inactive)}
          sub="Need re-engagement"
          icon={UserX}
          color="bg-slate-500"
          trend={{ value: "1.5%", up: false }}
          href="/customers/segments"
        />
      </div>

      {/* ── KPI Row 2 ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Returning Customers"
          value={formatQuantity(kpis.returning)}
          sub="Repeat buyers"
          icon={TrendingUp}
          color="bg-indigo-500"
          trend={{ value: "4.3%", up: true }}
        />
        <KpiCard
          label="Avg Order Value"
          value={formatCurrency(kpis.avgOrderValue)}
          sub="Per transaction"
          icon={ShoppingBag}
          color="bg-violet-500"
          trend={{ value: "3.2%", up: true }}
        />
        <KpiCard
          label="Avg Lifetime Value"
          value={formatCurrency(kpis.avgLtv)}
          sub="AI predicted LTV"
          icon={Wallet}
          color="bg-cyan-500"
          trend={{ value: "8.1%", up: true }}
        />
        <KpiCard
          label="New This Month"
          value={kpis.newThisMonth}
          sub="Jun 2026"
          icon={ArrowUpRight}
          color="bg-pink-500"
          trend={{ value: "15%", up: true }}
        />
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Customer Growth Area Chart */}
        <div className="xl:col-span-2 rounded-xl border border-input bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Customer Growth</h2>
              <p className="text-[11px] text-muted-foreground">New vs Returning — last 6 months</p>
            </div>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={growthData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colRet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colNew" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="returning" name="Returning" stroke="#6366f1" strokeWidth={2} fill="url(#colRet)" />
              <Area type="monotone" dataKey="new" name="New" stroke="#10b981" strokeWidth={2} fill="url(#colNew)" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="mt-3 flex gap-4">
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
              <span className="text-muted-foreground">Returning</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">New</span>
            </div>
          </div>
        </div>

        {/* Segment Donut */}
        <div className="rounded-xl border border-input bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Customer Segments</h2>
              <p className="text-[11px] text-muted-foreground">By group type</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={segmentData}
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={72}
                paddingAngle={3}
                dataKey="value"
              >
                {segmentData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--background))",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-1.5">
            {segmentData.map((seg) => (
              <div key={seg.name} className="flex items-center gap-2 text-[11px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: seg.color }} />
                <span className="flex-1 text-muted-foreground">{seg.name}</span>
                <span className="font-medium">{seg.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Second charts row ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Top Cities */}
        <div className="rounded-xl border border-input bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Top Cities</h2>
            <Link href="/customers/reports" className="text-[11px] text-primary hover:underline">
              Full report
            </Link>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={cityData} layout="vertical" margin={{ left: 4, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="city" tick={{ fontSize: 11 }} width={68} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--background))",
                }}
              />
              <Bar dataKey="customers" name="Customers" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* AI Insights Panel */}
        <div className="rounded-xl border border-input bg-card">
          <div className="flex items-center gap-2 border-b border-input px-4 py-3">
            <Zap className="h-4 w-4 text-violet-500" />
            <h2 className="text-sm font-semibold">Chief AI Agent — Customer Insights</h2>
          </div>
          <div className="space-y-2.5 p-4">
            {[
              {
                icon: "📈",
                category: "Growth",
                text: `${formatQuantity(kpis.returning)} returning customers this month — send loyalty reward campaign for +12% retention.`,
                color: "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30",
              },
              {
                icon: "⚠️",
                category: "Risk",
                text: `${atRisk.length} customers at high churn risk detected — AI recommends immediate win-back campaigns.`,
                color: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30",
              },
              {
                icon: "💰",
                category: "Revenue",
                text: `Top 5% customers account for 42% of revenue. Upsell opportunity: ${formatCurrency(kpis.avgLtv * 0.4)} additional LTV per VIP.`,
                color: "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30",
              },
              {
                icon: "🎯",
                category: "Segment",
                text: "43 customers near Platinum tier — 3 orders away. Trigger milestone campaign to accelerate upgrade.",
                color: "border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30",
              },
              {
                icon: "📣",
                category: "Marketing",
                text: "198 inactive customers identified. Best reactivation channel: SMS with personalized discount (avg 23% conversion).",
                color: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30",
              },
            ].map((item, i) => (
              <div key={i} className={`flex gap-2.5 rounded-lg border p-2.5 text-xs ${item.color}`}>
                <span className="shrink-0 text-base leading-4">{item.icon}</span>
                <div>
                  <span className="font-semibold">{item.category} — </span>
                  <span className="text-muted-foreground">{item.text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main tables row ── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Top Spenders */}
        <div className="rounded-xl border border-input bg-card">
          <div className="flex items-center justify-between border-b border-input px-4 py-3">
            <h2 className="text-sm font-semibold">Top Customers by Spend</h2>
            <Link href="/customers/all" className="text-[11px] text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-input">
            {topSpenders.map((c, i) => (
              <Link
                key={c.id}
                href={`/customers/${c.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <span className="w-5 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs font-medium">{c.name}</p>
                    {c.status === "vip" && <Crown className="h-3 w-3 shrink-0 text-yellow-500" />}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Phone className="h-2.5 w-2.5" />
                    {c.phone}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold">{formatCurrency(c.totalSpend)}</p>
                  <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-medium capitalize ${loyaltyPill(c.loyaltyTier)}`}>
                    {c.loyaltyTier}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* At-Risk + Recent Registrations */}
        <div className="space-y-4">
          {/* At-Risk */}
          <div className="rounded-xl border border-input bg-card">
            <div className="flex items-center gap-2 border-b border-input px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <h2 className="text-sm font-semibold">AI: High Churn Risk</h2>
              <span className="ml-auto rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                {atRisk.length} customers
              </span>
            </div>
            {atRisk.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">No high-risk customers detected.</p>
            ) : (
              <div className="divide-y divide-input">
                {atRisk.map((c) => (
                  <Link
                    key={c.id}
                    href={`/customers/${c.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-[11px] font-bold text-destructive">
                      {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{c.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {c.aiInsights.churnReasons[0] ?? "High churn risk"}
                      </p>
                    </div>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${riskColor(c.riskLevel)}`}>
                      {c.riskScore}%
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent Registrations */}
          <div className="rounded-xl border border-input bg-card">
            <div className="flex items-center justify-between border-b border-input px-4 py-3">
              <h2 className="text-sm font-semibold">Recent Registrations</h2>
              <Link href="/customers/all" className="text-[11px] text-primary hover:underline">
                View all
              </Link>
            </div>
            <div className="divide-y divide-input">
              {recentCustomers.map((c) => (
                <Link
                  key={c.id}
                  href={`/customers/${c.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{c.name}</p>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Mail className="h-2.5 w-2.5" />
                      {c.email}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(c.customerSince)}
                    </p>
                    <span className={`capitalize inline-block rounded px-1.5 py-0.5 text-[9px] font-medium ${loyaltyPill(c.loyaltyTier)}`}>
                      {c.group}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
