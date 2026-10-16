import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  promotionsSeed,
  type Promotion,
} from "@/lib/mock-data/promotions";

type PromotionState = {
  promotions: Promotion[];
  upsertPromotion: (data: Partial<Promotion> & { id?: string }) => string;
  deletePromotion: (id: string) => void;
  duplicatePromotion: (id: string) => string | null;
};

function nextId() {
  return `promo_${Date.now().toString(36)}`;
}

export const usePromotionStore = create<PromotionState>()(
  persist(
    (set, get) => ({
      promotions: promotionsSeed,

      upsertPromotion: (data) => {
        const id = data.id ?? nextId();
        const existing = get().promotions.find((p) => p.id === id);
        const next: Promotion = {
          id,
          name: data.name ?? existing?.name ?? "Untitled promotion",
          slug: data.slug ?? existing?.slug ?? "untitled-promotion",
          status: data.status ?? existing?.status ?? "draft",
          startsAt: data.startsAt ?? existing?.startsAt ?? new Date().toISOString(),
          endsAt: data.endsAt ?? existing?.endsAt ?? new Date().toISOString(),
          description: data.description ?? existing?.description,
          rules: data.rules ?? existing?.rules ?? [],
          actions: data.actions ?? existing?.actions ?? [],
          priority: data.priority ?? existing?.priority ?? 10,
          stackingMode: data.stackingMode ?? existing?.stackingMode ?? "stackable",
          autoApply: data.autoApply ?? existing?.autoApply ?? true,
          showOnCart: data.showOnCart ?? existing?.showOnCart ?? true,
          showAnnouncement: data.showAnnouncement ?? existing?.showAnnouncement ?? false,
          ordersCount: data.ordersCount ?? existing?.ordersCount ?? 0,
          revenue: data.revenue ?? existing?.revenue ?? 0,
          updatedAt: new Date().toISOString().slice(0, 10),
        };

        set((state) => ({
          promotions: existing
            ? state.promotions.map((p) => (p.id === id ? next : p))
            : [next, ...state.promotions],
        }));

        return id;
      },

      deletePromotion: (id) => {
        set((state) => ({ promotions: state.promotions.filter((p) => p.id !== id) }));
      },

      duplicatePromotion: (id) => {
        const source = get().promotions.find((p) => p.id === id);
        if (!source) return null;
        const newId = nextId();
        const copy: Promotion = {
          ...source,
          id: newId,
          name: `${source.name} (copy)`,
          slug: `${source.slug}-copy`,
          status: "draft",
          ordersCount: 0,
          revenue: 0,
          rules: source.rules.map((r) => ({ ...r })),
          actions: source.actions.map((a) => ({ ...a })),
          updatedAt: new Date().toISOString().slice(0, 10),
        };
        set((state) => ({ promotions: [copy, ...state.promotions] }));
        return newId;
      },
    }),
    { name: "againerp-promotions", version: 1 },
  ),
);
