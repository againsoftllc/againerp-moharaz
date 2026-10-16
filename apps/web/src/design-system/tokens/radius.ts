/**
 * Border radius tokens.
 * @see docs/ui-ux/design-system.md#border-radius
 * @see docs/design-system/HR_DESIGN_SYSTEM_SPECIFICATION.md#border-strategy
 */

import type { CssVariableMap, RadiusTokenName } from "../types";

export const radiusTokenNames = {
  sm: "radius-sm",
  md: "radius-md",
  lg: "radius-lg",
  full: "radius-full",
  base: "radius",
} as const satisfies Record<string, RadiusTokenName>;

export const radiusScale: Record<RadiusTokenName, string> = {
  "radius-sm": "4px",
  "radius-md": "8px",
  "radius-lg": "12px",
  "radius-full": "9999px",
  /** Base control radius — matches apps/web globals `--radius` (0.375rem). */
  radius: "0.375rem",
};

export const radiusCssVariables: CssVariableMap = Object.fromEntries(
  Object.entries(radiusScale).map(([key, value]) => [`--${key}`, value]),
) as CssVariableMap;
