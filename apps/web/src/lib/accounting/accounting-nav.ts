/**
 * Accounting module chrome — NetSuite-style centers (dashboard only for now).
 */

export type AccountingNavMenu = {
  id: string;
  label: string;
  href?: string;
};

export const ACCOUNTING_NAV_MENUS: AccountingNavMenu[] = [
  { id: "activities", label: "Activities" },
  { id: "billing", label: "Billing" },
  { id: "customers", label: "Customers" },
  { id: "vendors", label: "Vendors" },
  { id: "payroll", label: "Payroll and HR" },
  { id: "financial", label: "Financial", href: "/accounting" },
  { id: "reports", label: "Reports" },
  { id: "analytics", label: "Analytics" },
  { id: "documents", label: "Documents" },
  { id: "setup", label: "Setup", href: "/accounting/settings" },
  { id: "ap", label: "A/P" },
  { id: "ar", label: "A/R" },
  { id: "sales-audit", label: "Sales Audit" },
  { id: "suiteapps", label: "SuiteApps" },
  { id: "support", label: "Support" },
];
