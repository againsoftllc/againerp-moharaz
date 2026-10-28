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
  { id: "supplier-statement", label: "Supplier Statement", href: "/finance/reports/supplier-statement", description: "One supplier's ledger for a period — opening, bills, payments, total and credit limit summary. Print / PDF / Excel." },
  { id: "cheque-register", label: "Cheque Reports", href: "/finance/reports/cheque-register", description: "Status-wise cheques, cheques in hand, advance cheques issued, bounce analysis, party performance and history — as on any date." },
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
        id: "party-settlement",
        label: "Party transaction settlement",
        href: "/finance/settlements",
        description: "Move money already on one customer invoice to another of the same customer.",
      },
      {
        kind: "item",
        id: "payment-settlement",
        label: "Payment settlement",
        href: "/finance/settlements?party=supplier",
        description: "Move a supplier payment from one bill to another of the same supplier.",
      },
      {
        kind: "item",
        id: "invoice-pending",
        label: "Invoice wise pending collection",
        href: "/finance/receivables?view=pending",
        description: "Every customer invoice with what is paid, what is due and what settled it.",
      },
      {
        kind: "item",
        id: "payment-accounts",
        label: "Payment accounts",
        href: "/finance/payment-accounts",
        description: "Cash, bank, and wallet accounts — balances and transfers.",
      },
      {
        kind: "item",
        id: "banks",
        label: "Banks & branches",
        href: "/finance/banks",
        description: "Bank master with branches and routing numbers, used by your bank accounts.",
      },
      {
        kind: "item",
        id: "cheque-books",
        label: "Cheque books",
        href: "/finance/cheque-books",
        description: "Register the cheque books you hold and see which leaves are unused, issued or cleared.",
      },
    ],
  },
  {
    id: "vouchers",
    label: "Vouchers",
    href: "/finance/vouchers",
    children: [
      {
        kind: "item",
        id: "vouchers-debit",
        label: "Debit / Payment",
        href: "/finance/vouchers?type=debit",
        description: "Money paid out of a cash or bank account against any expense or other head.",
      },
      {
        kind: "item",
        id: "vouchers-credit",
        label: "Credit / Receive",
        href: "/finance/vouchers?type=credit",
        description: "Money received into a cash or bank account from any income or other head.",
      },
      {
        kind: "item",
        id: "vouchers-contra",
        label: "Contra",
        href: "/finance/vouchers?type=contra",
        description: "Cash deposited to the bank, cash drawn, bank to bank.",
      },
      {
        kind: "item",
        id: "vouchers-journal",
        label: "Journal",
        href: "/finance/vouchers?type=journal",
        description: "Adjustments between any heads; debits equal credits.",
      },
      {
        kind: "item",
        id: "vouchers-from-template",
        label: "Voucher from template",
        href: "/finance/vouchers?from=template",
        description: "Start a voucher from a saved template.",
      },
      {
        kind: "item",
        id: "voucher-templates",
        label: "Voucher templates",
        href: "/finance/voucher-templates",
        description: "Vouchers you enter often, kept for re-use.",
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
        id: "opening-balances",
        label: "Opening balances",
        href: "/finance/opening-balances",
        description: "What each account held on the go-live date; finalized once, then locked.",
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
