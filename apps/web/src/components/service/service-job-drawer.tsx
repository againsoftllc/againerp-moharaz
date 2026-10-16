"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { createServiceJob } from "@/lib/api/service-jobs";
import { useCommerceCustomers } from "@/lib/api/use-commerce-customers";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import { listHrmEmployees } from "@/lib/api/hrm-employees";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

/** Walk-in / non-RMA repair — product not sold by us never creates an RMA. */
export function ServiceJobDrawer({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const { customers } = useCommerceCustomers();
  const { warehouses } = useInventoryWarehouses();
  const [technicians, setTechnicians] = useState<{ id: string; name: string }[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [productName, setProductName] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [sku, setSku] = useState("");
  const [serial, setSerial] = useState("");
  const [imei, setImei] = useState("");
  const [issue, setIssue] = useState("");
  const [condition, setCondition] = useState("");
  const [priority, setPriority] = useState("normal");
  const [technicianId, setTechnicianId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void listHrmEmployees({ per_page: 200, employee_status: "active" })
      .then((res) => setTechnicians(res.rows.map((e) => ({ id: e.id, name: e.name }))))
      .catch(() => setTechnicians([]));
  }, [open]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId],
  );

  const pickCustomer = (id: string) => {
    setCustomerId(id);
    const row = customers.find((c) => c.id === id);
    if (row) {
      setCustomerName(row.name);
      setPhone(row.phone || "");
      setEmail(row.email || "");
    }
  };

  const blocked = !(customerName.trim() || selectedCustomer) || !issue.trim();

  const submit = async () => {
    if (blocked) return;
    setSaving(true);
    try {
      const tech = technicians.find((t) => t.id === technicianId);
      const job = await createServiceJob({
        customer_id: customerId || undefined,
        customer_name: customerName.trim(),
        customer_phone: phone.trim() || undefined,
        customer_email: email.trim() || undefined,
        product_name: productName.trim() || undefined,
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
        sku: sku.trim() || undefined,
        serial_number: serial.trim() || undefined,
        imei: imei.trim() || undefined,
        issue: issue.trim(),
        condition_notes: condition.trim() || undefined,
        priority,
        technician_id: technicianId || undefined,
        technician_name: tech?.name,
        warehouse_id: warehouseId || undefined,
        service_type: "direct",
      });
      toast.success(`${job.job_number} opened`);
      onOpenChange(false);
      onCreated?.(job.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the service job");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        closeButton="inside"
        resizable
        className="flex min-w-[160px] w-[460px] max-w-[720px] flex-col p-0"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 pr-10">
          <Button className="rounded-none" size="sm" disabled={blocked || saving} onClick={() => void submit()}>
            {saving ? "Opening…" : "Save"}
          </Button>
          <div>
            <h2 className="text-sm font-semibold">New job card</h2>
            <p className="text-[11px] text-muted-foreground">
              External / walk-in devices — this is not an RMA.
            </p>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <Field label="Customer (CRM)">
            <Select value={customerId} onChange={(e) => pickCustomer(e.target.value)} className="w-full">
              <option value="">Walk-in / name only</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Customer name">
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="rounded-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-none" />
            </Field>
            <Field label="Email">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-none" />
            </Field>
          </div>
          <Field label="Device / product">
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="rounded-none"
              placeholder="Dell monitor, iPhone 15…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Brand">
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} className="rounded-none" />
            </Field>
            <Field label="Model">
              <Input value={model} onChange={(e) => setModel(e.target.value)} className="rounded-none" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="SKU">
              <Input value={sku} onChange={(e) => setSku(e.target.value)} className="rounded-none" />
            </Field>
            <Field label="Serial">
              <Input value={serial} onChange={(e) => setSerial(e.target.value)} className="rounded-none" />
            </Field>
          </div>
          <Field label="IMEI">
            <Input value={imei} onChange={(e) => setImei(e.target.value)} className="rounded-none" />
          </Field>
          <Field label="Customer complaint">
            <Textarea value={issue} onChange={(e) => setIssue(e.target.value)} rows={4} />
          </Field>
          <Field label="Received condition">
            <Textarea value={condition} onChange={(e) => setCondition(e.target.value)} rows={2} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Priority">
              <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </Field>
            <Field label="Technician">
              <Select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} className="w-full">
                <option value="">Unassigned</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Warehouse (for parts)">
            <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full">
              <option value="">Select later</option>
              {warehouses
                .filter((w) => w.active)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
      </SheetContent>
    </Sheet>
  );
}
