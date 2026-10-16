import type { DashboardLayoutConfig } from "./types";

export const workspaceLayout: DashboardLayoutConfig = {
  id: "tpl.workspace.home",
  type: "workspace",
  name: "Workspace Home",
  slots: [
    { id: "s-kpi-1", widgetId: "workspace.kpi-row", category: "kpi", title: "KPI Overview", colSpan: 12, rowSpan: 1, mobileOrder: 1, mobileSupport: "full" },
    { id: "s-qa", widgetId: "workspace.quick-actions", category: "quick_action", title: "Quick Actions", colSpan: 4, rowSpan: 2, mobileOrder: 3, mobileSupport: "full" },
    { id: "s-notif", widgetId: "workspace.notifications", category: "alert", title: "Notifications", colSpan: 4, rowSpan: 2, mobileOrder: 4, mobileSupport: "compact" },
    { id: "s-ai", widgetId: "workspace.ai-brief", category: "ai", title: "AI Briefing", colSpan: 8, rowSpan: 2, mobileOrder: 5, mobileSupport: "full" },
    { id: "s-act", widgetId: "workspace.activities", category: "activity", title: "Recent Activities", colSpan: 8, rowSpan: 2, mobileOrder: 6, mobileSupport: "compact" },
  ],
};

export const moduleLayout: DashboardLayoutConfig = {
  id: "tpl.module.standard",
  type: "module",
  name: "Module Dashboard",
  slots: [
    { id: "m-kpi", widgetId: "module.kpi-row", category: "kpi", title: "KPI Summary", colSpan: 12, rowSpan: 1, mobileOrder: 1, mobileSupport: "full" },
    { id: "m-chart", widgetId: "module.chart-main", category: "chart", title: "Pipeline Trend", colSpan: 8, rowSpan: 3, mobileOrder: 7, mobileSupport: "compact" },
    { id: "m-reports", widgetId: "module.reports", category: "quick_action", title: "Reports", colSpan: 4, rowSpan: 3, mobileOrder: 8, mobileSupport: "full" },
    { id: "m-chart2", widgetId: "module.chart-funnel", category: "chart", title: "Sales Funnel", colSpan: 12, rowSpan: 2, mobileOrder: 9, mobileSupport: "compact" },
    { id: "m-act", widgetId: "module.activities", category: "activity", title: "Recent Activities", colSpan: 6, rowSpan: 2, mobileOrder: 10, mobileSupport: "compact" },
    { id: "m-tasks", widgetId: "module.tasks", category: "table", title: "Pending Tasks", colSpan: 6, rowSpan: 2, mobileOrder: 2, mobileSupport: "full" },
    { id: "m-ai", widgetId: "module.ai", category: "ai", title: "AI Suggestions", colSpan: 12, rowSpan: 2, mobileOrder: 5, mobileSupport: "full" },
  ],
};

export const executiveLayout: DashboardLayoutConfig = {
  id: "tpl.executive.standard",
  type: "executive",
  name: "Executive Dashboard",
  slots: [
    { id: "e-rev", widgetId: "exec.revenue", category: "kpi", title: "Revenue", colSpan: 6, rowSpan: 2, mobileOrder: 1, mobileSupport: "full" },
    { id: "e-sales", widgetId: "exec.sales", category: "kpi", title: "Sales", colSpan: 6, rowSpan: 2, mobileOrder: 2, mobileSupport: "full" },
    { id: "e-rev-chart", widgetId: "exec.revenue-chart", category: "chart", title: "Revenue Trend", colSpan: 6, rowSpan: 3, mobileOrder: 7, mobileSupport: "compact" },
    { id: "e-inv", widgetId: "exec.inventory", category: "kpi", title: "Inventory", colSpan: 6, rowSpan: 2, mobileOrder: 3, mobileSupport: "full" },
    { id: "e-fin", widgetId: "exec.finance", category: "kpi", title: "Finance", colSpan: 6, rowSpan: 2, mobileOrder: 4, mobileSupport: "full" },
    { id: "e-hr", widgetId: "exec.hr", category: "kpi", title: "HR", colSpan: 6, rowSpan: 2, mobileOrder: 5, mobileSupport: "full" },
    { id: "e-mkt", widgetId: "exec.marketing", category: "chart", title: "Marketing", colSpan: 6, rowSpan: 3, mobileOrder: 8, mobileSupport: "compact" },
    { id: "e-ai", widgetId: "exec.ai-summary", category: "ai", title: "AI Executive Summary", colSpan: 12, rowSpan: 2, mobileOrder: 6, mobileSupport: "full" },
  ],
};
