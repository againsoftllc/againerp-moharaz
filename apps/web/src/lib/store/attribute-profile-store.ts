import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  attributeGroupsSeed,
  attributeProfilesSeed,
  attributeSpecsSeed,
  ensureSortOrder,
  slugifyAttributeCode,
  type AttributeGroup,
  type AttributeProfile,
  type AttributeSpec,
} from "@/lib/mock-data/attribute-profiles";

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
  profiles: AttributeProfile[];
  groups: AttributeGroup[];
  attributes: AttributeSpec[];
  setProfiles: (profiles: AttributeProfile[]) => void;
  upsertProfile: (data: Partial<AttributeProfile> & { id?: string }) => void;
  patchProfile: (id: string, patch: Partial<AttributeProfile>) => void;
  deleteProfiles: (ids: string[]) => void;
  duplicateProfile: (id: string) => string | null;
  reorderProfiles: (orderedIds: string[]) => void;
  upsertGroup: (data: Partial<AttributeGroup> & { id?: string; profileId: string }) => void;
  patchGroup: (id: string, patch: Partial<AttributeGroup>) => void;
  deleteGroups: (ids: string[]) => void;
  reorderGroups: (profileId: string, orderedIds: string[]) => void;
  upsertAttribute: (data: Partial<AttributeSpec> & { id?: string; groupId: string }) => void;
  patchAttribute: (id: string, patch: Partial<AttributeSpec>) => void;
  deleteAttributes: (ids: string[]) => void;
  reorderAttributes: (groupId: string, orderedIds: string[]) => void;
  getProfileById: (id: string) => AttributeProfile | undefined;
  getGroupsForProfile: (profileId: string) => AttributeGroup[];
  getAttributesForGroup: (groupId: string) => AttributeSpec[];
  saveProfileBulk: (payload: {
    profileId?: string;
    profileName: string;
    imageUrl?: string;
    groups: {
      id?: string;
      name: string;
      attributes: { id?: string; name: string; filterable?: boolean; predefinedValues?: string[] }[];
    }[];
  }) => string;
};

export const useAttributeProfileStore = create<State>()(
  persist(
    (set, get) => ({
      profiles: attributeProfilesSeed,
      groups: attributeGroupsSeed,
      attributes: attributeSpecsSeed,

      setProfiles: (profiles) => set({ profiles: ensureSortOrder(profiles) }),

      upsertProfile: (data) => {
        set((state) => {
          if (data.id) {
            return {
              profiles: state.profiles.map((p) =>
                p.id === data.id
                  ? { ...p, ...data, updatedAt: new Date().toISOString().slice(0, 10) }
                  : p,
              ),
            };
          }
          const nextOrder = state.profiles.length
            ? Math.max(...state.profiles.map((p) => p.sortOrder)) + 1
            : 0;
          const id = `prof_${Date.now()}`;
          const created: AttributeProfile = {
            id,
            name: data.name ?? "New Profile",
            code: data.code ?? "new-profile",
            description: data.description,
            sortOrder: nextOrder,
            active: data.active ?? true,
            productCount: 0,
            iconUrl: data.iconUrl,
            categoryLabels: data.categoryLabels ?? [],
            updatedAt: new Date().toISOString().slice(0, 10),
          };
          return { profiles: [...state.profiles, created] };
        });
      },

      patchProfile: (id, patch) => {
        set((state) => ({
          profiles: state.profiles.map((p) =>
            p.id === id
              ? { ...p, ...patch, updatedAt: new Date().toISOString().slice(0, 10) }
              : p,
          ),
        }));
      },

      deleteProfiles: (ids) => {
        const drop = new Set(ids);
        set((state) => ({
          profiles: ensureSortOrder(state.profiles.filter((p) => !drop.has(p.id))),
          groups: state.groups.filter((g) => !drop.has(g.profileId)),
          attributes: state.attributes.filter((a) => {
            const group = state.groups.find((g) => g.id === a.groupId);
            return group && !drop.has(group.profileId);
          }),
        }));
      },

      duplicateProfile: (id) => {
        const state = get();
        const source = state.profiles.find((p) => p.id === id);
        if (!source) return null;
        const newProfileId = `prof_${Date.now()}`;
        const newProfile: AttributeProfile = {
          ...source,
          id: newProfileId,
          name: `${source.name} (Copy)`,
          code: `${source.code}_copy`,
          productCount: 0,
          sortOrder: state.profiles.length,
          updatedAt: new Date().toISOString().slice(0, 10),
        };
        const sourceGroups = state.groups.filter((g) => g.profileId === id);
        const groupIdMap = new Map<string, string>();
        const newGroups = sourceGroups.map((g) => {
          const newId = `grp_${Date.now()}_${g.id}`;
          groupIdMap.set(g.id, newId);
          return { ...g, id: newId, profileId: newProfileId };
        });
        const newAttributes = state.attributes
          .filter((a) => groupIdMap.has(a.groupId))
          .map((a) => ({
            ...a,
            id: `attr_${Date.now()}_${a.id}`,
            groupId: groupIdMap.get(a.groupId)!,
            code: `${a.code}_copy`,
          }));
        set({
          profiles: [...state.profiles, newProfile],
          groups: [...state.groups, ...newGroups],
          attributes: [...state.attributes, ...newAttributes],
        });
        return newProfileId;
      },

      reorderProfiles: (orderedIds) => {
        set((state) => ({
          profiles: ensureSortOrder(applyOrder(state.profiles, orderedIds)),
        }));
      },

      upsertGroup: (data) => {
        set((state) => {
          if (data.id) {
            return {
              groups: state.groups.map((g) =>
                g.id === data.id ? { ...g, ...data } : g,
              ),
            };
          }
          const siblings = state.groups.filter((g) => g.profileId === data.profileId);
          const nextOrder = siblings.length ? Math.max(...siblings.map((g) => g.sortOrder)) + 1 : 0;
          const created: AttributeGroup = {
            id: `grp_${Date.now()}`,
            profileId: data.profileId,
            name: data.name ?? "New Group",
            code: data.code ?? "new_group",
            sortOrder: nextOrder,
            active: data.active ?? true,
            description: data.description,
          };
          return { groups: [...state.groups, created] };
        });
      },

      patchGroup: (id, patch) => {
        set((state) => ({
          groups: state.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        }));
      },

      deleteGroups: (ids) => {
        const drop = new Set(ids);
        set((state) => ({
          groups: ensureSortOrder(state.groups.filter((g) => !drop.has(g.id))),
          attributes: state.attributes.filter((a) => !drop.has(a.groupId)),
        }));
      },

      reorderGroups: (profileId, orderedIds) => {
        set((state) => {
          const map = new Map(orderedIds.map((id, i) => [id, i]));
          return {
            groups: state.groups.map((g) =>
              g.profileId === profileId && map.has(g.id)
                ? { ...g, sortOrder: map.get(g.id)! }
                : g,
            ),
          };
        });
      },

      upsertAttribute: (data) => {
        set((state) => {
          if (data.id) {
            return {
              attributes: state.attributes.map((a) =>
                a.id === data.id ? { ...a, ...data } : a,
              ),
            };
          }
          const siblings = state.attributes.filter((a) => a.groupId === data.groupId);
          const nextOrder = siblings.length ? Math.max(...siblings.map((a) => a.sortOrder)) + 1 : 0;
          const created: AttributeSpec = {
            id: `attr_${Date.now()}`,
            groupId: data.groupId,
            name: data.name ?? "New Attribute",
            code: data.code ?? "new_attribute",
            fieldType: data.fieldType ?? "text",
            sortOrder: nextOrder,
            isRequired: data.isRequired ?? false,
            isFilterable: data.isFilterable ?? false,
            isComparable: data.isComparable ?? true,
            isSearchable: data.isSearchable ?? false,
            isVisible: data.isVisible ?? true,
            active: data.active ?? true,
            unit: data.unit,
            helpText: data.helpText,
          };
          return { attributes: [...state.attributes, created] };
        });
      },

      patchAttribute: (id, patch) => {
        set((state) => ({
          attributes: state.attributes.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        }));
      },

      deleteAttributes: (ids) => {
        const drop = new Set(ids);
        set((state) => ({
          attributes: ensureSortOrder(state.attributes.filter((a) => !drop.has(a.id))),
        }));
      },

      reorderAttributes: (groupId, orderedIds) => {
        set((state) => {
          const map = new Map(orderedIds.map((id, i) => [id, i]));
          return {
            attributes: state.attributes.map((a) =>
              a.groupId === groupId && map.has(a.id) ? { ...a, sortOrder: map.get(a.id)! } : a,
            ),
          };
        });
      },

      getProfileById: (id) => get().profiles.find((p) => p.id === id),

      getGroupsForProfile: (profileId) =>
        ensureSortOrder(get().groups.filter((g) => g.profileId === profileId)),

      getAttributesForGroup: (groupId) =>
        ensureSortOrder(get().attributes.filter((a) => a.groupId === groupId)),

      saveProfileBulk: (payload) => {
        const state = get();
        const profileName = payload.profileName.trim();
        let profileId = payload.profileId;

        if (profileId) {
          set({
            profiles: state.profiles.map((p) =>
              p.id === profileId
                ? { ...p, name: profileName, code: slugifyAttributeCode(profileName), imageUrl: payload.imageUrl ?? p.imageUrl, updatedAt: new Date().toISOString().slice(0, 10) }
                : p,
            ),
          });
        } else {
          profileId = `prof_${Date.now()}`;
          const nextOrder = state.profiles.length
            ? Math.max(...state.profiles.map((p) => p.sortOrder)) + 1
            : 0;
          const created: AttributeProfile = {
            id: profileId,
            name: profileName,
            code: slugifyAttributeCode(profileName),
            imageUrl: payload.imageUrl,
            sortOrder: nextOrder,
            active: true,
            productCount: 0,
            categoryLabels: [],
            updatedAt: new Date().toISOString().slice(0, 10),
          };
          set({ profiles: [...state.profiles, created] });
        }

        const newGroups: AttributeGroup[] = [];
        const newAttributes: AttributeSpec[] = [];

        payload.groups.forEach((group, groupIndex) => {
          const groupId = group.id ?? `grp_${Date.now()}_${groupIndex}`;
          const groupCode = slugifyAttributeCode(group.name);
          newGroups.push({
            id: groupId,
            profileId: profileId!,
            name: group.name.trim(),
            code: groupCode,
            sortOrder: groupIndex,
            active: true,
          });

          group.attributes.forEach((attr, attrIndex) => {
            const attrId = attr.id ?? `attr_${Date.now()}_${groupIndex}_${attrIndex}`;
            const baseCode = slugifyAttributeCode(attr.name);
            newAttributes.push({
              id: attrId,
              groupId,
              name: attr.name.trim(),
              code: `${groupCode}_${baseCode}`,
              fieldType: attr.filterable ? "dropdown" : "text",
              sortOrder: attrIndex,
              isRequired: false,
              isFilterable: attr.filterable ?? false,
              isComparable: true,
              isSearchable: false,
              isVisible: true,
              active: true,
              predefinedValues: attr.predefinedValues ?? [],
            });
          });
        });

        set((current) => ({
          groups: [
            ...current.groups.filter((g) => g.profileId !== profileId),
            ...newGroups,
          ],
          attributes: [
            ...current.attributes.filter((a) => {
              const group = current.groups.find((g) => g.id === a.groupId);
              return !group || group.profileId !== profileId;
            }),
            ...newAttributes,
          ],
        }));

        return profileId!;
      },
    }),
    { name: "againerp-attribute-profiles", version: 1 },
  ),
);
