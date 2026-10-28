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
import { ProductCombobox } from "@/components/products/product-combobox";
import { fetchCatalogProductDetail } from "@/lib/api/catalog-products";
import { fetchPaymentAccounts, type ApiFinancePaymentAccount } from "@/lib/api/finance";
import {
  RECEIPT_OUTCOMES,
  RECEIPT_OUTCOME_HINT,
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
import { cn, formatCurrency } from "@/lib/utils";

type Form = {
  outcome: RmaReceiptOutcome;
  outcome_note: string;
  received_serial: string;
  received_item_id: string;
  refund_amount: string;
  refund_account_id: string;
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
  received_item_id: r.received_item_id ?? "",
  refund_amount: r.refund_amount != null && r.refund_amount !== "" ? String(Number(r.refund_amount)) : "",
  refund_account_id: r.refund_account_id ?? "",
  supplier_delivery_ref: r.supplier_delivery_ref ?? "",
  received_date: r.received_date ?? "",
  received_by: r.received_by ?? "",
  condition_notes: r.condition_notes ?? "",
  accessories_received: r.accessories_received ?? "",
  warehouse_id: r.warehouse_id ?? "",
});

const approvedMessage = (outcome: RmaReceiptOutcome) =>
  outcome === "cash_back"
    ? "Cash back approved — the money is posted to Finance"
    : outcome === "different_product"
      ? "Receipt approved — the other product is stocked in the RMA store"
      : "Receipt approved — the unit is back in the RMA store";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/**
 * What the supplier sent back for a dispatched claim (docs/RMA.md Stage D), in the common drawer. The receipt has a TYPE that
 * says what came back, and the form follows it: the same unit, the same product with a new serial, a different product, or
 * cash back (no unit). A new serial or product needs the serial-change permission and a reason; the "On approval" box says
 * exactly what posting it will do. Only approving posts (stock, serials, and for cash back the money).
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
  // the Approve permission on RMA (Workspace › Roles) decides every RMA document, as it does in the other modules
  const holdsRmaApprove = usePermission("rma", "approve");
  const canApprove = usePermission("rma_receive_approve", "write") || holdsRmaApprove;
  const canChangeSerial = usePermission("rma_serial_change", "write");
  const canReprint = usePermission("rma_reprint", "write");
  const [receipt, setReceipt] = useState<RmaReceipt | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [stores, setStores] = useState<RmaStore[]>([]);
  const [accounts, setAccounts] = useState<ApiFinancePaymentAccount[]>([]);
  // a product picked in this session (the saved receipt carries its own name once it is saved)
  const [pickedProduct, setPickedProduct] = useState<{ id: string; label: string } | null>(null);
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
    setPickedProduct(null);
    if (!open || !receiptId) return;
    void load();
    void fetchRmaStores()
      .then(setStores)
      .catch(() => setStores([]));
    void fetchPaymentAccounts()
      .then((res) => setAccounts(res.data))
      .catch(() => setAccounts([]));
  }, [open, receiptId, load]);

  const status = receipt?.status;
  const editable = canWrite && (status === "draft" || status === "correction_requested");
  const saved = useMemo(() => (receipt ? toForm(receipt) : null), [receipt]);
  const dirty = Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved));
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

  // Saving a draft finalizes it, as in Sales: an approver's receipt is approved (the unit is stocked), anyone else's is sent for approval
  const save = () => {
    if (!receipt || !form) return undefined;
    const finalizes = receipt.status === "draft" || receipt.status === "correction_requested";
    return run(
      async () => {
        let next = dirty
          ? await updateRmaReceipt(receipt.id, {
              outcome: form.outcome,
              outcome_note: nullable(form.outcome_note),
              received_serial: form.received_serial,
              received_item_id: form.received_item_id || undefined,
              refund_amount: form.refund_amount ? Number(form.refund_amount) : undefined,
              refund_account_id: form.refund_account_id || undefined,
              supplier_delivery_ref: nullable(form.supplier_delivery_ref),
              received_date: nullable(form.received_date),
              received_by: nullable(form.received_by),
              condition_notes: nullable(form.condition_notes),
              accessories_received: nullable(form.accessories_received),
              warehouse_id: nullable(form.warehouse_id),
            })
          : receipt;
        if (finalizes) next = await (canApprove ? decideRmaReceipt(next.id, "approved") : submitRmaReceipt(next.id));
        return next;
      },
      !finalizes ? "Saved" : canApprove ? approvedMessage(form.outcome) : "Sent for approval",
    );
  };

  const decide = (decision: "approved" | "rejected" | "correction_requested") => {
    if (!receipt) return;
    if (decision !== "approved" && !reason.trim()) {
      toast.error("Write the reason first — it is kept with the decision.");
      return;
    }
    void run(
      () => decideRmaReceipt(receipt.id, decision, reason.trim() || undefined),
      decision === "approved" ? approvedMessage(receipt.outcome) : decision === "rejected" ? "Receipt rejected" : "Sent back for correction",
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

  // choosing a type keeps only what that type uses, so nothing stale is saved with it
  const selectOutcome = (outcome: RmaReceiptOutcome) => {
    if (!receipt || !form || !editable || outcome === form.outcome) return;
    const sent = receipt.sent_serial ?? "";
    patch({
      outcome,
      received_serial: outcome === "same_unit" ? sent : outcome === "cash_back" ? "" : form.received_serial === sent ? "" : form.received_serial,
      received_item_id: outcome === "different_product" ? form.received_item_id : "",
      refund_amount: outcome === "cash_back" ? form.refund_amount : "",
      refund_account_id: outcome === "cash_back" ? form.refund_account_id || accounts.find((a) => a.is_default)?.id || "" : "",
    });
  };

  const pickProduct = (productId: string) => {
    if (!productId) {
      setPickedProduct(null);
      patch({ received_item_id: "" });
      return;
    }
    void fetchCatalogProductDetail(productId)
      .then((product) => {
        if (!product.itemId) {
          toast.error("That product has no inventory item, so it cannot be stocked.");
          return;
        }
        setPickedProduct({ id: product.itemId, label: `${product.name} (${product.sku})` });
        patch({ received_item_id: product.itemId });
      })
      .catch(() => toast.error("Could not read that product — pick it again"));
  };

  const productLabel = !form?.received_item_id
    ? ""
    : pickedProduct?.id === form.received_item_id
      ? pickedProduct.label
      : receipt?.received_item_id === form.received_item_id
        ? `${receipt.received_product_name ?? ""} (${receipt.received_sku ?? ""})`
        : form.received_item_id;
  const claimed = ticket.product_name || ticket.sku;
  const account = accounts.find((a) => a.id === form?.refund_account_id);
  const storeName = stores.find((x) => x.id === form?.warehouse_id)?.name ?? "the RMA store";
  const newSerial = (form?.received_serial ?? "").trim();
  const sentSerial = receipt?.sent_serial ?? "";

  /** What approving will post, in plain words, for the type that is chosen now. */
  const onApproval = (): string[] => {
    if (!form) return [];
    const from = sentSerial ? ` ${sentSerial}` : "";
    switch (form.outcome) {
      case "same_unit":
        return [`The unit${from} comes back from Supplier / In Transit into ${storeName}.`];
      case "same_product":
        return [
          `The unit comes back from Supplier / In Transit into ${storeName}.`,
          `The new serial ${newSerial || "…"} is registered as the same product and linked to${from || " the original"}; the original is kept and marked replaced.`,
        ];
      case "different_product":
        return [
          `The original${from} leaves the Supplier / In Transit stock: the supplier kept it.`,
          `${productLabel || "The other product"} (${newSerial || "serial …"}) is stocked into ${storeName}.`,
          "The RMA holds this product from now on: the customer delivery hands it over, not the one that was claimed.",
        ];
      default:
        return [
          `No unit comes back. The original${from} leaves the Supplier / In Transit stock: the supplier kept it.`,
          `${form.refund_amount ? formatCurrency(Number(form.refund_amount)) : "The amount"} is posted to Finance as money in from ${receipt?.supplier_name ?? "the supplier"}${account ? ` into ${account.name}` : ""} (an RMA settlement, once).`,
          "The customer is settled separately (a refund or a replacement); the RMA can be completed after that.",
        ];
    }
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
                  <AgainDrawerButton variant="primary" onClick={() => void save()} disabled={busy || !canWrite}>
                    {busy ? "Saving…" : "Save"}
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
                  <span className="font-semibold">Rejected:</span> {receipt.decision_reason}. Nothing was posted.
                </p>
              ) : null}
              {receipt.status === "approved" ? (
                <p className="border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[12px]">
                  Approved {receipt.decided_at?.slice(0, 16).replace("T", " ")} by {receipt.decided_by_name}.{" "}
                  {receipt.outcome === "cash_back"
                    ? `The cash back is posted to Finance (settlement ${receipt.settlement_id ? "recorded" : "pending"}); no unit came back.`
                    : receipt.outcome === "different_product"
                      ? `${receipt.received_product_name} (${receipt.received_sku}) is stocked in the RMA store.`
                      : "The unit is back in the RMA store."}
                </p>
              ) : null}

              <Section title="What did the supplier send back?">
                <div className="grid gap-2 @md:grid-cols-2">
                  {RECEIPT_OUTCOMES.map((o) => {
                    const on = form.outcome === o;
                    return (
                      <button
                        key={o}
                        type="button"
                        disabled={!editable}
                        onClick={() => selectOutcome(o)}
                        aria-pressed={on}
                        className={cn(
                          "border px-3 py-2 text-left transition-colors",
                          on ? "border-primary bg-primary/5" : "border-border",
                          editable && !on && "hover:bg-muted/40",
                          !editable && "cursor-default",
                        )}
                      >
                        <span className="block text-[13px] font-medium">{RECEIPT_OUTCOME_LABEL[o]}</span>
                        <span className="block text-[11px] text-muted-foreground">{RECEIPT_OUTCOME_HINT[o]}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 grid grid-cols-2 border border-border text-[12px]">
                  <div className="space-y-0.5 border-r border-border px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sent to supplier</p>
                    <p>{claimed}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{sentSerial || "no serial"}</p>
                  </div>
                  <div className="space-y-0.5 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Received</p>
                    {form.outcome === "cash_back" ? (
                      <>
                        <p>No unit comes back</p>
                        <p className="text-[11px] text-muted-foreground">Cash back {form.refund_amount ? formatCurrency(Number(form.refund_amount)) : "— enter the amount"}</p>
                      </>
                    ) : (
                      <>
                        <p className={cn(form.outcome === "different_product" && "text-amber-700 dark:text-amber-300")}>
                          {form.outcome === "different_product" ? productLabel || "— pick the product" : claimed}
                        </p>
                        <p className={cn("font-mono text-[11px]", form.outcome === "same_unit" ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300")}>
                          {form.outcome === "same_unit" ? sentSerial || "no serial" : newSerial || "— enter the new serial"}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {form.outcome === "different_product" ? (
                  <AgainFormRow label="Product received">
                    {form.received_item_id ? (
                      <div className="flex items-center gap-2 border border-input px-2 py-1.5 text-[13px]">
                        <span className="min-w-0 flex-1 truncate">{productLabel}</span>
                        {editable ? (
                          <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => pickProduct("")}>
                            Change
                          </button>
                        ) : null}
                      </div>
                    ) : editable ? (
                      <ProductCombobox products={[]} value="" onChange={pickProduct} placeholder="Search the product the supplier sent…" />
                    ) : (
                      <AgainUnderlineInput value="" readOnly />
                    )}
                  </AgainFormRow>
                ) : null}

                {form.outcome === "same_product" || form.outcome === "different_product" ? (
                  <>
                    <AgainFormRow label="New serial">
                      <AgainUnderlineInput
                        value={form.received_serial}
                        onChange={(v) => patch({ received_serial: v })}
                        readOnly={!editable}
                        placeholder="Serial on the unit that came back"
                      />
                    </AgainFormRow>
                    {editable ? (
                      <p className={cn("text-[11px]", serialLockedForUser ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                        {serialLockedForUser
                          ? "A new serial or product needs the RMA serial-change permission to save. The serial must also be new to the registry."
                          : "The original serial is kept and linked to this one. It must be new to the registry."}
                      </p>
                    ) : null}
                  </>
                ) : null}

                {form.outcome === "cash_back" ? (
                  <div className="grid gap-x-8 @md:grid-cols-2">
                    <AgainFormRow label="Amount">
                      <AgainUnderlineInput
                        value={form.refund_amount}
                        onChange={(v) => patch({ refund_amount: v.replace(/[^0-9.]/g, "") })}
                        readOnly={!editable}
                        placeholder="What the supplier paid"
                      />
                    </AgainFormRow>
                    <AgainFormRow label="Paid into">
                      <FilterSelect
                        value={form.refund_account_id}
                        onChange={(v) => patch({ refund_account_id: v })}
                        width="w-full"
                        avoidCollisions
                        ariaLabel="Cash or bank account"
                        disabled={!editable}
                        placeholder="Choose the account…"
                        options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.kind.replace("_", " ")})` }))}
                      />
                    </AgainFormRow>
                  </div>
                ) : null}

                <AgainFormRow label="Note">
                  <AgainUnderlineTextarea
                    value={form.outcome_note}
                    onChange={(v) => patch({ outcome_note: v })}
                    rows={2}
                    readOnly={!editable}
                    placeholder="What the supplier did / said (optional)"
                  />
                </AgainFormRow>

                {receipt.status !== "approved" ? (
                  <div className="mt-2 border border-border bg-muted/30 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">On approval</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px]">
                      {onApproval().map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    {form.outcome === "cash_back" ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">Approving a cash back needs the settlement approval right, because it posts money.</p>
                    ) : null}
                  </div>
                ) : null}
              </Section>

              <Section title="Receipt">
                <div className="grid gap-x-8 @md:grid-cols-2">
                  <AgainFormRow label={form.outcome === "cash_back" ? "Credit note ref." : "Delivery ref."}>
                    <AgainUnderlineInput value={form.supplier_delivery_ref} onChange={(v) => patch({ supplier_delivery_ref: v })} readOnly={!editable} placeholder={form.outcome === "cash_back" ? "Supplier credit note / payment ref" : "Supplier challan / courier ref"} />
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
                  {form.outcome !== "cash_back" ? (
                    <AgainFormRow label="Into RMA store">
                      <FilterSelect
                        value={form.warehouse_id}
                        onChange={(v) => patch({ warehouse_id: v })}
                        width="w-full"
                        avoidCollisions
                        ariaLabel="RMA store"
                        disabled={!editable}
                        placeholder="Choose the RMA store…"
                        options={stores.map((x) => ({ value: x.id, label: x.name }))}
                      />
                    </AgainFormRow>
                  ) : null}
                </div>
                {form.outcome !== "cash_back" ? (
                  <>
                    <AgainFormRow label="Condition">
                      <AgainUnderlineInput value={form.condition_notes} onChange={(v) => patch({ condition_notes: v })} readOnly={!editable} placeholder="Condition on arrival" />
                    </AgainFormRow>
                    <AgainFormRow label="Accessories">
                      <AgainUnderlineInput value={form.accessories_received} onChange={(v) => patch({ accessories_received: v })} readOnly={!editable} placeholder="Box, cable, adapter…" />
                    </AgainFormRow>
                  </>
                ) : null}
              </Section>

              {status === "pending_approval" ? (
                <Section title="Decision">
                  <AgainFormRow label="Reason">
                    <AgainUnderlineTextarea value={reason} onChange={setReason} rows={2} placeholder="Required to reject or return for correction" />
                  </AgainFormRow>
                  <p className="text-[11px] text-muted-foreground">
                    Approving posts what is listed under On approval, once. Rejecting or sending back posts nothing.
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
