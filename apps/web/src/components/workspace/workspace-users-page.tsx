"use client";

import { WorkspaceSubTabs, USERS_ACCESS_TABS } from "@/components/workspace/workspace-sub-tabs";
import { WorkspaceUsersPanel } from "@/components/workspace/workspace-users-panel";

/** Configuration › Users & Roles — the team list; Roles is the second tab. */
export function WorkspaceUsersPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkspaceSubTabs tabs={USERS_ACCESS_TABS} />
      <WorkspaceUsersPanel embedded />
    </div>
  );
}
