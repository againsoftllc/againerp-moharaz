import { apiFetch } from "@/lib/api/client";

export type SalesDashboardDayPoint = {
  date: string;
  label: string;
  orders: number;
  sales: number;
};

export type SalesDashboardRecentOrder = {
  id: string;
  order_number: string;
  customer_name?: string | null;
  status: string;
  total?: number | string;
  order_date: string;
};

export type SalesDashboard = {
  open_order_count: number;
  pending_delivery_count: number;
  completed_count: number;
  revenue_total: number | string;
  open_quotation_count: number;
  status_breakdown: Record<string, number>;
  recent_orders: SalesDashboardRecentOrder[];
  daily_series: SalesDashboardDayPoint[];
};

// Aliases for the naming this session's own dashboard pages were built against.
export type ApiSalesDashboardOrder = SalesDashboardRecentOrder;
export type ApiSalesDashboard = SalesDashboard;

export async function fetchSalesDashboard(): Promise<SalesDashboard> {
  const res = await apiFetch<{ data: SalesDashboard }>("/api/v1/sales/dashboard");
  return res.data;
}

export type SalesPeriodTotals = {
  order_count: number;
  revenue: number | string;
  avg_order_value: number | string;
  completed_count: number;
  cancelled_count: number;
  status_breakdown: Record<string, number>;
};

/** The dashboard for one period (Today, This month …); `open_*` / pending are right now. */
export type SalesDashboardPeriod = {
  date_from: string | null;
  date_to: string | null;
  current: SalesPeriodTotals;
  previous: SalesPeriodTotals | null;
  series: SalesDashboardDayPoint[];
  by_month: boolean;
  recent_orders: SalesDashboardRecentOrder[];
  open_order_count: number;
  pending_delivery_count: number;
  open_quotation_count: number;
};

/** Dates are YYYY-MM-DD, both inclusive; leave one out for an open end (no date_from: from the first order). */
export async function fetchSalesDashboardPeriod(dateFrom?: string, dateTo?: string): Promise<SalesDashboardPeriod> {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const q = params.toString();
  const res = await apiFetch<{ data: SalesDashboardPeriod }>(`/api/v1/sales/dashboard/period${q ? `?${q}` : ""}`);
  return res.data;
}
