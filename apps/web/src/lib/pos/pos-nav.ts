export type PosNavEntry =
  | { kind: "header"; id: string; label: string }
  | { kind: "item"; id: string; label: string; href: string; description?: string };

export type PosNavMenu = {
  id: string;
  label: string;
  direct?: boolean;
  href?: string;
  children: PosNavEntry[];
};

export const POS_NAV_MENUS: PosNavMenu[] = [
  { id: "dashboard", label: "Dashboard", direct: true, href: "/pos", children: [] },
  { id: "sale", label: "New sale", direct: true, href: "/pos/sale", children: [] },
  { id: "sessions", label: "Sessions", direct: true, href: "/pos/sessions", children: [] },
  { id: "terminals", label: "Terminals", direct: true, href: "/pos/terminals", children: [] },
  { id: "orders", label: "Orders", direct: true, href: "/pos/orders", children: [] },
  { id: "held", label: "Held", direct: true, href: "/pos/held", children: [] },
  { id: "returns", label: "Returns", direct: true, href: "/pos/returns", children: [] },
  { id: "cash", label: "Cash", direct: true, href: "/pos/cash", children: [] },
  { id: "payments", label: "Payments", direct: true, href: "/pos/payments", children: [] },
  { id: "receipts", label: "Receipts", direct: true, href: "/pos/receipts", children: [] },
  { id: "reports", label: "Reports", direct: true, href: "/pos/reports", children: [] },
  { id: "settings", label: "Settings", direct: true, href: "/pos/settings", children: [] },
];
