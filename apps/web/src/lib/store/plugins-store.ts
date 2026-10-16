import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PluginChangeLog, PluginInstallState } from "@/lib/settings/plugins/types";
import {
  PLUGIN_REGISTRY,
  buildPluginDefaults,
  findPlugin,
} from "@/lib/settings/plugins/registry";
import { serializeBanks } from "@/lib/plugins/bank-emi/banks-config";
import { DEFAULT_EMI_SETTINGS } from "@/lib/mock-data/emi-banks";

type PluginsStore = {
  plugins: Record<string, PluginInstallState>;
  history: PluginChangeLog[];
  /** When Center is bound, these plugin ids are hidden (Center's plan disallows them). */
  centerBound: boolean;
  centerBlockedPlugins: string[];
  applyCenterPluginEntitlements: (payload: {
    bound: boolean;
    blocked?: string[];
  }) => void;
  isPluginVisible: (pluginId: string) => boolean;
  installPlugin: (pluginId: string) => void;
  uninstallPlugin: (pluginId: string) => void;
  setEnabled: (pluginId: string, enabled: boolean) => void;
  setConfigValue: (
    pluginId: string,
    key: string,
    value: string | boolean | number,
    meta: { label: string },
  ) => void;
  savePluginConfig: (
    pluginId: string,
    config: Record<string, string | boolean | number>,
    meta: { labels: Record<string, string> },
  ) => void;
  resetPluginConfig: (pluginId: string) => void;
  getPluginState: (pluginId: string) => PluginInstallState | undefined;
  hydrateFromServer: (
    states: Record<string, { installed: boolean; enabled: boolean }>,
  ) => void;
};

function defaultState(pluginId: string): PluginInstallState {
  const plugin = findPlugin(pluginId);
  return {
    installed: false,
    enabled: false,
    config: plugin ? buildPluginDefaults(plugin) : {},
  };
}

export const usePluginsStore = create<PluginsStore>()(
  persist(
    (set, get) => ({
      plugins: {},
      history: [],
      centerBound: false,
      centerBlockedPlugins: [],

      getPluginState: (pluginId) => get().plugins[pluginId] ?? defaultState(pluginId),

      hydrateFromServer: (states) =>
        set((s) => {
          const plugins = { ...s.plugins };
          for (const [pluginId, remote] of Object.entries(states)) {
            const current = plugins[pluginId] ?? defaultState(pluginId);
            plugins[pluginId] = {
              ...current,
              installed: remote.installed,
              enabled: remote.enabled,
            };
          }
          return { plugins };
        }),

      applyCenterPluginEntitlements: ({ bound, blocked }) => {
        if (!bound) {
          set({ centerBound: false, centerBlockedPlugins: [] });
          return;
        }
        set({
          centerBound: true,
          centerBlockedPlugins: blocked ?? [],
        });
      },

      isPluginVisible: (pluginId) => {
        const { centerBound, centerBlockedPlugins } = get();
        if (!centerBound) return true;
        return !centerBlockedPlugins.includes(pluginId);
      },

      installPlugin: (pluginId) => {
        if (!get().isPluginVisible(pluginId)) return;
        const plugin = findPlugin(pluginId);
        if (!plugin) return;
        const config = buildPluginDefaults(plugin);
        if (pluginId === "bank-emi") {
          config.banks_json = serializeBanks(DEFAULT_EMI_SETTINGS.banks);
        }
        if (pluginId === "again-drop-api") {
          config.use_server_key = true;
          config.api_key = "__server_again_drop_key__";
        }
        set((s) => ({
          plugins: {
            ...s.plugins,
            [pluginId]: {
              installed: true,
              enabled: true,
              config,
              installedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        }));
      },

      uninstallPlugin: (pluginId) => {
        set((s) => {
          const next = { ...s.plugins };
          delete next[pluginId];
          return { plugins: next };
        });
      },

      setEnabled: (pluginId, enabled) => {
        const current = get().plugins[pluginId];
        if (!current?.installed) return;
        set((s) => ({
          plugins: {
            ...s.plugins,
            [pluginId]: { ...current, enabled, updatedAt: new Date().toISOString() },
          },
        }));
      },

      setConfigValue: (pluginId, key, value, meta) => {
        const current = get().plugins[pluginId];
        if (!current?.installed) return;
        const oldValue = current.config[key];
        if (oldValue === value) return;
        set((s) => ({
          plugins: {
            ...s.plugins,
            [pluginId]: {
              ...current,
              config: { ...current.config, [key]: value },
              updatedAt: new Date().toISOString(),
            },
          },
          history: [
            {
              id: `plg_${Date.now()}`,
              pluginId,
              label: meta.label,
              oldValue: oldValue ?? "",
              newValue: value,
              changedBy: "Admin",
              at: new Date().toISOString(),
            },
            ...s.history,
          ].slice(0, 100),
        }));
      },

      savePluginConfig: (pluginId, config, meta) => {
        const current = get().plugins[pluginId];
        if (!current?.installed) return;
        const changes: PluginChangeLog[] = [];
        for (const [key, value] of Object.entries(config)) {
          const oldValue = current.config[key];
          if (oldValue !== value) {
            changes.push({
              id: `plg_${Date.now()}_${key}`,
              pluginId,
              label: meta.labels[key] ?? key,
              oldValue: oldValue ?? "",
              newValue: value,
              changedBy: "Admin",
              at: new Date().toISOString(),
            });
          }
        }
        if (changes.length === 0) return;
        set((s) => ({
          plugins: {
            ...s.plugins,
            [pluginId]: {
              ...current,
              config: { ...current.config, ...config },
              updatedAt: new Date().toISOString(),
            },
          },
          history: [...changes, ...s.history].slice(0, 100),
        }));
      },

      resetPluginConfig: (pluginId) => {
        const plugin = findPlugin(pluginId);
        const current = get().plugins[pluginId];
        if (!plugin || !current?.installed) return;
        set((s) => ({
          plugins: {
            ...s.plugins,
            [pluginId]: {
              ...current,
              config: buildPluginDefaults(plugin),
              updatedAt: new Date().toISOString(),
            },
          },
        }));
      },
    }),
    {
      name: "again-plugins-v1",
      partialize: (state) => ({
        plugins: state.plugins,
        history: state.history,
      }),
    },
  ),
);

export function getInstalledPlugins() {
  const { plugins } = usePluginsStore.getState();
  return PLUGIN_REGISTRY.filter((p) => plugins[p.id]?.installed);
}

export function getAvailablePlugins() {
  const { plugins } = usePluginsStore.getState();
  return PLUGIN_REGISTRY.filter((p) => !plugins[p.id]?.installed);
}
