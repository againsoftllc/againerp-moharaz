"use client";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { RmaWorkspace } from "@/components/rma/rma-workspace";

export function RmaClaimDrawer({
  ticketId,
  onClose,
  onChanged,
}: {
  ticketId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  return (
    <Sheet open={Boolean(ticketId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        closeButton="inside"
        resizable
        className="flex min-w-[160px] w-[640px] max-w-[720px] flex-col p-0"
        onInteractOutside={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          const otherContent = target.closest("[data-radix-dialog-content]");
          if (otherContent && otherContent !== event.currentTarget) {
            event.preventDefault();
            return;
          }
          if (
            target.closest("[data-radix-dialog-overlay]") &&
            document.querySelectorAll("[data-radix-dialog-overlay]").length > 1
          ) {
            event.preventDefault();
          }
        }}
      >
        {ticketId ? (
          <RmaWorkspace key={ticketId} ticketId={ticketId} embedded onChanged={onChanged} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
