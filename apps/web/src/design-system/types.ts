/** Design token primitives — no business logic. */

export type CssVariableName = `--${string}`;

export type CssVariableMap = Record<CssVariableName, string>;

export type ThemeMode = "light" | "dark";

export type BreakpointName = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

export type SpacingTokenName =
  | "space-1"
  | "space-2"
  | "space-3"
  | "space-4"
  | "space-5"
  | "space-6"
  | "space-8"
  | "space-10"
  | "space-12";

export type RadiusTokenName = "radius-sm" | "radius-md" | "radius-lg" | "radius-full" | "radius";

export type ShadowTokenName = "shadow-none" | "shadow-sm" | "shadow-md" | "shadow-lg";

export type TypographySizeToken =
  | "text-xs"
  | "text-sm"
  | "text-base"
  | "text-lg"
  | "text-xl"
  | "text-2xl"
  | "text-display";
