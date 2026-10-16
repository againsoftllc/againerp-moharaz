"use client";

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { semanticColorTokens } from "@/design-system/tokens/colors";
import { cn } from "@/lib/utils";

/** Semantic surface variants — token-driven, theme-aware via CSS variables. */
export type ThemedSurfaceVariant =
  | "background"
  | "surface"
  | "surfaceRaised"
  | "primary"
  | "primarySubtle"
  | "muted"
  | "ai";

const SURFACE_STYLES: Record<ThemedSurfaceVariant, CSSProperties> = {
  background: {
    backgroundColor: `var(--${semanticColorTokens.background})`,
    color: `var(--${semanticColorTokens.text})`,
  },
  surface: {
    backgroundColor: `var(--${semanticColorTokens.surface})`,
    color: `var(--${semanticColorTokens.text})`,
    borderColor: `var(--${semanticColorTokens.border})`,
  },
  surfaceRaised: {
    backgroundColor: `var(--${semanticColorTokens.surfaceRaised})`,
    color: `var(--${semanticColorTokens.text})`,
    borderColor: `var(--${semanticColorTokens.border})`,
  },
  primary: {
    backgroundColor: `var(--${semanticColorTokens.primary})`,
    color: `var(--${semanticColorTokens.primaryForeground})`,
  },
  primarySubtle: {
    backgroundColor: `var(--${semanticColorTokens.primarySubtle})`,
    color: `var(--${semanticColorTokens.text})`,
    borderColor: `var(--${semanticColorTokens.border})`,
  },
  muted: {
    backgroundColor: "var(--muted)",
    color: "var(--muted-foreground)",
  },
  ai: {
    backgroundColor: "var(--ai-accent-bg)",
    color: "var(--ai-accent-fg)",
    borderColor: "var(--ai-accent-border)",
  },
};

type ThemedSurfaceProps = HTMLAttributes<HTMLDivElement> & {
  variant?: ThemedSurfaceVariant;
  bordered?: boolean;
  children: ReactNode;
};

/**
 * Theme-aware surface — reads semantic CSS variables (light/dark via ThemeProvider).
 * Use instead of hardcoded `bg-violet-50 dark:bg-violet-950` for token-compliant panels.
 */
export function ThemedSurface({
  variant = "surface",
  bordered = false,
  className,
  style,
  children,
  ...props
}: ThemedSurfaceProps) {
  return (
    <div
      className={cn(bordered && "border", className)}
      style={{ ...SURFACE_STYLES[variant], ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

/** Read a computed CSS variable at runtime (client only). */
export function useThemeToken(variableName: `--${string}`, fallback = ""): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
}
