import { FINANCE_REPORTS } from "@/lib/finance/finance-nav";
import { INVENTORY_REPORTS } from "@/lib/inventory/inventory-nav";
import { PURCHASE_REPORTS } from "@/lib/purchase/purchase-nav";
import { NAV_MODULE_MAP, hasPermission, type PermissionMap } from "@/lib/auth/permissions";
import {
  isToggleableModuleId,
  type ToggleableModuleId,
} from "@/lib/store/module-settings-store";

export type ErpReportLink = {
  id: string;
  label: string;
  href: string;
  description: string;
};

export type ErpReportGroup = {
  id: string;
  title: string;
  /** Workspace module ids that gate this group. Visible if any listed module is on. */
  moduleIds: ToggleableModuleId[];
  reports: ErpReportLink[];
};

/** Full ERP report catalog — grouped by module. Links existing report screens only. */
export const ERP_REPORT_GROUPS: ErpReportGroup[] = [
  {
    id: "catalog",
    title: "Catalog",
    moduleIds: ["catalog"],
    reports: [
      {
        id: "review-reports",
        label: "Review reports",
        href: "/website/reviews/reports",
        description: "Ratings, sentiment, moderation, and review intelligence.",
      },
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    moduleIds: ["inventory"],
    reports: INVENTORY_REPORTS,
  },
  {
    id: "purchase",
    title: "Purchase",
    moduleIds: ["purchase"],
    reports: PURCHASE_REPORTS,
  },
  {
    id: "rma",
    title: "RMA",
    moduleIds: ["rma"],
    reports: [
      {
        id: "rma-overview",
        label: "RMA reports",
        href: "/inventory/rma/reports",
        description: "Returns by status, warranty, and resolution.",
      },
    ],
  },
  {
    id: "service",
    title: "Service",
    moduleIds: ["service"],
    reports: [
      {
        id: "service-overview",
        label: "Service reports",
        href: "/service/reports",
        description: "Jobs by type, technician, and status.",
      },
    ],
  },
  {
    id: "pos",
    title: "POS",
    moduleIds: ["pos"],
    reports: [
      {
        id: "pos-overview",
        label: "POS reports",
        href: "/pos/reports",
        description: "Gross sales, cashiers, terminals, and top products from POS carts.",
      },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    moduleIds: ["finance", "accounting"],
    reports: FINANCE_REPORTS,
  },
  {
    id: "customers",
    title: "Customers",
    moduleIds: ["customers"],
    reports: [
      {
        id: "customer-overview",
        label: "Customer reports",
        href: "/customers/reports",
        description: "Segment, loyalty, wallet, and LTV reports.",
      },
    ],
  },
];

export function isErpReportGroupVisible(
  group: { moduleIds: ToggleableModuleId[] },
  opts: {
    moduleEnabled: Record<string, boolean | undefined>;
    enabledModules: string[] | null | undefined;
    permissions: PermissionMap | null | undefined;
    role?: string | null;
  },
): boolean {
  return group.moduleIds.some((id) => {
    if (isToggleableModuleId(id) && opts.moduleEnabled[id] === false) return false;
    const rbac = NAV_MODULE_MAP[id] ?? id;
    if (opts.enabledModules && !opts.enabledModules.includes(rbac)) return false;
    return hasPermission(opts.permissions, rbac, "read", opts.role);
  });
}
