import { apiFetch } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils";
import type { ToggleableModuleId } from "@/lib/store/module-settings-store";
import type { KpiData } from "./types";

/**
 * One card in the module-aware dashboard grid. Mirrors `ErpReportGroup`
 * (`@/lib/reports/erp-reports.ts`) so the same `isErpReportGroupVisible`
 * gating already used by the Reports hub works unchanged here — a widget
 * is visible exactly when its module would show up in Reports.
 */
export type DashboardWidgetDef = {
  id: string;
  title: string;
  moduleIds: ToggleableModuleId[];
  href: string;
  fetch: () => Promise<any>;
  mapToStats: (data: any) => KpiData[];
};

function money(value: unknown) {
  return formatCurrency(Number(value) || 0);
}

export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  {
    id: "purchase",
    title: "Purchase",
    moduleIds: ["purchase"],
    href: "/purchase/orders",
    fetch: () => apiFetch<{ data: any }>("/api/v1/purchase/dashboard").then((r) => r.data),
    mapToStats: (d) => [
      { id: "purchase-open", label: "Open POs", value: String(d.open_po_count ?? 0), change: "" },
      { id: "purchase-pending", label: "Pending receive", value: String(d.pending_receive_count ?? 0), change: "" },
      { id: "purchase-spend", label: "Spend total", value: money(d.spend_total), change: "" },
    ],
  },
  {
    id: "crm",
    title: "CRM",
    moduleIds: ["crm"],
    href: "/crm/dashboard",
    fetch: () => apiFetch<{ data: any }>("/api/v1/crm/dashboard").then((r) => r.data),
    mapToStats: (d) => [
      { id: "crm-deals", label: "Open deals", value: String(d.open_deals_count ?? 0), change: "" },
      { id: "crm-pipeline", label: "Pipeline value", value: money(d.pipeline_value), change: "" },
      { id: "crm-tickets", label: "Open tickets", value: String(d.open_tickets_count ?? 0), change: "" },
    ],
  },
  {
    id: "rma",
    title: "RMA",
    moduleIds: ["rma"],
    href: "/inventory/rma",
    fetch: () => apiFetch<{ data: any }>("/api/v1/rma/dashboard").then((r) => r.data),
    mapToStats: (d) => [
      { id: "rma-open", label: "Open tickets", value: String(d.open_count ?? 0), change: "" },
      { id: "rma-supplier", label: "At supplier", value: String(d.at_supplier_count ?? 0), change: "" },
      { id: "rma-unbilled", label: "Unbilled", value: money(d.unbilled_total), change: "" },
    ],
  },
  {
    id: "service",
    title: "Service",
    moduleIds: ["service"],
    href: "/service",
    fetch: () => apiFetch<{ data: any }>("/api/v1/service-jobs/dashboard").then((r) => r.data),
    mapToStats: (d) => [
      { id: "service-open", label: "Open jobs", value: String(d.open ?? 0), change: "" },
      { id: "service-overdue", label: "Overdue", value: String(d.overdue ?? 0), change: "" },
      { id: "service-billed", label: "Billed", value: money(d.billed_amount), change: "" },
    ],
  },
  {
    id: "pos",
    title: "POS",
    moduleIds: ["pos"],
    href: "/pos",
    fetch: () => apiFetch<{ data: any }>("/api/v1/pos/dashboard").then((r) => r.data),
    mapToStats: (d) => [
      { id: "pos-sessions", label: "Open sessions", value: String(d.open_session_count ?? 0), change: "" },
      { id: "pos-sales", label: "Completed sales", value: String(d.completed_sale_count ?? 0), change: "" },
      { id: "pos-held", label: "Held carts", value: String(d.held_cart_count ?? 0), change: "" },
    ],
  },
  {
    id: "expenses",
    title: "Expenses",
    // No dedicated RBAC module id exists yet for Expenses — gated under Finance
    // (matches current backend reality; independent toggling needs a backend change).
    moduleIds: ["finance"],
    href: "/expenses",
    fetch: () => apiFetch<{ data: any }>("/api/v1/finance/expenses/summary").then((r) => r.data),
    mapToStats: (d) => [
      { id: "expenses-month", label: "This month", value: money(d.month_total), change: "" },
      {
        id: "expenses-pending",
        label: "Pending",
        value: `${d.pending_count ?? 0} · ${money(d.pending_amount)}`,
        change: "",
      },
    ],
  },
  {
    id: "website",
    title: "Website / SEO",
    moduleIds: ["website"],
    href: "/seo/dashboard",
    fetch: () => apiFetch<any>("/api/v1/seo/dashboard"),
    mapToStats: (d) => [
      { id: "seo-health", label: "Health score", value: String(d.health_score ?? 0), change: "" },
      { id: "seo-issues", label: "Open issues", value: String(d.open_issues ?? 0), change: "" },
      { id: "seo-high", label: "High severity", value: String(d.high_issues ?? 0), change: "" },
    ],
  },
  {
    id: "vendors",
    title: "Vendor Portal",
    moduleIds: ["vendors"],
    href: "/vendors",
    fetch: () => apiFetch<{ data: any }>("/api/v1/vendors/analytics/overview").then((r) => r.data),
    mapToStats: (d) => [
      { id: "vendors-active", label: "Active vendors", value: String(d.active_vendors ?? 0), change: "" },
      { id: "vendors-requests", label: "Open requests", value: String(d.active_order_requests ?? 0), change: "" },
      { id: "vendors-outstanding", label: "Outstanding", value: money(d.total_outstanding), change: "" },
    ],
  },
  {
    id: "customers",
    title: "Customers",
    moduleIds: ["customers"],
    href: "/customers",
    fetch: () => apiFetch<{ data: any[] }>("/api/v1/commerce/customers/crm-summary").then((r) => r.data),
    mapToStats: (rows: any[]) => {
      const totalDue = rows.reduce((sum, r) => sum + (Number(r.due) || 0), 0);
      return [
        { id: "customers-count", label: "Customers", value: String(rows.length), change: "" },
        { id: "customers-due", label: "Total due", value: money(totalDue), change: "" },
      ];
    },
  },
  {
    id: "finance-summary",
    title: "Finance",
    moduleIds: ["finance"],
    href: "/finance/dashboard",
    fetch: () => apiFetch<{ data: any }>("/api/v1/finance/dashboard").then((r) => r.data),
    mapToStats: (d) => [
      { id: "finance-receivables", label: "Receivables", value: money(d.receivable_balance), change: "" },
      { id: "finance-payables", label: "Payables", value: money(d.payable_balance), change: "" },
      {
        id: "finance-tax",
        label: "Net tax payable",
        value: money(d.tax_summary?.net_tax_payable),
        change: "",
      },
    ],
  },
];
