"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
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
import { AGAIN_FORM_RECORD_TITLE_CLASS, AgainFormRow, AgainUnderlineTextarea } from "@/components/again/again-form-sheet";
import {
  decideRmaComplaint,
  fetchPriorRmas,
  fetchRmaStores,
  updateRmaTicket,
  RMA_STATUS_LABEL,
  WARRANTY_LABEL,
  type RmaDecision,
  type RmaPrior,
  type RmaStore,
  type RmaTicket,
} from "@/lib/api/rma";
import { formatCurrency } from "@/lib/utils";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex gap-3 py-[3px] text-[13px]">
      <span className="w-[8.5rem] shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{value || "—"}</span>
    </div>
  );
}

/**
 * Complaint approval (docs/RMA.md Stage B): the approver sees the complaint, warranty, supplier trace, prior history
 * and the receiving store, then approves, sends it back for correction or rejects. Approving a unit that is here stocks
 * it into the RMA store (once); a rejection or a send-back never creates stock.
 */
export function RmaApprovalDrawer({
  open,
  onOpenChange,
  ticket,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: RmaTicket;
  onDone: () => void;
}) {
  const [stores, setStores] = useState<RmaStore[]>([]);
  const [prior, setPrior] = useState<RmaPrior[]>([]);
  const [storeId, setStoreId] = useState(ticket.warehouse_id ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<RmaDecision | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStoreId(ticket.warehouse_id ?? "");
    setReason("");
    void fetchRmaStores()
      .then((rows) => !cancelled && setStores(rows))
      .catch(() => !cancelled && setStores([]));
    void fetchPriorRmas({
      serial: ticket.serial_number ?? undefined,
      itemId: ticket.item_id ?? undefined,
      customerId: ticket.customer_id ?? undefined,
      excludeId: ticket.id,
    })
      .then((rows) => !cancelled && setPrior(rows))
      .catch(() => !cancelled && setPrior([]));
    return () => {
      cancelled = true;
    };
  }, [open, ticket.id, ticket.warehouse_id, ticket.serial_number, ticket.item_id, ticket.customer_id]);

  const needsStore = ticket.unit_received !== false;
  const storeOk = stores.some((s) => s.id === storeId);
  const reasonRequired = (decision: RmaDecision) => decision !== "approved";

  const decide = async (decision: RmaDecision) => {
    if (reasonRequired(decision) && !reason.trim()) {
      toast.error("Write the reason first — it is kept with the decision.");
      return;
    }
    if (decision === "approved" && needsStore && !storeOk) {
      toast.error("Choose the receiving RMA store first.");
      return;
    }
    setBusy(decision);
    try {
      if (decision === "approved" && storeId && storeId !== ticket.warehouse_id) {
        await updateRmaTicket(ticket.id, { warehouse_id: storeId });
      }
      await decideRmaComplaint(ticket.id, decision, reason.trim() || undefined);
      toast.success(
        decision === "approved" ? "Complaint approved" : decision === "rejected" ? "Complaint rejected" : "Sent back for correction",
      );
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record the decision");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Complaint approval"
      nested
      resizable
      defaultWidth={540}
      minWidth={380}
      widthStorageKey="again-rma-approval-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => onOpenChange(false)} />}>
          <AgainDrawerButton variant="primary" onClick={() => void decide("approved")} disabled={busy !== null}>
            {busy === "approved" ? "Approving…" : "Approve"}
          </AgainDrawerButton>
          <AgainDrawerButton onClick={() => void decide("correction_requested")} disabled={busy !== null}>
            {busy === "correction_requested" ? "Sending…" : "Return for correction"}
          </AgainDrawerButton>
          <AgainDrawerButton variant="danger" onClick={() => void decide("rejected")} disabled={busy !== null}>
            {busy === "rejected" ? "Rejecting…" : "Reject"}
          </AgainDrawerButton>
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="@container space-y-5">
            <div className="min-w-0">
              <h2 className={AGAIN_FORM_RECORD_TITLE_CLASS}>{ticket.rma_number}</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {ticket.product_name || ticket.sku} · {ticket.customer_name} · {RMA_STATUS_LABEL[ticket.status]}
              </p>
            </div>

            {prior.length > 0 && (
              <div className="flex items-start gap-2 border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 text-[11px]">
                  <p className="font-semibold text-amber-700 dark:text-amber-300">
                    {prior.length} earlier claim{prior.length === 1 ? "" : "s"} on this {ticket.serial_number ? "unit" : "product"}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-foreground">
                    {prior.slice(0, 4).map((p) => (
                      <li key={p.id} className="truncate">
                        <span className="font-mono">{p.rma_number}</span> · {RMA_STATUS_LABEL[p.status] ?? p.status} · {p.fault_reported}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <Section title="Complaint">
              <Fact label="Problem" value={ticket.fault_reported} />
              <Fact label="Accessories" value={ticket.accessories} />
              <Fact label="Condition" value={ticket.condition_notes} />
              {ticket.diagnosis_required ? <Fact label="Diagnosis report" value={ticket.diagnosis_report} /> : null}
              <Fact label="Charge estimate" value={Number(ticket.charge_estimate ?? 0) ? formatCurrency(Number(ticket.charge_estimate)) : "No charge"} />
              <Fact label="Promised delivery" value={ticket.promised_delivery_date} />
            </Section>

            <Section title="Sale and warranty">
              <Fact label="Invoice / order" value={ticket.order_number} />
              <Fact label="Sold on" value={ticket.purchased_at} />
              <Fact label="Warranty" value={`${WARRANTY_LABEL[ticket.warranty_status]}${ticket.warranty_note ? ` — ${ticket.warranty_note}` : ""}`} />
              <Fact label="Serial" value={ticket.serial_number} />
            </Section>

            <Section title="Supplier trace">
              <Fact label="Supplier" value={ticket.supplier_name} />
              <Fact label="Purchase receipt" value={ticket.purchase_receipt_no} />
              {ticket.vendor_invoice_no ? <Fact label="Vendor invoice" value={ticket.vendor_invoice_no} /> : null}
              <Fact
                label="Source"
                value={
                  ticket.supplier_source === "traced"
                    ? "Traced from the serial"
                    : ticket.supplier_source === "manual"
                      ? `Chosen by hand — ${ticket.supplier_override_reason ?? ""}`
                      : "No purchase trace found"
                }
              />
            </Section>

            <Section title="Receiving store">
              <AgainFormRow label="RMA store">
                <FilterSelect
                  value={storeId}
                  onChange={setStoreId}
                  width="w-full"
                  avoidCollisions
                  ariaLabel="Receiving RMA store"
                  placeholder="Choose the RMA store…"
                  options={stores.map((s) => ({ value: s.id, label: s.name }))}
                />
              </AgainFormRow>
              <p className="text-[11px] text-muted-foreground">
                {needsStore
                  ? "Approving puts the unit into this store (once). Rejecting or sending back never adds stock."
                  : "This unit has not arrived yet. It is stocked into the store when you mark it received."}
              </p>
            </Section>

            <Section title="Decision">
              <AgainFormRow label="Reason">
                <AgainUnderlineTextarea
                  value={reason}
                  onChange={setReason}
                  rows={2}
                  placeholder="Required to reject or return for correction"
                />
              </AgainFormRow>
            </Section>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
