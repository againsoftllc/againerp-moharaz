"use client";

import { ThemeProvider } from "@/components/theme/theme-provider";

/** Admin / login only — storefront must not mount ThemeProvider (avoids dark flash). */
export function AdminThemeShell({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
