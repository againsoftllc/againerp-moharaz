"use client";

import { SpecTemplatesGrid } from "@/components/specifications/spec-templates-grid";

export default function SpecificationTemplatesPage() {
  return (
    <div className="flex min-h-[calc(100vh-2.75rem-1.5rem)] flex-col lg:min-h-[calc(100vh-2.75rem-2rem)]">
      <div className="shrink-0">
        <h1 className="page-title">Templates</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Preset starting points — duplicate into a new profile and customize
        </p>
      </div>
      <div className="mt-4 min-h-0 flex-1">
        <SpecTemplatesGrid />
      </div>
    </div>
  );
}
