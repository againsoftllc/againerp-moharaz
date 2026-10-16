import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  flashSalesSeed,
  type FlashSale,
  type FlashSaleItem,
} from "@/lib/mock-data/flash-sales";

type FlashSaleState = {
  sales: FlashSale[];
  upsertSale: (data: Partial<FlashSale> & { id?: string }) => string;
  deleteSale: (id: string) => void;
  duplicateSale: (id: string) => string | null;
};

function nextId() {
  return `fs_${Date.now().toString(36)}`;
}

export const useFlashSaleStore = create<FlashSaleState>()(
  persist(
    (set, get) => ({
      sales: flashSalesSeed,

      upsertSale: (data) => {
        const id = data.id ?? nextId();
        const existing = get().sales.find((s) => s.id === id);
        const next: FlashSale = {
          id,
          name: data.name ?? existing?.name ?? "Untitled flash sale",
          slug: data.slug ?? existing?.slug ?? "untitled-flash-sale",
          status: data.status ?? existing?.status ?? "draft",
          startsAt: data.startsAt ?? existing?.startsAt ?? new Date().toISOString(),
          endsAt: data.endsAt ?? existing?.endsAt ?? new Date().toISOString(),
          description: data.description ?? existing?.description,
          showOnHomepage: data.showOnHomepage ?? existing?.showOnHomepage ?? true,
          showOnDealsPage: data.showOnDealsPage ?? existing?.showOnDealsPage ?? true,
          items: data.items ?? existing?.items ?? [],
          ordersCount: data.ordersCount ?? existing?.ordersCount ?? 0,
          revenue: data.revenue ?? existing?.revenue ?? 0,
          updatedAt: new Date().toISOString().slice(0, 10),
        };

        set((state) => ({
          sales: existing
            ? state.sales.map((s) => (s.id === id ? next : s))
            : [next, ...state.sales],
        }));

        return id;
      },

      deleteSale: (id) => {
        set((state) => ({ sales: state.sales.filter((s) => s.id !== id) }));
      },

      duplicateSale: (id) => {
        const source = get().sales.find((s) => s.id === id);
        if (!source) return null;
        const newId = nextId();
        const copy: FlashSale = {
          ...source,
          id: newId,
          name: `${source.name} (copy)`,
          slug: `${source.slug}-copy`,
          status: "draft",
          ordersCount: 0,
          revenue: 0,
          items: source.items.map((item) => ({ ...item })) as FlashSaleItem[],
          updatedAt: new Date().toISOString().slice(0, 10),
        };
        set((state) => ({ sales: [copy, ...state.sales] }));
        return newId;
      },
    }),
    { name: "againerp-flash-sales", version: 1 },
  ),
);
