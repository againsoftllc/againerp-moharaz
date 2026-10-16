"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { apiFetch } from "@/lib/api/client";
import { apiStockToStockItem, type ApiStockListResponse } from "@/lib/api/inventory";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import { registerSerials, type SerialBatchResponse } from "@/lib/api/inventory-serials";

type ItemOption = { id: string; sku: string; name: string };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Bulk-register serials for one item — the intake point for stock that was
 * never received through a purchase receipt (older stock, manual counts).
 */
export function SerialRegisterDrawer({
  open,
  onOpenChange,
  onRegistered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistered?: () => void;
}) {
  const { warehouses } = useInventoryWarehouses(open);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [serialText, setSerialText] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SerialBatchResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<ApiStockListResponse>("/api/v1/inventory/stock?limit=1000");
        if (cancelled) return;
        const rows = res.data.map(apiStockToStockItem);
        const seen = new Set<string>();
        const options: ItemOption[] = [];
        for (const row of rows) {
          if (!row.itemId || seen.has(row.itemId)) continue;
          seen.add(row.itemId);
          options.push({ id: row.itemId, sku: row.sku, name: row.name });
        }
        setItems(options.sort((a, b) => a.sku.localeCompare(b.sku)));
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items.slice(0, 60);
    return items.filter((i) => `${i.sku} ${i.name}`.toLowerCase().includes(q)).slice(0, 60);
  }, [items, itemSearch]);

  const serialCount = serialText
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean).length;

  const submit = async () => {
    if (!itemId || serialCount === 0) return;
    setSaving(true);
    try {
      const serials = serialText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await registerSerials({
        serial_numbers: serials,
        item_id: itemId,
        warehouse_id: warehouseId || undefined,
        source_type: "manual",
        notes: notes.trim() || undefined,
      });
      setResult(res);
      if (res.created > 0) {
        toast.success(`${res.created} serial${res.created === 1 ? "" : "s"} registered`);
        onRegistered?.();
      }
      if (res.duplicates > 0 || res.rejected > 0) {
        toast.message(`${res.duplicates + res.rejected} skipped — see details below`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setItemId("");
    setSerialText("");
    setNotes("");
    setResult(null);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="flex w-[460px] flex-col gap-0 overflow-y-auto">
        <div className="border-b border-border pb-3">
          <h3 className="text-sm font-semibold">Register serial numbers</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Paste one serial per line for stock that never came through a receipt.
          </p>
        </div>

        <div className="flex-1 space-y-4 py-4">
          <Field label="Item">
            <Input
              placeholder="Search SKU or name…"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              className="mb-1.5 rounded-none"
            />
            <FilterSelect
              value={itemId}
              onChange={setItemId}
              width="w-full"
              ariaLabel="Item"
              options={filteredItems.map((i) => ({ value: i.id, label: `${i.sku} — ${i.name}` }))}
            />
          </Field>

          <Field label="Warehouse" hint="Optional — leave blank if you're not tracking location yet.">
            <FilterSelect
              value={warehouseId}
              onChange={setWarehouseId}
              width="w-full"
              ariaLabel="Warehouse"
              options={[
                { value: "", label: "No warehouse" },
                ...warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
              ]}
            />
          </Field>

          <Field
            label="Serial numbers"
            hint={`One per line or comma-separated. ${serialCount} unit${serialCount === 1 ? "" : "s"}.`}
          >
            <Textarea
              value={serialText}
              onChange={(e) => setSerialText(e.target.value)}
              rows={6}
              placeholder={"SN-000123\nSN-000124\nSN-000125"}
              className="rounded-none font-mono text-[12px]"
            />
          </Field>

          <Field label="Notes">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="rounded-none text-[12px]"
            />
          </Field>

          {result && (
            <div className="border border-border">
              <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px]">
                <span>{result.created} created</span>
                <span className="text-muted-foreground">·</span>
                <span>{result.duplicates} duplicate</span>
                <span className="text-muted-foreground">·</span>
                <span>{result.rejected} rejected</span>
              </div>
              <div className="max-h-40 divide-y divide-border overflow-y-auto">
                {result.data.map((r) => (
                  <div
                    key={r.serial_number}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]"
                  >
                    <span className="truncate font-mono">{r.serial_number}</span>
                    <span className="flex items-center gap-1.5">
                      {r.detail && <span className="text-muted-foreground">{r.detail}</span>}
                      <Badge
                        variant="outline"
                        className={
                          r.outcome === "created"
                            ? "rounded-none border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
                            : "rounded-none border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                        }
                      >
                        {r.outcome}
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border pt-3">
          <Button className="rounded-none" disabled={!itemId || serialCount === 0 || saving} onClick={submit}>
            {saving ? "Registering…" : `Register ${serialCount || ""}`.trim()}
          </Button>
          <Button variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
