import type { BlogCategory } from "@/lib/blog/blog-category";

export type BlogCategoryNode = BlogCategory & { children: BlogCategoryNode[] };

export type FlatBlogCategory = { id: string; name: string; depth: number };

export function buildBlogCategoryTree(categories: BlogCategory[]): BlogCategoryNode[] {
  const byId = new Map<string, BlogCategoryNode>();
  categories.forEach((c) => byId.set(c.id, { ...c, children: [] }));
  const roots: BlogCategoryNode[] = [];
  byId.forEach((node) => {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  const sortRec = (nodes: BlogCategoryNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export function flattenBlogCategoryTree(
  nodes: BlogCategoryNode[],
  depth = 0,
): FlatBlogCategory[] {
  const out: FlatBlogCategory[] = [];
  for (const node of nodes) {
    out.push({ id: node.id, name: node.name, depth });
    out.push(...flattenBlogCategoryTree(node.children, depth + 1));
  }
  return out;
}

/** Exclude a category and all its descendants from parent picker options. */
export function filterCategoriesForParentPicker(
  categories: BlogCategory[],
  excludeId?: string | null,
): BlogCategory[] {
  if (!excludeId) return categories;
  const exclude = new Set<string>([excludeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parentId && exclude.has(category.parentId) && !exclude.has(category.id)) {
        exclude.add(category.id);
        changed = true;
      }
    }
  }
  return categories.filter((category) => !exclude.has(category.id));
}
