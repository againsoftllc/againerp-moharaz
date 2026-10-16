import type { ResolvedThemeMode, ThemePreference } from "./types";

/** Resolve preference + system hint to an effective light/dark mode. */
export function resolveThemeMode(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedThemeMode {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  return systemPrefersDark ? "dark" : "light";
}

export function isDarkMode(preference: ThemePreference, systemPrefersDark: boolean): boolean {
  return resolveThemeMode(preference, systemPrefersDark) === "dark";
}

/** Cycle: system → light → dark → system */
export function nextThemePreference(current: ThemePreference): ThemePreference {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}
