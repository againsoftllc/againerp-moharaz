"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { WorkspaceEmptyState } from "@/components/workspace/states/empty-state";
import { WorkspaceLoadingState } from "@/components/workspace/states/loading-state";

function ModulePlaceholderContent() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "dashboard";

  const titles: Record<string, { title: string; description: string }> = {
    dashboard: {
      title: "Module Dashboard",
      description: "Module KPI widgets render here via WS-CONTENT-DASH — data from module APIs only.",
    },
    operations: {
      title: "Operations",
      description: "Standard list + drawer CRUD (?create=1 · ?view= · ?edit=) for module entities.",
    },
    reports: {
      title: "Reports",
      description: "LAYOUT-ANALYTICS — charts, filters, and export actions.",
    },
    settings: {
      title: "Settings",
      description: "LAYOUT-SETTINGS — module configuration sections.",
    },
  };

  const meta = titles[tab] ?? titles.dashboard;

  return (
    <div className="space-y-4" data-layout="LAYOUT-MODULE">
      <div>
        <h1 className="page-title">{meta.title}</h1>
        <p className="page-subtitle">Zone D · Module content slot · {tab}</p>
      </div>
      <WorkspaceEmptyState
        title={`${meta.title} placeholder`}
        description={meta.description}
        actionLabel="View list prototype"
        onAction={() => {
          window.location.href = "/website/products";
        }}
      />
    </div>
  );
}

/** Generic module Zone D placeholder for shell validation. */
export function ModulePlaceholder() {
  return (
    <Suspense fallback={<WorkspaceLoadingState />}>
      <ModulePlaceholderContent />
    </Suspense>
  );
}
