"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { ApiLocation, LocationInput } from "@/lib/api/inventory";
import type { Warehouse } from "@/lib/mock-data/inventory";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: ApiLocation | null;
  warehouses: Warehouse[];
  defaultWarehouseId?: string;
  warehouseLabel?: string;
  noun?: "location" | "bin";
  onCreate: (input: LocationInput) => Promise<void>;
  onSave: (id: string, input: Partial<LocationInput>) => Promise<void>;
};

export function LocationDrawer({
  open,
  onOpenChange,
  location,
  warehouses,
  defaultWarehouseId,
  warehouseLabel = "Warehouse",
  noun = "location",
  onCreate,
  onSave,
}: Props) {
  const isEdit = Boolean(location);

  const [warehouseId, setWarehouseId] = React.useState("");
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (location) {
      setWarehouseId(location.warehouse_id);
      setCode(location.code);
      setName(location.name);
      setNotes(location.notes ?? "");
      setIsActive(location.is_active);
    } else {
      setWarehouseId(defaultWarehouseId ?? warehouses[0]?.id ?? "");
      setCode("");
      setName("");
      setNotes("");
      setIsActive(true);
    }
  }, [open, location, defaultWarehouseId, warehouses]);

  const isValid = warehouseId.trim().length > 0 && code.trim().length > 0 && name.trim().length > 0;

  async function handleSubmit() {
    if (!isValid) return;
    setSaving(true);
    try {
      if (isEdit && location) {
        await onSave(location.id, {
          warehouseId,
          code: code.trim(),
          name: name.trim(),
          notes: notes.trim() || undefined,
          isActive,
        });
        toast.success("Location updated");
      } else {
        await onCreate({
          warehouseId,
          code: code.trim(),
          name: name.trim(),
          notes: notes.trim() || undefined,
          isActive,
        });
        toast.success("Location created");
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save location");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title={isEdit ? `Edit ${noun}` : `New ${noun}`} className="w-full max-w-sm overflow-y-auto">
        <h2 className="pr-8 text-base font-semibold">{isEdit ? `Edit ${location?.name}` : `New ${noun}`}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          A bin or zone within a {warehouseLabel.toLowerCase()} — optional finer-grained placement.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <Label className="text-xs">{warehouseLabel}</Label>
            <Select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="mt-1 w-full rounded-none"
              disabled={saving}
            >
              <option value="" disabled>
                Select a {warehouseLabel.toLowerCase()}
              </option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="A1-01"
                disabled={saving}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Aisle A1 Shelf 1"
                disabled={saving}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-none border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={saving}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={saving} />
            Active
          </label>
        </div>

        <Button size="sm" className="mt-5 w-full" onClick={() => void handleSubmit()} disabled={saving || !isValid}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create location"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
