"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createPosTerminal, fetchPosTerminals, fetchPosWarehouses, updatePosTerminal, type PosTerminal } from "@/lib/api/pos";

export default function PosTerminalsPage() {
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<PosTerminal[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    warehouse_id: "",
    receipt_printer: "",
    barcode_scanner: "",
    customer_display: "",
    status: "active",
  });

  const load = useCallback(async () => {
    try {
      const [terminalRows, warehouseRows] = await Promise.all([fetchPosTerminals(), fetchPosWarehouses()]);
      setRows(terminalRows);
      setWarehouses(warehouseRows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load terminals");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    try {
      await createPosTerminal({
        name: form.name,
        code: form.code,
        warehouse_id: form.warehouse_id,
        receipt_printer: form.receipt_printer || undefined,
        barcode_scanner: form.barcode_scanner || undefined,
        customer_display: form.customer_display || undefined,
        status: form.status,
      });
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save terminal");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <h1 className="text-sm font-semibold">Terminals</h1>
        <Button size="sm" className="rounded-none" onClick={() => setOpen(true)}>
          New terminal
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/30 text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Name</th>
              <th className="px-3 py-1.5 font-medium">Code</th>
              <th className="px-3 py-1.5 font-medium">Warehouse</th>
              <th className="px-3 py-1.5 font-medium">Status</th>
              <th className="px-3 py-1.5 font-medium">Printer</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border">
                <td className="px-3 py-1.5">{row.name}</td>
                <td className="px-3 py-1.5">{row.code}</td>
                <td className="px-3 py-1.5">{warehouses.find((w) => w.id === row.warehouse_id)?.name || row.warehouse_id}</td>
                <td className="px-3 py-1.5">{row.status}</td>
                <td className="px-3 py-1.5">{row.receipt_printer || "—"}</td>
                <td className="px-3 py-1.5">
                  {row.status === "active" ? (
                    <Button size="sm" variant="outline" className="rounded-none" onClick={() => void updatePosTerminal(row.id, { status: "inactive" }).then(load)}>
                      Deactivate
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="rounded-none" onClick={() => void updatePosTerminal(row.id, { status: "active" }).then(load)}>
                      Activate
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent resizable className="min-w-[280px] w-[420px] max-w-[720px] rounded-none p-0" title="New terminal">
          <SheetHeader className="border-b border-border px-3 py-2">
            <SheetTitle className="text-sm">New terminal</SheetTitle>
          </SheetHeader>
          <div className="space-y-2 p-3">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
            <Label>Code</Label>
            <Input value={form.code} onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))} />
            <Label>Warehouse</Label>
            <select
              className="flex h-8 w-full rounded-none border border-input bg-background px-2.5 text-xs"
              value={form.warehouse_id}
              onChange={(e) => setForm((s) => ({ ...s, warehouse_id: e.target.value }))}
            >
              <option value="">Select</option>
              {warehouses.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            <Label>Receipt printer</Label>
            <Input value={form.receipt_printer} onChange={(e) => setForm((s) => ({ ...s, receipt_printer: e.target.value }))} />
            <Label>Barcode scanner</Label>
            <Input value={form.barcode_scanner} onChange={(e) => setForm((s) => ({ ...s, barcode_scanner: e.target.value }))} />
            <Label>Customer display</Label>
            <Input value={form.customer_display} onChange={(e) => setForm((s) => ({ ...s, customer_display: e.target.value }))} />
            <Button className="rounded-none" onClick={() => void save()} disabled={!form.name || !form.code || !form.warehouse_id}>
              Save
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
