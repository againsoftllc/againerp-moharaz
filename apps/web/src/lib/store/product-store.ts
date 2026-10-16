import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type Product,
  type QuickAddProductInput,
  buildProductFromQuickAdd,
  getAdminCatalogProducts,
} from "@/lib/mock-data/products";

type ProductStore = {
  extraProducts: Product[];
  getAllProducts: () => Product[];
  addProduct: (input: QuickAddProductInput) => Product;
  getById: (id: string) => Product | undefined;
};

export const useProductStore = create<ProductStore>()(
  persist(
    (set, get) => ({
      extraProducts: [],

      getAllProducts: () => {
        const base = getAdminCatalogProducts();
        const extras = get().extraProducts.filter(
          (e) => !base.some((b) => b.id === e.id || b.slug === e.slug),
        );
        return [...extras, ...base];
      },

      addProduct: (input) => {
        const product = buildProductFromQuickAdd(input);
        set((s) => ({ extraProducts: [product, ...s.extraProducts] }));
        return product;
      },

      getById: (id) => get().getAllProducts().find((p) => p.id === id),
    }),
    { name: "againerp-products-extra" },
  ),
);
