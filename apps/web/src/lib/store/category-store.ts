import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  categoriesFlat as seedCategories,
  ensureSortOrder,
  type Category,
} from "@/lib/mock-data/categories";

function assignSortOrder(items: Category[], parentId: string | null, orderedIds: string[]) {
  const orderMap = new Map<string, number>();
  orderedIds.forEach((id, index) => orderMap.set(id, index));
  return items.map((c) =>
    (c.parentId ?? null) === (parentId ?? null) && orderMap.has(c.id)
      ? { ...c, sortOrder: orderMap.get(c.id)! }
      : { ...c },
  );
}

type CategoryState = {
  categories: Category[];
  setCategories: (categories: Category[]) => void;
  patchCategory: (id: string, patch: Partial<Category>) => void;
  upsertCategory: (data: Partial<Category> & { id?: string }) => void;
  reorderSiblings: (parentId: string | null, orderedIds: string[]) => void;
  deleteCategories: (ids: string[]) => void;
  getTopMenuItems: () => Category[];
  getDisplayOrder: () => Category[];
};

export const useCategoryStore = create<CategoryState>()(
  persist(
    (set, get) => ({
      categories: ensureSortOrder(seedCategories),

      setCategories: (categories) => set({ categories: ensureSortOrder(categories) }),

      patchCategory: (id, patch) => {
        set((state) => ({
          categories: state.categories.map((c) =>
            c.id === id
              ? { ...c, ...patch, updatedAt: new Date().toISOString().slice(0, 10) }
              : c,
          ),
        }));
      },

      upsertCategory: (data) => {
        set((state) => {
          if (data.id) {
            return {
              categories: state.categories.map((c) =>
                c.id === data.id
                  ? { ...c, ...data, updatedAt: new Date().toISOString().slice(0, 10) }
                  : c,
              ),
            };
          }
          const parentId = data.parentId ?? null;
          const siblings = state.categories.filter(
            (c) => (c.parentId ?? null) === parentId,
          );
          const nextOrder = siblings.length
            ? Math.max(...siblings.map((c) => c.sortOrder)) + 1
            : 0;
          const id = `cat_${Date.now()}`;
          const created: Category = {
            id,
            name: data.name ?? "New Category",
            caption: data.caption ?? data.name ?? "New",
            slug: data.slug ?? "new-category",
            parentId,
            productCount: 0,
            active: data.active ?? true,
            showInTopMenu: data.showInTopMenu ?? false,
            sortOrder: nextOrder,
            updatedAt: new Date().toISOString().slice(0, 10),
            description: data.description,
            metaTitle: data.metaTitle,
            metaDescription: data.metaDescription,
            metaKeywords: data.metaKeywords,
            iconUrl: data.iconUrl,
            bannerUrl: data.bannerUrl,
            iconMediaId: data.iconMediaId,
            bannerMediaId: data.bannerMediaId,
          };
          return { categories: [...state.categories, created] };
        });
      },

      reorderSiblings: (parentId, orderedIds) => {
        set((state) => ({
          categories: assignSortOrder(state.categories, parentId, orderedIds),
        }));
      },

      deleteCategories: (ids) => {
        set((state) => {
          const toDelete = new Set<string>();
          const markTree = (id: string) => {
            toDelete.add(id);
            state.categories
              .filter((c) => c.parentId === id)
              .forEach((c) => markTree(c.id));
          };
          ids.forEach((id) => markTree(id));
          return {
            categories: state.categories.filter((c) => !toDelete.has(c.id)),
          };
        });
      },

      getTopMenuItems: () => {
        const { categories } = get();
        return categories
          .filter((c) => c.active && c.showInTopMenu && !c.parentId)
          .sort((a, b) => a.sortOrder - b.sortOrder);
      },

      getDisplayOrder: () => {
        const { categories } = get();
        const out: Category[] = [];
        const walk = (pid: string | null) => {
          categories
            .filter((c) => c.parentId === pid)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .forEach((c) => {
              out.push(c);
              walk(c.id);
            });
        };
        walk(null);
        return out;
      },
    }),
    { name: "againerp-categories", version: 1, migrate: (persisted) => {
      const state = persisted as CategoryState | undefined;
      if (state?.categories) {
        state.categories = ensureSortOrder(state.categories);
      }
      return state as CategoryState;
    } },
  ),
);
