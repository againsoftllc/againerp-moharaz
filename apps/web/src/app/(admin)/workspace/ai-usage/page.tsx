"use client";

import { WorkspaceSubTabs, AI_ASSISTANT_TABS } from "@/components/workspace/workspace-sub-tabs";
import { WorkspaceAiPlanOverview } from "@/components/workspace/workspace-ai-plan-overview";
import { WorkspaceAiUsagePanel } from "@/components/workspace/workspace-ai-usage-panel";

export default function WorkspaceAiUsagePage() {
  return (
    <div>
      <WorkspaceSubTabs tabs={AI_ASSISTANT_TABS} />
      <div className="p-4 pb-0">
        <WorkspaceAiPlanOverview />
      </div>
      <div className="mt-2 border-t border-border">
        <WorkspaceAiUsagePanel />
      </div>
    </div>
  );
}
