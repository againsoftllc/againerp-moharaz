"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/utils";
import {
  fetchAnalyticsOverview,
  fetchVendorRanking,
  type VendorAnalyticsOverview,
  type VendorRankRow,
} from "@/lib/api/vendor-orders";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-input p-4">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default function VendorAnalyticsPage() {
  const [overview, setOverview] = React.useState<VendorAnalyticsOverview | null>(null);
  const [ranking, setRanking] = React.useState<VendorRankRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [days, setDays] = React.useState<string>("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = days ? Number(days) : undefined;
      const [o, r] = await Promise.all([fetchAnalyticsOverview(d), fetchVendorRanking(d)]);
      setOverview(o);
      setRanking(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [days]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">Vendor Analytics</h1>
          <p className="text-xs text-muted-foreground">Revenue, activity, and health across your vendor base.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onChange={(e) => setDays(e.target.value)} className="max-w-[160px]">
            <option value="">All time</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {overview && (
        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
          <StatCard label="Total Vendors" value={String(overview.total_vendors)} hint={`${overview.active_vendors} active`} />
          <StatCard label="New (30d)" value={String(overview.new_vendors_30d)} />
          <StatCard label="Dormant" value={String(overview.dormant_vendors)} hint="No orders in 60d" />
          <StatCard label="Active Requests" value={String(overview.active_order_requests)} />
          <StatCard label="Revenue" value={formatMoney(overview.total_revenue)} hint={`${overview.order_count} orders`} />
          <StatCard label="Avg Order Value" value={formatMoney(overview.average_order_value)} />
          <StatCard label="Cancellation Rate" value={`${Number(overview.cancellation_rate).toFixed(1)}%`} />
          <StatCard label="Outstanding" value={formatMoney(overview.total_outstanding)} hint="Unpaid invoices" />
        </div>
      )}

      <div className="px-4 pb-4">
        <h2 className="mb-2 text-sm font-semibold">Top Vendors by Revenue</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Revenue</TableHead>
              <TableHead>Orders</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranking.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                  No vendor orders yet.
                </TableCell>
              </TableRow>
            )}
            {ranking.map((r) => (
              <TableRow key={r.vendor_id}>
                <TableCell className="font-medium">{r.vendor_name}</TableCell>
                <TableCell>{formatMoney(r.revenue)}</TableCell>
                <TableCell>{r.order_count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
