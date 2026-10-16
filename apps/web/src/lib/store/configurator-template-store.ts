import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ConfiguratorTemplate, ConfiguratorStatus } from "@/lib/configurator/types";
import { slugifyConfigurator } from "@/lib/configurator/types";
import { logConfiguratorActivity } from "@/lib/configurator/audit";
import { configuratorTemplatesSeed } from "@/lib/mock-data/configurator-admin";

type State = {
  templates: ConfiguratorTemplate[];
  getById: (id: string) => ConfiguratorTemplate | undefined;
  upsert: (data: Partial<ConfiguratorTemplate> & { name: string; profileId: string }) => string;
  deleteMany: (ids: string[]) => void;
  bulkSetStatus: (ids: string[], status: ConfiguratorStatus) => void;
  duplicate: (id: string) => string | null;
};

export const useConfiguratorTemplateStore = create<State>()(
  persist(
    (set, get) => ({
      templates: configuratorTemplatesSeed,

      getById: (id) => get().templates.find((t) => t.id === id),

      upsert: (data) => {
        const id = data.id ?? `ct_${Date.now().toString(36)}`;
        const existing = get().templates.find((t) => t.id === id);
        const template: ConfiguratorTemplate = {
          id,
          profileId: data.profileId,
          profileName: data.profileName ?? existing?.profileName ?? "",
          name: data.name,
          slug: data.slug ?? existing?.slug ?? slugifyConfigurator(data.name),
          description: data.description ?? existing?.description,
          components: data.components ?? existing?.components ?? [],
          isFeatured: data.isFeatured ?? existing?.isFeatured ?? false,
          status: data.status ?? existing?.status ?? "draft",
          useCount: data.useCount ?? existing?.useCount ?? 0,
          updatedAt: new Date().toISOString().slice(0, 10),
        };

        set((state) => ({
          templates: existing
            ? state.templates.map((t) => (t.id === id ? template : t))
            : [template, ...state.templates],
        }));

        logConfiguratorActivity(
          "configurator_template",
          id,
          existing ? "update" : "create",
          existing ? `Template "${template.name}" updated` : `Template "${template.name}" created`,
        );
        return id;
      },

      deleteMany: (ids) => {
        set((state) => ({ templates: state.templates.filter((t) => !ids.includes(t.id)) }));
        ids.forEach((id) =>
          logConfiguratorActivity("configurator_template", id, "delete", "Template deleted"),
        );
      },

      bulkSetStatus: (ids, status) => {
        set((state) => ({
          templates: state.templates.map((t) =>
            ids.includes(t.id) ? { ...t, status, updatedAt: new Date().toISOString().slice(0, 10) } : t,
          ),
        }));
        ids.forEach((id) =>
          logConfiguratorActivity("configurator_template", id, "status_change", `Status → ${status}`),
        );
      },

      duplicate: (id) => {
        const source = get().templates.find((t) => t.id === id);
        if (!source) return null;
        const newId = `ct_${Date.now().toString(36)}`;
        const copy: ConfiguratorTemplate = {
          ...source,
          id: newId,
          name: `${source.name} (copy)`,
          slug: `${source.slug}-copy`,
          status: "draft",
          useCount: 0,
          updatedAt: new Date().toISOString().slice(0, 10),
        };
        set((state) => ({ templates: [copy, ...state.templates] }));
        logConfiguratorActivity("configurator_template", newId, "create", `Duplicated from "${source.name}"`);
        return newId;
      },
    }),
    { name: "againerp-configurator-templates", version: 1 },
  ),
);
