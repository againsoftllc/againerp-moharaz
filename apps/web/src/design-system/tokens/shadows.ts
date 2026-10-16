/**
 * Elevation / shadow tokens.
 * @see docs/ui-ux/design-system.md#shadows--elevation
 * @see docs/design-system/HR_DESIGN_SYSTEM_SPECIFICATION.md#elevation-strategy
 */

import type { CssVariableMap, ShadowTokenName, ThemeMode } from "../types";

export const shadowTokenNames = {
  none: "shadow-none",
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg",
} as const satisfies Record<string, ShadowTokenName>;

export const shadowScaleLight: Record<ShadowTokenName, string> = {
  "shadow-none": "none",
  "shadow-sm": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  "shadow-md": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  "shadow-lg": "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
};

export const shadowScaleDark: Record<ShadowTokenName, string> = {
  "shadow-none": "none",
  "shadow-sm": "0 1px 2px rgb(0 0 0 / 0.3)",
  "shadow-md": "0 4px 12px rgb(0 0 0 / 0.4)",
  "shadow-lg": "0 10px 24px rgb(0 0 0 / 0.5)",
};

export function shadowCssVariables(mode: ThemeMode): CssVariableMap {
  const scale = mode === "dark" ? shadowScaleDark : shadowScaleLight;
  return Object.fromEntries(
    Object.entries(scale).map(([key, value]) => [`--${key}`, value]),
  ) as CssVariableMap;
}
