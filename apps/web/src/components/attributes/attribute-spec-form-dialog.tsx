"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import {
  FIELD_TYPE_LABELS,
  type AttributeFieldType,
  type AttributeSpec,
} from "@/lib/mock-data/attribute-profiles";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  attribute?: AttributeSpec | null;
  onSave: (data: Partial<AttributeSpec> & { groupId: string }) => void;
};

const FIELD_TYPES = Object.keys(FIELD_TYPE_LABELS) as AttributeFieldType[];

export function AttributeSpecFormDialog({
  open,
  onOpenChange,
  groupId,
  attribute,
  onSave,
}: Props) {
  const [fieldType, setFieldType] = useState<AttributeFieldType>(attribute?.fieldType ?? "text");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSave({
      id: attribute?.id,
      groupId,
      name: String(fd.get("name") ?? ""),
      code: String(fd.get("code") ?? ""),
      fieldType,
      unit: String(fd.get("unit") ?? "") || undefined,
      helpText: String(fd.get("helpText") ?? "") || undefined,
      isRequired: fd.get("isRequired") === "on",
      isFilterable: fd.get("isFilterable") === "on",
      isComparable: fd.get("isComparable") === "on",
      isSearchable: fd.get("isSearchable") === "on",
      isVisible: fd.get("isVisible") === "on",
      active: fd.get("active") === "on",
    });
    toast.success(attribute ? "Field updated" : "Field created");
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(520px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-input bg-background p-5 shadow-xl">
          <Dialog.Title className="text-base font-semibold">
            {attribute ? "Edit specification field" : "Add specification field"}
          </Dialog.Title>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <Field label="Field name" required>
              <Input name="name" required defaultValue={attribute?.name} placeholder="CPU Brand" />
            </Field>
            <Field label="Code" required>
              <Input name="code" required defaultValue={attribute?.code} placeholder="processor_brand" />
            </Field>
            <Field label="Field type" required>
              <Select
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value as AttributeFieldType)}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Unit">
              <Input name="unit" defaultValue={attribute?.unit} placeholder="GHz, GB, inch" />
            </Field>
            <Field label="Help text">
              <Input name="helpText" defaultValue={attribute?.helpText} />
            </Field>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-input p-3 text-sm">
              <Flag name="isRequired" label="Required" defaultChecked={attribute?.isRequired} />
              <Flag name="isFilterable" label="Filterable" defaultChecked={attribute?.isFilterable} />
              <Flag name="isComparable" label="Comparable" defaultChecked={attribute?.isComparable ?? true} />
              <Flag name="isSearchable" label="Searchable" defaultChecked={attribute?.isSearchable} />
              <Flag name="isVisible" label="Visible" defaultChecked={attribute?.isVisible ?? true} />
              <Flag name="active" label="Active" defaultChecked={attribute?.active ?? true} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">Save</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Flag({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}
