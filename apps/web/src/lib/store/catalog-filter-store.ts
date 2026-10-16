import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  catalogFiltersSeed,
  ensureFilterSortOrder,
  type CatalogFacetFilter,
} from "@/lib/mock-data/catalog-filters";

type CatalogFilterState = {
  filters: CatalogFacetFilter[];
  patchFilter: (id: string, patch: Partial<CatalogFacetFilter>) => void;
  upsertFilter: (data: Partial<CatalogFacetFilter> & { id?: string }) => void;
  reorderFilters: (orderedIds: string[]) => void;
  deleteFilters: (ids: string[]) => void;
  getDisplayOrder: () => CatalogFacetFilter[];
};

export const useCatalogFilterStore = create<CatalogFilterState>()(
  persist(
    (set, get) => ({
      filters: catalogFiltersSeed,

      patchFilter: (id, patch) => {
        set((state) => ({
          filters: state.filters.map((f) =>
            f.id === id
              ? { ...f, ...patch, updatedAt: new Date().toISOString().slice(0, 10) }
              : f,
          ),
        }));
      },

      upsertFilter: (data) => {
        set((state) => {
          if (data.id) {
            return {
              filters: state.filters.map((f) =>
                f.id === data.id
                  ? { ...f, ...data, updatedAt: new Date().toISOString().slice(0, 10) }
                  : f,
              ),
            };
          }
          const nextOrder = state.filters.length
            ? Math.max(...state.filters.map((f) => f.sortOrder)) + 1
            : 0;
          const id = `flt_${Date.now()}`;
          const created: CatalogFacetFilter = {
            id,
            name: data.name ?? "New Filter",
            paramKey: data.paramKey ?? "new_filter",
            displayType: data.displayType ?? "multi_select",
            source: data.source ?? "attribute",
            attributeId: data.attributeId,
            attributeName: data.attributeName ?? "—",
            sortOrder: nextOrder,
            isActive: data.isActive ?? true,
            storefrontVisible: data.storefrontVisible ?? true,
            categoryScope: data.categoryScope ?? "All categories",
            valueCount: 0,
            urlExample: data.urlExample ?? `?${data.paramKey ?? "new_filter"}=`,
            updatedAt: new Date().toISOString().slice(0, 10),
          };
          return { filters: [...state.filters, created] };
        });
      },

      reorderFilters: (orderedIds) => {
        set((state) => {
          const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
          return {
            filters: state.filters.map((f) =>
              orderMap.has(f.id) ? { ...f, sortOrder: orderMap.get(f.id)! } : f,
            ),
          };
        });
      },

      deleteFilters: (ids) => {
        const toDelete = new Set(ids);
        set((state) => ({
          filters: ensureFilterSortOrder(
            state.filters.filter((f) => !toDelete.has(f.id) && !f.isSystem),
          ),
        }));
      },

      getDisplayOrder: () => {
        const { filters } = get();
        return [...filters].sort((a, b) => a.sortOrder - b.sortOrder);
      },
    }),
    { name: "againerp-catalog-filters" },
  ),
);
