"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { useCommerceSuppliers } from "@/lib/api/use-commerce-suppliers";
import {
  addRmaCharge,
  changeRmaStatus,
  createRmaServiceJob,
  inspectRmaTicket,
  overrideWarranty,
  raiseRmaBill,
  refundRmaTicket,
  replaceRmaTicket,
  resolveRmaTicket,
  restockRmaTicket,
  RMA_NEXT_STATUSES,
  RMA_STATUS_LABEL,
  RESOLUTION_LABEL,
  saveSupplierJob,
  type RmaResolutionType,
  type RmaTicket,
  type RmaStatus,
  type WarrantyStatus,
} from "@/lib/api/rma";
import { formatCurrency } from "@/lib/utils";

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
  const next = RMA_NEXT_STATUSES[ticket.status] ?? [];
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

/* ---------------------------------------------------------- warranty */

export function WarrantyDrawer({
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
  const [status, setStatus] = useState<WarrantyStatus>(ticket.warranty_status);
  const [expires, setExpires] = useState(ticket.warranty_expires_on ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await overrideWarranty(ticket.id, status, note.trim() || undefined, expires || undefined);
      toast.success("Warranty decision recorded");
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not set warranty");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title="Set warranty by hand"
      subtitle="Use this when the automatic check could not decide, or the customer has proof."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={saving} onClick={() => void submit()}>
            {saving ? "Saving…" : "Record decision"}
          </Button>
        </>
      }
    >
      <Field label="Warranty">
        <FilterSelect
          value={status}
          onChange={(v) => setStatus(v as WarrantyStatus)}
          width="w-full"
          ariaLabel="Warranty status"
          options={[
            { value: "in_warranty", label: "In warranty" },
            { value: "out_of_warranty", label: "Out of warranty" },
            { value: "unknown", label: "Still unverified" },
          ]}
        />
      </Field>
      <Field label="Expires on">
        <Input
          type="date"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
          className="rounded-none"
        />
      </Field>
      <Field label="Reason" hint="Recorded against the claim so the call can be justified later.">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Customer produced the invoice…"
          className="rounded-none"
        />
      </Field>
      {status === "out_of_warranty" && (
        <p className="border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          Marking it out of warranty makes the repair billable.
        </p>
      )}
    </DrawerShell>
  );
}

/* ----------------------------------------------------------- charges */

export function ChargeDrawer({
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
  const [kind, setKind] = useState<"part" | "labour" | "misc">("part");
  const [description, setDescription] = useState("");
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [saving, setSaving] = useState(false);

  const qty = Number.parseFloat(quantity);
  const price = Number.parseFloat(unitPrice);
  const blocked =
    !description.trim() || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0;
  const lineTotal = blocked ? 0 : qty * price;

  const submit = async () => {
    if (blocked) return;
    setSaving(true);
    try {
      await addRmaCharge(ticket.id, {
        kind,
        description: description.trim(),
        quantity: qty,
        unit_price: price,
        tax_rate: Number.parseFloat(taxRate) || 0,
        sku: sku.trim() || undefined,
      });
      toast.success("Charge added");
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the charge");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title="Add a charge"
      subtitle="Parts fitted and labour done on this repair."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={blocked || saving} onClick={() => void submit()}>
            {saving ? "Adding…" : "Add charge"}
          </Button>
        </>
      }
    >
      <Field label="Type">
        <FilterSelect
          value={kind}
          onChange={(v) => setKind(v as "part" | "labour" | "misc")}
          width="w-full"
          ariaLabel="Charge type"
          options={[
            { value: "part", label: "Part" },
            { value: "labour", label: "Labour" },
            { value: "misc", label: "Other" },
          ]}
        />
      </Field>
      <Field label="Description">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={kind === "labour" ? "Diagnostics and reassembly" : "Replacement part"}
          className="rounded-none"
        />
      </Field>
      {kind === "part" && (
        <Field label="Part SKU" hint="Optional — links the charge to a stocked part.">
          <Input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="SKU-…"
            className="rounded-none"
          />
        </Field>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Field label={kind === "labour" ? "Hours" : "Qty"}>
          <Input
            type="number"
            min={0}
            step="0.5"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="rounded-none"
          />
        </Field>
        <Field label="Unit price">
          <Input
            type="number"
            min={0}
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            className="rounded-none"
          />
        </Field>
        <Field label="Tax %">
          <Input
            type="number"
            min={0}
            max={100}
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
            className="rounded-none"
          />
        </Field>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Line total <span className="font-medium text-foreground">{formatCurrency(lineTotal)}</span>{" "}
        before tax.
      </p>
    </DrawerShell>
  );
}

/* ----------------------------------------------------- supplier job */

export function SupplierJobDrawer({
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
  const { suppliers } = useCommerceSuppliers();
  const job = ticket.supplier_job;
  const [supplierId, setSupplierId] = useState(job?.supplier_id ?? "");
  const [status, setStatus] = useState(job?.status ?? "draft");
  const [dispatched, setDispatched] = useState(job?.dispatched_at ?? "");
  const [reference, setReference] = useState(job?.supplier_reference ?? "");
  const [expected, setExpected] = useState(job?.expected_return_date ?? "");
  const [returned, setReturned] = useState(job?.returned_at ?? "");
  const [cost, setCost] = useState(job ? String(Number(job.cost)) : "0");
  const [notes, setNotes] = useState(job?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!supplierId) return;
    setSaving(true);
    try {
      await saveSupplierJob(ticket.id, {
        supplier_id: supplierId,
        status,
        dispatched_at: dispatched || undefined,
        supplier_reference: reference.trim() || undefined,
        expected_return_date: expected || undefined,
        returned_at: returned || undefined,
        cost: Number.parseFloat(cost) || 0,
        notes: notes.trim() || undefined,
      });
      toast.success("Supplier job saved");
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the supplier job");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title={job ? "Update supplier job" : "Send to supplier"}
      subtitle="Track the unit while it is out with the supplier."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!supplierId || saving} onClick={() => void submit()}>
            {saving ? "Saving…" : "Save job"}
          </Button>
        </>
      }
    >
      <Field label="Supplier">
        <FilterSelect
          value={supplierId}
          onChange={setSupplierId}
          width="w-full"
          ariaLabel="Supplier"
          options={[
            { value: "", label: "Select supplier…" },
            ...suppliers.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
      </Field>
      <Field label="Job status">
        <FilterSelect
          value={status}
          onChange={setStatus}
          width="w-full"
          ariaLabel="Job status"
          options={[
            { value: "draft", label: "Draft" },
            { value: "dispatched", label: "Dispatched" },
            { value: "acknowledged", label: "Acknowledged" },
            { value: "in_progress", label: "In progress" },
            { value: "completed", label: "Completed" },
            { value: "returned", label: "Returned to us" },
            { value: "rejected", label: "Rejected by supplier" },
          ]}
        />
      </Field>
      <Field label="Their reference">
        <Input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Supplier RMA number"
          className="rounded-none"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Dispatched">
          <Input
            type="date"
            value={dispatched}
            onChange={(e) => setDispatched(e.target.value)}
            className="rounded-none"
          />
        </Field>
        <Field label="Expected back">
          <Input
            type="date"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            className="rounded-none"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Returned on">
          <Input
            type="date"
            value={returned}
            onChange={(e) => setReturned(e.target.value)}
            className="rounded-none"
          />
        </Field>
        <Field label="Supplier cost">
          <Input
            type="number"
            min={0}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="rounded-none"
          />
        </Field>
      </div>
      <Field label="Notes">
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What the supplier is doing"
          className="rounded-none"
        />
      </Field>
    </DrawerShell>
  );
}

/* ------------------------------------------------------------- bill */

export function BillDrawer({
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
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const bill = await raiseRmaBill(ticket.id, dueDate || undefined);
      toast.success(`${bill.invoice_number} raised for ${formatCurrency(Number(bill.amount))}`);
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not raise the bill");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title="Bill the customer"
      subtitle={`${ticket.rma_number} — ${ticket.customer_name}`}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={saving} onClick={() => void submit()}>
            {saving ? "Raising…" : "Raise invoice"}
          </Button>
        </>
      }
    >
      <div className="border border-border">
        <div className="flex justify-between px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">Parts</span>
          <span className="tabular-nums">{formatCurrency(Number(ticket.parts_total))}</span>
        </div>
        <div className="flex justify-between border-t border-border px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">Labour &amp; other</span>
          <span className="tabular-nums">{formatCurrency(Number(ticket.labour_total))}</span>
        </div>
        <div className="flex justify-between border-t border-border px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">Tax</span>
          <span className="tabular-nums">{formatCurrency(Number(ticket.tax_total))}</span>
        </div>
        <div className="flex justify-between border-t border-border px-3 py-1.5 text-xs font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatCurrency(Number(ticket.total))}</span>
        </div>
      </div>

      <Field label="Due date">
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded-none"
        />
      </Field>

      <p className="text-[11px] text-muted-foreground">
        This raises a receivable on the customer&apos;s account, and locks the charges.
      </p>
      {ticket.warranty_status === "in_warranty" && (
        <p className="border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          This claim is marked in warranty — make sure the charges really are billable.
        </p>
      )}
    </DrawerShell>
  );
}

/* ------------------------------------------------------------ inspection */

const PHYSICAL = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like new" },
  { value: "used", label: "Used" },
  { value: "damaged", label: "Damaged" },
  { value: "heavily_damaged", label: "Heavily damaged" },
];
const FUNCTIONAL = [
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "partial", label: "Partially working" },
];
const QC = [
  { value: "resellable", label: "Resellable" },
  { value: "repairable", label: "Repairable" },
  { value: "scrap", label: "Scrap" },
  { value: "supplier_return", label: "Supplier return" },
];

export function InspectionDrawer({
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
  const [physical, setPhysical] = useState(ticket.physical_condition || "used");
  const [functional, setFunctional] = useState(ticket.functional_result || "failed");
  const [qc, setQc] = useState(ticket.qc_result || "repairable");
  const [notes, setNotes] = useState(ticket.inspection_notes || "");
  const [accessories, setAccessories] = useState(ticket.accessories || "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await inspectRmaTicket(ticket.id, {
        physical_condition: physical,
        functional_result: functional,
        qc_result: qc,
        notes: notes.trim() || undefined,
        accessories: accessories.trim() || undefined,
      });
      toast.success("Inspection recorded");
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record inspection");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title="Inspection / QC"
      subtitle={ticket.rma_number}
      footer={
        <>
          <Button variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="rounded-none" disabled={saving} onClick={() => void submit()}>
            {saving ? "Saving…" : "Save inspection"}
          </Button>
        </>
      }
    >
      <Field label="Physical condition">
        <FilterSelect value={physical} onChange={setPhysical} options={PHYSICAL} width="w-full" />
      </Field>
      <Field label="Functional result">
        <FilterSelect value={functional} onChange={setFunctional} options={FUNCTIONAL} width="w-full" />
      </Field>
      <Field label="QC result">
        <FilterSelect value={qc} onChange={setQc} options={QC} width="w-full" />
      </Field>
      <Field label="Accessories" hint="Box, charger, cable, manual, warranty card…">
        <Input value={accessories} onChange={(e) => setAccessories(e.target.value)} className="rounded-none" />
      </Field>
      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="w-full rounded-none border border-input bg-background px-2 py-1.5 text-sm"
        />
      </Field>
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
  const [type, setType] = useState<RmaResolutionType>(
    (ticket.resolution_type as RmaResolutionType) || "paid_repair",
  );
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
