"use client";
/* DEPRECATED: one-shot stock mutation UI. Stock Grid now routes to
   Stock Adjustments / Transfers / Counts. Do not wire this dialog back in. */

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import { adjustStockLevel, type StockAdjustInput } from "@/lib/api/inventory";
import type { StockItem, Warehouse } from "@/lib/mock-data/inventory";

type MovementType = StockAdjustInput["movementType"];

const MOVEMENT_OPTIONS: { value: MovementType; label: string; hint: string }[] = [
  { value: "in", label: "Stock in", hint: "Add received units to on hand." },
  { value: "out", label: "Stock out", hint: "Remove units from on hand." },
  { value: "adjustment", label: "Set exact quantity", hint: "Overwrite on hand with a counted value." },
  { value: "transfer", label: "Transfer", hint: "Move units to another warehouse." },
];

export function StockAdjustDialog({
  open,
  onOpenChange,
  item,
  warehouses,
  onAdjusted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: StockItem | null;
  warehouses: Warehouse[];
  onAdjusted?: () => void;
}) {
  const [movementType, setMovementType] = useState<MovementType>("in");
  const [quantity, setQuantity] = useState("1");
  const [destWarehouseId, setDestWarehouseId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const destOptions = useMemo(
    () =>
      warehouses
        .filter((w) => w.active && w.id !== item?.warehouseId)
        .map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
    [warehouses, item?.warehouseId],
  );

  const hint = MOVEMENT_OPTIONS.find((o) => o.value === movementType)?.hint ?? "";
  const qty = Number.parseInt(quantity, 10);
  const qtyValid = Number.isFinite(qty) && qty >= 0;

  const projected = useMemo(() => {
    if (!item || !qtyValid) return null;
    if (movementType === "in") return item.onHand + qty;
    if (movementType === "out") return item.onHand - qty;
    if (movementType === "adjustment") return qty;
    return item.onHand - qty; // transfer moves units out of this warehouse
  }, [item, movementType, qty, qtyValid]);

  const blocked =
    !item ||
    !qtyValid ||
    (movementType === "transfer" && !destWarehouseId) ||
    ((movementType === "out" || movementType === "transfer") && qty > (item?.onHand ?? 0));

  const submit = async () => {
    if (!item || blocked) return;
    setSaving(true);
    try {
      await adjustStockLevel(item.id, {
        movementType,
        quantity: qty,
        destWarehouseId: movementType === "transfer" ? destWarehouseId : undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(`Stock updated for ${item.sku}`);
      onOpenChange(false);
      onAdjusted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Stock adjustment failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(460px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-input bg-background p-6 shadow-xl">
          <Dialog.Title className="text-base font-semibold">Adjust stock</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            {item
              ? `${item.sku} — ${item.name} · ${item.warehouse} · on hand ${item.onHand}`
              : "Select a stock line"}
          </Dialog.Description>

          <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Movement</label>
            <FilterSelect
              value={movementType}
              onChange={(value) => setMovementType(value as MovementType)}
              width="w-full"
              ariaLabel="Movement type"
              options={MOVEMENT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          </div>

          {movementType === "transfer" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Destination warehouse</label>
              <FilterSelect
                value={destWarehouseId}
                onChange={setDestWarehouseId}
                width="w-full"
                ariaLabel="Destination warehouse"
                options={[{ value: "", label: "Select warehouse…" }, ...destOptions]}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Quantity</label>
            <Input
              type="number"
              min={0}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="rounded-none"
            />
            {projected !== null && (
              <p className="text-[11px] text-muted-foreground">
                On hand {item?.onHand} → <span className="font-medium text-foreground">{projected}</span>
                {projected < 0 && <span className="ml-1 text-destructive">(not enough stock)</span>}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Reference</label>
            <Input
              placeholder="PO-1042, count sheet #7…"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="rounded-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Notes</label>
            <Input
              placeholder="Optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-none"
            />
          </div>
        </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={blocked || saving} onClick={() => void submit()}>
              {saving ? "Applying…" : "Apply"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
