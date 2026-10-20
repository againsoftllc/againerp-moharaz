"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { FilterSelect } from "@/components/shared/filter-select";
import {
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AgainDrawerButton,
  AgainDrawerCloseButton,
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
} from "@/components/again/again-drawer";
import {
  AGAIN_FORM_RECORD_TITLE_CLASS,
  AgainFormRow,
  AgainUnderlineInput,
  AgainUnderlineTextarea,
} from "@/components/again/again-form-sheet";
import {
  RECEIPT_OUTCOME_LABEL,
  RECEIPT_STATUS_LABEL,
  RECEIPT_STATUS_TONE,
  cancelRmaReceipt,
  decideRmaReceipt,
  fetchRmaReceiptDoc,
  submitRmaReceipt,
  updateRmaReceipt,
  type RmaReceipt,
  type RmaReceiptOutcome,
} from "@/lib/api/rma-receipts";
import { fetchRmaStores, type RmaStore, type RmaTicket } from "@/lib/api/rma";
import { usePermission } from "@/lib/auth/permissions";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";
import { openRmaReceiveCopy } from "@/lib/rma/rma-print";
import { cn } from "@/lib/utils";

type Form = {
  outcome: RmaReceiptOutcome;
  outcome_note: string;
  received_serial: string;
  supplier_delivery_ref: string;
  received_date: string;
  received_by: string;
  condition_notes: string;
  accessories_received: string;
  warehouse_id: string;
};

const toForm = (r: RmaReceipt): Form => ({
  outcome: r.outcome,
  outcome_note: r.outcome_note ?? "",
  received_serial: r.received_serial ?? "",
  supplier_delivery_ref: r.supplier_delivery_ref ?? "",
  received_date: r.received_date ?? "",
  received_by: r.received_by ?? "",
  condition_notes: r.condition_notes ?? "",
  accessories_received: r.accessories_received ?? "",
  warehouse_id: r.warehouse_id ?? "",
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/**
 * What the supplier sent back for a dispatched claim (docs/RMA.md Stage D), in the common drawer. The received serial
 * starts as the serial that was sent; a different one needs the serial-change permission, must be new to the registry,
 * and is linked to the original (never written over it). Only approving stocks the unit back into the RMA store.
 */
export function RmaReceiptDrawer({
  open,
  onOpenChange,
  receiptId,
  ticket,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptId: string | null;
  ticket: RmaTicket;
  onDone: () => void;
}) {
  const canWrite = useAdminCanWrite();
  const canApprove = usePermission("rma_receive_approve", "write");
  const canChangeSerial = usePermission("rma_serial_change", "write");
  const canReprint = usePermission("rma_reprint", "write");
  const [receipt, setReceipt] = useState<RmaReceipt | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [stores, setStores] = useState<RmaStore[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!receiptId) return;
    try {
      const r = await fetchRmaReceiptDoc(receiptId);
      setReceipt(r);
      setForm(toForm(r));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the receipt");
    }
  }, [receiptId]);

  useEffect(() => {
    setReceipt(null);
    setForm(null);
    setReason("");
    if (!open || !receiptId) return;
    void load();
    void fetchRmaStores()
      .then(setStores)
      .catch(() => setStores([]));
  }, [open, receiptId, load]);

  const status = receipt?.status;
  const editable = canWrite && (status === "draft" || status === "correction_requested");
  const saved = useMemo(() => (receipt ? toForm(receipt) : null), [receipt]);
  const dirty = Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved));
  const serialChanged = Boolean(form && receipt && (form.received_serial || "").trim().toLowerCase() !== (receipt.sent_serial || "").trim().toLowerCase());
  const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<{ form: Form; scrollTop: number }>({
    key: receiptId ? `rma-receipt:${receiptId}` : null,
    ready: Boolean(open && receipt && form),
    dirty,
    getValues: () => ({ form: form as Form, scrollTop: scrollRef.current?.scrollTop ?? 0 }),
    restore: (values) => {
      setForm(values.form);
      pendingScroll.current = values.scrollTop;
    },
    onDiscard: () => receipt && setForm(toForm(receipt)),
    label: "supplier receipt",
  });
  useEffect(() => {
    if (pendingScroll.current == null) return;
    const top = pendingScroll.current;
    pendingScroll.current = null;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top }));
  }, [form]);

  const handleOpenChange = (next: boolean) => {
    if (!next) saveDraftIfDirty();
    onOpenChange(next);
  };

  const patch = (changes: Partial<Form>) => setForm((current) => (current ? { ...current, ...changes } : current));
  const nullable = (v: string) => v.trim() || undefined;

  const run = async (fn: () => Promise<RmaReceipt>, done: string, close = false) => {
    setBusy(true);
    try {
      const next = await fn();
      setReceipt(next);
      setForm(toForm(next));
      clearDraft();
      toast.success(done);
      onDone();
      if (close) onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the receipt");
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    receipt && form
      ? run(
          () =>
            updateRmaReceipt(receipt.id, {
              outcome: form.outcome,
              outcome_note: nullable(form.outcome_note),
              received_serial: form.received_serial,
              supplier_delivery_ref: nullable(form.supplier_delivery_ref),
              received_date: nullable(form.received_date),
              received_by: nullable(form.received_by),
              condition_notes: nullable(form.condition_notes),
              accessories_received: nullable(form.accessories_received),
              warehouse_id: nullable(form.warehouse_id),
            }),
          "Saved",
        )
      : undefined;

  const decide = (decision: "approved" | "rejected" | "correction_requested") => {
    if (!receipt) return;
    if (decision !== "approved" && !reason.trim()) {
      toast.error("Write the reason first — it is kept with the decision.");
      return;
    }
    void run(
      () => decideRmaReceipt(receipt.id, decision, reason.trim() || undefined),
      decision === "approved" ? "Receipt approved — the unit is back in the RMA store" : decision === "rejected" ? "Receipt rejected" : "Sent back for correction",
    );
  };

  const printCopy = async () => {
    if (!receipt) return;
    try {
      const copy = await openRmaReceiveCopy(receipt.id);
      toast.success(copy.reprint ? `${copy.receipt_no} reprinted` : `${copy.receipt_no} copy opened`);
      void load();
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the copy");
    }
  };

  const cancel = () => {
    if (!receipt || !window.confirm(`Cancel receipt ${receipt.receipt_number}?`)) return;
    void run(() => cancelRmaReceipt(receipt.id), "Receipt cancelled", true);
  };

  const canPrint = status && !["draft", "cancelled"].includes(status);
  const reprintBlocked = (receipt?.print_count ?? 0) > 0 && !canReprint;
  const serialLockedForUser = !canChangeSerial;

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={handleOpenChange}
      title="Supplier receipt"
      nested
      resizable
      defaultWidth={600}
      minWidth={400}
      widthStorageKey="again-rma-receipt-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => handleOpenChange(false)} />}>
          {receipt && form ? (
            editable && dirty ? (
              <>
                <AgainDrawerButton variant="primary" onClick={() => void save()} disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </AgainDrawerButton>
                <AgainDrawerButton onClick={() => { clearDraft(); setForm(toForm(receipt)); }} disabled={busy}>
                  Discard
                </AgainDrawerButton>
              </>
            ) : (
              <>
                {(status === "draft" || status === "correction_requested") && (
                  <AgainDrawerButton variant="primary" onClick={() => void run(() => submitRmaReceipt(receipt.id), "Sent for approval")} disabled={busy || !canWrite}>
                    Send for approval
                  </AgainDrawerButton>
                )}
                {status === "pending_approval" && (
                  <>
                    <AgainDrawerButton variant="primary" onClick={() => decide("approved")} disabled={busy || !canApprove} title={canApprove ? undefined : "Needs the receipt approval permission"}>
                      Approve &amp; receive
                    </AgainDrawerButton>
                    <AgainDrawerButton onClick={() => decide("correction_requested")} disabled={busy || !canApprove}>
                      Return for correction
                    </AgainDrawerButton>
                    <AgainDrawerButton variant="danger" onClick={() => decide("rejected")} disabled={busy || !canApprove}>
                      Reject
                    </AgainDrawerButton>
                  </>
                )}
                {canPrint && (
                  <AgainDrawerButton onClick={() => void printCopy()} disabled={reprintBlocked} title={reprintBlocked ? "Reprinting needs the RMA reprint permission" : undefined}>
                    {(receipt.print_count ?? 0) > 0 ? "Reprint copy" : "Print copy"}
                  </AgainDrawerButton>
                )}
                {canWrite && ["draft", "correction_requested", "pending_approval"].includes(receipt.status) && (
                  <AgainDrawerButton onClick={cancel} disabled={busy}>
                    Cancel receipt
                  </AgainDrawerButton>
                )}
              </>
            )
          ) : null}
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS} scrollRef={scrollRef}>
          {!receipt || !form ? (
            <div className="space-y-3" aria-hidden>
              <div className="fb-shimmer h-8 w-56 rounded" />
              <div className="fb-shimmer h-32 w-full rounded" />
            </div>
          ) : (
            <div className="@container space-y-5">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={cn(AGAIN_FORM_RECORD_TITLE_CLASS, "font-mono")}>{receipt.receipt_number}</h2>
                  <Badge variant="outline" className={cn("rounded-none text-[10px]", RECEIPT_STATUS_TONE[receipt.status])}>
                    {RECEIPT_STATUS_LABEL[receipt.status]}
                  </Badge>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  For {ticket.rma_number} · from {receipt.supplier_name} · {ticket.product_name || ticket.sku}
                </p>
                {dirty ? <p className="text-[11px] text-muted-foreground">Unsaved changes</p> : null}
              </div>

              {receipt.status === "correction_requested" && receipt.decision_reason ? (
                <p className="border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-[12px]">
                  <span className="font-semibold">Sent back for correction:</span> {receipt.decision_reason}
                </p>
              ) : null}
              {receipt.status === "rejected" && receipt.decision_reason ? (
                <p className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px]">
                  <span className="font-semibold">Rejected:</span> {receipt.decision_reason}. Nothing was stocked.
                </p>
              ) : null}
              {receipt.status === "approved" ? (
                <p className="border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[12px]">
                  Approved {receipt.decided_at?.slice(0, 16).replace("T", " ")} by {receipt.decided_by_name}. The unit is back in the RMA store.
                </p>
              ) : null}

              <Section title="What came back">
                <AgainFormRow label="Outcome">
                  <FilterSelect
                    value={form.outcome}
                    onChange={(v) => patch({ outcome: v as RmaReceiptOutcome })}
                    width="w-full"
                    avoidCollisions
                    ariaLabel="Outcome"
                    disabled={!editable}
                    options={(Object.keys(RECEIPT_OUTCOME_LABEL) as RmaReceiptOutcome[]).map((o) => ({ value: o, label: RECEIPT_OUTCOME_LABEL[o] }))}
                  />
                </AgainFormRow>
                <AgainFormRow label="Serial sent">
                  <AgainUnderlineInput value={receipt.sent_serial ?? ""} readOnly />
                </AgainFormRow>
                <AgainFormRow label="Serial received">
                  <AgainUnderlineInput
                    value={form.received_serial}
                    onChange={(v) => patch({ received_serial: v })}
                    readOnly={!editable}
                    placeholder={receipt.sent_serial ?? "Serial on the unit"}
                  />
                </AgainFormRow>
                {editable ? (
                  <p className={cn("text-[11px]", serialChanged ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                    {serialChanged
                      ? serialLockedForUser
                        ? "A different serial needs the RMA serial-change permission to save. It must also be new to the registry."
                        : "A different serial: the original is kept and linked to this one. It must be new to the registry."
                      : "Same as the serial that was sent. Type another only if the supplier sent a different unit."}
                  </p>
                ) : null}
                <AgainFormRow label="Outcome note">
                  <AgainUnderlineTextarea value={form.outcome_note} onChange={(v) => patch({ outcome_note: v })} rows={2} readOnly={!editable} placeholder="What the supplier did / said" />
                </AgainFormRow>
              </Section>

              <Section title="Receipt">
                <div className="grid gap-x-8 @md:grid-cols-2">
                  <AgainFormRow label="Delivery ref.">
                    <AgainUnderlineInput value={form.supplier_delivery_ref} onChange={(v) => patch({ supplier_delivery_ref: v })} readOnly={!editable} placeholder="Supplier challan / courier ref" />
                  </AgainFormRow>
                  <AgainFormRow label="Received date">
                    <input
                      type="date"
                      value={form.received_date}
                      disabled={!editable}
                      onChange={(e) => patch({ received_date: e.target.value })}
                      className="h-8 w-full border-0 border-b border-input bg-transparent text-[13px] outline-none disabled:opacity-70"
                    />
                  </AgainFormRow>
                  <AgainFormRow label="Received by">
                    <AgainUnderlineInput value={form.received_by} onChange={(v) => patch({ received_by: v })} readOnly={!editable} placeholder="Staff name" />
                  </AgainFormRow>
                  <AgainFormRow label="Into RMA store">
                    <FilterSelect
                      value={form.warehouse_id}
                      onChange={(v) => patch({ warehouse_id: v })}
                      width="w-full"
                      avoidCollisions
                      ariaLabel="RMA store"
                      disabled={!editable}
                      placeholder="Choose the RMA store…"
                      options={stores.map((s) => ({ value: s.id, label: s.name }))}
                    />
                  </AgainFormRow>
                </div>
                <AgainFormRow label="Condition">
                  <AgainUnderlineInput value={form.condition_notes} onChange={(v) => patch({ condition_notes: v })} readOnly={!editable} placeholder="Condition on arrival" />
                </AgainFormRow>
                <AgainFormRow label="Accessories">
                  <AgainUnderlineInput value={form.accessories_received} onChange={(v) => patch({ accessories_received: v })} readOnly={!editable} placeholder="Box, cable, adapter…" />
                </AgainFormRow>
              </Section>

              {status === "pending_approval" ? (
                <Section title="Decision">
                  <AgainFormRow label="Reason">
                    <AgainUnderlineTextarea value={reason} onChange={setReason} rows={2} placeholder="Required to reject or return for correction" />
                  </AgainFormRow>
                  <p className="text-[11px] text-muted-foreground">
                    Approving brings the unit from Supplier / In Transit into the chosen RMA store, once. Rejecting or sending back creates no stock.
                  </p>
                </Section>
              ) : null}
            </div>
          )}
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
