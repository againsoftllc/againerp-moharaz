"use client";

import { create } from "zustand";
import {
  createCatalogBundle,
  deleteCatalogBundles,
  fetchCatalogBundles,
  updateCatalogBundle,
} from "@/lib/api/catalog-bundles";
import { recalcBundle, type ProductBundle } from "@/lib/mock-data/bundles";

type BundleState = {
  bundles: ProductBundle[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  loadBundles: () => Promise<void>;
  patchBundle: (id: string, patch: Partial<ProductBundle>) => Promise<void>;
  upsertBundle: (data: Partial<ProductBundle> & { id?: string }) => Promise<void>;
  deleteBundles: (ids: string[]) => Promise<void>;
};

export const useBundleStore = create<BundleState>((set, get) => ({
  bundles: [],
  loading: false,
  loaded: false,
  error: null,

  loadBundles: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const bundles = await fetchCatalogBundles();
      set({ bundles, loading: false, loaded: true });
    } catch (err) {
      set({
        loading: false,
        loaded: true,
        error: err instanceof Error ? err.message : "Failed to load bundles",
        bundles: [],
      });
    }
  },

  patchBundle: async (id, patch) => {
    const current = get().bundles.find((b) => b.id === id);
    if (!current) return;
    const optimistic = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString().slice(0, 10),
      ...(patch.components ||
      patch.pricingMode ||
      patch.discountPercent !== undefined ||
      patch.bundlePrice !== undefined
        ? recalcBundle({ ...current, ...patch, components: patch.components ?? current.components })
        : {}),
    };
    set((state) => ({
      bundles: state.bundles.map((b) => (b.id === id ? optimistic : b)),
    }));
    try {
      const saved = await updateCatalogBundle(id, patch);
      set((state) => ({
        bundles: state.bundles.map((b) => (b.id === id ? saved : b)),
      }));
    } catch (err) {
      set((state) => ({
        bundles: state.bundles.map((b) => (b.id === id ? current : b)),
        error: err instanceof Error ? err.message : "Failed to update bundle",
      }));
      throw err;
    }
  },

  upsertBundle: async (data) => {
    if (data.id) {
      await get().patchBundle(data.id, data);
      return;
    }
    const created = await createCatalogBundle({
      name: data.name ?? "New Bundle",
      slug: data.slug ?? `bundle-${Date.now()}`,
      sku: data.sku,
      status: data.status ?? "draft",
      pricingMode: data.pricingMode ?? "sum_discount",
      bundlePrice: data.bundlePrice ?? 0,
      discountPercent: data.discountPercent ?? 10,
      stock: data.stock ?? 0,
      thumbnail: data.thumbnail,
      category: data.category ?? "General",
      description: data.description,
      components: data.components ?? [],
    });
    set((state) => ({ bundles: [created, ...state.bundles] }));
  },

  deleteBundles: async (ids) => {
    const toDelete = new Set(ids);
    const previous = get().bundles;
    set({ bundles: previous.filter((b) => !toDelete.has(b.id)) });
    try {
      await deleteCatalogBundles(ids);
    } catch (err) {
      set({
        bundles: previous,
        error: err instanceof Error ? err.message : "Failed to delete bundles",
      });
      throw err;
    }
  },
}));
