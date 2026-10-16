"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AttributeProfileGrid } from "@/components/attributes/attribute-profile-grid";
import { SpecificationsNav } from "@/components/specifications/specifications-nav";
import { useCatalogAttributeProfiles } from "@/lib/api/use-catalog-attribute-profiles";

export default function SpecificationProfilesPage() {
  const [addTrigger, setAddTrigger] = useState(0);
  const { profiles, groups, attributes, total, loading, refetch } = useCatalogAttributeProfiles();

  return (
    <div className="flex min-h-[calc(100vh-2.75rem-1.5rem)] flex-col lg:min-h-[calc(100vh-2.75rem-2rem)]">
      <div className="shrink-0 space-y-3">
        <div>
          <h1 className="page-title">
            Specification Profiles
            <span className="ml-2 text-base font-normal text-muted-foreground">
              ({loading ? "…" : total})
            </span>
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Profile → Group → Field templates · managed in Profile Builder only
          </p>
        </div>
        <SpecificationsNav />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => toast.info("Import — coming soon")}>
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.info("Export — coming soon")}>
            Export
          </Button>
          <Button size="sm" onClick={() => setAddTrigger((n) => n + 1)}>
            + Add Profile
          </Button>
        </div>
      </div>

      <AttributeProfileGrid
        className="mt-3 min-h-0 flex-1"
        addTrigger={addTrigger}
        profiles={profiles}
        groups={groups}
        attributes={attributes}
        loading={loading}
        onProfilesChanged={() => void refetch()}
      />

      <Button
        size="sm"
        className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full p-0 shadow-lg sm:hidden"
        onClick={() => setAddTrigger((n) => n + 1)}
        aria-label="Add profile"
      >
        <Plus className="h-5 w-5" />
      </Button>
    </div>
  );
}
