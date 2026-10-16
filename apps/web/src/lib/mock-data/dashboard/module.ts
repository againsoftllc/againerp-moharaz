import type {
  ActivityItem,
  AiBriefing,
  ChartData,
  KpiData,
  QuickAction,
  TableColumn,
  TableRow,
  TaskItem,
} from "@/lib/dashboard/types";

export const moduleKpis: KpiData[] = [
  { id: "mkpi-pipeline", label: "Pipeline Value", value: "৳ 18.6M", change: "+14%", up: true },
  { id: "mkpi-won", label: "Won This Month", value: "৳ 4.2M", change: "+6.1%", up: true },
  { id: "mkpi-leads", label: "New Leads", value: "42", change: "+9", up: true },
  { id: "mkpi-conversion", label: "Win Rate", value: "28%", change: "−1.2%", up: false },
];

export const moduleCharts: ChartData[] = [
  {
    id: "chart-pipeline",
    title: "Pipeline Trend",
    type: "area",
    xKey: "month",
    data: [
      { month: "Jan", value: 12 },
      { month: "Feb", value: 14 },
      { month: "Mar", value: 13 },
      { month: "Apr", value: 16 },
      { month: "May", value: 17 },
      { month: "Jun", value: 19 },
    ],
    series: [{ dataKey: "value", label: "Pipeline (M)" }],
  },
  {
    id: "chart-funnel",
    title: "Sales Funnel",
    type: "bar",
    xKey: "stage",
    data: [
      { stage: "Lead", count: 120 },
      { stage: "Qualified", count: 68 },
      { stage: "Proposal", count: 34 },
      { stage: "Won", count: 12 },
    ],
    series: [{ dataKey: "count", label: "Deals" }],
  },
];

export const moduleReportShortcuts: QuickAction[] = [
  { id: "r1", label: "Revenue by Rep", href: "/sales-marketing/reports" },
  { id: "r2", label: "Pipeline Aging", href: "/sales-marketing/reports" },
  { id: "r3", label: "Win/Loss Analysis", href: "/sales-marketing/reports" },
  { id: "r4", label: "Commission Summary", href: "/sales-marketing/commission" },
];

export const moduleTasks: TaskItem[] = [
  { id: "t1", title: "Follow up — Metro Retail proposal", due: "Today", priority: "high" },
  { id: "t2", title: "Schedule demo — GreenMart", due: "Tomorrow", priority: "medium" },
  { id: "t3", title: "Update quotation — ORD-882", due: "Jun 21", priority: "low" },
  { id: "t4", title: "Review commission dispute", due: "Jun 22", priority: "high" },
];

export const moduleActivities: ActivityItem[] = [
  { id: "ma1", user: "Sadia", action: "moved Metro Retail to Proposal stage", time: "20m ago" },
  { id: "ma2", user: "Rahim", action: "sent quotation QT-1042", time: "1h ago" },
  { id: "ma3", user: "System", action: "lead score updated for 5 accounts", time: "3h ago" },
];

export const moduleAiSuggestions: AiBriefing = {
  id: "ai-module",
  title: "AI Suggestions",
  bullets: [
    "Metro Retail deal has 78% close probability — schedule executive call.",
    "3 stale quotations over 14 days — send automated follow-up.",
    "Top rep Sadia is 22% above quota — replicate playbook to team.",
  ],
  ctaLabel: "View AI insights",
};

export const moduleTableColumns: TableColumn[] = [
  { key: "deal", label: "Deal" },
  { key: "value", label: "Value", align: "right" },
  { key: "stage", label: "Stage" },
];

export const moduleTableRows: TableRow[] = [
  { deal: "Metro Retail", value: "৳2.4M", stage: "Proposal" },
  { deal: "GreenMart", value: "৳890K", stage: "Qualified" },
  { deal: "UrbanWear B2B", value: "৳1.1M", stage: "Negotiation" },
  { deal: "TechHub Ltd", value: "৳650K", stage: "Lead" },
];
