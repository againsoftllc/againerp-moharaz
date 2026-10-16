/**
 * Spacing tokens — 4px base unit.
 * @see docs/ui-ux/design-system.md#spacing-scale
 * @see docs/design-system/HR_DESIGN_SYSTEM_SPECIFICATION.md#spacing-strategy
 */

import type { CssVariableMap, SpacingTokenName } from "../types";

export const spacingTokenNames = {
  space1: "space-1",
  space2: "space-2",
  space3: "space-3",
  space4: "space-4",
  space5: "space-5",
  space6: "space-6",
  space8: "space-8",
  space10: "space-10",
  space12: "space-12",
} as const satisfies Record<string, SpacingTokenName>;

/** Pixel values — canonical scale. */
export const spacingScale: Record<SpacingTokenName, string> = {
  "space-1": "4px",
  "space-2": "8px",
  "space-3": "12px",
  "space-4": "16px",
  "space-5": "20px",
  "space-6": "24px",
  "space-8": "32px",
  "space-10": "40px",
  "space-12": "48px",
};

/** CSS custom properties (`--space-*`). */
export const spacingCssVariables: CssVariableMap = Object.fromEntries(
  Object.entries(spacingScale).map(([key, value]) => [`--${key}`, value]),
) as CssVariableMap;

/** Enterprise touch targets — docs/ui-ux/mobile-first.md */
export const touchTargetMin = "44px";

/** Gap between interactive controls */
export const touchSpacing = spacingScale["space-2"];
