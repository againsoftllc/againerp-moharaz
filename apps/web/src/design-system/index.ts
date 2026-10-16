/**
 * AgainERP Design Token System
 *
 * Canonical frontend tokens for enterprise SaaS UI.
 * Spec: docs/ui-ux/design-system.md · docs/design-system/HR_DESIGN_SYSTEM_SPECIFICATION.md
 *
 * @example
 * import { lightCssVariables, breakpoints, spacingScale } from '@/design-system';
 * import { applyCssVariables, getThemeCssVariables } from '@/design-system';
 */

export type {
  BreakpointName,
  CssVariableMap,
  CssVariableName,
  RadiusTokenName,
  ShadowTokenName,
  SpacingTokenName,
  ThemeMode,
  TypographySizeToken,
} from "./types";

export * from "./tokens";
export * from "./themes";
export { applyCssVariables, clearCssVariables, cssVariablesToBlock } from "./utils/css-variables";

export type { ThemePreference, ResolvedThemeMode } from "@/lib/theme/types";
export { resolveThemeMode, isDarkMode, nextThemePreference } from "@/lib/theme/resolve-theme";
export { applyThemeToDocument } from "@/lib/theme/apply-theme";
