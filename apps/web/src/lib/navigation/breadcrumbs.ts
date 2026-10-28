import { flattenWorkspaceNavWithPath } from "@/lib/workspace/navigation-config";
import { BRAND_NAME } from "@/lib/brand";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

function flattenSidebarNav() {
  return flattenWorkspaceNavWithPath();
}

const SIDEBAR_FLAT = flattenSidebarNav();

const SEGMENT_LABELS: Record<string, string> = {
  catalog: "Catalog",
  customers: "Customers",
  inventory: "Inventory",
  transfers: "Stock Transfers",
  adjustments: "Stock Adjustments",
  suppliers: "Suppliers",
  purchase: "Purchase",
  marketing: "Marketing",
  website: "Website",
  seo: "SEO",
  config: "Config",
  sitemap: "Sitemap",
  robots: "Robots.txt",
  schema: "Schema",
  workspace: "Workspace",
  media: "Media",
  reports: "Reports",
  settings: "Settings",
  notifications: "Notifications",
  dashboard: "Dashboard",
  rma: "RMA",
  "service-jobs": "Service jobs",
  "stock-report": "RMA Stock Report",
  jobs: "Job cards",
  items: "Service items",
  invoices: "Invoices",
  technicians: "Technicians",
  finance: "Finance",
  accounting: "Accounting",
  pos: "POS",
  sale: "New sale",
  sessions: "Sessions",
  terminals: "Terminals",
  orders: "Orders",
  held: "Held orders",
  returns: "Returns",
  cash: "Cash",
  receipts: "Receipts",
  receivables: "Receivables",
  payables: "Payables",
  payments: "Payments",
  expenses: "Expenses",
  journal: "Journal",
  accounts: "Chart of Accounts",
  "payment-accounts": "Payment Accounts",
  "cheque-books": "Cheque Books",
  "trial-balance": "Trial Balance",
  "profit-loss": "Profit & Loss",
  "balance-sheet": "Balance Sheet",
  ai: "AI",
  "cash-flow": "Cash Flow",
  "general-ledger": "General Ledger",
  "tax-summary": "Tax Summary",
  service: "Service",
  manufacturing: "Manufacturing",
  "ai-os": "AI OS",
  "ai-approvals": "AI Approvals",
  "ai-usage": "AI Usage",
};

function normalizeHref(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname;
}

function findNavMatch(pathname: string, search: string) {
  const full = normalizeHref(pathname, search);
  const exact = SIDEBAR_FLAT.find((e) => e.href === full);
  if (exact) return exact;

  const pathMatches = SIDEBAR_FLAT.filter((e) => {
    const [path] = e.href.split("?");
    return pathname === path || pathname.startsWith(`${path}/`);
  }).sort((a, b) => b.href.length - a.href.length);

  return pathMatches[0];
}

function fallbackCrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [];

  const crumbs: BreadcrumbItem[] = [];
  let href = "";

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    href += `/${segment}`;
    const label =
      SEGMENT_LABELS[segment] ??
      segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const isLast = i === segments.length - 1;
    crumbs.push({ label, href: isLast ? undefined : href });
  }

  return crumbs;
}

export function resolveBreadcrumbs(pathname: string, search = ""): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [{ label: BRAND_NAME, href: "/dashboard" }];

  if (pathname === "/dashboard") {
    crumbs.push({ label: "Dashboard" });
    return crumbs;
  }

  const match = findNavMatch(pathname, search);

  if (match) {
    match.path.forEach((label, index) => {
      const isLast = index === match.path.length - 1;
      crumbs.push({
        label,
        href: isLast ? undefined : match.href.split("?")[0],
      });
    });
    return crumbs;
  }

  const fallback = fallbackCrumbs(pathname);
  return [...crumbs, ...fallback];
}
