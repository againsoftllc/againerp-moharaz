import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UtilityPanelTab = "activity" | "comments" | "notes" | "files";

type AppState = {
  sidebarCollapsed: boolean;
  hrModuleNavCollapsed: boolean;
  smwModuleNavCollapsed: boolean;
  utilityPanelOpen: boolean;
  utilityPanelTab: UtilityPanelTab;
  aiDrawerOpen: boolean;
  mobileSidebarOpen: boolean;
  companyId: string;
  branchId: string;
  favorites: string[];
  recentPages: { title: string; href: string }[];
  toggleSidebar: () => void;
  toggleHrModuleNavCollapsed: () => void;
  toggleSmwModuleNavCollapsed: () => void;
  toggleUtilityPanel: () => void;
  openUtilityPanel: (tab?: UtilityPanelTab) => void;
  setUtilityPanelOpen: (open: boolean) => void;
  setUtilityPanelTab: (tab: UtilityPanelTab) => void;
  toggleAiDrawer: () => void;
  setAiDrawerOpen: (open: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setCompany: (id: string) => void;
  setBranch: (id: string) => void;
  addRecent: (title: string, href: string) => void;
  toggleFavorite: (href: string) => void;
};

type LegacyAppState = AppState & {
  theme?: "light" | "dark" | "system";
};

function migrateLegacyThemePreference(legacyTheme?: string) {
  if (typeof window === "undefined" || !legacyTheme) return;
  try {
    if (!localStorage.getItem("againerp-theme")) {
      localStorage.setItem(
        "againerp-theme",
        JSON.stringify({ state: { preference: legacyTheme }, version: 1 }),
      );
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      hrModuleNavCollapsed: false,
      smwModuleNavCollapsed: false,
      utilityPanelOpen: false,
      utilityPanelTab: "activity",
      aiDrawerOpen: false,
      mobileSidebarOpen: false,
      companyId: "co1",
      branchId: "br1",
      favorites: [],
      recentPages: [],
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      toggleHrModuleNavCollapsed: () =>
        set((s) => ({ hrModuleNavCollapsed: !s.hrModuleNavCollapsed })),
      toggleSmwModuleNavCollapsed: () =>
        set((s) => ({ smwModuleNavCollapsed: !s.smwModuleNavCollapsed })),
      toggleUtilityPanel: () => set((s) => ({ utilityPanelOpen: !s.utilityPanelOpen })),
      openUtilityPanel: (tab) =>
        set((s) => ({
          utilityPanelOpen: true,
          utilityPanelTab: tab ?? s.utilityPanelTab,
        })),
      setUtilityPanelOpen: (utilityPanelOpen) => set({ utilityPanelOpen }),
      setUtilityPanelTab: (utilityPanelTab) => set({ utilityPanelTab }),
      toggleAiDrawer: () =>
        set((s) => ({
          aiDrawerOpen: !s.aiDrawerOpen,
        })),
      setAiDrawerOpen: (aiDrawerOpen: boolean) => set({ aiDrawerOpen }),
      setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
      setCompany: (companyId) => set({ companyId }),
      setBranch: (branchId) => set({ branchId }),
      addRecent: (title, href) => {
        const filtered = get().recentPages.filter((p) => p.href !== href);
        set({ recentPages: [{ title, href }, ...filtered].slice(0, 8) });
      },
      toggleFavorite: (href) => {
        const favs = get().favorites;
        set({
          favorites: favs.includes(href)
            ? favs.filter((f) => f !== href)
            : [...favs, href],
        });
      },
    }),
    {
      name: "againerp-prototype",
      version: 5,
      migrate: (persistedState, version) => {
        const state = persistedState as LegacyAppState;
        if (version < 1) {
          return { ...state, utilityPanelOpen: false };
        }
        if (version < 2) {
          return { ...state, hrModuleNavCollapsed: false };
        }
        if (version < 3) {
          migrateLegacyThemePreference(state.theme);
          const { theme: _theme, ...rest } = state;
          return rest as AppState;
        }
        if (version < 4) {
          return { ...state, smwModuleNavCollapsed: false };
        }
        if (version < 5) {
          return {
            ...state,
            utilityPanelTab: "activity" as UtilityPanelTab,
            mobileSidebarOpen: false,
          };
        }
        return state;
      },
    },
  ),
);
