"use client";

import { useSyncExternalStore } from "react";
import { useThemeOptional } from "@/components/theme/theme-provider";
import { isDarkMode } from "@/lib/theme/resolve-theme";
import { useThemeStore } from "@/lib/store/theme-store";

function subscribePrefersDark(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Resolved dark mode — for AG Grid and other non-CSS integrations. */
export function useIsDark() {
  const themeCtx = useThemeOptional();
  const preference = useThemeStore((s) => s.preference);
  const prefersDark = useSyncExternalStore(subscribePrefersDark, getPrefersDark, () => false);

  if (themeCtx) return themeCtx.isDark;
  return isDarkMode(preference, prefersDark);
}
