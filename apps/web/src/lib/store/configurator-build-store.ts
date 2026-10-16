import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SavedBuild } from "@/lib/configurator/types";
import { logConfiguratorActivity } from "@/lib/configurator/audit";
import { savedBuildsSeed } from "@/lib/mock-data/configurator-admin";

type State = {
  builds: SavedBuild[];
  getById: (id: string) => SavedBuild | undefined;
  deleteMany: (ids: string[]) => void;
  bulkSetStatus: (ids: string[], status: SavedBuild["status"]) => void;
};

export const useConfiguratorBuildStore = create<State>()(
  persist(
    (set, get) => ({
      builds: savedBuildsSeed,

      getById: (id) => get().builds.find((b) => b.id === id),

      deleteMany: (ids) => {
        set((state) => ({ builds: state.builds.filter((b) => !ids.includes(b.id)) }));
        ids.forEach((id) =>
          logConfiguratorActivity("configurator_build", id, "delete", "Saved build deleted"),
        );
      },

      bulkSetStatus: (ids, status) => {
        set((state) => ({
          builds: state.builds.map((b) =>
            ids.includes(b.id) ? { ...b, status, updatedAt: new Date().toISOString().slice(0, 10) } : b,
          ),
        }));
        ids.forEach((id) =>
          logConfiguratorActivity("configurator_build", id, "status_change", `Status → ${status}`),
        );
      },
    }),
    { name: "againerp-configurator-builds", version: 1 },
  ),
);
