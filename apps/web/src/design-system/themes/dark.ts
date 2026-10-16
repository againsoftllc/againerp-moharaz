/**
 * Dark theme — canonical token values.
 * UI layer matches apps/web/src/app/globals.css `.dark`.
 * Semantic layer per docs/ui-ux/dark-mode.md (aligned with implemented shell).
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

export const darkUiColors: UiColors = {
  background: "#0b0f19",
  foreground: "#f8fafc",
  card: "#111827",
  popover: "#111827",
  primary: "#6366f1",
  primaryForeground: "#ffffff",
  secondary: "#1e293b",
  secondaryForeground: "#f8fafc",
  muted: "#1e293b",
  mutedForeground: "#94a3b8",
  accent: "#1e293b",
  accentForeground: "#f8fafc",
  destructive: "#ef4444",
  destructiveForeground: "#ffffff",
  border: "#2a3544",
  input: "#2a3544",
  ring: "#6366f1",
};

export const darkSemanticColors: SemanticColors = {
  primary: darkUiColors.primary,
  primaryHover: "#818cf8",
  primaryForeground: darkUiColors.primaryForeground,
  primarySubtle: "#1e3a5f",
  secondary: darkUiColors.secondary,
  secondaryForeground: darkUiColors.secondaryForeground,
  success: "#22c55e",
  warning: "#fbbf24",
  danger: "#ef4444",
  info: "#22d3ee",
  surface: darkUiColors.card,
  surfaceRaised: "#334155",
  background: darkUiColors.background,
  text: darkUiColors.foreground,
  textMuted: darkUiColors.mutedForeground,
  border: darkUiColors.border,
  ring: darkUiColors.ring,
  destructive: darkUiColors.destructive,
  destructiveForeground: darkUiColors.destructiveForeground,
};

export const darkStatusColors: StatusColors = {
  success: { bg: "#14532d", text: "#86efac" },
  warning: { bg: "#78350f", text: "#fde68a" },
  danger: { bg: "#7f1d1d", text: "#fca5a5" },
  info: { bg: "#164e63", text: "#67e8f9" },
  pending: { bg: "#1e3a8a", text: "#93c5fd" },
  draft: { bg: "#334155", text: "#cbd5e1" },
  approved: { bg: "#14532d", text: "#bbf7d0" },
  rejected: { bg: "#7f1d1d", text: "#fecaca" },
  archived: { bg: "#334155", text: "#94a3b8" },
};

export const darkAiAccent = {
  border: "#4c1d95",
  background: "rgb(46 16 101 / 0.35)",
  foreground: "#c4b5fd",
} as const;

export const darkThemeExtras: CssVariableMap = {
  "--density-scale": "0.9",
  "--ai-accent-border": darkAiAccent.border,
  "--ai-accent-bg": darkAiAccent.background,
  "--ai-accent-fg": darkAiAccent.foreground,
};

export const darkCssVariables: CssVariableMap = {
  ...toUiCssVariables(darkUiColors),
  ...toSemanticCssVariables(darkSemanticColors),
  ...toStatusCssVariables(darkStatusColors),
  ...spacingCssVariables,
  ...radiusCssVariables,
  ...typographyCssVariables,
  ...shadowCssVariables("dark"),
  ...darkThemeExtras,
};
