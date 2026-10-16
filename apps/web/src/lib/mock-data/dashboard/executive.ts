import type { AiBriefing, ChartData, KpiData, TableColumn, TableRow } from "@/lib/dashboard/types";

export const executiveRevenueKpis: KpiData[] = [
  { id: "er-revenue", label: "Revenue MTD", value: "৳ 42.8M", change: "+11.2%", up: true },
  { id: "er-growth", label: "YoY Growth", value: "+18%", change: "+2.1pp", up: true },
];

export const executiveSalesKpis: KpiData[] = [
  { id: "es-orders", label: "Orders", value: "3,842", change: "+9.4%", up: true },
  { id: "es-aov", label: "Avg Order Value", value: "৳ 11,150", change: "+3.8%", up: true },
];

export const executiveInventoryKpis: KpiData[] = [
  { id: "ei-stock", label: "Stock Value", value: "৳ 28.4M", change: "−2.1%", up: false },
  { id: "ei-turnover", label: "Turnover Days", value: "34", change: "−3 days", up: true },
];

export const executiveFinanceKpis: KpiData[] = [
  { id: "ef-cash", label: "Cash Position", value: "৳ 8.6M", change: "+৳1.2M", up: true },
  { id: "ef-ar", label: "Receivables", value: "৳ 5.4M", change: "12 overdue", up: false },
];

export const executiveHrKpis: KpiData[] = [
  { id: "eh-headcount", label: "Headcount", value: "248", change: "+6", up: true },
  { id: "eh-attendance", label: "Attendance", value: "96.2%", change: "+0.4%", up: true },
];

export const executiveMarketingKpis: KpiData[] = [
  { id: "em-roas", label: "ROAS", value: "4.2×", change: "+0.3", up: true },
  { id: "em-cac", label: "CAC", value: "৳ 420", change: "−8%", up: true },
];

export const executiveRevenueChart: ChartData = {
  id: "exec-revenue-chart",
  title: "Revenue Trend",
  type: "area",
  xKey: "month",
  data: [
    { month: "Jan", revenue: 32 },
    { month: "Feb", revenue: 34 },
    { month: "Mar", revenue: 36 },
    { month: "Apr", revenue: 38 },
    { month: "May", revenue: 40 },
    { month: "Jun", revenue: 43 },
  ],
  series: [{ dataKey: "revenue", label: "Revenue (M)" }],
};

export const executiveMarketingChart: ChartData = {
  id: "exec-marketing-chart",
  title: "Marketing Spend vs ROAS",
  type: "bar",
  xKey: "channel",
  data: [
    { channel: "Meta", spend: 420, roas: 4.8 },
    { channel: "Google", spend: 380, roas: 3.9 },
    { channel: "Email", spend: 120, roas: 6.2 },
    { channel: "Organic", spend: 0, roas: 8.1 },
  ],
  series: [{ dataKey: "roas", label: "ROAS" }],
};

export const executiveInventoryTable: { columns: TableColumn[]; rows: TableRow[] } = {
  columns: [
    { key: "warehouse", label: "Warehouse" },
    { key: "skus", label: "SKUs", align: "right" },
    { key: "value", label: "Value", align: "right" },
  ],
  rows: [
    { warehouse: "Dhaka HQ", skus: "1,842", value: "৳12.4M" },
    { warehouse: "Chittagong", skus: "624", value: "৳8.2M" },
    { warehouse: "Sylhet", skus: "312", value: "৳4.1M" },
  ],
};

export const executiveHrTable: { columns: TableColumn[]; rows: TableRow[] } = {
  columns: [
    { key: "dept", label: "Department" },
    { key: "headcount", label: "HC", align: "right" },
    { key: "open", label: "Open Roles", align: "right" },
  ],
  rows: [
    { dept: "Sales", headcount: 68, open: 4 },
    { dept: "Operations", headcount: 92, open: 2 },
    { dept: "Finance", headcount: 24, open: 1 },
    { dept: "HR", headcount: 12, open: 0 },
  ],
};

export const executiveAiSummary: AiBriefing = {
  id: "ai-exec",
  title: "AI Executive Summary",
  bullets: [
    "Revenue up 11% MTD — Apparel and Electronics driving growth; watch Beauty margin compression.",
    "Cash position improved ৳1.2M — receivables aging warrants collection focus on top 5 accounts.",
    "Inventory turnover improved 3 days — 18 SKUs still below safety stock in Dhaka HQ.",
    "Marketing ROAS 4.2× — Email channel outperforming; reallocate 10% from Meta test budget.",
    "HR headcount +6 — Sales hiring on track; payroll cost within 2% of plan.",
  ],
  ctaLabel: "Open executive briefing",
};
