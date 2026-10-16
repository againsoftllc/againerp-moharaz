import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  collectionsSeed,
  ensureCollectionSortOrder,
  type ProductCollection,
} from "@/lib/mock-data/collections";

type CollectionState = {
  collections: ProductCollection[];
  patchCollection: (id: string, patch: Partial<ProductCollection>) => void;
  upsertCollection: (data: Partial<ProductCollection> & { id?: string }) => void;
  reorderCollections: (orderedIds: string[]) => void;
  deleteCollections: (ids: string[]) => void;
  getDisplayOrder: () => ProductCollection[];
};

export const useCollectionStore = create<CollectionState>()(
  persist(
    (set, get) => ({
      collections: collectionsSeed,

      patchCollection: (id, patch) => {
        set((state) => ({
          collections: state.collections.map((c) =>
            c.id === id
              ? { ...c, ...patch, updatedAt: new Date().toISOString().slice(0, 10) }
              : c,
          ),
        }));
      },

      upsertCollection: (data) => {
        set((state) => {
          if (data.id) {
            return {
              collections: state.collections.map((c) =>
                c.id === data.id
                  ? { ...c, ...data, updatedAt: new Date().toISOString().slice(0, 10) }
                  : c,
              ),
            };
          }
          const nextOrder = state.collections.length
            ? Math.max(...state.collections.map((c) => c.sortOrder)) + 1
            : 0;
          const id = `col_${Date.now()}`;
          const created: ProductCollection = {
            id,
            name: data.name ?? "New Collection",
            slug: data.slug ?? "new-collection",
            type: data.type ?? "custom",
            status: data.status ?? "draft",
            sortOrder: nextOrder,
            productCount: 0,
            ruleSummary: data.ruleSummary ?? "Manual product pick list",
            heroImageUrl: data.heroImageUrl,
            description: data.description,
            metaTitle: data.metaTitle,
            metaDescription: data.metaDescription,
            scheduleStart: data.scheduleStart,
            scheduleEnd: data.scheduleEnd,
            updatedAt: new Date().toISOString().slice(0, 10),
          };
          return { collections: [...state.collections, created] };
        });
      },

      reorderCollections: (orderedIds) => {
        set((state) => {
          const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
          return {
            collections: state.collections.map((c) =>
              orderMap.has(c.id) ? { ...c, sortOrder: orderMap.get(c.id)! } : c,
            ),
          };
        });
      },

      deleteCollections: (ids) => {
        const toDelete = new Set(ids);
        set((state) => ({
          collections: ensureCollectionSortOrder(
            state.collections.filter((c) => !toDelete.has(c.id) && !c.isSystem),
          ),
        }));
      },

      getDisplayOrder: () => {
        const { collections } = get();
        return [...collections].sort((a, b) => a.sortOrder - b.sortOrder);
      },
    }),
    { name: "againerp-collections" },
  ),
);
