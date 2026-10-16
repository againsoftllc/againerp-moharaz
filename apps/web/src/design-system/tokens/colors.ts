/**
 * Color tokens — semantic + UI (shadcn bridge).
 * Values align with apps/web globals.css and docs/ui-ux/design-system.md.
 * @see docs/ui-ux/dark-mode.md
 * @see docs/ui-ux/status-system.md
 * @see docs/design-system/HR_DESIGN_SYSTEM_SPECIFICATION.md#color-strategy
 */

import type { CssVariableMap } from "../types";

/** Semantic token names — use in components, never raw hex. */
export const semanticColorTokens = {
  primary: "color-primary",
  primaryHover: "color-primary-hover",
  primaryForeground: "color-primary-foreground",
  primarySubtle: "color-primary-subtle",
  secondary: "color-secondary",
  secondaryForeground: "color-secondary-foreground",
  success: "color-success",
  warning: "color-warning",
  danger: "color-danger",
  info: "color-info",
  surface: "color-surface",
  surfaceRaised: "color-surface-raised",
  background: "color-background",
  text: "color-text",
  textMuted: "color-text-muted",
  border: "color-border",
  ring: "color-ring",
  destructive: "color-destructive",
  destructiveForeground: "color-destructive-foreground",
} as const;

/** Status badge tokens — docs/ui-ux/status-system.md */
export const statusColorTokens = {
  success: "status-success",
  warning: "status-warning",
  danger: "status-danger",
  info: "status-info",
  pending: "status-pending",
  draft: "status-draft",
  approved: "status-approved",
  rejected: "status-rejected",
  archived: "status-archived",
} as const;

/** Shadcn / Tailwind bridge variables (existing app convention). */
export const uiColorTokens = {
  background: "background",
  foreground: "foreground",
  card: "card",
  popover: "popover",
  primary: "primary",
  primaryForeground: "primary-foreground",
  secondary: "secondary",
  secondaryForeground: "secondary-foreground",
  muted: "muted",
  mutedForeground: "muted-foreground",
  accent: "accent",
  accentForeground: "accent-foreground",
  destructive: "destructive",
  destructiveForeground: "destructive-foreground",
  border: "border",
  input: "input",
  ring: "ring",
} as const;

export type SemanticColors = {
  primary: string;
  primaryHover: string;
  primaryForeground: string;
  primarySubtle: string;
  secondary: string;
  secondaryForeground: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  surface: string;
  surfaceRaised: string;
  background: string;
  text: string;
  textMuted: string;
  border: string;
  ring: string;
  destructive: string;
  destructiveForeground: string;
};

export type StatusColors = {
  success: { bg: string; text: string };
  warning: { bg: string; text: string };
  danger: { bg: string; text: string };
  info: { bg: string; text: string };
  pending: { bg: string; text: string };
  draft: { bg: string; text: string };
  approved: { bg: string; text: string };
  rejected: { bg: string; text: string };
  archived: { bg: string; text: string };
};

export type UiColors = {
  background: string;
  foreground: string;
  card: string;
  popover: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
};

export function toSemanticCssVariables(colors: SemanticColors): CssVariableMap {
  return {
    "--color-primary": colors.primary,
    "--color-primary-hover": colors.primaryHover,
    "--color-primary-foreground": colors.primaryForeground,
    "--color-primary-subtle": colors.primarySubtle,
    "--color-secondary": colors.secondary,
    "--color-secondary-foreground": colors.secondaryForeground,
    "--color-success": colors.success,
    "--color-warning": colors.warning,
    "--color-danger": colors.danger,
    "--color-info": colors.info,
    "--color-surface": colors.surface,
    "--color-surface-raised": colors.surfaceRaised,
    "--color-background": colors.background,
    "--color-text": colors.text,
    "--color-text-muted": colors.textMuted,
    "--color-border": colors.border,
    "--color-ring": colors.ring,
    "--color-destructive": colors.destructive,
    "--color-destructive-foreground": colors.destructiveForeground,
  };
}

export function toStatusCssVariables(status: StatusColors): CssVariableMap {
  const map: CssVariableMap = {};
  for (const [key, value] of Object.entries(status)) {
    map[`--status-${key}` as `--${string}`] = value.text;
    map[`--status-${key}-bg` as `--${string}`] = value.bg;
  }
  return map;
}

export function toUiCssVariables(ui: UiColors): CssVariableMap {
  return {
    "--background": ui.background,
    "--foreground": ui.foreground,
    "--card": ui.card,
    "--popover": ui.popover,
    "--primary": ui.primary,
    "--primary-foreground": ui.primaryForeground,
    "--secondary": ui.secondary,
    "--secondary-foreground": ui.secondaryForeground,
    "--muted": ui.muted,
    "--muted-foreground": ui.mutedForeground,
    "--accent": ui.accent,
    "--accent-foreground": ui.accentForeground,
    "--destructive": ui.destructive,
    "--destructive-foreground": ui.destructiveForeground,
    "--border": ui.border,
    "--input": ui.input,
    "--ring": ui.ring,
  };
}
