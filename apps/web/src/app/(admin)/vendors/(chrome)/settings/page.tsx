"use client";

import { SimpleModuleSettingsForm } from "@/components/workspace/simple-module-settings-form";

export default function VendorsSettingsPage() {
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto">
      <SimpleModuleSettingsForm moduleId="vendors" />
    </div>
  );
}
