import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ConfiguratorProfile, ConfiguratorStatus } from "@/lib/configurator/types";
import { slugifyConfigurator } from "@/lib/configurator/types";
import { logConfiguratorActivity } from "@/lib/configurator/audit";
import { configuratorProfilesSeed } from "@/lib/mock-data/configurator-admin";

type State = {
  profiles: ConfiguratorProfile[];
  getById: (id: string) => ConfiguratorProfile | undefined;
  upsert: (data: Partial<ConfiguratorProfile> & { name: string }) => string;
  deleteMany: (ids: string[]) => void;
  bulkSetStatus: (ids: string[], status: ConfiguratorStatus) => void;
  duplicate: (id: string) => string | null;
};

export const useConfiguratorProfileStore = create<State>()(
  persist(
    (set, get) => ({
      profiles: configuratorProfilesSeed,

      getById: (id) => get().profiles.find((p) => p.id === id),

      upsert: (data) => {
        const id = data.id ?? `cfg_${Date.now().toString(36)}`;
        const existing = get().profiles.find((p) => p.id === id);
        const profile: ConfiguratorProfile = {
          id,
          name: data.name,
          slug: data.slug ?? existing?.slug ?? slugifyConfigurator(data.name),
          profileType: data.profileType ?? existing?.profileType ?? "custom",
          description: data.description ?? existing?.description,
          isDefault: data.isDefault ?? existing?.isDefault ?? false,
          status: data.status ?? existing?.status ?? "draft",
          categoryCount: data.categoryCount ?? existing?.categoryCount ?? 0,
          ruleCount: data.ruleCount ?? existing?.ruleCount ?? 0,
          templateCount: data.templateCount ?? existing?.templateCount ?? 0,
          buildCount: data.buildCount ?? existing?.buildCount ?? 0,
          updatedAt: new Date().toISOString().slice(0, 10),
          createdAt: existing?.createdAt ?? new Date().toISOString().slice(0, 10),
        };

        set((state) => ({
          profiles: existing
            ? state.profiles.map((p) => (p.id === id ? profile : p))
            : [profile, ...state.profiles],
        }));

        logConfiguratorActivity(
          "configurator_profile",
          id,
          existing ? "update" : "create",
          existing ? `Profile "${profile.name}" updated` : `Profile "${profile.name}" created`,
        );
        return id;
      },

      deleteMany: (ids) => {
        set((state) => ({ profiles: state.profiles.filter((p) => !ids.includes(p.id)) }));
        ids.forEach((id) =>
          logConfiguratorActivity("configurator_profile", id, "delete", "Profile deleted"),
        );
      },

      bulkSetStatus: (ids, status) => {
        set((state) => ({
          profiles: state.profiles.map((p) =>
            ids.includes(p.id) ? { ...p, status, updatedAt: new Date().toISOString().slice(0, 10) } : p,
          ),
        }));
        ids.forEach((id) =>
          logConfiguratorActivity("configurator_profile", id, "status_change", `Status → ${status}`, {
            fieldChanges: [{ field: "Status", oldValue: "—", newValue: status }],
          }),
        );
      },

      duplicate: (id) => {
        const source = get().profiles.find((p) => p.id === id);
        if (!source) return null;
        const newId = `cfg_${Date.now().toString(36)}`;
        const copy: ConfiguratorProfile = {
          ...source,
          id: newId,
          name: `${source.name} (copy)`,
          slug: `${source.slug}-copy`,
          isDefault: false,
          status: "draft",
          updatedAt: new Date().toISOString().slice(0, 10),
        };
        set((state) => ({ profiles: [copy, ...state.profiles] }));
        logConfiguratorActivity("configurator_profile", newId, "create", `Duplicated from "${source.name}"`);
        return newId;
      },
    }),
    { name: "againerp-configurator-profiles", version: 1 },
  ),
);
