/**
 * AgainERP Expenses navigation — top module chrome.
 */

export type ExpensesNavMenu = {
  id: string;
  label: string;
  /** Single destination — render as a top-level chip (no dropdown). */
  direct?: boolean;
  href?: string;
  children: [];
};

export const EXPENSES_NAV_MENUS: ExpensesNavMenu[] = [
  {
    id: "expenses",
    label: "Expenses",
    direct: true,
    href: "/expenses",
    children: [],
  },
  {
    id: "reports",
    label: "Reports",
    direct: true,
    href: "/finance/reports/expense-by-cost-center",
    children: [],
  },
];
