import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemePreference } from "@/lib/theme/types";

type ThemeState = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  togglePreference: () => void;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      preference: "system",
      setPreference: (preference) => set({ preference }),
      togglePreference: () => {
        const current = get().preference;
        const next: ThemePreference =
          current === "system" ? "light" : current === "light" ? "dark" : "system";
        set({ preference: next });
      },
    }),
    {
      name: "againerp-theme",
      version: 1,
    },
  ),
);
