"use client";

import { SimpleModuleSettingsForm } from "@/components/workspace/simple-module-settings-form";
import { WorkspaceSubTabs, USERS_ACCESS_TABS } from "@/components/workspace/workspace-sub-tabs";

/** Users & Roles › Security — the company's sign-in rules (wrong-password lock, password expiry). */
export default function WorkspaceSecurityPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WorkspaceSubTabs tabs={USERS_ACCESS_TABS} />
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto">
        <SimpleModuleSettingsForm moduleId="security" />
      </div>
    </div>
  );
}
