"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { createServiceItem, patchItem, type ItemRecord } from "@/lib/api/items";
import {
  buildServiceCategoryTree,
  createServiceCategory,
  flattenServiceCategoryTree,
  useServiceCategories,
} from "@/lib/api/service-categories";

const UNITS = ["Job", "Hour", "Visit", "Device", "Unit"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

function skuFromName(name: string) {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 16);
  return `SRV-${slug || Date.now().toString(36).toUpperCase()}`;
}

export function ServiceItemDrawer({
  open,
  onOpenChange,
  item,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ItemRecord | null;
  onSaved?: () => void;
}) {
  const { categories, refetch } = useServiceCategories();
  const tree = useMemo(
    () => flattenServiceCategoryTree(buildServiceCategoryTree(categories)),
    [categories],
  );

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("Job");
  const [rate, setRate] = useState("0");
  const [imageUrl, setImageUrl] = useState("");
  const [status, setStatus] = useState("active");
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setSku(item?.sku ?? "");
    setDescription(item?.description ?? "");
    setCategory(item?.category ?? "");
    setUnit(item?.unit_type ?? "Job");
    setRate(item?.rate != null ? String(item.rate) : "0");
    setImageUrl(item?.image_url ?? "");
    setStatus(item?.status ?? "active");
    setNewCategory("");
  }, [open, item]);

  const blocked = !name.trim() || Number(rate) < 0;

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      const created = await createServiceCategory(newCategory.trim());
      setCategory(created.name);
      setNewCategory("");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create category");
    }
  };

  const submit = async () => {
    if (blocked) return;
    setSaving(true);
    try {
      if (item) {
        await patchItem(item.id, {
          name: name.trim(),
          sku: sku.trim() || item.sku,
          description: description.trim() || null,
          category: category || null,
          unit_type: unit,
          rate: Number(rate) || 0,
          image_url: imageUrl.trim() || null,
          status,
        });
        toast.success("Service item updated");
      } else {
        await createServiceItem({
          name: name.trim(),
          sku: sku.trim() || skuFromName(name),
          description: description.trim() || null,
          category: category || null,
          unit_type: unit,
          rate: Number(rate) || 0,
          image_url: imageUrl.trim() || null,
          status,
        });
        toast.success("Service item created");
      }
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the service item");
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
        className="flex min-w-[160px] w-[420px] max-w-[720px] flex-col p-0"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 pr-10">
          <Button className="rounded-none" size="sm" disabled={blocked || saving} onClick={() => void submit()}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <h2 className="text-sm font-semibold">{item ? "Edit service item" : "New service item"}</h2>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <Field label="Item name">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-none" />
          </Field>
          <Field label="Service code">
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="rounded-none"
              placeholder="Auto if empty"
            />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full">
              <option value="">Uncategorised</option>
              {tree.map((c) => (
                <option key={c.id} value={c.name}>
                  {"— ".repeat(c.depth)}
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-1.5">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="rounded-none"
              placeholder="New category"
            />
            <Button type="button" variant="outline" className="rounded-none" onClick={() => void addCategory()}>
              Add
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Unit">
              <Select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full">
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Rate">
              <Input
                type="number"
                min={0}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="rounded-none"
              />
            </Field>
          </div>
          <Field label="Image URL">
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="rounded-none" />
          </Field>
          {item ? (
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full">
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="draft">Draft</option>
              </Select>
            </Field>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
