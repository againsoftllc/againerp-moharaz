"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchPosReports, type PosReports } from "@/lib/api/pos";
import { formatCurrency } from "@/lib/utils";

function MoneyTable({ title, rows }: { title: string; rows: { label: string; count?: number; total: number }[] }) {
  return (
    <section className="min-w-0 border border-border">
      <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-xs font-semibold">{title}</div>
      <table className="w-full text-xs">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border last:border-b-0">
              <td className="px-3 py-1.5">{row.label}</td>
              {row.count != null ? <td className="px-3 py-1.5 text-right tabular-nums">{row.count}</td> : null}
              <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(row.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function PosReportsPage() {
  const [data, setData] = useState<PosReports | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchPosReports());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load POS reports");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const financial = data?.financial;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <h1 className="text-sm font-semibold">POS reports</h1>
      <p className="mt-1 text-xs text-muted-foreground">Built from POS carts, payments, sessions, and inventory stock — not a second sales engine.</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Gross sales", financial?.gross_sales],
          ["Discounts", financial?.discounts],
          ["Tax", financial?.tax],
          ["Net sales", financial?.net_sales],
          ["Refunds", financial?.refunds],
          ["Orders", financial?.order_count],
        ].map(([label, value]) => (
          <div key={String(label)} className="border border-border px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {label === "Orders" ? String(value ?? 0) : formatCurrency(Number(value ?? 0))}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <MoneyTable
          title="By cashier"
          rows={Object.entries(data?.by_cashier ?? {}).map(([label, val]) => ({ label, count: val.count, total: val.total }))}
        />
        <MoneyTable
          title="By terminal"
          rows={Object.entries(data?.by_terminal ?? {}).map(([label, val]) => ({ label, count: val.count, total: val.total }))}
        />
        <MoneyTable
          title="By payment method"
          rows={Object.entries(data?.by_payment_method ?? {}).map(([label, total]) => ({ label, total }))}
        />
        <MoneyTable
          title="Top products"
          rows={(data?.top_products ?? []).map((row) => ({ label: `${row.name} (${row.qty})`, total: row.total }))}
        />
      </div>
      <section className="mt-4 border border-border">
        <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-xs font-semibold">Session closing</div>
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Register</th>
              <th className="px-3 py-1.5 font-medium">Opening</th>
              <th className="px-3 py-1.5 font-medium">Cash sales</th>
              <th className="px-3 py-1.5 font-medium">In</th>
              <th className="px-3 py-1.5 font-medium">Out</th>
              <th className="px-3 py-1.5 font-medium">Refunds</th>
              <th className="px-3 py-1.5 font-medium">Expected</th>
              <th className="px-3 py-1.5 font-medium">Actual</th>
              <th className="px-3 py-1.5 font-medium">Diff</th>
            </tr>
          </thead>
          <tbody>
            {(data?.sessions ?? []).map((row) => (
              <tr key={row.id} className="border-b border-border">
                <td className="px-3 py-1.5">{row.register_name}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatCurrency(row.opening_cash)}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatCurrency(row.cash_sales)}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatCurrency(row.cash_in)}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatCurrency(row.cash_out)}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatCurrency(row.refunds)}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatCurrency(row.expected_cash)}</td>
                <td className="px-3 py-1.5 tabular-nums">{row.actual_cash == null ? "—" : formatCurrency(row.actual_cash)}</td>
                <td className="px-3 py-1.5 tabular-nums">{row.difference == null ? "—" : formatCurrency(row.difference)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="mt-4 border border-border">
        <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-xs font-semibold">Low stock</div>
        <table className="w-full text-xs">
          <tbody>
            {(data?.low_stock ?? []).map((row) => (
              <tr key={row.sku} className="border-b border-border">
                <td className="px-3 py-1.5">{row.name}</td>
                <td className="px-3 py-1.5">{row.sku}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{row.on_hand}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
