import type {
  ActivityItem,
  AiBriefing,
  AlertItem,
  KpiData,
  QuickAction,
} from "@/lib/dashboard/types";

export const workspaceKpis: KpiData[] = [
  { id: "kpi-revenue", label: "Revenue MTD", value: "৳ 12.4M", change: "+8.2%", up: true },
  { id: "kpi-orders", label: "Open Orders", value: "284", change: "+12", up: true },
  { id: "kpi-stock", label: "Low Stock SKUs", value: "18", change: "−3", up: false },
  { id: "kpi-carts", label: "Abandoned Carts", value: "42", change: "12 recoverable", up: false },
  { id: "kpi-customers", label: "Active Customers", value: "1,248", change: "+3.2%", up: true },
  { id: "kpi-conversion", label: "Conversion Rate", value: "3.8%", change: "−0.4%", up: false },
];

export const workspaceQuickActions: QuickAction[] = [
  { id: "qa-product", label: "Create Product", href: "/website/products?create=1" },
  { id: "qa-order", label: "Create Order", href: "/sales" },
  { id: "qa-customer", label: "Add Customer", href: "/customers?create=1" },
  { id: "qa-po", label: "Create PO", href: "/purchase/orders?create=1" },
];

export const workspaceNotifications: AlertItem[] = [
  {
    id: "n1",
    title: "Order awaiting shipment",
    message: "ORD-8821 is paid and ready to ship.",
    severity: "warning",
    href: "/sales",
  },
  {
    id: "n2",
    title: "Low stock alert",
    message: "18 SKUs below reorder point in Dhaka HQ.",
    severity: "danger",
    href: "/inventory/catalog",
  },
  {
    id: "n3",
    title: "Flash sale ending soon",
    message: "Summer Sale ends in 6 hours.",
    severity: "info",
    href: "/marketing/flash-sales",
  },
  {
    id: "n4",
    title: "New customer signup",
    message: "Metro Retail registered as B2B customer.",
    severity: "success",
    href: "/customers",
  },
];

export const workspaceActivities: ActivityItem[] = [
  { id: "a1", user: "Sadia", action: "updated price on SKU-0042", time: "5m ago" },
  { id: "a2", user: "Rahim", action: "published 3 products to storefront", time: "1h ago" },
  { id: "a3", user: "System", action: "low stock alert: Wireless Earbuds Pro", time: "2h ago" },
  { id: "a4", user: "Karim", action: "processed refund for ORD-7712", time: "3h ago" },
  { id: "a5", user: "Admin", action: "added coupon SUMMER20", time: "4h ago" },
];

export const workspaceAiBriefing: AiBriefing = {
  id: "ai-brief-workspace",
  title: "AI Daily Brief",
  bullets: [
    "Revenue is tracking 8% above last month — top category: Apparel.",
    "42 abandoned carts — 12 have high recovery probability.",
    "18 SKUs below reorder point in Dhaka HQ warehouse.",
    "Flash sale conversion up 14% vs last campaign.",
  ],
  ctaLabel: "Open AI Assistant",
};
