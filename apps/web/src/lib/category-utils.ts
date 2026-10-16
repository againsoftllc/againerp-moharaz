import type { Category } from "@/lib/mock-data/categories";
import { categoriesFlat } from "@/lib/mock-data/categories";

export function getCategoryDepth(category: Category, items: Category[]): number {
  let depth = 0;
  let parentId = category.parentId;
  while (parentId) {
    depth++;
    parentId = items.find((c) => c.id === parentId)?.parentId ?? null;
  }
  return depth;
}

export function getParentLabel(category: Category, items: Category[]): string {
  if (!category.parentId) return "—";
  const parent = items.find((c) => c.id === category.parentId);
  return parent?.name ?? "—";
}

/** Full ancestor breadcrumb: "Electronics › Laptops › Gaming Laptop" */
export function getCategoryBreadcrumb(category: Category, items: Category[]): string {
  const ancestors = getCategoryAncestorNames(category, items);
  return ancestors.length ? ancestors.join(" › ") : "—";
}

export function getCategoryAncestorNames(category: Category, items: Category[]): string[] {
  const ancestors: string[] = [];
  let parentId = category.parentId;
  while (parentId) {
    const parent = items.find((c) => c.id === parentId);
    if (!parent) break;
    ancestors.unshift(parent.name);
    parentId = parent.parentId;
  }
  return ancestors;
}

export function getCategoryDisplay(
  category: Category,
  items: Category[] = categoriesFlat,
): { label: string; parentPath?: string } {
  const ancestors = getCategoryAncestorNames(category, items);
  if (ancestors.length === 0) {
    return { label: category.name };
  }

  return {
    label: category.caption || category.name,
    parentPath: (ancestors.length > 2 ? ancestors.slice(1) : ancestors).join(" › "),
  };
}

export function getProductCategoryDisplay(
  categoryName: string,
  items: Category[] = categoriesFlat,
): { label: string; parentPath?: string } {
  const category = items.find((c) => c.name === categoryName);
  if (!category) return { label: categoryName };
  return getCategoryDisplay(category, items);
}

export function getTopMenuCategories(categories: Category[]): Category[] {
  return categories
    .filter((c) => c.active && c.showInTopMenu && !c.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function sameParent(a: Category, b: Category): boolean {
  return (a.parentId ?? null) === (b.parentId ?? null);
}

/** Reorder siblings after drag — returns ordered ids or null if invalid */
export function reorderSiblingIds(
  items: Category[],
  draggedId: string,
  overId: string,
): string[] | null {
  const dragged = items.find((c) => c.id === draggedId);
  const over = items.find((c) => c.id === overId);
  if (!dragged || !over || !sameParent(dragged, over)) return null;

  const parentId = dragged.parentId ?? null;
  const siblings = items
    .filter((c) => (c.parentId ?? null) === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const fromIdx = siblings.findIndex((c) => c.id === draggedId);
  const toIdx = siblings.findIndex((c) => c.id === overId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return null;

  const next = [...siblings];
  const [item] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, item);
  return next.map((c) => c.id);
}
