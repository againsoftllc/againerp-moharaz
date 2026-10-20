"use client";

import { RmaDetailDrawer } from "@/components/rma/rma-detail-drawer";

/** The claim's detail drawer (docs/RMA.md): opened from a list row or `?claim=<id>`. */
export function RmaClaimDrawer({
  ticketId,
  onClose,
  onChanged,
}: {
  ticketId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  return <RmaDetailDrawer ticketId={ticketId} onClose={onClose} onChanged={onChanged} />;
}
