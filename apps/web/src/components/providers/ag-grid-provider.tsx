"use client";

/**
 * Side-effect AG Grid bootstrap — import from grid components only.
 * Do not mount from the admin layout (that pulls ~AG Grid into every route compile).
 */
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

ModuleRegistry.registerModules([AllCommunityModule]);

/** @deprecated Prefer importing this module for side effects; kept for older wrappers. */
export function AgGridSetup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
