"use client";

import { Suspense } from "react";
import { BusinessSettingsHome } from "@/components/settings/business-settings-home";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

export default function BusinessSettingsPage() {
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto">
      <Suspense fallback={<ContentDataSkeleton />}>
        <BusinessSettingsHome />
      </Suspense>
    </div>
  );
}
