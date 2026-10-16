"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useCommerceCustomers } from "@/lib/api/use-commerce-customers";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import {
  addServiceJobLine,
  billServiceJob,
  createServiceJob,
  searchServiceCatalog,
  type ServiceCatalogItem,
} from "@/lib/api/service-jobs";
import { formatCurrency } from "@/lib/utils";

type DraftLine = {
  key: string;
  kind: "service" | "part" | "custom";
  item_id?: string;
  sku?: string;
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

export function ServiceInvoiceDrawer({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (jobId: string) => void;
}) {
  const { customers } = useCommerceCustomers();
  const { warehouses } = useInventoryWarehouses();
  const [customerId, setCustomerId] = useState("");
  const [issue, setIssue] = useState("Direct service");
  const [warehouseId, setWarehouseId] = useState("");
  const [catalogQ, setCatalogQ] = useState("");
  const [catalog, setCatalog] = useState<ServiceCatalogItem[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [customName, setCustomName] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [saving, setSaving] = useState(false);

  const customer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId],
  );

  useEffect(() => {
    if (!catalogQ.trim()) return;
    const t = window.setTimeout(() => {
      void searchServiceCatalog(catalogQ)
        .then(setCatalog)
        .catch(() => setCatalog([]));
    }, 200);
    return () => window.clearTimeout(t);
  }, [catalogQ]);

  const total = lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
  const blocked = !customerId || lines.length === 0;

  const addItem = (item: ServiceCatalogItem) => {
    setLines((prev) => [
      ...prev,
      {
        key: `${item.id}-${Date.now()}`,
        kind: item.kind === "part" ? "part" : "service",
        item_id: item.id,
        sku: item.sku,
        name: item.name,
        quantity: 1,
        unit: item.unit,
        unit_price: Number(item.rate) || 0,
      },
    ]);
    setCatalogQ("");
    setCatalog([]);
  };

  const addCustom = () => {
    if (!customName.trim()) return;
    setLines((prev) => [
      ...prev,
      {
        key: `custom-${Date.now()}`,
        kind: "custom",
        name: customName.trim(),
        quantity: 1,
        unit: "job",
        unit_price: Number(customRate) || 0,
      },
    ]);
    setCustomName("");
    setCustomRate("");
  };

  const submit = async () => {
    if (blocked || !customer) return;
    const needsWarehouse = lines.some((l) => l.kind === "part");
    if (needsWarehouse && !warehouseId) {
      toast.error("Choose a warehouse before adding inventory parts");
      return;
    }
    setSaving(true);
    try {
      const job = await createServiceJob({
        invoice_only: true,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone || undefined,
        customer_email: customer.email || undefined,
        issue: issue.trim() || "Direct service",
        warehouse_id: warehouseId || undefined,
        service_type: "direct",
      });
      for (const line of lines) {
        await addServiceJobLine(job.id, {
          kind: line.kind,
          item_id: line.item_id,
          sku: line.sku,
          name: line.name,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unit_price,
          warehouse_id: line.kind === "part" ? warehouseId : undefined,
        });
      }
      await billServiceJob(job.id);
      toast.success(`${job.job_number} invoiced`);
      onOpenChange(false);
      onCreated?.(job.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the service invoice");
    } finally {
      setSaving(false);
    }
  };

  const services = catalogQ.trim() ? catalog.filter((c) => c.kind === "service") : [];
  const parts = catalogQ.trim() ? catalog.filter((c) => c.kind === "part") : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        closeButton="inside"
        resizable
        className="flex min-w-[160px] w-[560px] max-w-[720px] flex-col p-0"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 pr-10">
          <Button className="rounded-none" size="sm" disabled={blocked || saving} onClick={() => void submit()}>
            {saving ? "Saving…" : "Confirm"}
          </Button>
          <div>
            <h2 className="text-sm font-semibold">New service invoice</h2>
            <p className="text-[11px] text-muted-foreground">
              Mix service items and inventory products. Payment is recorded in Finance.
            </p>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <Field label="Customer">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full">
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description">
            <Input value={issue} onChange={(e) => setIssue(e.target.value)} className="rounded-none" />
          </Field>
          <Field label="Warehouse (inventory parts)">
            <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full">
              <option value="">Select</option>
              {warehouses
                .filter((w) => w.active)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Add item">
            <Input
              value={catalogQ}
              onChange={(e) => setCatalogQ(e.target.value)}
              className="rounded-none"
              placeholder="Search services and products…"
            />
            {catalog.length > 0 ? (
              <div className="mt-2 max-h-40 overflow-auto border border-border">
                {services.length > 0 ? (
                  <>
                    <div className="bg-muted/40 px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                      Services
                    </div>
                    {services.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="flex w-full items-center justify-between border-b border-border px-2 py-1.5 text-left text-xs hover:bg-accent"
                        onClick={() => addItem(item)}
                      >
                        <span>{item.name}</span>
                        <span className="tabular-nums">{formatCurrency(Number(item.rate))}</span>
                      </button>
                    ))}
                  </>
                ) : null}
                {parts.length > 0 ? (
                  <>
                    <div className="bg-muted/40 px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                      Products
                    </div>
                    {parts.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="flex w-full items-center justify-between border-b border-border px-2 py-1.5 text-left text-xs hover:bg-accent"
                        onClick={() => addItem(item)}
                      >
                        <span>{item.name}</span>
                        <span className="tabular-nums">{formatCurrency(Number(item.rate))}</span>
                      </button>
                    ))}
                  </>
                ) : null}
              </div>
            ) : null}
          </Field>
          <div className="grid grid-cols-[1fr_100px_auto] gap-1.5">
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="rounded-none"
              placeholder="Custom service"
            />
            <Input
              type="number"
              min={0}
              value={customRate}
              onChange={(e) => setCustomRate(e.target.value)}
              className="rounded-none"
              placeholder="Rate"
            />
            <Button type="button" variant="outline" className="rounded-none" onClick={addCustom}>
              Add
            </Button>
          </div>
          <table className="w-full text-xs">
            <thead className="text-left text-[11px] text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Type</th>
                <th className="py-1 font-medium">Item</th>
                <th className="py-1 text-right font-medium">Qty</th>
                <th className="py-1 text-right font-medium">Rate</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key} className="border-t border-border">
                  <td className="py-1.5 capitalize">{line.kind}</td>
                  <td className="py-1.5">{line.name}</td>
                  <td className="py-1.5 text-right">
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((row) =>
                            row.key === line.key
                              ? { ...row, quantity: Math.max(1, Number(e.target.value) || 1) }
                              : row,
                          ),
                        )
                      }
                      className="ml-auto h-7 w-16 rounded-none text-right"
                    />
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(line.unit_price)}</td>
                  <td className="py-1.5 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-none"
                      onClick={() => setLines((prev) => prev.filter((row) => row.key !== line.key))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end text-sm font-medium">Total {formatCurrency(total)}</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
