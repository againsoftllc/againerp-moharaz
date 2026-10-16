import { create } from "zustand";
import { persist } from "zustand/middleware";
import { slugifyConfiguratorCode } from "@/lib/mock-data/configurator-attributes";
import {
  configuratorAttributeFieldsSeed,
  configuratorAttributeProfilesSeed,
  ensureFieldSortOrder,
  ensureProfileSortOrder,
  type ConfiguratorAttributeField,
  type ConfiguratorAttributeProfile,
  type ConfiguratorFieldOption,
} from "@/lib/mock-data/configurator-attributes";

function applyOrder<T extends { id: string; sortOrder: number }>(
  items: T[],
  orderedIds: string[],
): T[] {
  const map = new Map(orderedIds.map((id, i) => [id, i]));
  return items.map((item) =>
    map.has(item.id) ? { ...item, sortOrder: map.get(item.id)! } : item,
  );
}

type State = {
  profiles: ConfiguratorAttributeProfile[];
  fields: ConfiguratorAttributeField[];
  getProfileById: (id: string) => ConfiguratorAttributeProfile | undefined;
  getFieldsForProfile: (profileId: string) => ConfiguratorAttributeField[];
  upsertProfile: (
    data: Partial<ConfiguratorAttributeProfile> & {
      id?: string;
      name?: string;
      code?: string;
      categoryId?: string;
      categoryName?: string;
      categorySlug?: string;
    },
  ) => string;
  reorderProfiles: (orderedIds: string[]) => void;
  upsertField: (
    data: Partial<ConfiguratorAttributeField> & { profileId: string; id?: string },
  ) => string;
  deleteFields: (ids: string[]) => void;
  reorderFields: (profileId: string, orderedIds: string[]) => void;
};

export const useConfiguratorAttributeStore = create<State>()(
  persist(
    (set, get) => ({
      profiles: configuratorAttributeProfilesSeed,
      fields: configuratorAttributeFieldsSeed,

      getProfileById: (id) => get().profiles.find((p) => p.id === id),

      getFieldsForProfile: (profileId) =>
        ensureFieldSortOrder(get().fields.filter((f) => f.profileId === profileId)),

      upsertProfile: (data) => {
        const id = data.id ?? `cap_${Date.now().toString(36)}`;
        const existing = get().profiles.find((p) => p.id === id);
        const nextOrder = existing?.sortOrder ?? get().profiles.length;

        const profile: ConfiguratorAttributeProfile = {
          id,
          name: data.name ?? existing?.name ?? "New Component",
          code: data.code ?? existing?.code ?? slugifyConfiguratorCode(data.name ?? "new"),
          categoryId: data.categoryId ?? existing?.categoryId ?? "cc_new",
          categoryName: data.categoryName ?? existing?.categoryName ?? "Component",
          categorySlug: data.categorySlug ?? existing?.categorySlug ?? "component",
          description: data.description ?? existing?.description,
          sortOrder: nextOrder,
          active: data.active ?? existing?.active ?? true,
          productCount: existing?.productCount ?? 0,
          updatedAt: new Date().toISOString().slice(0, 10),
        };

        set((state) => ({
          profiles: ensureProfileSortOrder(
            existing
              ? state.profiles.map((p) => (p.id === id ? profile : p))
              : [...state.profiles, profile],
          ),
        }));
        return id;
      },

      reorderProfiles: (orderedIds) => {
        set((state) => ({
          profiles: ensureProfileSortOrder(applyOrder(state.profiles, orderedIds)),
        }));
      },

      upsertField: (data) => {
        const id = data.id ?? `caf_${Date.now().toString(36)}`;
        const existing = get().fields.find((f) => f.id === id);
        const profileFields = get().fields.filter((f) => f.profileId === data.profileId);
        const nextOrder = existing?.sortOrder ?? profileFields.length;

        const field: ConfiguratorAttributeField = {
          id,
          profileId: data.profileId,
          name: data.name ?? existing?.name ?? "New Field",
          code: data.code ?? existing?.code ?? slugifyConfiguratorCode(data.name ?? "field"),
          fieldType: data.fieldType ?? existing?.fieldType ?? "text",
          sortOrder: data.sortOrder ?? nextOrder,
          isRequired: data.isRequired ?? existing?.isRequired ?? false,
          isFilterable: data.isFilterable ?? existing?.isFilterable ?? true,
          isComparable: data.isComparable ?? existing?.isComparable ?? true,
          active: data.active ?? existing?.active ?? true,
          unit: data.unit ?? existing?.unit,
          helpText: data.helpText ?? existing?.helpText,
          validation: data.validation ?? existing?.validation,
          options: (data.options ?? existing?.options)?.map((o, i) => ({
            ...o,
            sortOrder: o.sortOrder ?? i,
          })) as ConfiguratorFieldOption[] | undefined,
        };

        set((state) => ({
          fields: ensureFieldSortOrder(
            existing
              ? state.fields.map((f) => (f.id === id ? field : f))
              : [...state.fields, field],
          ),
        }));
        return id;
      },

      deleteFields: (ids) => {
        const drop = new Set(ids);
        set((state) => ({
          fields: ensureFieldSortOrder(state.fields.filter((f) => !drop.has(f.id))),
        }));
      },

      reorderFields: (profileId, orderedIds) => {
        set((state) => {
          const profileFieldIds = new Set(
            state.fields.filter((f) => f.profileId === profileId).map((f) => f.id),
          );
          const reordered = applyOrder(
            state.fields.filter((f) => f.profileId === profileId),
            orderedIds.filter((id) => profileFieldIds.has(id)),
          );
          const map = new Map(reordered.map((f) => [f.id, f]));
          return {
            fields: ensureFieldSortOrder(
              state.fields.map((f) => (f.profileId === profileId ? map.get(f.id) ?? f : f)),
            ),
          };
        });
      },
    }),
    { name: "againerp-configurator-attributes", version: 1 },
  ),
);
