"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchPosDashboard, readStoredPosSessionId, type PosDashboard } from "@/lib/api/pos";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

function Kpi({ label, value, href }: { label: string; value: string; href?: string }) {
  const body = (
    <div className="border border-border bg-background px-3 py-2 hover:bg-muted/30">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function PosDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<PosDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchPosDashboard(readStoredPosSessionId()));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load POS dashboard");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = data?.today;
  const session = data?.current_session;
  const summary = useMemo(
    () => [
      { label: "Total sales", value: formatCurrency(today?.sales_total ?? 0) },
      { label: "Orders", value: String(today?.order_count ?? 0) },
      { label: "Average order", value: formatCurrency(today?.average_order ?? 0) },
      { label: "Cash sales", value: formatCurrency(today?.cash_sales ?? 0) },
      { label: "Card sales", value: formatCurrency(today?.card_sales ?? 0) },
      { label: "Digital / bank", value: formatCurrency(today?.digital_sales ?? 0) },
      { label: "Returns", value: formatCurrency(today?.returns ?? 0) },
      { label: "Discounts", value: formatCurrency(today?.discounts ?? 0) },
      { label: "Tax collected", value: formatCurrency(today?.tax_collected ?? 0) },
    ],
    [today],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-sm font-semibold">POS dashboard</h1>
        <Button variant="outline" size="sm" className="rounded-none" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {summary.map((row) => (
          <Kpi key={row.label} label={row.label} value={row.value} />
        ))}
      </div>

      <section className="mt-4 border border-border">
        <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-xs font-semibold">Current session</div>
        {session ? (
          <div className="grid grid-cols-2 gap-2 p-3 text-xs sm:grid-cols-4">
            <p>Terminal: {session.terminal_name}</p>
            <p>Cashier: {session.cashier_name || "—"}</p>
            <p>Opening: {formatCurrency(session.opening_float)}</p>
            <p>Cash in: {formatCurrency(session.cash_in)}</p>
            <p>Cash out: {formatCurrency(session.cash_out)}</p>
            <p>Cash sales: {formatCurrency(session.cash_sales)}</p>
            <p>Expected close: {formatCurrency(session.expected_cash)}</p>
            <p>Sales: {formatCurrency(session.total_sales)}</p>
          </div>
        ) : (
          <p className="px-3 py-3 text-xs text-muted-foreground">No open session. Open one from New sale.</p>
        )}
      </section>

      <section className="mt-4">
        <p className="mb-2 text-xs font-semibold">Quick actions</p>
        <div className="flex flex-wrap gap-1.5">
          {[
            { href: "/pos/sale", label: "New sale" },
            { href: "/pos/sessions", label: session ? "Close session" : "Open session" },
            { href: "/pos/held", label: "Held orders" },
            { href: "/pos/returns", label: "Returns" },
            { href: "/pos/cash", label: "Cash in / out" },
          ].map((action) => (
            <Button key={action.href} type="button" variant="outline" size="sm" className="rounded-none" onClick={() => router.push(action.href)}>
              {action.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="mt-4 min-h-0 flex-1">
        <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-xs font-semibold">Recent POS orders</div>
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Order</th>
              <th className="px-3 py-1.5 font-medium">Customer</th>
              <th className="px-3 py-1.5 font-medium">Items</th>
              <th className="px-3 py-1.5 font-medium">Amount</th>
              <th className="px-3 py-1.5 font-medium">Payment</th>
              <th className="px-3 py-1.5 font-medium">Cashier</th>
              <th className="px-3 py-1.5 font-medium">Status</th>
              <th className="px-3 py-1.5 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {(data?.recent_orders ?? []).map((row) => (
              <tr key={row.id} className="border-b border-border">
                <td className="px-3 py-1.5">{row.cart_number}</td>
                <td className="px-3 py-1.5">{row.customer_name}</td>
                <td className="px-3 py-1.5 tabular-nums">{row.item_count}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatCurrency(row.total)}</td>
                <td className="px-3 py-1.5">{row.payment_methods.join(", ") || "—"}</td>
                <td className="px-3 py-1.5">{row.cashier_name || "—"}</td>
                <td className="px-3 py-1.5">{row.status}</td>
                <td className="px-3 py-1.5">{formatDateTime(row.completed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
