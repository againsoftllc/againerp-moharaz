"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { applyThemeToDocument } from "@/lib/theme/apply-theme";
import { isDarkMode, nextThemePreference, resolveThemeMode } from "@/lib/theme/resolve-theme";
import type { ThemeContextValue, ThemePreference } from "@/lib/theme/types";
import { useThemeStore } from "@/lib/store/theme-store";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function subscribeSystemTheme(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSystemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getServerSystemPrefersDark() {
  return false;
}

type Props = {
  children: React.ReactNode;
};

/** Admin-only theme — mount via AdminThemeShell, not on storefront routes. */
export function ThemeProvider({ children }: Props) {
  const preference = useThemeStore((s) => s.preference);
  const setPreferenceStore = useThemeStore((s) => s.setPreference);
  const togglePreferenceStore = useThemeStore((s) => s.togglePreference);

  const systemPrefersDark = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemPrefersDark,
    getServerSystemPrefersDark,
  );

  const resolvedMode = resolveThemeMode(preference, systemPrefersDark);
  const isDark = isDarkMode(preference, systemPrefersDark);

  useLayoutEffect(() => {
    document.documentElement.classList.remove("storefront-site");
    document.body?.classList.remove("storefront-site");
    applyThemeToDocument(resolvedMode);
  }, [resolvedMode]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceStore(next);
    },
    [setPreferenceStore],
  );

  const toggle = useCallback(() => {
    togglePreferenceStore();
  }, [togglePreferenceStore]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolvedMode,
      isDark,
      setPreference,
      toggle,
    }),
    [preference, resolvedMode, isDark, setPreference, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

/** Optional hook — returns null outside provider (e.g. tests). */
export function useThemeOptional(): ThemeContextValue | null {
  return useContext(ThemeContext);
}

export { nextThemePreference };
