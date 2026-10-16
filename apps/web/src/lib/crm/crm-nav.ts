/**
 * AgainERP CRM navigation — top module chrome.
 */

export type CrmNavEntry =
  | { kind: "header"; id: string; label: string }
  | { kind: "item"; id: string; label: string; href: string; description?: string };

export type CrmNavMenu = {
  id: string;
  label: string;
  direct?: boolean;
  href?: string;
  children: CrmNavEntry[];
};

export const CRM_NAV_MENUS: CrmNavMenu[] = [
  { id: "dashboard", label: "Dashboard", direct: true, href: "/crm/dashboard", children: [] },
  { id: "leads", label: "Leads", direct: true, href: "/crm/leads", children: [] },
  { id: "deals", label: "Deals", direct: true, href: "/crm/deals", children: [] },
  { id: "clients", label: "Clients", direct: true, href: "/crm/clients", children: [] },
  { id: "invoices", label: "Invoices", direct: true, href: "/crm/invoices", children: [] },
  { id: "projects", label: "Projects", direct: true, href: "/crm/projects", children: [] },
  { id: "tasks", label: "Tasks", direct: true, href: "/crm/tasks", children: [] },
  { id: "tickets", label: "Support Tickets", direct: true, href: "/crm/tickets", children: [] },
  { id: "settings", label: "Settings", direct: true, href: "/crm/settings", children: [] },
];
