/**
 * AgainERP Inventory navigation — top module chrome.
 * Phase 1 ships Stock / Warehouses / Movements / Serials / Stock Counts / Stock Transfers.
 */

export type InventoryNavEntry =
  | { kind: "header"; id: string; label: string }
  | { kind: "item"; id: string; label: string; href: string; description?: string };

export type InventoryNavMenu = {
  id: string;
  label: string;
  /** Single destination — render as a top-level chip (no dropdown). */
  direct?: boolean;
  href?: string;
  children: InventoryNavEntry[];
};

export const INVENTORY_REPORTS: { id: string; label: string; href: string; description: string }[] = [
  {
    id: "product",
    label: "Product report",
    href: "/inventory/reports/product",
    description:
      "One product end to end — purchases in, sales out, returns, current stock and value, supplier, profit/loss.",
  },
  {
    id: "on-hand",
    label: "Stock on hand",
    href: "/inventory/reports/on-hand",
    description: "SKU × warehouse quantity — on hand, reserved, available, and incoming.",
  },
  {
    id: "valuation",
    label: "Stock valuation",
    href: "/inventory/reports/valuation",
    description: "On-hand stock at default sales price, with cost and potential profit if sold.",
  },
  {
    id: "by-supplier",
    label: "By supplier",
    href: "/inventory/reports/by-supplier",
    description: "How much stock you hold from each supplier — cost, sale value, and potential profit.",
  },
  {
    id: "movements",
    label: "Movement summary",
    href: "/inventory/reports/movements",
    description: "In, out, transfer, and adjustment quantities for a date range.",
  },
  {
    id: "profit-loss",
    label: "Profit / Loss",
    href: "/inventory/reports/profit-loss",
    description: "Opening/closing stock, purchases, sales, returns, expenses, COGS, and net profit.",
  },
  {
    id: "serials",
    label: "Serial register",
    href: "/inventory/reports/serials",
    description:
      "Each physical unit — status, warehouse, warranty, days in stock, and open RMA.",
  },
  {
    id: "reorder-suggestions",
    label: "Reorder suggestions",
    href: "/inventory/reorder-suggestions",
    description: "Items at or below reorder level, with a suggested quantity.",
  },
];

export const INVENTORY_NAV_MENUS: InventoryNavMenu[] = [
  {
    id: "catalog",
    label: "Catalog",
    direct: true,
    href: "/inventory/catalog",
    children: [],
  },
  // Same Sales data as the Sales module's own navbar, mounted under
  // /inventory/* so it shows the Inventory chrome — /sales/* itself is untouched.
  {
    id: "sales",
    label: "Sales",
    children: [
      {
        kind: "item",
        id: "all-sales",
        label: "All Sales",
        href: "/inventory/orders",
        description: "Every sales order, regardless of status.",
      },
      {
        kind: "item",
        id: "quotations",
        label: "Quotations",
        href: "/inventory/quotations",
        description: "Draft and sent quotations awaiting confirmation.",
      },
      {
        kind: "item",
        id: "returns",
        label: "Returns",
        href: "/inventory/returns",
        description: "Customer returns awaiting confirmation, credit, or cancellation.",
      },
      {
        kind: "item",
        id: "customers",
        label: "Customers",
        href: "/inventory/customers",
        description: "Customer directory and order history.",
      },
    ],
  },
  // Same Purchase data as the Purchase module's own navbar, mounted under
  // /inventory/purchase/* so it shows the Inventory chrome — /purchase/* itself
  // is untouched.
  {
    id: "purchase",
    label: "Purchase",
    children: [
      {
        kind: "item",
        id: "rfq",
        label: "RFQ",
        href: "/inventory/purchase/rfq",
        description: "Request quotes from suppliers, compare them, and award to a purchase order.",
      },
      {
        kind: "item",
        id: "orders",
        label: "Order (PO)",
        href: "/inventory/purchase/orders",
        description: "Draft, confirm, and track orders against suppliers.",
      },
      {
        kind: "item",
        id: "receipts",
        label: "Receipts",
        href: "/inventory/purchase/receipts",
        description: "Goods received against purchase orders.",
      },
      {
        kind: "item",
        id: "returns",
        label: "Returns",
        href: "/inventory/purchase/returns",
        description: "Stock returned to suppliers.",
      },
      {
        kind: "item",
        id: "bills",
        label: "Bills",
        href: "/inventory/purchase/bills",
        description: "Supplier bills and payment status.",
      },
      {
        kind: "item",
        id: "suppliers",
        label: "Suppliers",
        href: "/inventory/purchase/suppliers",
        description: "Supplier directory and purchase history.",
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    children: [
      {
        kind: "item",
        id: "movements",
        label: "Stock Movements",
        href: "/inventory/movements",
        description: "Every in, out, transfer, and adjustment with before → after quantity.",
      },
      {
        kind: "item",
        id: "serials",
        label: "Serial Numbers",
        href: "/inventory/serials",
        description: "Which unit is where — in stock, sold, or on an open RMA.",
      },
      {
        kind: "item",
        id: "stock-counts",
        label: "Stock Counts",
        href: "/inventory/stock-counts",
        description: "Cycle counts — snapshot expected qty, record counted, post variances.",
      },
      {
        kind: "item",
        id: "adjustments",
        label: "Stock Adjustments",
        href: "/inventory/adjustments",
        description: "Correct warehouse stock when physical count differs from ERP.",
      },
      {
        kind: "item",
        id: "transfers",
        label: "Stock Transfers",
        href: "/inventory/transfers",
        description: "Move stock between warehouses — ship, in transit, then receive.",
      },
    ],
  },
  {
    id: "rma",
    label: "RMA",
    direct: true,
    href: "/inventory/rma",
    children: [],
  },
  {
    // finalizing actions held for an approver (docs/approval.md); sits left of Reports
    id: "approve",
    label: "Approve",
    direct: true,
    href: "/inventory/approve",
    children: [],
  },
  {
    id: "reports",
    label: "Reports",
    href: "/inventory/reports",
    children: [
      {
        kind: "item",
        id: "hub",
        label: "All reports",
        href: "/inventory/reports",
        description: "Inventory reporting hub.",
      },
      {
        kind: "item",
        id: "stock",
        label: "Stock Report",
        href: "/inventory/stock",
        description: "Live stock levels by product.",
      },
      ...INVENTORY_REPORTS.map((report) => ({
        kind: "item" as const,
        id: report.id,
        label: report.label,
        href: report.href,
        description: report.description,
      })),
    ],
  },
  {
    id: "configuration",
    label: "Configuration",
    children: [
      {
        kind: "item",
        id: "settings",
        label: "Settings",
        href: "/inventory/settings",
        description: "Inventory defaults — valuation, negative stock, and serial policy.",
      },
      {
        kind: "item",
        id: "warehouses",
        label: "Warehouses",
        href: "/inventory/warehouses",
        description: "Warehouse master — codes, types, addresses, and the default location.",
      },
      {
        kind: "item",
        id: "locations",
        label: "Locations",
        href: "/inventory/locations",
        description: "Bins and zones within a warehouse — optional finer-grained placement.",
      },
    ],
  },
];
