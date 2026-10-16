"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchFinanceDashboard, type ApiFinanceDashboard } from "@/lib/api/finance";
import { cn, formatMoney } from "@/lib/utils";

function money(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? formatMoney(n) : value;
}

function Kpi({ label, value, tone, href }: { label: string; value: string; tone?: "good" | "warn" | "danger"; href?: string }) {
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
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function FinanceDashboardPage() {
  const [data, setData] = useState<ApiFinanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFinanceDashboard();
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "finance-dashboard-api" });
  }, [error]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-sm font-semibold">Finance overview</h1>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {!data ? (
        <p className="text-sm text-muted-foreground">{loading ? "Loading…" : "No data."}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label="Receivables outstanding" value={money(data.receivable_balance)} tone="good" href="/finance/receivables" />
            <Kpi label="Payables outstanding" value={money(data.payable_balance)} tone="warn" href="/finance/payables" />
            <Kpi label="Inbound payments" value={money(data.payments_inbound_total)} href="/finance/payments" />
            <Kpi label="Net tax payable" value={money(data.tax_summary.net_tax_payable)} tone={Number(data.tax_summary.net_tax_payable) > 0 ? "warn" : "good"} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label="Journal entries" value={String(data.journal_entry_count)} href="/finance/journal" />
            <Kpi label="Chart of accounts" value={String(data.account_count)} href="/finance/accounts" />
            <Kpi label="Output tax" value={money(data.tax_summary.output_tax_total)} />
            <Kpi label="Input tax" value={money(data.tax_summary.input_tax_total)} />
          </div>
          {(data.unposted_receivable_count || data.unposted_payable_count || data.failed_posting_count) ? (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi
                label="Unposted receivables"
                value={String(data.unposted_receivable_count ?? 0)}
                tone={(data.unposted_receivable_count ?? 0) > 0 ? "warn" : "good"}
                href="/finance/receivables"
              />
              <Kpi
                label="Unposted payables"
                value={String(data.unposted_payable_count ?? 0)}
                tone={(data.unposted_payable_count ?? 0) > 0 ? "warn" : "good"}
                href="/finance/payables"
              />
              <Kpi
                label="Failed postings"
                value={String(data.failed_posting_count ?? 0)}
                tone={(data.failed_posting_count ?? 0) > 0 ? "danger" : "good"}
                href="/finance/reports"
              />
            </div>
          ) : null}

          <div className="mt-5 border border-border">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-semibold">Cash &amp; bank — where the money is</span>
              <Link href="/finance/payment-accounts" className="text-[11px] text-primary hover:underline">
                Manage accounts
              </Link>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border sm:grid-cols-4">
              {data.payment_accounts.map((account) => (
                <Link
                  key={account.id}
                  href="/finance/payment-accounts"
                  className="px-3 py-2.5 hover:bg-muted/30"
                >
                  <p className="truncate text-[11px] text-muted-foreground">{account.name}</p>
                  <p
                    className={cn(
                      "mt-0.5 text-base font-semibold tabular-nums",
                      Number(account.balance) < 0 && "text-red-600 dark:text-red-400",
                    )}
                  >
                    {money(account.balance)}
                  </p>
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-semibold">Recent receivables</span>
                <Link href="/finance/receivables" className="text-[11px] text-primary hover:underline">
                  View all
                </Link>
              </div>
              <div className="divide-y divide-border/60">
                {data.recent_receivables.length === 0 && (
                  <p className="px-3 py-4 text-xs text-muted-foreground">Nothing yet.</p>
                )}
                {data.recent_receivables.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.customer_name ?? r.customer_id}</p>
                      <p className="text-muted-foreground">{r.invoice_number}</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums">{money(r.balance)}</p>
                      <Badge variant={r.status === "paid" ? "success" : r.status === "partial" ? "warning" : "outline"} className="mt-0.5 capitalize">
                        {r.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-semibold">Recent payables</span>
                <Link href="/finance/payables" className="text-[11px] text-primary hover:underline">
                  View all
                </Link>
              </div>
              <div className="divide-y divide-border/60">
                {data.recent_payables.length === 0 && (
                  <p className="px-3 py-4 text-xs text-muted-foreground">Nothing yet.</p>
                )}
                {data.recent_payables.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.supplier_name ?? p.supplier_id}</p>
                      <p className="text-muted-foreground">{p.reference_number}</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums">{money(p.balance)}</p>
                      <Badge variant={p.status === "paid" ? "success" : p.status === "partial" ? "warning" : "outline"} className="mt-0.5 capitalize">
                        {p.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-semibold">Recent payments</span>
                <Link href="/finance/payments" className="text-[11px] text-primary hover:underline">
                  View all
                </Link>
              </div>
              <div className="divide-y divide-border/60">
                {data.recent_payments.length === 0 && (
                  <p className="px-3 py-4 text-xs text-muted-foreground">Nothing yet.</p>
                )}
                {data.recent_payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.party_name || p.payment_number}</p>
                      <p className="capitalize text-muted-foreground">
                        {p.payment_number}
                        {p.payment_method ? ` · ${p.payment_method.replace("_", " ")}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn("tabular-nums", p.direction === "inbound" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                        {p.direction === "inbound" ? "+" : "−"}
                        {money(p.amount)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
