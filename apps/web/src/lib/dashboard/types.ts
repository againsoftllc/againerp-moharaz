export type WidgetCategory =
  | "kpi"
  | "chart"
  | "table"
  | "activity"
  | "alert"
  | "ai"
  | "quick_action";

export type MobileSupport = "full" | "compact" | "none";

export type DashboardType = "workspace" | "module" | "executive" | "personal" | "ai";

export type KpiData = {
  id: string;
  label: string;
  value: string;
  change: string;
  up?: boolean;
  href?: string;
};

export type ChartSeries = {
  dataKey: string;
  label: string;
  color?: string;
};

export type ChartData = {
  id: string;
  title: string;
  type: "area" | "bar" | "line" | "pie";
  data: Record<string, string | number>[];
  xKey?: string;
  series: ChartSeries[];
};

export type TableColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
};

export type TableRow = Record<string, string | number>;

export type ActivityItem = {
  id: string;
  user: string;
  action: string;
  time: string;
  avatar?: string;
};

export type AlertItem = {
  id: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "danger" | "success";
  href?: string;
};

export type AiBriefing = {
  id: string;
  title: string;
  bullets: string[];
  ctaLabel?: string;
};

export type QuickAction = {
  id: string;
  label: string;
  href: string;
};

export type TaskItem = {
  id: string;
  title: string;
  due: string;
  priority: "low" | "medium" | "high";
};

export type WidgetSlotConfig = {
  id: string;
  widgetId: string;
  category: WidgetCategory;
  title: string;
  colSpan: number;
  rowSpan: number;
  mobileOrder: number;
  mobileSupport: MobileSupport;
};

export type DashboardLayoutConfig = {
  id: string;
  type: DashboardType;
  name: string;
  slots: WidgetSlotConfig[];
};
