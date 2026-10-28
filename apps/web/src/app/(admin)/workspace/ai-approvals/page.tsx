"use client";

import { WorkspaceSubTabs, AI_ASSISTANT_TABS } from "@/components/workspace/workspace-sub-tabs";
import { WorkspaceAiApprovalsPanel } from "@/components/workspace/workspace-ai-approvals-panel";

export default function WorkspaceAiApprovalsPage() {
  return (
    <div>
      <WorkspaceSubTabs tabs={AI_ASSISTANT_TABS} />
      <WorkspaceAiApprovalsPanel />
    </div>
  );
}
