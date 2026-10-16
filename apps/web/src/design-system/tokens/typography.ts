/**
 * Typography tokens.
 * @see docs/ui-ux/design-system.md#typography
 * @see docs/design-system/HR_DESIGN_SYSTEM_SPECIFICATION.md#typography-system
 */

import type { CssVariableMap, TypographySizeToken } from "../types";

export const fontFamily = {
  sans: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  mono: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
} as const;

export const fontWeight = {
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const typographyScale: Record<
  TypographySizeToken,
  { fontSize: string; lineHeight: string; fontWeight: string }
> = {
  "text-xs": { fontSize: "12px", lineHeight: "1.4", fontWeight: fontWeight.normal },
  "text-sm": { fontSize: "14px", lineHeight: "1.5", fontWeight: fontWeight.normal },
  "text-base": { fontSize: "16px", lineHeight: "1.5", fontWeight: fontWeight.normal },
  "text-lg": { fontSize: "18px", lineHeight: "1.3", fontWeight: fontWeight.semibold },
  "text-xl": { fontSize: "20px", lineHeight: "1.25", fontWeight: fontWeight.semibold },
  "text-2xl": { fontSize: "24px", lineHeight: "1.25", fontWeight: fontWeight.bold },
  "text-display": { fontSize: "30px", lineHeight: "1.2", fontWeight: fontWeight.bold },
};

/** App shell default — matches `html { font-size: 14px }` in globals.css */
export const rootFontSize = "14px";

export const proseMaxWidth = "75ch";

export const typographyCssVariables: CssVariableMap = {
  "--font-family": fontFamily.sans,
  "--font-family-mono": fontFamily.mono,
  "--text-xs": typographyScale["text-xs"].fontSize,
  "--text-sm": typographyScale["text-sm"].fontSize,
  "--text-base": typographyScale["text-base"].fontSize,
  "--text-lg": typographyScale["text-lg"].fontSize,
  "--text-xl": typographyScale["text-xl"].fontSize,
  "--text-2xl": typographyScale["text-2xl"].fontSize,
  "--text-display": typographyScale["text-display"].fontSize,
  "--leading-body": typographyScale["text-sm"].lineHeight,
  "--leading-heading": typographyScale["text-xl"].lineHeight,
  "--font-weight-normal": fontWeight.normal,
  "--font-weight-medium": fontWeight.medium,
  "--font-weight-semibold": fontWeight.semibold,
  "--font-weight-bold": fontWeight.bold,
};
