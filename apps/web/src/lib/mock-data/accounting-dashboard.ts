export type AccountingReminder = {
  id: string;
  count: number;
  label: string;
  tone: "info" | "danger" | "warn";
};

export type AccountingShortcutGroup = {
  id: string;
  label: string;
  icon: "sales" | "inventory" | "arap" | "financials";
  links: { id: string; label: string }[];
};

export type AccountingKpiCard = {
  id: string;
  label: string;
  changePct: number;
  direction: "up" | "down";
  tone: "good" | "bad" | "neutral";
  sparkline: number[];
};

export type AccountingKpiRow = {
  id: string;
  indicator: string;
  period: string;
  current: number;
  previous: number;
  changePct: number;
  direction: "up" | "down";
  tone: "good" | "bad" | "neutral";
};

export type AccountingPeriodPoint = {
  period: string;
  income: number;
  revenue: number;
  movingAverage: number;
  newBusiness: number;
  newBusinessRepeat: number;
};

export const ACCOUNTING_REMINDERS: AccountingReminder[] = [
  { id: "expense-reports", count: 3, label: "Expense Reports to Approve", tone: "info" },
  { id: "overdue-invoices", count: 1, label: "Invoices > 30 Days > 50K", tone: "danger" },
  { id: "new-vendors", count: 2, label: "New Vendors", tone: "warn" },
];

export const ACCOUNTING_SHORTCUTS: AccountingShortcutGroup[] = [
  {
    id: "sales",
    label: "Sales",
    icon: "sales",
    links: [
      { id: "cust-profit", label: "Customer Profitability" },
      { id: "sales-item", label: "Sales by Item Summary" },
    ],
  },
  {
    id: "inventory",
    label: "Inventory Management",
    icon: "inventory",
    links: [
      { id: "turnover", label: "Inventory Turnover" },
      { id: "variances", label: "Purchase Variances" },
      { id: "inv-profit", label: "Inventory Profitability" },
      { id: "open-po", label: "Open Purchase Orders" },
      { id: "po-history", label: "Purchase Order History" },
    ],
  },
  {
    id: "arap",
    label: "AR and AP Reports",
    icon: "arap",
    links: [
      { id: "ap-aging", label: "A/P Aging" },
      { id: "ar-aging", label: "A/R Aging" },
      { id: "ap-register", label: "A/P Register" },
      { id: "ar-register", label: "A/R Register" },
    ],
  },
  {
    id: "financials",
    label: "Financials",
    icon: "financials",
    links: [
      { id: "bank-register", label: "Bank Register" },
      { id: "gl", label: "General Ledger" },
      { id: "cash-flow", label: "Cash Flow Statement" },
    ],
  },
];

export const ACCOUNTING_KPI_CARDS: AccountingKpiCard[] = [
  {
    id: "sales",
    label: "Sales",
    changePct: 13.4,
    direction: "up",
    tone: "good",
    sparkline: [118, 124, 121, 132, 140, 148, 155, 162, 170],
  },
  {
    id: "expenses",
    label: "Expenses",
    changePct: 8.6,
    direction: "up",
    tone: "bad",
    sparkline: [72, 74, 73, 78, 80, 82, 85, 88, 93],
  },
  {
    id: "revenue",
    label: "Revenue",
    changePct: 13.4,
    direction: "up",
    tone: "good",
    sparkline: [120, 126, 122, 134, 142, 150, 158, 164, 172],
  },
  {
    id: "receivables",
    label: "Receivables",
    changePct: 25.3,
    direction: "up",
    tone: "good",
    sparkline: [48, 50, 52, 55, 58, 64, 70, 78, 86],
  },
];

export const ACCOUNTING_KPI_ROWS: AccountingKpiRow[] = [
  {
    id: "sales",
    indicator: "Sales",
    period: "This Month vs. Last Month",
    current: 1_700_137,
    previous: 1_498_879,
    changePct: 13.4,
    direction: "up",
    tone: "good",
  },
  {
    id: "expenses",
    indicator: "Expenses",
    period: "This Period vs. Last Period",
    current: 928_230,
    previous: 854_765,
    changePct: 8.6,
    direction: "up",
    tone: "bad",
  },
  {
    id: "revenue",
    indicator: "Revenue",
    period: "This Month vs. Last Month",
    current: 1_700_137,
    previous: 1_498_879,
    changePct: 13.4,
    direction: "up",
    tone: "good",
  },
  {
    id: "receivables",
    indicator: "Receivables",
    period: "This Period vs. Last Period",
    current: 412_880,
    previous: 329_510,
    changePct: 25.3,
    direction: "up",
    tone: "good",
  },
  {
    id: "bank",
    indicator: "Total Bank Balance",
    period: "This Period vs. Last Period",
    current: 3_150_869,
    previous: 2_998_835,
    changePct: 5.1,
    direction: "up",
    tone: "good",
  },
  {
    id: "payables",
    indicator: "Payables",
    period: "End of This Month vs. End of Last Month",
    current: 1_150_358,
    previous: 1_215_692,
    changePct: 5.4,
    direction: "down",
    tone: "neutral",
  },
  {
    id: "cogs",
    indicator: "COGS",
    period: "This Period vs. Last Period",
    current: 612_440,
    previous: 578_910,
    changePct: 5.8,
    direction: "up",
    tone: "bad",
  },
  {
    id: "inventory",
    indicator: "Inventory",
    period: "End of This Month vs. End of Last Month",
    current: 842_110,
    previous: 801_220,
    changePct: 5.1,
    direction: "up",
    tone: "good",
  },
  {
    id: "pipeline",
    indicator: "Total Pipeline Deals",
    period: "This Period vs. Last Period",
    current: 2_450_000,
    previous: 2_180_000,
    changePct: 12.4,
    direction: "up",
    tone: "good",
  },
  {
    id: "cc",
    indicator: "Credit Card Balance",
    period: "End of This Month vs. End of Last Month",
    current: 48_220,
    previous: 51_100,
    changePct: 5.6,
    direction: "down",
    tone: "good",
  },
];

export const ACCOUNTING_PERIOD_TREND: AccountingPeriodPoint[] = [
  { period: "Jul 2024", income: 185_000, revenue: 198_000, movingAverage: 185_000, newBusiness: 42_000, newBusinessRepeat: 18_000 },
  { period: "Aug 2024", income: 242_000, revenue: 255_000, movingAverage: 214_000, newBusiness: 55_000, newBusinessRepeat: 22_000 },
  { period: "Sep 2024", income: 318_000, revenue: 340_000, movingAverage: 264_000, newBusiness: 68_000, newBusinessRepeat: 28_000 },
  { period: "Oct 2024", income: 496_000, revenue: 528_000, movingAverage: 374_000, newBusiness: 96_000, newBusinessRepeat: 36_000 },
  { period: "Nov 2024", income: 742_000, revenue: 790_000, movingAverage: 553_000, newBusiness: 148_000, newBusinessRepeat: 52_000 },
  { period: "Dec 2024", income: 1_186_000, revenue: 1_264_000, movingAverage: 861_000, newBusiness: 238_000, newBusinessRepeat: 84_000 },
  { period: "Jan 2025", income: 1_700_137, revenue: 1_850_000, movingAverage: 1_301_000, newBusiness: 365_000, newBusinessRepeat: 118_000 },
];
