"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { toast } from "sonner";
import {
  CONFIGURATOR_FIELD_TYPE_LABELS,
  CONFIGURATOR_FIELD_TYPES,
  type ConfiguratorFieldType,
} from "@/lib/attributes/field-types";
import type { ConfiguratorAttributeField } from "@/lib/mock-data/configurator-attributes";
import { ConfiguratorOptionsEditor } from "@/components/configurator/configurator-sortable-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  field?: ConfiguratorAttributeField | null;
  onSave: (data: Partial<ConfiguratorAttributeField> & { profileId: string }) => void;
};

export function ConfiguratorFieldFormDialog({ open, onOpenChange, profileId, field, onSave }: Props) {
  const [fieldType, setFieldType] = useState<ConfiguratorFieldType>(field?.fieldType ?? "text");
  const [options, setOptions] = useState(field?.options ?? []);
  const [isRequired, setIsRequired] = useState(field?.isRequired ?? false);
  const [isFilterable, setIsFilterable] = useState(field?.isFilterable ?? true);

  useEffect(() => {
    if (!open) return;
    setFieldType(field?.fieldType ?? "text");
    setOptions(field?.options ?? []);
    setIsRequired(field?.isRequired ?? false);
    setIsFilterable(field?.isFilterable ?? true);
  }, [open, field]);

  const needsOptions = fieldType === "dropdown" || fieldType === "multi_select";

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const min = fd.get("min") ? Number(fd.get("min")) : undefined;
    const max = fd.get("max") ? Number(fd.get("max")) : undefined;

    onSave({
      id: field?.id,
      profileId,
      name: String(fd.get("name") ?? ""),
      code: String(fd.get("code") ?? ""),
      fieldType,
      unit: String(fd.get("unit") ?? "") || undefined,
      helpText: String(fd.get("helpText") ?? "") || undefined,
      isRequired,
      isFilterable,
      isComparable: true,
      active: fd.get("active") === "on",
      validation: min != null || max != null ? { min, max } : undefined,
      options: needsOptions ? options : undefined,
    });
    toast.success(field ? "Field updated" : "Field created");
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(560px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-input bg-background p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">
              {field ? "Edit component attribute" : "Add component attribute"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Field name</Label>
              <Input name="name" required defaultValue={field?.name} placeholder="Socket" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Code</Label>
              <Input name="code" required defaultValue={field?.code} placeholder="socket" className="h-8 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Field type</Label>
              <Select value={fieldType} onChange={(e) => setFieldType(e.target.value as ConfiguratorFieldType)} className="h-8 text-xs">
                {CONFIGURATOR_FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CONFIGURATOR_FIELD_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>

            {fieldType === "number" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Min</Label>
                  <Input name="min" type="number" defaultValue={field?.validation?.min} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max</Label>
                  <Input name="max" type="number" defaultValue={field?.validation?.max} className="h-8 text-xs" />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Unit (optional)</Label>
              <Input name="unit" defaultValue={field?.unit} placeholder="W, MHz, GB" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Help text</Label>
              <Input name="helpText" defaultValue={field?.helpText} className="h-8 text-xs" />
            </div>

            {needsOptions && (
              <div className="space-y-1 rounded-lg border border-input bg-muted/20 p-3">
                <Label className="text-xs">Options</Label>
                <ConfiguratorOptionsEditor options={options} onChange={setOptions} />
              </div>
            )}

            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={isRequired} onCheckedChange={setIsRequired} />
                Required
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={isFilterable} onCheckedChange={setIsFilterable} />
                Filterable (compatibility)
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="active" defaultChecked={field?.active ?? true} />
                Active
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Save field
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
