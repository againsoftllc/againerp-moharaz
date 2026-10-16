"use client";

import dynamic from "next/dynamic";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";

const VendorWorkspace = dynamic(
  () => import("@/components/vendors/vendor-workspace").then((m) => m.VendorWorkspace),
  { ssr: false, loading: () => <ListGridOpenFallback label="Opening vendor…" /> },
);

/**
 * Vendor detail as a right-hand drawer over the list — the same workspace as /vendors/[id]
 * (general, terms, credit, order requests, quotations, portal, activity), embedded.
 */
export function VendorDetailDrawer({
  open,
  vendorId,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  vendorId: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  return (
    <Sheet open={open && Boolean(vendorId)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title="Vendor"
        resizable
        closeButton="inside"
        className="flex w-[min(1100px,94vw)] min-w-[320px] max-w-[96vw] flex-col gap-0 rounded-none p-0"
      >
        {vendorId ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-8">
            <VendorWorkspace
              key={vendorId}
              vendorId={vendorId}
              embedded
              onClose={() => onOpenChange(false)}
              onChanged={onChanged}
            />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
