"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AttributeGroup } from "@/lib/mock-data/attribute-profiles";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  group?: AttributeGroup | null;
  onSave: (data: Partial<AttributeGroup> & { profileId: string }) => void;
};

export function GroupFormDialog({ open, onOpenChange, profileId, group, onSave }: Props) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSave({
      id: group?.id,
      profileId,
      name: String(fd.get("name") ?? ""),
      code: String(fd.get("code") ?? ""),
      description: String(fd.get("description") ?? ""),
      active: fd.get("active") === "on",
    });
    toast.success(group ? "Group updated" : "Group created");
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(440px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-input bg-background p-5 shadow-xl">
          <Dialog.Title className="text-base font-semibold">
            {group ? "Edit Group" : "Add Group"}
          </Dialog.Title>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <Field label="Group name" required>
              <Input name="name" required defaultValue={group?.name} placeholder="Processor" />
            </Field>
            <Field label="Code" required>
              <Input name="code" required defaultValue={group?.code} placeholder="processor" />
            </Field>
            <Field label="Description">
              <Textarea name="description" rows={2} defaultValue={group?.description} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={group?.active ?? true} />
              Active
            </label>
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
