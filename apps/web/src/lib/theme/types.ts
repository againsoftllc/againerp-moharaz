/**
 * Theme architecture types — no business logic.
 * @see docs/ui-ux/theme-system.md · docs/ui-ux/dark-mode.md
 */

/** User preference — may follow OS when `system`. */
export type ThemePreference = "light" | "dark" | "system";

/** Resolved paint mode applied to the document. */
export type ResolvedThemeMode = "light" | "dark";

export type ThemeContextValue = {
  /** Stored user preference */
  preference: ThemePreference;
  /** Effective mode after resolving `system` */
  resolvedMode: ResolvedThemeMode;
  isDark: boolean;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
};
