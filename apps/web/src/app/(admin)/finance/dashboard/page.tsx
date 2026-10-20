"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BookOpenCheck,
  Building2,
  CalendarClock,
  FileText,
  Landmark,
  Percent,
  Receipt,
  ReceiptText,
  Repeat,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchFinanceDashboardPeriod, type FinanceDashboardPeriod } from "@/lib/api/finance";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { formatMoney } from "@/lib/utils";
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

const METHOD_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#0ea5e9", "#ec4899", "#94a3b8"];
const methodLabel = (m: string) =>
  m === "bKash" || m === "bkash" ? "bKash" : m.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const KIND_LABEL: Record<string, string> = { cash: "Cash", bank: "Bank", mobile_wallet: "Mobile wallet" };

const money = (v: number) => formatMoney(v);

export default function FinanceDashboardPage() {
  const [period, setPeriod] = useUserScopedState<PeriodId>("finance-dashboard:period", "30d");
  const range = useMemo(() => periodRange(period), [period]);
  const [data, setData] = useState<FinanceDashboardPeriod | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loading = loadedFor !== `${period}:${reloadKey}`;

  useEffect(() => {
    let live = true;
    const key = `${period}:${reloadKey}`;
    void fetchFinanceDashboardPeriod(range.from, range.to)
      .then((d) => {
        if (!live) return;
        setData(d);
        setLoadedFor(key);
      })
      .catch((err) => {
        if (!live) return;
        setLoadedFor(key);
        toast.error(err instanceof Error ? err.message : "Couldn't load the finance summary", { id: "finance-dashboard-api" });
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
  const snapshotLoading = !data;
  const hasTrend = (data?.series ?? []).some((p) => p.money_in || p.money_out);
  const methodRows = useMemo(
    () =>
      (data?.by_method ?? []).map((m, i) => ({
        key: m.method,
        label: `${methodLabel(m.method)} · ${money(m.amount)}`,
        color: METHOD_COLORS[i % METHOD_COLORS.length],
        n: Math.round(m.amount),
      })),
    [data],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto p-4">
      <DashboardHeader
        title="Finance Dashboard"
        period={period}
        onPeriod={setPeriod}
        onRefresh={() => setReloadKey((k) => k + 1)}
        loading={loading}
      />

      {/* money in the period */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          icon={<ArrowDownToLine className="h-4 w-4" />}
          label="Money in"
          tone="good"
          value={money(cur?.money_in ?? 0)}
          foot={<Change now={cur?.money_in ?? 0} before={prev?.money_in} label={range.compare} />}
          href="/finance/payments"
          loading={loading}
        />
        <Kpi
          icon={<ArrowUpFromLine className="h-4 w-4" />}
          label="Money out"
          tone="warn"
          value={money(cur?.money_out ?? 0)}
          foot={<Change now={cur?.money_out ?? 0} before={prev?.money_out} label={range.compare} />}
          href="/finance/payments"
          loading={loading}
        />
        <Kpi
          icon={<Repeat className="h-4 w-4" />}
          label="Net cash flow"
          tone={(cur?.net_cash ?? 0) < 0 ? "bad" : "default"}
          value={`${(cur?.net_cash ?? 0) >= 0 ? "+" : "−"}${money(Math.abs(cur?.net_cash ?? 0))}`}
          foot={<span className="text-muted-foreground">in − out, {label.toLowerCase()}</span>}
          loading={loading}
        />
        <Kpi
          icon={<ReceiptText className="h-4 w-4" />}
          label="Invoiced"
          value={money(cur?.invoiced ?? 0)}
          foot={<Change now={cur?.invoiced ?? 0} before={prev?.invoiced} label={range.compare} />}
          href="/finance/receivables"
          loading={loading}
        />
        <Kpi
          icon={<FileText className="h-4 w-4" />}
          label="Bills received"
          value={money(cur?.billed ?? 0)}
          foot={<Change now={cur?.billed ?? 0} before={prev?.billed} label={range.compare} invert />}
          href="/finance/payables"
          loading={loading}
        />
        <Kpi
          icon={<Receipt className="h-4 w-4" />}
          label="Expenses"
          value={money(cur?.expenses ?? 0)}
          foot={<Change now={cur?.expenses ?? 0} before={prev?.expenses} label={range.compare} invert />}
          href="/finance/reports/expense-by-cost-center"
          loading={loading}
        />
      </div>

      {/* trend + payment methods */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel
          title={`Money in / out · ${data?.by_month ? "by month" : "by day"}`}
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
              <p className="text-sm font-medium">No payments {label.toLowerCase()}</p>
              <p className="text-xs text-muted-foreground">Customer receipts, supplier payments and expenses paid show here.</p>
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
                    formatter={(value, name) => [money(Number(value)), name === "money_in" ? "In" : "Out"]}
                  />
                  <Bar dataKey="money_in" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="money_out" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          title={`Payments by method · ${label.toLowerCase()}`}
          action={<Link href="/finance/payments" className="text-xs text-[#00a09d] hover:underline">Payments</Link>}
        >
          {loading ? (
            <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="fb-shimmer h-6 rounded" />)}</div>
          ) : (
            <ShareBars rows={methodRows} empty={`No payments ${label.toLowerCase()}.`} />
          )}
        </Panel>
      </div>

      {/* money right now */}
      <Panel title="Money right now" action={<Link href="/finance/reports" className="text-xs text-[#00a09d] hover:underline">Reports</Link>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Kpi
            icon={<ReceiptText className="h-4 w-4" />}
            label="Receivables"
            tone="good"
            value={money(snap?.receivable_balance ?? 0)}
            foot={<span className="text-muted-foreground">{snap?.receivable_count ?? 0} open invoice{snap?.receivable_count === 1 ? "" : "s"}</span>}
            href="/finance/receivables"
            loading={snapshotLoading}
          />
          <Kpi
            icon={<FileText className="h-4 w-4" />}
            label="Payables"
            tone="warn"
            value={money(snap?.payable_balance ?? 0)}
            foot={<span className="text-muted-foreground">{snap?.payable_count ?? 0} open bill{snap?.payable_count === 1 ? "" : "s"}</span>}
            href="/finance/payables"
            loading={snapshotLoading}
          />
          <Kpi
            icon={<Wallet className="h-4 w-4" />}
            label="Cash & bank"
            tone={(snap?.cash_total ?? 0) < 0 ? "bad" : "default"}
            value={money(snap?.cash_total ?? 0)}
            foot={<span className="text-muted-foreground">all payment accounts</span>}
            href="/finance/payment-accounts"
            loading={snapshotLoading}
          />
          <Kpi
            icon={<Percent className="h-4 w-4" />}
            label="Net tax payable"
            tone={(snap?.net_tax_payable ?? 0) > 0 ? "warn" : "good"}
            value={money(snap?.net_tax_payable ?? 0)}
            foot={<span className="text-muted-foreground">output − input tax</span>}
            href="/finance/reports/tax-summary"
            loading={snapshotLoading}
          />
          <Kpi
            icon={<CalendarClock className="h-4 w-4" />}
            label="Overdue receivables"
            tone={snap?.overdue_receivable_count ? "bad" : "good"}
            value={money(snap?.overdue_receivable ?? 0)}
            foot={<span className="text-muted-foreground">{snap?.overdue_receivable_count ?? 0} past due</span>}
            href="/finance/reports/aged-receivable"
            loading={snapshotLoading}
          />
          <Kpi
            icon={<CalendarClock className="h-4 w-4" />}
            label="Overdue payables"
            tone={snap?.overdue_payable_count ? "bad" : "good"}
            value={money(snap?.overdue_payable ?? 0)}
            foot={<span className="text-muted-foreground">{snap?.overdue_payable_count ?? 0} past due</span>}
            href="/finance/reports/aged-payable"
            loading={snapshotLoading}
          />
        </div>
      </Panel>

      {/* latest payments + needs attention */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel
          title={`Latest payments · ${label.toLowerCase()}`}
          className="lg:col-span-2"
          action={<Link href="/finance/payments" className="text-xs text-[#00a09d] hover:underline">View all</Link>}
        >
          {loading ? (
            <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="fb-shimmer h-7 rounded" />)}</div>
          ) : (data?.recent_payments ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No payments {label.toLowerCase()}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Date</th>
                    <th className="py-1.5 pr-2 font-medium">Payment</th>
                    <th className="py-1.5 pr-2 font-medium">Party</th>
                    <th className="py-1.5 pr-2 font-medium">Method</th>
                    <th className="py-1.5 pr-2 font-medium">Account</th>
                    <th className="py-1.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recent_payments ?? []).map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">{p.date ?? "—"}</td>
                      <td className="py-1.5 pr-2">
                        <span className="block font-medium">{p.payment_number}</span>
                        {p.reference ? <span className="block text-[11px] text-muted-foreground">{p.reference}</span> : null}
                      </td>
                      <td className="max-w-[220px] py-1.5 pr-2"><span className="block truncate" title={p.party ?? ""}>{p.party ?? "—"}</span></td>
                      <td className="py-1.5 pr-2">{methodLabel(p.method)}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">{p.account ?? "—"}</td>
                      <td className={`py-1.5 text-right font-medium tabular-nums ${p.direction === "inbound" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {p.direction === "inbound" ? "+" : "−"}{money(p.amount)}
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
            <Kpi icon={<BookOpenCheck className="h-4 w-4" />} label="Unposted receivables" tone={att?.unposted_receivables ? "warn" : "good"} value={String(att?.unposted_receivables ?? 0)} foot={<span className="text-muted-foreground">no journal entry yet</span>} href="/finance/receivables" loading={snapshotLoading} />
            <Kpi icon={<BookOpenCheck className="h-4 w-4" />} label="Unposted payables" tone={att?.unposted_payables ? "warn" : "good"} value={String(att?.unposted_payables ?? 0)} foot={<span className="text-muted-foreground">no journal entry yet</span>} href="/finance/payables" loading={snapshotLoading} />
            <Kpi icon={<ShieldAlert className="h-4 w-4" />} label="Failed postings" tone={att?.failed_postings ? "bad" : "good"} value={String(att?.failed_postings ?? 0)} foot={<span className="text-muted-foreground">could not post</span>} href="/finance/reports" loading={snapshotLoading} />
            <Kpi icon={<Landmark className="h-4 w-4" />} label="Cheques moving" tone={att?.cheques_moving ? "warn" : "good"} value={String(att?.cheques_moving ?? 0)} foot={<span className="text-muted-foreground">not cleared yet</span>} href="/finance/payments" loading={snapshotLoading} />
            <Kpi icon={<Receipt className="h-4 w-4" />} label="Expenses to approve" tone={att?.expenses_to_approve ? "warn" : "good"} value={String(att?.expenses_to_approve ?? 0)} foot={<span className="text-muted-foreground">draft</span>} href="/finance/reports/expense-by-cost-center" loading={snapshotLoading} />
            <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Overdue invoices" tone={att?.overdue_receivables ? "bad" : "good"} value={String(att?.overdue_receivables ?? 0)} foot={<span className="text-muted-foreground">past the due date</span>} href="/finance/receivables" loading={snapshotLoading} />
          </div>
        </Panel>
      </div>

      {/* cash & bank · expenses · who owes · who we owe */}
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <Panel title="Cash & bank" action={<Link href="/finance/payment-accounts" className="text-xs text-[#00a09d] hover:underline">Accounts</Link>}>
          {snapshotLoading ? (
            <div className="fb-shimmer h-24 rounded" />
          ) : (data?.cash_accounts ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payment accounts yet.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {(data?.cash_accounts ?? []).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 border-b pb-1.5 last:border-0">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{a.name}</span>
                    <span className="ml-1.5 text-muted-foreground">{KIND_LABEL[a.kind] ?? a.kind}</span>
                  </span>
                  <span className={`shrink-0 tabular-nums font-medium ${a.balance < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{money(a.balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Expenses by category · ${label.toLowerCase()}`}>
          {loading ? (
            <div className="fb-shimmer h-24 rounded" />
          ) : (data?.expenses_by_category ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No expenses {label.toLowerCase()}.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {(data?.expenses_by_category ?? []).map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-2 border-b pb-1.5 last:border-0">
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{money(c.total)} · {c.count}×</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Customers owing most" action={<Link href="/finance/receivables" className="text-xs text-[#00a09d] hover:underline">Receivables</Link>}>
          {snapshotLoading ? (
            <div className="fb-shimmer h-24 rounded" />
          ) : (data?.top_receivables ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nobody owes anything.</p>
          ) : (
            <ol className="space-y-1.5 text-xs">
              {(data?.top_receivables ?? []).map((r, i) => (
                <li key={r.party_id} className="flex items-center gap-2 border-b pb-1.5 last:border-0">
                  <span className="w-4 shrink-0 text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate" title={r.name}>{r.name}</span>
                  <span className="shrink-0 tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{money(r.balance)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Suppliers we owe most" action={<Link href="/finance/payables" className="text-xs text-[#00a09d] hover:underline">Payables</Link>}>
          {snapshotLoading ? (
            <div className="fb-shimmer h-24 rounded" />
          ) : (data?.top_payables ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">We owe nothing.</p>
          ) : (
            <ol className="space-y-1.5 text-xs">
              {(data?.top_payables ?? []).map((r, i) => (
                <li key={r.party_id} className="flex items-center gap-2 border-b pb-1.5 last:border-0">
                  <span className="w-4 shrink-0 text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate" title={r.name}>{r.name}</span>
                  <span className="shrink-0 tabular-nums font-medium text-amber-600 dark:text-amber-400">{money(r.balance)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
