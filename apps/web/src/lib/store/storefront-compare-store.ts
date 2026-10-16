"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const MAX_COMPARE_ITEMS = 4;

export type CompareItem = {
  id: string;
  productId: string;
  slug: string;
  name: string;
  image: string;
  price: number;
  compareAtPrice?: number;
  brand: string;
  category: string;
  stock: number;
  rating: number;
  reviewCount: number;
};

export type CompareProductInput = Omit<CompareItem, "id"> & { id?: string };

type CompareState = {
  items: CompareItem[];
  count: number;
  isInCompare: (productId: string) => boolean;
  canAdd: () => boolean;
  toggleItem: (item: CompareProductInput) => boolean;
  addItem: (item: CompareProductInput) => boolean;
  removeItem: (productId: string) => void;
  clearCompare: () => void;
};

export const useStorefrontCompare = create<CompareState>()(
  persist(
    (set, get) => ({
      items: [],
      count: 0,
      isInCompare: (productId) => get().items.some((i) => i.productId === productId),
      canAdd: () => get().items.length < MAX_COMPARE_ITEMS,
      toggleItem: (item) => {
        const exists = get().isInCompare(item.productId);
        if (exists) {
          get().removeItem(item.productId);
          return false;
        }
        return get().addItem(item);
      },
      addItem: (item) => {
        if (get().isInCompare(item.productId)) return true;
        if (get().items.length >= MAX_COMPARE_ITEMS) return false;
        set((s) => {
          const next = [
            ...s.items,
            { ...item, id: item.id ?? `cmp_${item.productId}` },
          ];
          return { items: next, count: next.length };
        });
        return true;
      },
      removeItem: (productId) =>
        set((s) => {
          const items = s.items.filter((i) => i.productId !== productId);
          return { items, count: items.length };
        }),
      clearCompare: () => set({ items: [], count: 0 }),
    }),
    {
      name: "storefront-compare",
      partialize: (s) => ({ items: s.items, count: s.count }),
    },
  ),
);
