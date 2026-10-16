/** Generic HRM entity field + row types for mock CRUD screens. */

export type HrmFieldType = "text" | "textarea" | "number" | "date" | "select" | "status";

export type HrmFieldDef = {
  key: string;
  label: string;
  type: HrmFieldType;
  required?: boolean;
  /** Show in list grid (default true for first columns). */
  list?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
};

export type HrmEntityRow = {
  id: string;
  /** Primary display name */
  name: string;
  status: string;
  [key: string]: string | number | boolean | undefined;
};

export type HrmEntityDef = {
  id: string;
  title: string;
  singular: string;
  href: string;
  description: string;
  fields: HrmFieldDef[];
  seed: HrmEntityRow[];
};

export const HRM_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
];

export function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  const s = status.toLowerCase();
  if (s === "active" || s === "approved" || s === "completed" || s === "present") return "default";
  if (s === "rejected" || s === "terminated" || s === "absent") return "destructive";
  if (s === "pending" || s === "draft" || s === "on_leave" || s === "half_day") return "secondary";
  if (s === "holiday") return "outline";
  return "outline";
}
