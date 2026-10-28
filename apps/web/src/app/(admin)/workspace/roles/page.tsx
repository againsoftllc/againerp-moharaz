"use client";

import { WorkspaceSubTabs, USERS_ACCESS_TABS } from "@/components/workspace/workspace-sub-tabs";
import { WorkspaceRolesPanel } from "@/components/workspace/workspace-roles-panel";

/** Users & Roles › Roles — what each role may open and do. */
export default function SystemRolesPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkspaceSubTabs tabs={USERS_ACCESS_TABS} />
      <div className="flex min-h-0 flex-1 flex-col border border-t-0 border-border">
        <WorkspaceRolesPanel />
      </div>
    </div>
  );
}
