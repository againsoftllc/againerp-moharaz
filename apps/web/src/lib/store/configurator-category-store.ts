import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ConfiguratorCategory, ConfiguratorStatus } from "@/lib/configurator/types";
import { slugifyConfigurator } from "@/lib/configurator/types";
import { logConfiguratorActivity } from "@/lib/configurator/audit";
import { configuratorCategoriesSeed } from "@/lib/mock-data/configurator-admin";

type State = {
  categories: ConfiguratorCategory[];
  getById: (id: string) => ConfiguratorCategory | undefined;
  listByProfile: (profileId: string) => ConfiguratorCategory[];
  upsert: (data: Partial<ConfiguratorCategory> & { name: string; profileId: string }) => string;
  deleteMany: (ids: string[]) => void;
  bulkSetStatus: (ids: string[], status: ConfiguratorStatus) => void;
  reorder: (profileId: string, orderedIds: string[]) => void;
};

export const useConfiguratorCategoryStore = create<State>()(
  persist(
    (set, get) => ({
      categories: configuratorCategoriesSeed,

      getById: (id) => get().categories.find((c) => c.id === id),

      listByProfile: (profileId) =>
        get()
          .categories.filter((c) => c.profileId === profileId)
          .sort((a, b) => a.sortOrder - b.sortOrder),

      upsert: (data) => {
        const id = data.id ?? `cc_${Date.now().toString(36)}`;
        const existing = get().categories.find((c) => c.id === id);
        const category: ConfiguratorCategory = {
          id,
          profileId: data.profileId,
          profileName: data.profileName ?? existing?.profileName ?? "",
          name: data.name,
          slug: data.slug ?? existing?.slug ?? slugifyConfigurator(data.name),
          description: data.description ?? existing?.description,
          sortOrder: data.sortOrder ?? existing?.sortOrder ?? get().categories.length + 1,
          isRequired: data.isRequired ?? existing?.isRequired ?? false,
          selectionMode: data.selectionMode ?? existing?.selectionMode ?? "single",
          productCount: data.productCount ?? existing?.productCount ?? 0,
          status: data.status ?? existing?.status ?? "draft",
          updatedAt: new Date().toISOString().slice(0, 10),
        };

        set((state) => ({
          categories: existing
            ? state.categories.map((c) => (c.id === id ? category : c))
            : [category, ...state.categories],
        }));

        logConfiguratorActivity(
          "configurator_category",
          id,
          existing ? "update" : "create",
          existing ? `Category "${category.name}" updated` : `Category "${category.name}" created`,
        );
        return id;
      },

      deleteMany: (ids) => {
        set((state) => ({ categories: state.categories.filter((c) => !ids.includes(c.id)) }));
        ids.forEach((id) =>
          logConfiguratorActivity("configurator_category", id, "delete", "Category deleted"),
        );
      },

      bulkSetStatus: (ids, status) => {
        set((state) => ({
          categories: state.categories.map((c) =>
            ids.includes(c.id) ? { ...c, status, updatedAt: new Date().toISOString().slice(0, 10) } : c,
          ),
        }));
        ids.forEach((id) =>
          logConfiguratorActivity("configurator_category", id, "status_change", `Status → ${status}`),
        );
      },

      reorder: (profileId, orderedIds) => {
        set((state) => ({
          categories: state.categories.map((c) => {
            if (c.profileId !== profileId) return c;
            const idx = orderedIds.indexOf(c.id);
            return idx >= 0 ? { ...c, sortOrder: idx + 1 } : c;
          }),
        }));
      },
    }),
    { name: "againerp-configurator-categories", version: 1 },
  ),
);
