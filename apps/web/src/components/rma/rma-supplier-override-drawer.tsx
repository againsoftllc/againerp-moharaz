"use client";

import { useEffect, useState } from "react";
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
import { useCommerceSuppliers } from "@/lib/api/use-commerce-suppliers";
import { updateRmaTicket, type RmaTicket } from "@/lib/api/rma";

/**
 * Authorized exception: choose the supplier by hand when the serial's purchase trace is missing or wrong. Needs the
 * RMA override permission and a reason; the change is written to the claim's activity log.
 */
export function RmaSupplierOverrideDrawer({
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
  const { suppliers } = useCommerceSuppliers();
  const [supplierId, setSupplierId] = useState(ticket.supplier_id ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSupplierId(ticket.supplier_id ?? "");
      setReason("");
    }
  }, [open, ticket.supplier_id]);

  const changed = Boolean(supplierId) && supplierId !== ticket.supplier_id;

  const save = async () => {
    if (!changed) return;
    if (!reason.trim()) {
      toast.error("Give a reason — it is kept in the activity log.");
      return;
    }
    setSaving(true);
    try {
      await updateRmaTicket(ticket.id, { supplier_id: supplierId, override_reason: reason.trim() });
      toast.success("Supplier updated");
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the supplier");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Override supplier"
      nested
      resizable
      defaultWidth={460}
      minWidth={360}
      widthStorageKey="again-rma-supplier-override-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={() => onOpenChange(false)} />}>
          <AgainDrawerButton variant="primary" onClick={() => void save()} disabled={!changed || saving}>
            {saving ? "Saving…" : "Save"}
          </AgainDrawerButton>
          <AgainDrawerButton onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </AgainDrawerButton>
        </AgainDrawerControlBar>
        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
          <div className="@container space-y-4">
            <div>
              <h2 className={AGAIN_FORM_RECORD_TITLE_CLASS}>Override supplier</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {ticket.supplier_source === "traced"
                  ? `The serial traces to ${ticket.supplier_name}. Change it only if that is wrong.`
                  : "No purchase trace was found for this unit, so the supplier is chosen by hand."}
              </p>
            </div>
            <AgainFormRow label="Supplier">
              <FilterSelect
                value={supplierId}
                onChange={setSupplierId}
                width="w-full"
                avoidCollisions
                ariaLabel="Supplier"
                placeholder="Choose a supplier…"
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              />
            </AgainFormRow>
            <AgainFormRow label="Reason">
              <AgainUnderlineTextarea value={reason} onChange={setReason} rows={2} placeholder="Why the trace is wrong or missing" />
            </AgainFormRow>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
