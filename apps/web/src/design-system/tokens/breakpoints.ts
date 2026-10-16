/**
 * Responsive breakpoints — mobile-first.
 * @see docs/ui-ux/design-system.md#breakpoints
 * @see docs/DEVELOPMENT_STANDARDS.md §1 Mobile-first
 */

import type { BreakpointName } from "../types";

export const breakpointScale: Record<BreakpointName, number> = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 1024,
  xl: 1440,
  "2xl": 1920,
};

/** Min-width media query helpers for programmatic use. */
export const breakpointMin: Record<Exclude<BreakpointName, "xs">, string> = {
  sm: `(min-width: ${breakpointScale.sm}px)`,
  md: `(min-width: ${breakpointScale.md}px)`,
  lg: `(min-width: ${breakpointScale.lg}px)`,
  xl: `(min-width: ${breakpointScale.xl}px)`,
  "2xl": `(min-width: ${breakpointScale["2xl"]}px)`,
};

/** Layout max widths — design-system.md */
export const layoutMaxWidth = {
  shell: "1536px",
  content: "1440px",
  form: "720px",
  drawerDefault: "560px",
  drawerWide: "896px",
  drawerWorkbench: "1152px",
  aiPanel: "400px",
  essColumn: "480px",
} as const;

/** Dashboard grid — HR_DESIGN_SYSTEM_SPECIFICATION.md */
export const dashboardGrid = {
  columns: 12,
  gutterDesktop: "24px",
  gutterTablet: "16px",
  gutterMobile: "16px",
  rowUnit: "80px",
} as const;
