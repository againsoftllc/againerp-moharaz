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
  DELIVERY_OUTCOMES,
  DELIVERY_OUTCOME_HINT,
  DELIVERY_OUTCOME_LABEL,
  DELIVERY_STATUS_LABEL,
  DELIVERY_STATUS_TONE,
  cancelRmaDelivery,
  decideRmaDelivery,
  fetchRmaDelivery,
  fetchRmaDeliverySummary,
  submitRmaDelivery,
  updateRmaDelivery,
  type RmaDelivery,
  type RmaDeliveryOutcome,
  type RmaDeliverySummary,
} from "@/lib/api/rma-deliveries";
import { CHARGE_KINDS, CHARGE_KIND_LABEL, addRmaCharge, removeRmaCharge, type RmaCharge, type RmaChargeKind, type RmaTicket } from "@/lib/api/rma";
import { fetchPaymentAccounts, type ApiFinancePaymentAccount } from "@/lib/api/finance";
import { usePermission } from "@/lib/auth/permissions";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";
import { openRmaDeliveryCopy } from "@/lib/rma/rma-print";
import { cn, formatCurrency } from "@/lib/utils";

type Form = {
  outcome: RmaDeliveryOutcome;
  delivery_date: string;
  delivered_to: string;
  notes: string;
  refund_amount: string;
  refund_account_id: string;
  amount_received: string;
  payment_account_id: string;
  payment_reference: string;
};

const asNumber = (v: string | number | null | undefined) => (v == null || v === "" ? "" : String(Number(v)));

const toForm = (d: RmaDelivery): Form => ({
  outcome: d.outcome,
  delivery_date: d.delivery_date ?? "",
  delivered_to: d.delivered_to ?? "",
  notes: d.notes ?? "",
  refund_amount: asNumber(d.refund_amount),
  refund_account_id: d.refund_account_id ?? "",
  amount_received: Number(d.amount_received) > 0 ? asNumber(d.amount_received) : "",
  payment_account_id: d.payment_account_id ?? "",
  payment_reference: d.payment_reference ?? "",
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

const approvedMessage = (outcome: RmaDeliveryOutcome) =>
  outcome === "cash_back" ? "Delivery approved — the cash back is paid" : "Delivery approved — the unit is handed over and the RMA is completed";

/**
 * Customer delivery (docs/RMA.md Stage E), in the common drawer. The type mirrors what came back from the supplier: the same
 * unit, the same product with a new serial, a different product, or cash back (money out, no unit). The three unit types have to
 * match the unit the RMA holds. The customer can be charged here (service charge, parts, labour, fine): part collected now, the
 * rest left owed on the RMA's invoice. The "On approval" box says exactly what posting it will do.
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
  // the Approve permission on RMA (Workspace › Roles) decides every RMA document, as it does in the other modules
  const holdsRmaApprove = usePermission("rma", "approve");
  const canApprove = usePermission("rma_delivery_approve", "write") || holdsRmaApprove;
  const canReprint = usePermission("rma_reprint", "write");
  const [delivery, setDelivery] = useState<RmaDelivery | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [summary, setSummary] = useState<RmaDeliverySummary | null>(null);
  const [accounts, setAccounts] = useState<ApiFinancePaymentAccount[]>([]);
  const [charges, setCharges] = useState<RmaCharge[]>(ticket.charges ?? []);
  const [chargeKind, setChargeKind] = useState<RmaChargeKind>("service");
  const [chargeText, setChargeText] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeDiscount, setChargeDiscount] = useState("");
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
    setCharges(ticket.charges ?? []);
    if (!open || !deliveryId) return;
    void load();
    void fetchPaymentAccounts()
      .then((res) => setAccounts(res.data))
      .catch(() => setAccounts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const nullable = (v: string) => v.trim() || undefined;
  const total = Number(summary?.total ?? 0);
  const collectNow = Number(form?.amount_received || 0);
  const owedAfter = Math.max(Number(summary?.outstanding ?? 0) - collectNow, 0);

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

  // Saving a draft finalizes it, as in Sales: an approver's delivery is approved and posted, anyone else's is sent for approval
  const save = () => {
    if (!delivery || !form) return undefined;
    const finalizes = delivery.status === "draft" || delivery.status === "correction_requested";
    return run(
      async () => {
        let next = dirty
          ? await updateRmaDelivery(delivery.id, {
              outcome: form.outcome,
              delivery_date: nullable(form.delivery_date),
              delivered_to: nullable(form.delivered_to),
              notes: nullable(form.notes),
              refund_amount: form.outcome === "cash_back" && form.refund_amount ? Number(form.refund_amount) : undefined,
              refund_account_id: form.outcome === "cash_back" ? form.refund_account_id || undefined : undefined,
              amount_received: Number(form.amount_received || 0),
              payment_account_id: form.payment_account_id || undefined,
              payment_reference: nullable(form.payment_reference),
            })
          : delivery;
        if (finalizes) next = await (canApprove ? decideRmaDelivery(next.id, "approved") : submitRmaDelivery(next.id));
        return next;
      },
      !finalizes ? "Saved" : canApprove ? approvedMessage(form.outcome) : "Sent for approval",
    );
  };

  const decide = (decision: "approved" | "rejected" | "correction_requested") => {
    if (!delivery) return;
    if (decision !== "approved" && !reason.trim()) {
      toast.error("Write the reason first — it is kept with the decision.");
      return;
    }
    void run(
      () => decideRmaDelivery(delivery.id, decision, reason.trim() || undefined),
      decision === "approved" ? approvedMessage(delivery.outcome) : decision === "rejected" ? "Delivery rejected" : "Sent back for correction",
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

  const refreshMoney = (next: RmaTicket) => {
    setCharges(next.charges ?? []);
    void fetchRmaDeliverySummary(ticket.id).then(setSummary).catch(() => undefined);
    onDone();
  };

  const addCharge = async () => {
    const amount = Number(chargeAmount);
    const discount = Number(chargeDiscount || 0);
    if (!chargeText.trim() || !(amount > 0)) {
      toast.error("Describe the charge and give an amount above zero.");
      return;
    }
    if (discount < 0 || discount > amount) {
      toast.error("The discount must be between 0 and the amount.");
      return;
    }
    try {
      refreshMoney(await addRmaCharge(ticket.id, { kind: chargeKind, description: chargeText.trim(), unit_price: amount, discount }));
      setChargeText("");
      setChargeAmount("");
      setChargeDiscount("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the charge");
    }
  };

  const dropCharge = async (chargeId: string) => {
    try {
      refreshMoney(await removeRmaCharge(ticket.id, chargeId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the charge");
    }
  };

  const selectOutcome = (outcome: RmaDeliveryOutcome) => {
    if (!form || !editable || outcome === form.outcome) return;
    patch({
      outcome,
      refund_amount: outcome === "cash_back" ? form.refund_amount : "",
      refund_account_id: outcome === "cash_back" ? form.refund_account_id || accounts.find((a) => a.is_default)?.id || "" : "",
    });
  };

  /** Why a type cannot be chosen right now, or null when it can. */
  const unavailable = (o: RmaDeliveryOutcome): string | null => {
    if (!summary) return null;
    if (o === "cash_back") return summary.can_cash_back ? null : summary.cash_back_blocker;
    if (!summary.can_deliver_product) return summary.deliver_blocker;
    if (o !== summary.unit_outcome) {
      return `The RMA holds ${summary.held_product_name ?? "the unit"}${summary.held_serial ? ` (${summary.held_serial})` : ""}: ${DELIVERY_OUTCOME_LABEL[summary.unit_outcome]}.`;
    }
    return null;
  };

  const canPrint = status && !["draft", "cancelled"].includes(status);
  const reprintBlocked = (delivery?.print_count ?? 0) > 0 && !canReprint;
  const account = (id: string) => accounts.find((a) => a.id === id);
  const customer = ticket.customer_name || "the customer";

  /** What approving will post, in plain words, for what is chosen now. */
  const onApproval = (): string[] => {
    if (!form || !summary) return [];
    const lines: string[] = [];
    const unit = `${summary.held_product_name ?? "The unit"}${summary.held_serial ? ` (${summary.held_serial})` : ""}`;
    if (total > 0) {
      lines.push(
        collectNow > 0
          ? `The charges (${money(total)}) are invoiced to ${customer} once; ${money(collectNow)} is collected${account(form.payment_account_id) ? ` into ${account(form.payment_account_id)?.name}` : ""} and ${money(owedAfter)} stays owed.`
          : `The charges (${money(total)}) are invoiced to ${customer} once and stay owed — nothing is collected now.`,
      );
    }
    if (form.outcome === "cash_back") {
      lines.push(`${form.refund_amount ? money(form.refund_amount) : "The amount"} is paid back to ${customer}${account(form.refund_account_id) ? ` from ${account(form.refund_account_id)?.name}` : ""} (an RMA settlement, money out).`);
      lines.push(
        ticket.custody_state === "cash_back"
          ? "The supplier kept the unit, so nothing is left to hand over: the RMA is completed."
          : "No unit goes back. A unit still in the RMA store keeps its own decision (restock, supplier, scrap), so the RMA stays open until then.",
      );
    } else {
      lines.unshift(`${unit} leaves the RMA store and goes back to ${customer}; its serial is with the customer again.`);
      lines.push("The RMA is completed.");
    }
    return lines;
  };

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={handleOpenChange}
      title="Customer delivery"
      nested
      resizable
      defaultWidth={640}
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
                  <AgainDrawerButton variant="primary" onClick={() => void save()} disabled={busy || !canWrite}>
                    {busy ? "Saving…" : "Save"}
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
                  Approved {delivery.decided_at?.slice(0, 16).replace("T", " ")} by {delivery.decided_by_name}.{" "}
                  {delivery.outcome === "cash_back"
                    ? `The cash back of ${money(delivery.refund_amount ?? 0)} was paid.`
                    : delivery.stock_posted
                      ? "The unit left the RMA store and the RMA is completed."
                      : ""}
                  {Number(delivery.amount_total) > 0
                    ? ` Charges ${money(delivery.amount_total)}: collected ${money(delivery.amount_received)}, owed ${money(delivery.amount_due)}${delivery.receivable_number ? ` (invoice ${delivery.receivable_number})` : ""}.`
                    : ""}
                </p>
              ) : null}

              <Section title="What does the customer get?">
                <div className="grid gap-2 @md:grid-cols-2">
                  {DELIVERY_OUTCOMES.map((o) => {
                    const on = form.outcome === o;
                    const why = unavailable(o);
                    const blocked = Boolean(why) && !on;
                    return (
                      <button
                        key={o}
                        type="button"
                        disabled={!editable || blocked}
                        onClick={() => selectOutcome(o)}
                        aria-pressed={on}
                        title={blocked ? (why ?? undefined) : undefined}
                        className={cn(
                          "border px-3 py-2 text-left transition-colors",
                          on ? "border-primary bg-primary/5" : "border-border",
                          editable && !on && !blocked && "hover:bg-muted/40",
                          (!editable || blocked) && "cursor-default",
                          blocked && "opacity-50",
                        )}
                      >
                        <span className="block text-[13px] font-medium">{DELIVERY_OUTCOME_LABEL[o]}</span>
                        <span className="block text-[11px] text-muted-foreground">{blocked && why ? why : DELIVERY_OUTCOME_HINT[o]}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 grid grid-cols-2 border border-border text-[12px]">
                  <div className="space-y-0.5 border-r border-border px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Customer brought</p>
                    <p>{summary.original_product_name || ticket.sku}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{summary.original_serial || "no serial"}</p>
                  </div>
                  <div className="space-y-0.5 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Customer gets</p>
                    {form.outcome === "cash_back" ? (
                      <>
                        <p>No unit goes back</p>
                        <p className="text-[11px] text-muted-foreground">Cash back {form.refund_amount ? money(form.refund_amount) : "— enter the amount"}</p>
                      </>
                    ) : (
                      <>
                        <p className={cn(form.outcome === "different_product" && "text-amber-700 dark:text-amber-300")}>{summary.held_product_name || ticket.sku}</p>
                        <p className={cn("font-mono text-[11px]", form.outcome === "same_unit" ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300")}>
                          {summary.held_serial || "no serial"}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {form.outcome === "cash_back" ? (
                  <div className="grid gap-x-8 @md:grid-cols-2">
                    <AgainFormRow label="Cash back">
                      <AgainUnderlineInput
                        value={form.refund_amount}
                        onChange={(v) => patch({ refund_amount: v.replace(/[^0-9.]/g, "") })}
                        readOnly={!editable}
                        placeholder="Paid back to the customer"
                      />
                    </AgainFormRow>
                    <AgainFormRow label="Paid from">
                      <FilterSelect
                        value={form.refund_account_id}
                        onChange={(v) => patch({ refund_account_id: v })}
                        width="w-full"
                        avoidCollisions
                        ariaLabel="Cash or bank account the cash back is paid from"
                        disabled={!editable}
                        placeholder="Choose the account…"
                        options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.kind.replace("_", " ")})` }))}
                      />
                    </AgainFormRow>
                  </div>
                ) : null}

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
                  <AgainFormRow label={form.outcome === "cash_back" ? "Paid to" : "Received by"}>
                    <AgainUnderlineInput value={form.delivered_to} onChange={(v) => patch({ delivered_to: v })} readOnly={!editable} placeholder="Who takes it" />
                  </AgainFormRow>
                </div>
                <AgainFormRow label="Notes">
                  <AgainUnderlineTextarea value={form.notes} onChange={(v) => patch({ notes: v })} rows={2} readOnly={!editable} />
                </AgainFormRow>
              </Section>

              <Section title="Charges to the customer">
                {charges.length === 0 ? (
                  <p className="py-1 text-[12px] text-muted-foreground">No charges. Add a service charge or a fine below if the customer has to pay.</p>
                ) : (
                  <div className="overflow-x-auto bg-background">
                    <table className="w-full min-w-[420px] border-collapse text-[12px]">
                      <tbody>
                        {charges.map((c) => (
                          <tr key={c.id} className="border-b border-border/60">
                            <td className="px-2 py-1.5 text-muted-foreground">{CHARGE_KIND_LABEL[c.kind] ?? c.kind}</td>
                            <td className="px-2 py-1.5">{c.description}</td>
                            <td className="px-2 py-1.5 text-right text-[11px] tabular-nums text-muted-foreground">
                              {Number(c.discount ?? 0) > 0 ? `− ${money(c.discount ?? 0)} disc.` : ""}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{money(c.line_total)}</td>
                            <td className="w-8 px-2 py-1.5 text-right">
                              {editable && ticket.bill_status !== "billed" ? (
                                <button type="button" aria-label="Remove charge" className="text-muted-foreground hover:text-destructive" onClick={() => void dropCharge(c.id)}>
                                  ✕
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {editable && ticket.bill_status !== "billed" ? (
                  <div className="mt-2 grid items-end gap-2 @md:grid-cols-[9rem_1fr_6rem_6rem_auto]">
                    <FilterSelect
                      value={chargeKind}
                      onChange={(v) => setChargeKind(v as RmaChargeKind)}
                      width="w-full"
                      avoidCollisions
                      ariaLabel="Type of charge"
                      options={CHARGE_KINDS.map((k) => ({ value: k.value, label: k.label }))}
                    />
                    <AgainUnderlineInput value={chargeText} onChange={setChargeText} placeholder={chargeKind === "fine" ? "Why the fine (e.g. liquid damage)" : "What it is for"} />
                    <AgainUnderlineInput value={chargeAmount} onChange={(v) => setChargeAmount(v.replace(/[^0-9.]/g, ""))} placeholder="Amount" />
                    <AgainUnderlineInput value={chargeDiscount} onChange={(v) => setChargeDiscount(v.replace(/[^0-9.]/g, ""))} placeholder="Discount" />
                    <AgainDrawerButton onClick={() => void addCharge()}>Add</AgainDrawerButton>
                  </div>
                ) : null}
                <div className="mt-3 grid gap-x-6 gap-y-1 text-[13px] @md:grid-cols-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Charges</p>
                    <p className="font-medium tabular-nums">{money(total)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Paid so far</p>
                    <p className="font-medium tabular-nums">{money(summary.paid)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Owed after this delivery</p>
                    <p className="font-medium tabular-nums">{money(owedAfter)}</p>
                  </div>
                </div>
              </Section>

              {total > 0 && Number(summary.outstanding) > 0 ? (
                <Section title="Collect now">
                  <div className="grid gap-x-8 @md:grid-cols-2">
                    <AgainFormRow label="Amount">
                      <AgainUnderlineInput
                        value={form.amount_received}
                        onChange={(v) => patch({ amount_received: v.replace(/[^0-9.]/g, "") })}
                        readOnly={!editable}
                        placeholder="0 — leave it owed"
                      />
                    </AgainFormRow>
                    <AgainFormRow label="Into">
                      <FilterSelect
                        value={form.payment_account_id}
                        onChange={(v) => patch({ payment_account_id: v })}
                        width="w-full"
                        avoidCollisions
                        ariaLabel="Cash or bank account the money is collected into"
                        disabled={!editable}
                        placeholder="Choose the account…"
                        options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.kind.replace("_", " ")})` }))}
                      />
                    </AgainFormRow>
                  </div>
                  <AgainFormRow label="Reference">
                    <AgainUnderlineInput value={form.payment_reference} onChange={(v) => patch({ payment_reference: v })} readOnly={!editable} placeholder="Receipt / transaction ref" />
                  </AgainFormRow>
                  <p className="text-[11px] text-muted-foreground">Whatever is not collected now stays owed on the RMA&apos;s invoice.</p>
                </Section>
              ) : null}

              {status !== "approved" ? (
                <div className="border border-border bg-muted/30 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">On approval</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px]">
                    {onApproval().map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  {form.outcome === "cash_back" || collectNow > 0 ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">Approving a delivery that moves money needs the settlement approval right, because it posts to Finance.</p>
                  ) : null}
                </div>
              ) : null}

              {status === "pending_approval" ? (
                <Section title="Decision">
                  <AgainFormRow label="Reason">
                    <AgainUnderlineTextarea value={reason} onChange={setReason} rows={2} placeholder="Required to reject or return for correction" />
                  </AgainFormRow>
                  <p className="text-[11px] text-muted-foreground">Approving posts what is listed under On approval, once. Rejecting or sending back posts nothing.</p>
                </Section>
              ) : null}
            </div>
          )}
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
