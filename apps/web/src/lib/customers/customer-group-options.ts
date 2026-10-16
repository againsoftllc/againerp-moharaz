import {
  CUSTOMER_GROUP_LABELS,
  type CustomerGroup,
} from "@/lib/mock-data/customers";

export type CustomerGroupOption = { id: string; label: string };

const CUSTOM_GROUPS_STORAGE = "againerp:customer-custom-groups";
const CUSTOM_GROUP_ORDER_STORAGE = "againerp:customer-group-order";
const HIDDEN_GROUPS_STORAGE = "againerp:customer-group-hidden";

export function isBuiltInCustomerGroup(id: string): boolean {
  return id in CUSTOMER_GROUP_LABELS;
}

export function readCustomCustomerGroupLabels(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CUSTOM_GROUPS_STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeCustomCustomerGroupLabels(labels: Record<string, string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUSTOM_GROUPS_STORAGE, JSON.stringify(labels));
}

export function readCustomerGroupOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_GROUP_ORDER_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function writeCustomerGroupOrder(order: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUSTOM_GROUP_ORDER_STORAGE, JSON.stringify(order));
}

export function readHiddenCustomerGroups(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HIDDEN_GROUPS_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function writeHiddenCustomerGroups(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(HIDDEN_GROUPS_STORAGE, JSON.stringify(ids));
}

export function slugCustomerGroupLabel(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 30);
  return slug || `group_${Date.now()}`;
}

function defaultGroupIds(): string[] {
  return Object.keys(CUSTOMER_GROUP_LABELS);
}

/**
 * Merge stored order with current group ids.
 * Known ids keep relative order; new ids append at the end.
 */
export function mergeCustomerGroupOrder(
  knownIds: string[],
  storedOrder: string[] = readCustomerGroupOrder(),
): string[] {
  const known = new Set(knownIds);
  const ordered = storedOrder.filter((id) => known.has(id));
  const seen = new Set(ordered);
  for (const id of knownIds) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}

export function buildCustomerGroupOptions(
  custom: Record<string, string>,
  order?: string[],
  hidden: string[] = readHiddenCustomerGroups(),
): CustomerGroupOption[] {
  const hiddenSet = new Set(hidden);
  const builtIn = Object.entries(CUSTOMER_GROUP_LABELS)
    .filter(([id]) => !hiddenSet.has(id))
    .map(([id, label]) => ({
      id,
      label: custom[id]?.trim() || label,
    }));
  const seen = new Set(Object.keys(CUSTOMER_GROUP_LABELS));
  const extras = Object.entries(custom)
    .filter(([id]) => !seen.has(id) && !hiddenSet.has(id))
    .map(([id, label]) => ({ id, label }));
  const all = [...builtIn, ...extras];
  const byId = new Map(all.map((o) => [o.id, o]));
  const sortedIds = mergeCustomerGroupOrder(
    all.map((o) => o.id),
    order ?? readCustomerGroupOrder(),
  );
  return sortedIds.map((id) => byId.get(id)!).filter(Boolean);
}

/** Append a new group id to the saved order (if not already present). */
export function appendCustomerGroupOrder(id: string) {
  const base = mergeCustomerGroupOrder([
    ...defaultGroupIds(),
    ...Object.keys(readCustomCustomerGroupLabels()),
  ]);
  if (!base.includes(id)) base.push(id);
  writeCustomerGroupOrder(base);
  // If it was previously hidden, unhide on re-add
  const hidden = readHiddenCustomerGroups().filter((h) => h !== id);
  writeHiddenCustomerGroups(hidden);
}

/** Rename a group label (built-in override or custom). */
export function renameCustomerGroupLabel(id: string, label: string) {
  const next = { ...readCustomCustomerGroupLabels(), [id]: label.trim() };
  writeCustomCustomerGroupLabels(next);
  return next;
}

/**
 * Delete/hide a group from the selectable list.
 * Built-ins are hidden; custom groups are removed from labels.
 */
export function deleteCustomerGroup(id: string): Record<string, string> {
  const labels = { ...readCustomCustomerGroupLabels() };
  if (isBuiltInCustomerGroup(id)) {
    delete labels[id]; // drop any rename override
    writeCustomCustomerGroupLabels(labels);
    const hidden = Array.from(new Set([...readHiddenCustomerGroups(), id]));
    writeHiddenCustomerGroups(hidden);
  } else {
    delete labels[id];
    writeCustomCustomerGroupLabels(labels);
  }
  writeCustomerGroupOrder(readCustomerGroupOrder().filter((g) => g !== id));
  return labels;
}

export function resolveCustomerGroupLabel(
  id: string,
  custom: Record<string, string>,
): string {
  if (custom[id]) return custom[id];
  const builtIn = CUSTOMER_GROUP_LABELS[id as CustomerGroup];
  if (builtIn) return builtIn;
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
