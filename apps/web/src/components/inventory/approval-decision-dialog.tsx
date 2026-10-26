"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ApprovalRequest } from "@/lib/api/approvals";
import { waitingFor } from "@/lib/approvals/format";
import { formatCurrency } from "@/lib/utils";

/**
 * The last look before a request is decided, naming exactly which one: a list can move under the pointer when a new request
 * arrives, and an Approve posts stock or money. Reject also asks why, so the sender sees the reason.
 */
export function ApprovalDecisionDialog({
  mode,
  request,
  busy,
  onClose,
  onConfirm,
}: {
  mode: "approve" | "reject";
  request: ApprovalRequest;
  busy: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const amount = request.amount != null && request.amount !== "" ? formatCurrency(Number(request.amount)) : null;
  const approving = mode === "approve";
  const orderEdit = request.action_key === "sales.order_edit";
  return (
    <div className="pointer-events-auto fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-md border border-border bg-background p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold">
          {approving ? "Approve" : "Reject"} {request.label}
          {request.reference ? ` · ${request.reference}` : ""}?
        </p>
        <div className="mt-2 space-y-0.5 border-l-2 border-[#00a09d] bg-muted/30 px-3 py-1.5 text-[12px]">
          {request.party ? <p className="text-foreground">{request.party}</p> : null}
          {amount ? <p className="text-[14px] font-semibold tabular-nums text-foreground">{amount}</p> : null}
          <p className="text-muted-foreground">
            Requested by {request.requested_by_name || "—"} · waiting {waitingFor(request.requested_at)}
          </p>
          {request.summary ? <p className="text-muted-foreground">{request.summary}</p> : null}
        </div>
        {approving ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {orderEdit
              ? `The order unlocks for ONE edit by ${request.requested_by_name || "the sender"}; it locks again after their next save.`
              : "It is finalized now, as you, and cannot be undone from here."}
          </p>
        ) : (
          <>
            <p className="mt-2 text-xs text-muted-foreground">
              {orderEdit ? "The order stays locked." : "Nothing is posted."} {request.requested_by_name} sees that it was rejected and why.
            </p>
            <textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Reason (optional)"
              className="mt-2 w-full border border-input bg-background px-2 py-1.5 text-[13px] outline-none focus:border-[#00a09d]"
            />
          </>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="outline" className="rounded-none" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button
            size="sm"
            autoFocus={approving}
            className={approving ? "rounded-none bg-emerald-600 text-white hover:bg-emerald-700" : "rounded-none bg-red-600 text-white hover:bg-red-700"}
            onClick={() => onConfirm(note)}
            disabled={busy}
          >
            {busy ? (approving ? "Approving…" : "Rejecting…") : approving ? "Approve" : "Reject"}
          </Button>
        </div>
      </div>
    </div>
  );
}
