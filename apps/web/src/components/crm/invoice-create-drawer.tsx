"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { fetchClients, type ApiClient } from "@/lib/api/crm-clients";
import { fetchCrmProjects, type ApiCrmProject } from "@/lib/api/crm";
import { createSalesInvoice } from "@/lib/api/sales-invoices";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (invoiceId: string) => void;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function InvoiceCreateDrawer({ open, onOpenChange, onCreated }: Props) {
  const [clients, setClients] = React.useState<ApiClient[]>([]);
  const [projects, setProjects] = React.useState<ApiCrmProject[]>([]);
  const [customerId, setCustomerId] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [billDate, setBillDate] = React.useState(today());
  const [dueDate, setDueDate] = React.useState("");
  const [taxRate, setTaxRate] = React.useState("0");
  const [secondTaxRate, setSecondTaxRate] = React.useState("0");
  const [tdsRate, setTdsRate] = React.useState("0");
  const [isRecurring, setIsRecurring] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCustomerId("");
    setProjectId("");
    setBillDate(today());
    setDueDate("");
    setTaxRate("0");
    setSecondTaxRate("0");
    setTdsRate("0");
    setIsRecurring(false);
    setNotes("");
    void fetchClients()
      .then((res) => setClients(res.data))
      .catch(() => setClients([]));
  }, [open]);

  React.useEffect(() => {
    if (!customerId) {
      setProjects([]);
      setProjectId("");
      return;
    }
    void fetchCrmProjects({ customer_id: customerId })
      .then((res) => setProjects(res.data))
      .catch(() => setProjects([]));
  }, [customerId]);

  const isValid = customerId.length > 0 && billDate.length > 0;

  async function handleSubmit() {
    if (!isValid) return;
    setSaving(true);
    try {
      const res = await createSalesInvoice({
        customer_id: customerId,
        project_id: projectId || undefined,
        bill_date: billDate,
        due_date: dueDate || undefined,
        tax_rate: taxRate || "0",
        second_tax_rate: secondTaxRate || "0",
        tds_rate: tdsRate || "0",
        is_recurring: isRecurring,
        notes: notes.trim() || undefined,
        lines: [],
      });
      toast.success(`Invoice ${res.data.invoice_number} created`);
      onCreated(res.data.id);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title="New invoice"
        resizable
        resizeMaxWidth={1000}
        className="flex w-full max-w-lg flex-col overflow-hidden"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-input pb-3 pr-8">
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={() => void handleSubmit()} disabled={!isValid || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
          <h2 className="text-base font-semibold">New invoice</h2>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Bill date</Label>
              <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} disabled={saving} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={saving} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Client</Label>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-none" disabled={saving}>
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Project</Label>
            <Select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-none"
              disabled={saving || !customerId}
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>TAX (%)</Label>
              <Input type="number" min="0" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} disabled={saving} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Second TAX (%)</Label>
              <Input type="number" min="0" step="0.01" value={secondTaxRate} onChange={(e) => setSecondTaxRate(e.target.value)} disabled={saving} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>TDS (%)</Label>
              <Input type="number" min="0" step="0.01" value={tdsRate} onChange={(e) => setTdsRate(e.target.value)} disabled={saving} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              disabled={saving}
              className="h-3.5 w-3.5 rounded-none border-input"
            />
            Recurring
          </label>

          <div className="flex flex-col gap-1.5">
            <Label>Note</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              disabled={saving}
              className="w-full rounded-none border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Labels</Label>
            <p className="text-[11px] text-muted-foreground">Save the invoice first to add labels.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Upload file</Label>
            <p className="text-[11px] text-muted-foreground">Save the invoice first to attach files.</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
