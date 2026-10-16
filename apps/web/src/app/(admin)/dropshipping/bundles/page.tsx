"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useBundleStore } from "@/lib/store/bundle-store";
import { Button } from "@/components/ui/button";
import { BundleGrid } from "@/components/bundles/bundle-grid";

export default function BundlesPage() {
  const [addTrigger, setAddTrigger] = useState(0);
  const count = useBundleStore((s) => s.bundles.length);

  return (
    <div className="flex min-h-[calc(100vh-2.75rem-1.5rem)] flex-col lg:min-h-[calc(100vh-2.75rem-2rem)]">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="page-title">
            Bundles
            <span className="ml-2 text-base font-normal text-muted-foreground">({count})</span>
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Multi-SKU packages with fixed or discounted pricing. Components decrement on sale;
            stock derived from component availability.
          </p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <Button variant="outline" size="sm" onClick={() => toast.info("Import — prototype")}>
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.success("Export started (mock)")}>
            Export
          </Button>
          <Button size="sm" onClick={() => setAddTrigger((n) => n + 1)}>
            + Add Bundle
          </Button>
        </div>
      </div>

      <BundleGrid className="mt-3 min-h-0 flex-1" addTrigger={addTrigger} />

      <Button
        size="sm"
        className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full p-0 shadow-lg sm:hidden"
        onClick={() => setAddTrigger((n) => n + 1)}
        aria-label="Add bundle"
      >
        <Plus className="h-5 w-5" />
      </Button>
    </div>
  );
}
