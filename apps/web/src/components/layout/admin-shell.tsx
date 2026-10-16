"use client";

import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { NavigationLoadingOverlay } from "@/components/layout/navigation-loading-overlay";

/** @deprecated Use WorkspaceShell — kept for layout import stability.
 * The floating Aladin chat button is no longer shown on every page; Aladin is on its own page (/ai). */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WorkspaceShell>{children}</WorkspaceShell>
      <NavigationLoadingOverlay />
    </>
  );
}
