import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  specialOffersSeed,
  type SpecialOffer,
} from "@/lib/mock-data/special-offers";

type SpecialOfferState = {
  offers: SpecialOffer[];
  upsertOffer: (data: Partial<SpecialOffer> & { id?: string }) => string;
  deleteOffer: (id: string) => void;
  duplicateOffer: (id: string) => string | null;
};

function nextId() {
  return `so_${Date.now().toString(36)}`;
}

export const useSpecialOfferStore = create<SpecialOfferState>()(
  persist(
    (set, get) => ({
      offers: specialOffersSeed,

      upsertOffer: (data) => {
        const id = data.id ?? nextId();
        const existing = get().offers.find((o) => o.id === id);
        const next: SpecialOffer = {
          id,
          name: data.name ?? existing?.name ?? "Untitled offer",
          code: data.code ?? existing?.code ?? "OFFER",
          slug: data.slug ?? existing?.slug ?? "untitled-offer",
          offerType: data.offerType ?? existing?.offerType ?? "bogo",
          status: data.status ?? existing?.status ?? "draft",
          startsAt: data.startsAt ?? existing?.startsAt ?? new Date().toISOString(),
          endsAt: data.endsAt ?? existing?.endsAt ?? new Date().toISOString(),
          description: data.description ?? existing?.description,
          showOnPdp: data.showOnPdp ?? existing?.showOnPdp ?? true,
          showOnCart: data.showOnCart ?? existing?.showOnCart ?? true,
          showBadge: data.showBadge ?? existing?.showBadge ?? true,
          stackable: data.stackable ?? existing?.stackable ?? false,
          priority: data.priority ?? existing?.priority ?? 5,
          bogo: data.bogo ?? existing?.bogo,
          bundle: data.bundle ?? existing?.bundle,
          gift: data.gift ?? existing?.gift,
          tiered: data.tiered ?? existing?.tiered,
          ordersCount: data.ordersCount ?? existing?.ordersCount ?? 0,
          revenue: data.revenue ?? existing?.revenue ?? 0,
          updatedAt: new Date().toISOString().slice(0, 10),
        };

        set((state) => ({
          offers: existing
            ? state.offers.map((o) => (o.id === id ? next : o))
            : [next, ...state.offers],
        }));

        return id;
      },

      deleteOffer: (id) => {
        set((state) => ({ offers: state.offers.filter((o) => o.id !== id) }));
      },

      duplicateOffer: (id) => {
        const source = get().offers.find((o) => o.id === id);
        if (!source) return null;
        const newId = nextId();
        const copy: SpecialOffer = {
          ...source,
          id: newId,
          name: `${source.name} (copy)`,
          code: `${source.code}-COPY`,
          slug: `${source.slug}-copy`,
          status: "draft",
          ordersCount: 0,
          revenue: 0,
          updatedAt: new Date().toISOString().slice(0, 10),
        };
        set((state) => ({ offers: [copy, ...state.offers] }));
        return newId;
      },
    }),
    { name: "againerp-special-offers", version: 1 },
  ),
);
