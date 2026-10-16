"use client";

import { useEffect } from "react";
import { Boxes } from "lucide-react";
import { formatBdt } from "@/lib/mock-data/configurator-admin";
import type { SavedBuild } from "@/lib/configurator/types";
import { savedBuildToErpInput } from "@/lib/configurator/erp/build-to-erp";
import { ActivityTriggerButton } from "@/components/activity/activity-trigger-button";
import { BuilderErpActions } from "@/components/configurator/erp/builder-erp-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  build: SavedBuild | null;
};

export function ConfiguratorBuildDetailSheet({ open, onOpenChange, build }: Props) {
  useEffect(() => {
    if (!open) return;
  }, [open, build]);

  if (!build) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <div className="flex items-center justify-between border-b border-input pb-3">
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="text-base font-semibold">{build.name}</h2>
              <p className="font-mono text-[11px] text-muted-foreground">{build.buildCode}</p>
            </div>
          </div>
          <ActivityTriggerButton entity={{ type: "configurator_build", id: build.id, label: build.name }} />
        </div>

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="capitalize">{build.status}</Badge>
            <Badge variant={build.compatibilityStatus === "compatible" ? "success" : build.compatibilityStatus === "warning" ? "warning" : "outline"} className="capitalize">
              {build.compatibilityStatus}
            </Badge>
          </div>

          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div><dt className="text-muted-foreground">Profile</dt><dd className="font-medium">{build.profileName}</dd></div>
            <div><dt className="text-muted-foreground">Customer</dt><dd className="font-medium">{build.customerName ?? build.userName ?? "Guest"}</dd></div>
            <div><dt className="text-muted-foreground">Total</dt><dd className="font-medium">{formatBdt(build.totalPrice)}</dd></div>
            <div><dt className="text-muted-foreground">Updated</dt><dd className="font-medium">{build.updatedAt}</dd></div>
          </dl>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Components</p>
            <ul className="mt-2 space-y-1">
              {build.components.map((c, i) => (
                <li key={i} className="rounded border border-input bg-muted/20 px-2 py-1.5 text-[11px]">
                  <span className="font-medium">{c.categoryName}</span>
                  <span className="text-muted-foreground"> — {c.productName ?? "Not selected"} ×{c.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-input bg-muted/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ERP integration</p>
          <div className="mt-2">
            <BuilderErpActions input={savedBuildToErpInput(build)} variant="admin" />
          </div>
        </div>

        <div className="mt-auto border-t border-input pt-4">
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
