"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { useModuleSettings } from "@/lib/workspace/use-module-settings";
import {
  changeRmaStatus,
  createRmaServiceJob,
  refundRmaTicket,
  replaceRmaTicket,
  resolveRmaTicket,
  restockRmaTicket,
  RMA_NEXT_STATUSES,
  RMA_STATUS_LABEL,
  RESOLUTION_LABEL,
  type RmaResolutionType,
  type RmaTicket,
  type RmaStatus,
} from "@/lib/api/rma";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DrawerShell({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  footer,
  width = "w-[420px]",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  width?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        closeButton="inside"
        resizable
        className={`flex min-w-[160px] ${width} max-w-[720px] flex-col p-0`}
      >
        <div className="border-b border-border px-4 py-3 pr-10">
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------ status */

export function StatusDrawer({
  open,
  onOpenChange,
  ticket,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ticket: RmaTicket;
  onDone: () => void;
}) {
  // A unit in the RMA store reaches the supplier only through a supplier claim (it moves the stock).
  // after a cash back nothing is handed over, so the RMA may be completed once the customer is settled
  const moves = RMA_NEXT_STATUSES[ticket.status] ?? [];
  const next = (ticket.status === "returned_from_supplier" && ticket.custody_state === "cash_back" ? [...moves, "closed" as RmaStatus] : moves).filter(
    (s) =>
      !(s === "sent_to_supplier" && ticket.custody_state === "in_rma_store") &&
      !(s === "returned_from_supplier" && ticket.custody_state === "with_supplier") &&
      !(s === "delivered" && ["in_rma_store", "replacement_received", "with_supplier"].includes(ticket.custody_state ?? "")),
  );
  const [status, setStatus] = useState<RmaStatus | "">(next[0] ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!status) return;
    setSaving(true);
    try {
      await changeRmaStatus(ticket.id, status as RmaStatus, note.trim() || undefined);
      toast.success(`Moved to ${RMA_STATUS_LABEL[status as RmaStatus]}`);
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change status");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title="Move this claim on"
      subtitle={`${ticket.rma_number} — currently ${RMA_STATUS_LABEL[ticket.status]}`}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!status || saving} onClick={() => void submit()}>
            {saving ? "Saving…" : "Update status"}
          </Button>
        </>
      }
    >
      {next.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          This claim is closed — no further moves are possible.
        </p>
      ) : (
        <>
          <Field label="Next stage">
            <FilterSelect
              value={status}
              onChange={(v) => setStatus(v as RmaStatus)}
              width="w-full"
              ariaLabel="Next status"
              options={next.map((s) => ({ value: s, label: RMA_STATUS_LABEL[s] }))}
            />
          </Field>
          <Field label="Note" hint="Shown on the claim history.">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
              className="rounded-none"
            />
          </Field>
        </>
      )}
    </DrawerShell>
  );
}

/* ------------------------------------------------------------ resolution */

const RESOLUTIONS: { value: RmaResolutionType; label: string }[] = (
  Object.keys(RESOLUTION_LABEL) as RmaResolutionType[]
).map((value) => ({ value, label: RESOLUTION_LABEL[value] }));

export function ResolveDrawer({
  open,
  onOpenChange,
  ticket,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ticket: RmaTicket;
  onDone: () => void;
}) {
  const { values: rmaSettings, loaded: rmaSettingsLoaded } = useModuleSettings("rma");
  const defaultResolution = (rmaSettings.defaultResolution as RmaResolutionType) || "paid_repair";
  const [type, setType] = useState<RmaResolutionType>(
    (ticket.resolution_type as RmaResolutionType) || defaultResolution,
  );
  // RMA settings → "Default resolution" arrives after the first render.
  useEffect(() => {
    if (open && rmaSettingsLoaded && !ticket.resolution_type) setType(defaultResolution);
  }, [open, rmaSettingsLoaded, ticket.resolution_type, defaultResolution]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await resolveRmaTicket(ticket.id, type, note.trim() || undefined);
      toast.success(`Resolution set to ${RESOLUTION_LABEL[type]}`);
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not set resolution");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title="Set resolution"
      subtitle="Resolution is independent of claim status."
      footer={
        <>
          <Button variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="rounded-none" disabled={saving} onClick={() => void submit()}>
            {saving ? "Saving…" : "Save resolution"}
          </Button>
        </>
      }
    >
      <Field label="Resolution">
        <FilterSelect
          value={type}
          onChange={(v) => setType(v as RmaResolutionType)}
          options={RESOLUTIONS}
          width="w-full"
        />
      </Field>
      <Field label="Note">
        <Input value={note} onChange={(e) => setNote(e.target.value)} className="rounded-none" />
      </Field>
    </DrawerShell>
  );
}

export function ServiceFromRmaDrawer({
  open,
  onOpenChange,
  ticket,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ticket: RmaTicket;
  onDone: () => void;
}) {
  const warranty = ticket.warranty_status === "in_warranty";
  const [labour, setLabour] = useState(warranty ? "0" : "0");
  const [parts, setParts] = useState("0");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await createRmaServiceJob(ticket.id, Number(labour) || 0, Number(parts) || 0);
      toast.success("Service job created");
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the service job");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title="Create service job"
      subtitle={
        warranty
          ? "In warranty — customer charge should stay zero unless there is an exception."
          : "Paid repair — labour and parts are billed by the service job, not this RMA."
      }
      footer={
        <>
          <Button variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="rounded-none" disabled={saving} onClick={() => void submit()}>
            {saving ? "Creating…" : "Create job"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <Field label="Labour">
          <Input
            type="number"
            min={0}
            value={labour}
            onChange={(e) => setLabour(e.target.value)}
            className="rounded-none"
          />
        </Field>
        <Field label="Parts">
          <Input
            type="number"
            min={0}
            value={parts}
            onChange={(e) => setParts(e.target.value)}
            className="rounded-none"
          />
        </Field>
      </div>
    </DrawerShell>
  );
}

export function RefundDrawer({
  open,
  onOpenChange,
  ticket,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ticket: RmaTicket;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("original");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const value = Number(amount);
    if (!value || value <= 0) return;
    setSaving(true);
    try {
      await refundRmaTicket(ticket.id, value, method);
      toast.success("Refund recorded against the original order");
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not process the refund");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title="Process refund"
      subtitle="Uses the existing commerce/finance refund path. ERP sales-order refunds stay in Sales."
      footer={
        <>
          <Button variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-none"
            disabled={saving || !Number(amount)}
            onClick={() => void submit()}
          >
            {saving ? "Processing…" : "Refund"}
          </Button>
        </>
      }
    >
      <Field label="Amount">
        <Input
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="rounded-none"
        />
      </Field>
      <Field label="Method">
        <FilterSelect
          value={method}
          onChange={setMethod}
          options={[
            { value: "original", label: "Original payment method" },
            { value: "store_credit", label: "Store credit" },
          ]}
          width="w-full"
        />
      </Field>
    </DrawerShell>
  );
}

export function ReplacementDrawer({
  open,
  onOpenChange,
  ticket,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ticket: RmaTicket;
  onDone: () => void;
}) {
  const [itemId, setItemId] = useState(ticket.item_id || "");
  const [warehouseId, setWarehouseId] = useState(ticket.warehouse_id || "");
  const [qty, setQty] = useState("1");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!itemId.trim() || !warehouseId.trim()) return;
    setSaving(true);
    try {
      await replaceRmaTicket(ticket.id, {
        item_id: itemId.trim(),
        warehouse_id: warehouseId.trim(),
        quantity: Number(qty) || 1,
      });
      toast.success("Replacement issued from inventory");
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not issue replacement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title="Issue replacement"
      subtitle="Deducts replacement stock through the inventory movement engine."
      footer={
        <>
          <Button variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-none"
            disabled={saving || !itemId.trim() || !warehouseId.trim()}
            onClick={() => void submit()}
          >
            {saving ? "Issuing…" : "Issue replacement"}
          </Button>
        </>
      }
    >
      <Field label="Item ID" hint="Inventory item to send as the replacement.">
        <Input value={itemId} onChange={(e) => setItemId(e.target.value)} className="rounded-none" />
      </Field>
      <Field label="Warehouse ID">
        <Input
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          className="rounded-none"
        />
      </Field>
      <Field label="Quantity">
        <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="rounded-none" />
      </Field>
    </DrawerShell>
  );
}

export function RestockDrawer({
  open,
  onOpenChange,
  ticket,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ticket: RmaTicket;
  onDone: () => void;
}) {
  const [warehouseId, setWarehouseId] = useState(ticket.warehouse_id || "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!warehouseId.trim()) return;
    setSaving(true);
    try {
      await restockRmaTicket(ticket.id, warehouseId.trim());
      toast.success("Returned to sellable stock");
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not restock");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title="Return to stock"
      subtitle="Only after QC marks the unit resellable. This is a customer_return movement."
      footer={
        <>
          <Button variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-none"
            disabled={saving || !warehouseId.trim()}
            onClick={() => void submit()}
          >
            {saving ? "Posting…" : "Restock"}
          </Button>
        </>
      }
    >
      <Field label="Warehouse ID">
        <Input
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          className="rounded-none"
        />
      </Field>
    </DrawerShell>
  );
}
