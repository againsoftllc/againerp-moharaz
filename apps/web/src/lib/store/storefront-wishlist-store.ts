"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WishlistItem = {
  id: string;
  productId: string;
  slug: string;
  name: string;
  image: string;
  price: number;
  compareAtPrice?: number;
  brand: string;
};

export type WishlistProductInput = Omit<WishlistItem, "id"> & { id?: string };

type WishlistState = {
  items: WishlistItem[];
  count: number;
  isInWishlist: (productId: string) => boolean;
  toggleItem: (item: WishlistProductInput) => boolean;
  addItem: (item: WishlistProductInput) => void;
  removeItem: (productId: string) => void;
  clearWishlist: () => void;
};

export const useStorefrontWishlist = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      count: 0,
      isInWishlist: (productId) => get().items.some((i) => i.productId === productId),
      toggleItem: (item) => {
        const exists = get().isInWishlist(item.productId);
        if (exists) {
          get().removeItem(item.productId);
          return false;
        }
        get().addItem(item);
        return true;
      },
      addItem: (item) =>
        set((s) => {
          if (s.items.some((i) => i.productId === item.productId)) return s;
          const next = [
            ...s.items,
            { ...item, id: item.id ?? `wish_${item.productId}` },
          ];
          return { items: next, count: next.length };
        }),
      removeItem: (productId) =>
        set((s) => {
          const items = s.items.filter((i) => i.productId !== productId);
          return { items, count: items.length };
        }),
      clearWishlist: () => set({ items: [], count: 0 }),
    }),
    {
      name: "storefront-wishlist",
      partialize: (s) => ({ items: s.items, count: s.count }),
    },
  ),
);
