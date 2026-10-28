"use client";

import { WorkspaceSubTabs, USERS_ACCESS_TABS } from "@/components/workspace/workspace-sub-tabs";
import { WorkspaceApprovalLimitsPanel } from "@/components/workspace/workspace-approval-limits-panel";

/** Users & Roles › Approval Limits — what each role may approve, by document. */
export default function WorkspaceApprovalLimitsPage() {
  return (
    <div>
      <WorkspaceSubTabs tabs={USERS_ACCESS_TABS} />
      <WorkspaceApprovalLimitsPanel embedded />
    </div>
  );
}
