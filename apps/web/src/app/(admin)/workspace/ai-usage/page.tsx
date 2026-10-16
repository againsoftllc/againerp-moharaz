"use client";

import { WorkspaceAiPlanOverview } from "@/components/workspace/workspace-ai-plan-overview";
import { WorkspaceAiUsagePanel } from "@/components/workspace/workspace-ai-usage-panel";

export default function WorkspaceAiUsagePage() {
  return (
    <div>
      <div className="p-4 pb-0">
        <WorkspaceAiPlanOverview />
      </div>
      <div className="mt-2 border-t border-border">
        <WorkspaceAiUsagePanel />
      </div>
    </div>
  );
}
