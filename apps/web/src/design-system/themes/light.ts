/**
 * Light theme — canonical token values.
 * UI layer matches apps/web/src/app/globals.css `:root`.
 * Semantic layer maps docs/ui-ux/design-system.md names to the same palette.
 */

import type { CssVariableMap } from "../types";
import {
  toSemanticCssVariables,
  toStatusCssVariables,
  toUiCssVariables,
  type SemanticColors,
  type StatusColors,
  type UiColors,
} from "../tokens/colors";
import { radiusCssVariables } from "../tokens/radius";
import { shadowCssVariables } from "../tokens/shadows";
import { spacingCssVariables } from "../tokens/spacing";
import { typographyCssVariables } from "../tokens/typography";

export const lightUiColors: UiColors = {
  background: "#fafafa",
  foreground: "#0f172a",
  card: "#ffffff",
  popover: "#ffffff",
  primary: "#4f46e5",
  primaryForeground: "#ffffff",
  secondary: "#f1f5f9",
  secondaryForeground: "#0f172a",
  muted: "#f1f5f9",
  mutedForeground: "#64748b",
  accent: "#f1f5f9",
  accentForeground: "#0f172a",
  destructive: "#ef4444",
  destructiveForeground: "#ffffff",
  border: "#e2e8f0",
  input: "#e2e8f0",
  ring: "#4f46e5",
};

export const lightSemanticColors: SemanticColors = {
  primary: lightUiColors.primary,
  primaryHover: "#4338ca",
  primaryForeground: lightUiColors.primaryForeground,
  primarySubtle: "#eef2ff",
  secondary: lightUiColors.secondary,
  secondaryForeground: lightUiColors.secondaryForeground,
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
  info: "#0891b2",
  surface: lightUiColors.card,
  surfaceRaised: "#ffffff",
  background: lightUiColors.background,
  text: lightUiColors.foreground,
  textMuted: lightUiColors.mutedForeground,
  border: lightUiColors.border,
  ring: lightUiColors.ring,
  destructive: lightUiColors.destructive,
  destructiveForeground: lightUiColors.destructiveForeground,
};

export const lightStatusColors: StatusColors = {
  success: { bg: "#f0fdf4", text: "#15803d" },
  warning: { bg: "#fffbeb", text: "#b45309" },
  danger: { bg: "#fef2f2", text: "#b91c1c" },
  info: { bg: "#ecfeff", text: "#0e7490" },
  pending: { bg: "#eff6ff", text: "#1d4ed8" },
  draft: { bg: "#f3f4f6", text: "#4b5563" },
  approved: { bg: "#f0fdf4", text: "#166534" },
  rejected: { bg: "#fef2f2", text: "#991b1b" },
  archived: { bg: "#f3f4f6", text: "#6b7280" },
};

/** HR / AI accent — advisory surfaces only */
export const lightAiAccent = {
  border: "#ddd6fe",
  background: "rgb(245 243 255 / 0.5)",
  foreground: "#6d28d9",
} as const;

export const lightThemeExtras: CssVariableMap = {
  "--density-scale": "0.9",
  "--ai-accent-border": lightAiAccent.border,
  "--ai-accent-bg": lightAiAccent.background,
  "--ai-accent-fg": lightAiAccent.foreground,
};

export const lightCssVariables: CssVariableMap = {
  ...toUiCssVariables(lightUiColors),
  ...toSemanticCssVariables(lightSemanticColors),
  ...toStatusCssVariables(lightStatusColors),
  ...spacingCssVariables,
  ...radiusCssVariables,
  ...typographyCssVariables,
  ...shadowCssVariables("light"),
  ...lightThemeExtras,
};
