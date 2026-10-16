/**
 * AgainERP Purchase navigation — top module chrome.
 * Inside this module say Supplier, never Vendor (Vendors = B2B customers).
 */

export type PurchaseNavEntry =
  | { kind: "header"; id: string; label: string }
  | { kind: "item"; id: string; label: string; href: string; description?: string };

export type PurchaseNavMenu = {
  id: string;
  label: string;
  /** Single destination — render as a top-level chip (no dropdown). */
  direct?: boolean;
  href?: string;
  children: PurchaseNavEntry[];
};

export const PURCHASE_REPORTS: { id: string; label: string; href: string; description: string }[] = [
  {
    id: "prices",
    label: "Purchase prices",
    href: "/purchase/reports/prices",
    description:
      "Stock cost, default, last, average, lowest, and highest purchase price per SKU — plus last purchase date.",
  },
  {
    id: "open-orders",
    label: "Open orders",
    href: "/purchase/reports/open-orders",
    description: "Confirmed and partial POs — remaining qty, expected date, and overdue aging.",
  },
];

export const PURCHASE_NAV_MENUS: PurchaseNavMenu[] = [
  {
    id: "suppliers",
    label: "Suppliers",
    direct: true,
    href: "/suppliers?from=purchase",
    children: [],
  },
  {
    id: "products",
    label: "Products",
    direct: true,
    href: "/purchase/products",
    children: [],
  },
  {
    id: "orders",
    label: "Orders",
    children: [
      {
        kind: "item",
        id: "purchase-orders",
        label: "Purchase Orders",
        href: "/purchase/orders",
        description: "Draft, confirm, and track orders against suppliers.",
      },
      {
        kind: "item",
        id: "rfq",
        label: "RFQ",
        href: "/purchase/rfq",
        description: "Request quantities and specs from suppliers.",
      },
      {
        kind: "item",
        id: "quotations",
        label: "Quotations",
        href: "/purchase/quotations",
        description: "Capture supplier quotes and award to a PO.",
      },
    ],
  },
  {
    id: "receipts",
    label: "Receipts",
    direct: true,
    href: "/purchase/receipts",
    children: [],
  },
  {
    id: "returns",
    label: "Returns",
    direct: true,
    href: "/purchase/returns",
    children: [],
  },
  {
    id: "bills",
    label: "Bills",
    direct: true,
    href: "/purchase/bills",
    children: [],
  },
  {
    id: "reports",
    label: "Reports",
    children: [
      {
        kind: "item",
        id: "hub",
        label: "All reports",
        href: "/purchase/reports",
        description: "Purchase reporting hub.",
      },
      ...PURCHASE_REPORTS.map((report) => ({
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
    href: "/purchase/settings",
    children: [],
  },
];
