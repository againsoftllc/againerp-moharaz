"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_TONE,
  cancelRmaClaim,
  decideRmaClaim,
  dispatchRmaClaim,
  fetchRmaClaim,
  submitRmaClaim,
  updateRmaClaim,
  type RmaClaim,
} from "@/lib/api/rma-claims";
import type { RmaTicket } from "@/lib/api/rma";
import { usePermission } from "@/lib/auth/permissions";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";
import { openRmaClaimCopy } from "@/lib/rma/rma-print";
import { cn } from "@/lib/utils";

type Form = {
  problem: string;
  diagnosis: string;
  accessories_sent: string;
  notes: string;
  dispatch_date: string;
  courier: string;
  tracking_number: string;
  expected_return_date: string;
};

const toForm = (c: RmaClaim): Form => ({
  problem: c.problem ?? "",
  diagnosis: c.diagnosis ?? "",
  accessories_sent: c.accessories_sent ?? "",
  notes: c.notes ?? "",
  dispatch_date: c.dispatch_date ?? "",
  courier: c.courier ?? "",
  tracking_number: c.tracking_number ?? "",
  expected_return_date: c.expected_return_date ?? "",
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Auto({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex gap-3 py-[3px] text-[13px]">
      <span className="w-[8.5rem] shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">
        {value || "—"}
        <span className="ml-2 rounded-none border border-border px-1 text-[9px] uppercase text-muted-foreground">auto</span>
      </span>
    </div>
  );
}

function DateInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <input
      type="date"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full border-0 border-b border-input bg-transparent text-[13px] outline-none disabled:opacity-70"
    />
  );
}

/**
 * One supplier claim (docs/RMA.md Stage C), in the common drawer. Supplier, serial and purchase invoice are copied from
 * the RMA and read-only; the claim text, accessories and dispatch details are the editable part. Approving the claim and
 * dispatching the unit are separate steps — dispatch is what moves the unit out of the RMA store.
 */
export function RmaSupplierClaimDrawer({
  open,
  onOpenChange,
  claimId,
  ticket,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claimId: string | null;
  ticket: RmaTicket;
  onDone: () => void;
}) {
  const canWrite = useAdminCanWrite();
  // the Approve permission on RMA (Workspace › Roles) decides every RMA document, as it does in the other modules
  const holdsRmaApprove = usePermission("rma", "approve");
  const canApprove = usePermission("rma_claim_approve", "write") || holdsRmaApprove;
  const canDispatch = usePermission("rma_dispatch", "write");
  const canReprint = usePermission("rma_reprint", "write");
  const [claim, setClaim] = useState<RmaClaim | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!claimId) return;
    try {
      const c = await fetchRmaClaim(claimId);
      setClaim(c);
      setForm(toForm(c));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the claim");
    }
  }, [claimId]);

  useEffect(() => {
    setClaim(null);
    setForm(null);
    setReason("");
    if (open && claimId) void load();
  }, [open, claimId, load]);

  const status = claim?.status;
  const editable = canWrite && (status === "draft" || status === "correction_requested");
  const dispatching = canDispatch && status === "approved";
  const saved = useMemo(() => (claim ? toForm(claim) : null), [claim]);
  const dirty = Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved));
  const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<{ form: Form; scrollTop: number }>({
    key: claimId ? `rma-claim:${claimId}` : null,
    ready: Boolean(open && claim && form),
    dirty,
    getValues: () => ({ form: form as Form, scrollTop: scrollRef.current?.scrollTop ?? 0 }),
    restore: (values) => {
      setForm(values.form);
      pendingScroll.current = values.scrollTop;
    },
    onDiscard: () => claim && setForm(toForm(claim)),
    label: "supplier claim",
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

  const run = async (fn: () => Promise<RmaClaim>, done: string, close = false) => {
    setBusy(true);
    try {
      const next = await fn();
      setClaim(next);
      setForm(toForm(next));
      clearDraft();
      toast.success(done);
      onDone();
      if (close) onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the claim");
    } finally {
      setBusy(false);
    }
  };

  // Saving a draft finalizes it, as in Sales: an approver's claim is approved, anyone else's is sent for approval
  const save = () => {
    if (!claim || !form) return undefined;
    const finalizes = claim.status === "draft" || claim.status === "correction_requested";
    return run(
      async () => {
        let next = dirty
          ? await updateRmaClaim(claim.id, {
              problem: form.problem,
              diagnosis: nullable(form.diagnosis),
              accessories_sent: nullable(form.accessories_sent),
              notes: nullable(form.notes),
              dispatch_date: nullable(form.dispatch_date),
              courier: nullable(form.courier),
              tracking_number: nullable(form.tracking_number),
              expected_return_date: nullable(form.expected_return_date),
            })
          : claim;
        if (finalizes) next = await (canApprove ? decideRmaClaim(next.id, "approved") : submitRmaClaim(next.id));
        return next;
      },
      !finalizes ? "Saved" : canApprove ? "Claim approved" : "Sent for approval",
    );
  };

  const decide = (decision: "approved" | "rejected" | "correction_requested") => {
    if (!claim) return;
    if (decision !== "approved" && !reason.trim()) {
      toast.error("Write the reason first — it is kept with the decision.");
      return;
    }
    void run(() => decideRmaClaim(claim.id, decision, reason.trim() || undefined), decision === "approved" ? "Claim approved" : decision === "rejected" ? "Claim rejected" : "Sent back for correction");
  };

  const dispatch = () => {
    if (!claim || !form) return;
    void run(
      () =>
        dispatchRmaClaim(claim.id, {
          dispatch_date: nullable(form.dispatch_date),
          courier: nullable(form.courier),
          tracking_number: nullable(form.tracking_number),
          expected_return_date: nullable(form.expected_return_date),
          note: nullable(form.notes),
        }),
      "Dispatched — the unit is now with the supplier",
    );
  };

  const cancel = () => {
    if (!claim || !window.confirm(`Cancel claim ${claim.claim_number}?`)) return;
    void run(() => cancelRmaClaim(claim.id), "Claim cancelled", true);
  };

  const printCopy = async () => {
    if (!claim) return;
    try {
      const copy = await openRmaClaimCopy(claim.id);
      toast.success(copy.reprint ? `${copy.claim_no} reprinted` : `${copy.claim_no} copy opened`);
      void load();
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the copy");
    }
  };

  const canPrint = status && !["draft", "cancelled"].includes(status);
  const reprintBlocked = (claim?.print_count ?? 0) > 0 && !canReprint;

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={handleOpenChange}
      title="Supplier claim"
      nested
      resizable
      defaultWidth={600}
      minWidth={400}
      widthStorageKey="again-rma-supplier-claim-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => handleOpenChange(false)} />}>
          {claim && form ? (
            editable && dirty ? (
              <>
                <AgainDrawerButton variant="primary" onClick={() => void save()} disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </AgainDrawerButton>
                <AgainDrawerButton onClick={() => { clearDraft(); setForm(toForm(claim)); }} disabled={busy}>
                  Discard
                </AgainDrawerButton>
              </>
            ) : (
              <>
                {(status === "draft" || status === "correction_requested") && (
                  <AgainDrawerButton variant="primary" onClick={() => void save()} disabled={busy || !canWrite}>
                    {busy ? "Saving…" : "Save"}
                  </AgainDrawerButton>
                )}
                {status === "pending_approval" && (
                  <>
                    <AgainDrawerButton variant="primary" onClick={() => decide("approved")} disabled={busy || !canApprove} title={canApprove ? undefined : "Needs the claim approval permission"}>
                      Approve
                    </AgainDrawerButton>
                    <AgainDrawerButton onClick={() => decide("correction_requested")} disabled={busy || !canApprove}>
                      Return for correction
                    </AgainDrawerButton>
                    <AgainDrawerButton variant="danger" onClick={() => decide("rejected")} disabled={busy || !canApprove}>
                      Reject
                    </AgainDrawerButton>
                  </>
                )}
                {status === "approved" && (
                  <AgainDrawerButton variant="primary" onClick={dispatch} disabled={busy || !canDispatch} title={canDispatch ? undefined : "Needs the dispatch permission"}>
                    Dispatch to supplier
                  </AgainDrawerButton>
                )}
                {canPrint && (
                  <AgainDrawerButton onClick={() => void printCopy()} disabled={reprintBlocked} title={reprintBlocked ? "Reprinting needs the RMA reprint permission" : undefined}>
                    {(claim.print_count ?? 0) > 0 ? "Reprint copy" : "Print copy"}
                  </AgainDrawerButton>
                )}
                {canWrite && ["draft", "correction_requested", "pending_approval", "approved"].includes(claim.status) && (
                  <AgainDrawerButton onClick={cancel} disabled={busy}>
                    Cancel claim
                  </AgainDrawerButton>
                )}
              </>
            )
          ) : null}
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS} scrollRef={scrollRef}>
          {!claim || !form ? (
            <div className="space-y-3" aria-hidden>
              <div className="fb-shimmer h-8 w-56 rounded" />
              <div className="fb-shimmer h-32 w-full rounded" />
            </div>
          ) : (
            <div className="@container space-y-5">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={cn(AGAIN_FORM_RECORD_TITLE_CLASS, "font-mono")}>{claim.claim_number}</h2>
                  <Badge variant="outline" className={cn("rounded-none text-[10px]", CLAIM_STATUS_TONE[claim.status])}>
                    {CLAIM_STATUS_LABEL[claim.status]}
                  </Badge>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  For {ticket.rma_number} · {claim.product_name || claim.sku}
                  {claim.serial_number ? ` · S/N ${claim.serial_number}` : ""}
                </p>
                {dirty ? <p className="text-[11px] text-muted-foreground">Unsaved changes</p> : null}
              </div>

              {claim.status === "correction_requested" && claim.decision_reason ? (
                <p className="border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-[12px]">
                  <span className="font-semibold">Sent back for correction:</span> {claim.decision_reason}
                </p>
              ) : null}
              {claim.status === "rejected" && claim.decision_reason ? (
                <p className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px]">
                  <span className="font-semibold">Rejected:</span> {claim.decision_reason}
                </p>
              ) : null}
              {claim.status === "dispatched" ? (
                <p className="border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[12px]">
                  Dispatched {claim.dispatched_at?.slice(0, 16).replace("T", " ")} by {claim.dispatched_by_name}. The unit is out of the RMA store and with the supplier.
                </p>
              ) : null}

              <Section title="Supplier and purchase (from the serial)">
                <Auto label="Supplier" value={claim.supplier_name} />
                <Auto label="Serial" value={claim.serial_number} />
                <Auto label="Product" value={claim.product_name ? `${claim.product_name}${claim.sku ? ` (${claim.sku})` : ""}` : claim.sku} />
                <Auto label="Purchase receipt" value={claim.purchase_receipt_no} />
                {claim.vendor_invoice_no ? <Auto label="Vendor invoice" value={claim.vendor_invoice_no} /> : null}
              </Section>

              <Section title="Claim">
                <AgainFormRow label="Problem">
                  <AgainUnderlineTextarea value={form.problem} onChange={(v) => patch({ problem: v })} rows={2} readOnly={!editable} />
                </AgainFormRow>
                <AgainFormRow label="Diagnosis">
                  <AgainUnderlineTextarea value={form.diagnosis} onChange={(v) => patch({ diagnosis: v })} rows={2} readOnly={!editable} placeholder="What the check found" />
                </AgainFormRow>
                <AgainFormRow label="Accessories sent">
                  <AgainUnderlineInput value={form.accessories_sent} onChange={(v) => patch({ accessories_sent: v })} readOnly={!editable} placeholder="Box, cable, adapter…" />
                </AgainFormRow>
              </Section>

              <Section title="Dispatch">
                <div className="grid gap-x-8 @md:grid-cols-2">
                  <AgainFormRow label="Dispatch date">
                    <DateInput value={form.dispatch_date} onChange={(v) => patch({ dispatch_date: v })} disabled={!(editable || dispatching)} />
                  </AgainFormRow>
                  <AgainFormRow label="Expected back">
                    <DateInput value={form.expected_return_date} onChange={(v) => patch({ expected_return_date: v })} disabled={!(editable || dispatching)} />
                  </AgainFormRow>
                  <AgainFormRow label="Courier">
                    <AgainUnderlineInput value={form.courier} onChange={(v) => patch({ courier: v })} readOnly={!(editable || dispatching)} placeholder="Courier or hand delivery" />
                  </AgainFormRow>
                  <AgainFormRow label="Tracking no.">
                    <AgainUnderlineInput value={form.tracking_number} onChange={(v) => patch({ tracking_number: v })} readOnly={!(editable || dispatching)} />
                  </AgainFormRow>
                </div>
                <AgainFormRow label="Notes">
                  <AgainUnderlineTextarea value={form.notes} onChange={(v) => patch({ notes: v })} rows={2} readOnly={!(editable || dispatching)} />
                </AgainFormRow>
                {status === "approved" && !canDispatch ? (
                  <p className="text-[11px] text-muted-foreground">Dispatching needs the RMA dispatch permission.</p>
                ) : null}
              </Section>

              {status === "pending_approval" ? (
                <Section title="Decision">
                  <AgainFormRow label="Reason">
                    <AgainUnderlineTextarea value={reason} onChange={setReason} rows={2} placeholder="Required to reject or return for correction" />
                  </AgainFormRow>
                </Section>
              ) : null}

              {claim.decision === "approved" ? (
                <Section title="Approval">
                  <div className="text-[13px]">
                    Approved by {claim.decided_by_name} · {claim.decided_at?.slice(0, 16).replace("T", " ")}
                  </div>
                </Section>
              ) : null}
            </div>
          )}
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
