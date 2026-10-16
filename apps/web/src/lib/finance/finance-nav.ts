/**
 * AgainERP Finance navigation — top module chrome.
 */

export type FinanceNavEntry =
  | { kind: "header"; id: string; label: string }
  | { kind: "item"; id: string; label: string; href: string; description?: string };

export type FinanceNavMenu = {
  id: string;
  label: string;
  /** Single destination — render as a top-level chip (no dropdown). */
  direct?: boolean;
  href?: string;
  children: FinanceNavEntry[];
};

export const FINANCE_REPORTS: { id: string; label: string; href: string; description: string }[] = [
  { id: "executive-summary", label: "Executive Summary", href: "/finance/reports/executive-summary", description: "Cash, profitability, balance sheet, performance and position at a glance." },
  { id: "profit-loss", label: "Profit & Loss", href: "/finance/reports/profit-loss", description: "Revenue, costs, and net profit from the journal." },
  { id: "balance-sheet", label: "Balance Sheet", href: "/finance/reports/balance-sheet", description: "Assets, liabilities, and equity as of a date." },
  { id: "trial-balance", label: "Trial Balance", href: "/finance/reports/trial-balance", description: "Debits and credits by account." },
  { id: "cash-flow", label: "Cash Flow", href: "/finance/reports/cash-flow", description: "Actual money in and out of payment accounts." },
  { id: "general-ledger", label: "General Ledger", href: "/finance/reports/general-ledger", description: "Journal activity and running balance by account." },
  { id: "partner-ledger", label: "Partner Ledger", href: "/finance/reports/partner-ledger", description: "Customer and supplier movements with running balance." },
  { id: "invoices-analysis", label: "Invoices Analysis", href: "/finance/reports/invoices-analysis", description: "Customer invoicing by month, customer, status — chart and pivot." },
  { id: "analytic-report", label: "Analytic Report", href: "/finance/reports/analytic-report", description: "Journal activity by cost center (analytic account) with running balance." },
  { id: "aged-receivable", label: "Aged Receivable", href: "/finance/reports/aged-receivable", description: "Open customer balances by partner — At Date, 1-30, 31-60, 61-90, 91-120, Older." },
  { id: "aged-payable", label: "Aged Payable", href: "/finance/reports/aged-payable", description: "Open supplier balances by partner — At Date, 1-30, 31-60, 61-90, 91-120, Older." },
  { id: "tax-summary", label: "Tax Summary", href: "/finance/reports/tax-summary", description: "Input tax, output tax, and net payable from the journal." },
  { id: "expense-by-cost-center", label: "Expense by cost center", href: "/finance/reports/expense-by-cost-center", description: "Expense journal debits grouped by concern and GL account." },
];

/**
 * Same shape as Purchase / Inventory:
 * daily lists as chips, related screens under a dropdown, reports, then settings.
 * Dashboard lives on the Finance title (left), not as its own chip.
 */
export const FINANCE_NAV_MENUS: FinanceNavMenu[] = [
  {
    id: "receivables",
    label: "Receivables",
    direct: true,
    href: "/finance/receivables",
    children: [],
  },
  {
    id: "payables",
    label: "Payables",
    direct: true,
    href: "/finance/payables",
    children: [],
  },
  {
    id: "payments",
    label: "Payments",
    href: "/finance/payments",
    children: [
      {
        kind: "item",
        id: "payments-list",
        label: "Payments",
        href: "/finance/payments",
        description: "Money in and out — customer receipts and supplier settlements.",
      },
      {
        kind: "item",
        id: "payment-accounts",
        label: "Payment accounts",
        href: "/finance/payment-accounts",
        description: "Cash, bank, and wallet accounts — balances and transfers.",
      },
    ],
  },
  {
    id: "accounting",
    label: "Accounting",
    href: "/finance/journal",
    children: [
      {
        kind: "item",
        id: "journal",
        label: "Journal",
        href: "/finance/journal",
        description: "Posted and pending journal entries.",
      },
      {
        kind: "item",
        id: "accounts",
        label: "Chart of accounts",
        href: "/finance/accounts",
        description: "GL account master — codes, types, and balances.",
      },
      {
        kind: "item",
        id: "cost-centers",
        label: "Cost centers",
        href: "/finance/cost-centers",
        description: "AgainSoft, Moharaz, EGP and other concerns.",
      },
      {
        kind: "item",
        id: "allocation-rules",
        label: "Allocation rules",
        href: "/finance/allocation-rules",
        description: "Split a journal entry across cost centers.",
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    href: "/finance/reports",
    children: [
      {
        kind: "item",
        id: "hub",
        label: "All reports",
        href: "/finance/reports",
        description: "Finance reporting hub.",
      },
      ...FINANCE_REPORTS.map((report) => ({
        kind: "item" as const,
        id: report.id,
        label: report.label,
        href: report.href,
        description: report.description,
      })),
    ],
  },
  {
    id: "settings",
    label: "Settings",
    direct: true,
    href: "/finance/settings",
    children: [],
  },
];
