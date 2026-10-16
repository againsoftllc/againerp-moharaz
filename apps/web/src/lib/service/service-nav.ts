export type ServiceNavEntry =
  | { kind: "header"; id: string; label: string }
  | { kind: "item"; id: string; label: string; href: string; description?: string };

export type ServiceNavMenu = {
  id: string;
  label: string;
  direct?: boolean;
  href?: string;
  children: ServiceNavEntry[];
};

export const SERVICE_NAV_MENUS: ServiceNavMenu[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    direct: true,
    href: "/service",
    children: [],
  },
  {
    id: "jobs",
    label: "Job cards",
    direct: true,
    href: "/service/jobs",
    children: [],
  },
  {
    id: "items",
    label: "Service items",
    direct: true,
    href: "/service/items",
    children: [],
  },
  {
    id: "invoices",
    label: "Invoices",
    direct: true,
    href: "/service/invoices",
    children: [],
  },
  {
    id: "technicians",
    label: "Technicians",
    direct: true,
    href: "/service/technicians",
    children: [],
  },
  {
    id: "reports",
    label: "Reports",
    direct: true,
    href: "/service/reports",
    children: [],
  },
  {
    id: "settings",
    label: "Settings",
    direct: true,
    href: "/service/settings",
    children: [],
  },
];
