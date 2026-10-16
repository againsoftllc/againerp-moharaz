import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  brandsSeed,
  ensureBrandSortOrder,
  type Brand,
} from "@/lib/mock-data/brands";

type BrandState = {
  brands: Brand[];
  setBrands: (brands: Brand[]) => void;
  patchBrand: (id: string, patch: Partial<Brand>) => void;
  upsertBrand: (data: Partial<Brand> & { id?: string }) => void;
  reorderBrands: (orderedIds: string[]) => void;
  deleteBrands: (ids: string[]) => void;
  getDisplayOrder: () => Brand[];
};

export const useBrandStore = create<BrandState>()(
  persist(
    (set, get) => ({
      brands: brandsSeed,

      setBrands: (brands) => set({ brands: ensureBrandSortOrder(brands) }),

      patchBrand: (id, patch) => {
        set((state) => ({
          brands: state.brands.map((b) =>
            b.id === id
              ? { ...b, ...patch, updatedAt: new Date().toISOString().slice(0, 10) }
              : b,
          ),
        }));
      },

      upsertBrand: (data) => {
        set((state) => {
          if (data.id) {
            return {
              brands: state.brands.map((b) =>
                b.id === data.id
                  ? { ...b, ...data, updatedAt: new Date().toISOString().slice(0, 10) }
                  : b,
              ),
            };
          }
          const nextOrder = state.brands.length
            ? Math.max(...state.brands.map((b) => b.sortOrder)) + 1
            : 0;
          const id = `brand_${Date.now()}`;
          const created: Brand = {
            id,
            name: data.name ?? "New Brand",
            slug: data.slug ?? "new-brand",
            sortOrder: nextOrder,
            productCount: 0,
            active: data.active ?? true,
            updatedAt: new Date().toISOString().slice(0, 10),
            description: data.description,
            websiteUrl: data.websiteUrl,
            metaTitle: data.metaTitle,
            metaDescription: data.metaDescription,
            metaKeywords: data.metaKeywords,
            logoUrl: data.logoUrl,
            bannerUrl: data.bannerUrl,
            logoMediaId: data.logoMediaId,
            bannerMediaId: data.bannerMediaId,
          };
          return { brands: [...state.brands, created] };
        });
      },

      reorderBrands: (orderedIds) => {
        set((state) => {
          const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
          return {
            brands: state.brands.map((b) =>
              orderMap.has(b.id) ? { ...b, sortOrder: orderMap.get(b.id)! } : b,
            ),
          };
        });
      },

      deleteBrands: (ids) => {
        const toDelete = new Set(ids);
        set((state) => ({
          brands: ensureBrandSortOrder(state.brands.filter((b) => !toDelete.has(b.id))),
        }));
      },

      getDisplayOrder: () => {
        const { brands } = get();
        return [...brands].sort((a, b) => a.sortOrder - b.sortOrder);
      },
    }),
    {
      name: "againerp-brands",
      version: 1,
      migrate: (persisted) => {
        const state = persisted as BrandState | undefined;
        if (state?.brands) {
          state.brands = ensureBrandSortOrder(state.brands);
        }
        return state as BrandState;
      },
    },
  ),
);
