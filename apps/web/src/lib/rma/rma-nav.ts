/**
 * AgainERP RMA navigation — top module chrome.
 * Claims stay on /rma with query filters; service jobs and reports are pages.
 */

export type RmaNavEntry =
  | { kind: "header"; id: string; label: string }
  | { kind: "item"; id: string; label: string; href: string; description?: string };

export type RmaNavMenu = {
  id: string;
  label: string;
  /** Single destination — render as a top-level chip (no dropdown). */
  direct?: boolean;
  href?: string;
  children: RmaNavEntry[];
};

export const RMA_NAV_MENUS: RmaNavMenu[] = [
  {
    id: "claims",
    label: "Claims",
    children: [
      {
        kind: "item",
        id: "all",
        label: "All RMA",
        href: "/rma",
        description: "Every claim, regardless of stage.",
      },
      {
        kind: "item",
        id: "pending",
        label: "Pending approval",
        href: "/rma?status=pending_approval",
        description: "Waiting for an agent to authorize the return.",
      },
      {
        kind: "item",
        id: "awaiting",
        label: "Awaiting return",
        href: "/rma?status=awaiting_return",
        description: "Approved — unit has not arrived yet.",
      },
      {
        kind: "item",
        id: "received",
        label: "Received",
        href: "/rma?status=received",
        description: "In holding / quarantine, not sellable stock.",
      },
      {
        kind: "item",
        id: "inspection",
        label: "Inspection",
        href: "/rma?status=diagnosing",
        description: "QC in progress.",
      },
      {
        kind: "item",
        id: "resolution",
        label: "Resolution pending",
        href: "/rma?status=awaiting_approval",
        description: "Inspection done — resolution not yet actioned.",
      },
      {
        kind: "item",
        id: "completed",
        label: "Completed",
        href: "/rma?status=closed",
        description: "Closed claims.",
      },
    ],
  },
  {
    id: "warranty",
    label: "Warranty",
    direct: true,
    href: "/rma?warranty_status=in_warranty",
    children: [],
  },
  {
    id: "supplier",
    label: "Supplier",
    direct: true,
    href: "/rma?rma_type=supplier",
    children: [],
  },
  {
    id: "service",
    label: "Service jobs",
    direct: true,
    href: "/service/jobs",
    children: [],
  },
  {
    id: "reports",
    label: "Reports",
    direct: true,
    href: "/rma/reports",
    children: [],
  },
  {
    id: "settings",
    label: "Settings",
    direct: true,
    href: "/rma/settings",
    children: [],
  },
];
