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
  DELIVERY_STATUS_LABEL,
  DELIVERY_STATUS_TONE,
  cancelRmaDelivery,
  decideRmaDelivery,
  fetchRmaDelivery,
  fetchRmaDeliverySummary,
  submitRmaDelivery,
  updateRmaDelivery,
  type RmaDelivery,
  type RmaDeliverySummary,
} from "@/lib/api/rma-deliveries";
import type { RmaTicket } from "@/lib/api/rma";
import { usePermission } from "@/lib/auth/permissions";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";
import { openRmaDeliveryCopy } from "@/lib/rma/rma-print";
import { cn, formatCurrency } from "@/lib/utils";

type Form = {
  delivery_date: string;
  delivered_to: string;
  notes: string;
};

const toForm = (d: RmaDelivery): Form => ({
  delivery_date: d.delivery_date ?? "",
  delivered_to: d.delivered_to ?? "",
  notes: d.notes ?? "",
});

const money = (v: number | string) => formatCurrency(Number(v) || 0);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Customer delivery (docs/RMA.md Stage E), in the common drawer: the hand-over of the unit only. Money (a payment, a refund,
 * an amount owed) is a separate RMA Settlement, so a delivery never posts a payment and a payment never hands the product over.
 * Approving takes the unit out of the RMA store and completes the RMA; any charges are invoiced once, unpaid.
 */
export function RmaDeliveryDrawer({
  open,
  onOpenChange,
  deliveryId,
  ticket,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveryId: string | null;
  ticket: RmaTicket;
  onDone: () => void;
}) {
  const canWrite = useAdminCanWrite();
  const canApprove = usePermission("rma_delivery_approve", "write");
  const canReprint = usePermission("rma_reprint", "write");
  const [delivery, setDelivery] = useState<RmaDelivery | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [summary, setSummary] = useState<RmaDeliverySummary | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!deliveryId) return;
    try {
      const [d, s] = await Promise.all([fetchRmaDelivery(deliveryId), fetchRmaDeliverySummary(ticket.id)]);
      setDelivery(d);
      setForm(toForm(d));
      setSummary(s);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the delivery");
    }
  }, [deliveryId, ticket.id]);

  useEffect(() => {
    setDelivery(null);
    setForm(null);
    setReason("");
    if (!open || !deliveryId) return;
    void load();
  }, [open, deliveryId, load]);

  const status = delivery?.status;
  const editable = canWrite && (status === "draft" || status === "correction_requested");
  const saved = useMemo(() => (delivery ? toForm(delivery) : null), [delivery]);
  const dirty = Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved));
  const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<{ form: Form; scrollTop: number }>({
    key: deliveryId ? `rma-delivery:${deliveryId}` : null,
    ready: Boolean(open && delivery && form),
    dirty,
    getValues: () => ({ form: form as Form, scrollTop: scrollRef.current?.scrollTop ?? 0 }),
    restore: (values) => {
      setForm(values.form);
      pendingScroll.current = values.scrollTop;
    },
    onDiscard: () => delivery && setForm(toForm(delivery)),
    label: "delivery",
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
  const outstanding = Number(summary?.outstanding ?? 0);
  const total = Number(summary?.total ?? 0);

  const nullable = (v: string) => v.trim() || undefined;

  const run = async (fn: () => Promise<RmaDelivery>, done: string, close = false) => {
    setBusy(true);
    try {
      const next = await fn();
      setDelivery(next);
      setForm(toForm(next));
      clearDraft();
      toast.success(done);
      onDone();
      void fetchRmaDeliverySummary(ticket.id).then(setSummary).catch(() => undefined);
      if (close) onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the delivery");
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    delivery && form
      ? run(
          () =>
            updateRmaDelivery(delivery.id, {
              delivery_date: nullable(form.delivery_date),
              delivered_to: nullable(form.delivered_to),
              notes: nullable(form.notes),
            }),
          "Saved",
        )
      : undefined;

  const decide = (decision: "approved" | "rejected" | "correction_requested") => {
    if (!delivery) return;
    if (decision !== "approved" && !reason.trim()) {
      toast.error("Write the reason first — it is kept with the decision.");
      return;
    }
    void run(
      () => decideRmaDelivery(delivery.id, decision, reason.trim() || undefined),
      decision === "approved" ? "Delivery approved and posted" : decision === "rejected" ? "Delivery rejected" : "Sent back for correction",
    );
  };

  const printCopy = async () => {
    if (!delivery) return;
    try {
      const copy = await openRmaDeliveryCopy(delivery.id);
      toast.success(copy.reprint ? `${copy.delivery_no} reprinted` : `${copy.delivery_no} copy opened`);
      void load();
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the copy");
    }
  };

  const cancel = () => {
    if (!delivery || !window.confirm(`Cancel ${delivery.delivery_number}?`)) return;
    void run(() => cancelRmaDelivery(delivery.id), "Delivery cancelled", true);
  };

  const canPrint = status && !["draft", "cancelled"].includes(status);
  const reprintBlocked = (delivery?.print_count ?? 0) > 0 && !canReprint;
  // Only while the delivery can still change: once approved, "already delivered" is the result, not a problem.
  const blocker = status && ["draft", "correction_requested", "pending_approval"].includes(status) ? (summary?.deliver_blocker ?? null) : null;

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={handleOpenChange}
      title="Customer delivery"
      nested
      resizable
      defaultWidth={620}
      minWidth={420}
      widthStorageKey="again-rma-delivery-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => handleOpenChange(false)} />}>
          {delivery && form ? (
            editable && dirty ? (
              <>
                <AgainDrawerButton variant="primary" onClick={() => void save()} disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </AgainDrawerButton>
                <AgainDrawerButton onClick={() => { clearDraft(); setForm(toForm(delivery)); }} disabled={busy}>
                  Discard
                </AgainDrawerButton>
              </>
            ) : (
              <>
                {(status === "draft" || status === "correction_requested") && (
                  <AgainDrawerButton variant="primary" onClick={() => void run(() => submitRmaDelivery(delivery.id), "Sent for approval")} disabled={busy || !canWrite}>
                    Send for approval
                  </AgainDrawerButton>
                )}
                {status === "pending_approval" && (
                  <>
                    <AgainDrawerButton variant="primary" onClick={() => decide("approved")} disabled={busy || !canApprove} title={canApprove ? undefined : "Needs the delivery approval permission"}>
                      Approve &amp; post
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
                    {(delivery.print_count ?? 0) > 0 ? "Reprint copy" : "Print copy"}
                  </AgainDrawerButton>
                )}
                {canWrite && ["draft", "correction_requested", "pending_approval"].includes(delivery.status) && (
                  <AgainDrawerButton onClick={cancel} disabled={busy}>
                    Cancel
                  </AgainDrawerButton>
                )}
              </>
            )
          ) : null}
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS} scrollRef={scrollRef}>
          {!delivery || !form || !summary ? (
            <div className="space-y-3" aria-hidden>
              <div className="fb-shimmer h-8 w-56 rounded" />
              <div className="fb-shimmer h-32 w-full rounded" />
            </div>
          ) : (
            <div className="@container space-y-5">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={cn(AGAIN_FORM_RECORD_TITLE_CLASS, "font-mono")}>{delivery.delivery_number}</h2>
                  <Badge variant="outline" className={cn("rounded-none text-[10px]", DELIVERY_STATUS_TONE[delivery.status])}>
                    {DELIVERY_STATUS_LABEL[delivery.status]}
                  </Badge>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  For {ticket.rma_number} · {ticket.customer_name} · {ticket.product_name || ticket.sku}
                  {summary.held_serial ? ` · S/N ${summary.held_serial}` : ""}
                </p>
                {dirty ? <p className="text-[11px] text-muted-foreground">Unsaved changes</p> : null}
              </div>

              {delivery.status === "correction_requested" && delivery.decision_reason ? (
                <p className="border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-[12px]">
                  <span className="font-semibold">Sent back for correction:</span> {delivery.decision_reason}
                </p>
              ) : null}
              {delivery.status === "rejected" && delivery.decision_reason ? (
                <p className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px]">
                  <span className="font-semibold">Rejected:</span> {delivery.decision_reason}. Nothing was posted.
                </p>
              ) : null}
              {delivery.status === "approved" ? (
                <p className="border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[12px]">
                  Approved {delivery.decided_at?.slice(0, 16).replace("T", " ")} by {delivery.decided_by_name}.
                  {delivery.stock_posted ? " The unit left the RMA store and the RMA is completed." : " The product stays here; the RMA stays open."}
                  {delivery.payment_number ? ` Payment ${delivery.payment_number} was recorded with it (older delivery).` : ""}
                  {delivery.receivable_number ? ` Invoice ${delivery.receivable_number}.` : ""}
                </p>
              ) : null}

              {blocker ? <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[12px]">{blocker}</p> : null}

              <Section title="Charges">
                <div className="grid gap-x-6 gap-y-1 text-[13px] @md:grid-cols-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Charges</p>
                    <p className="font-medium tabular-nums">{money(total)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Paid so far</p>
                    <p className="font-medium tabular-nums">{money(summary.paid)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Still owed</p>
                    <p className="font-medium tabular-nums">{money(outstanding)}</p>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {total > 0
                    ? "The delivery does not take money. Record payments in the Settlement section of this RMA; any charges are invoiced once when the unit is delivered."
                    : "No charges on this RMA, so nothing is invoiced."}
                </p>
              </Section>

              <Section title="Delivery">
                <div className="grid gap-x-8 @md:grid-cols-2">
                  <AgainFormRow label="Date">
                    <input
                      type="date"
                      value={form.delivery_date}
                      disabled={!editable}
                      onChange={(e) => patch({ delivery_date: e.target.value })}
                      className="h-8 w-full border-0 border-b border-input bg-transparent text-[13px] outline-none disabled:opacity-70"
                    />
                  </AgainFormRow>
                  <AgainFormRow label="Received by">
                    <AgainUnderlineInput value={form.delivered_to} onChange={(v) => patch({ delivered_to: v })} readOnly={!editable} placeholder="Who takes the unit" />
                  </AgainFormRow>
                </div>
                <AgainFormRow label="Serial">
                  <AgainUnderlineInput value={delivery.serial_delivered ?? summary.held_serial ?? ""} readOnly />
                </AgainFormRow>
                <AgainFormRow label="Notes">
                  <AgainUnderlineTextarea value={form.notes} onChange={(v) => patch({ notes: v })} rows={2} readOnly={!editable} />
                </AgainFormRow>
              </Section>

              {status === "pending_approval" ? (
                <Section title="Decision">
                  <AgainFormRow label="Reason">
                    <AgainUnderlineTextarea value={reason} onChange={setReason} rows={2} placeholder="Required to reject or return for correction" />
                  </AgainFormRow>
                  <p className="text-[11px] text-muted-foreground">
                    Approving takes the unit out of the RMA store and completes the RMA. Any charges are invoiced once, unpaid; payments are recorded as settlements.
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
