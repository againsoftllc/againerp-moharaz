"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CUSTOMER_GROUP_LABELS, type CustomerGroup } from "@/lib/mock-data/customers";
import { createCommerceCustomer } from "@/lib/api/commerce-customers";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

export function ClientCreateDrawer({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [group, setGroup] = React.useState<CustomerGroup>("retail");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setEmail("");
    setPhone("");
    setGroup("retail");
  }, [open]);

  const isValid = name.trim().length > 0;

  async function handleSubmit() {
    if (!isValid) return;
    setSaving(true);
    try {
      await createCommerceCustomer({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        group,
      });
      toast.success("Client created");
      onCreated();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create client");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title="New client" resizable className="flex w-full max-w-md flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-3 border-b border-input pb-3 pr-8">
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={() => void handleSubmit()} disabled={!isValid || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
          <h2 className="text-base font-semibold">New client</h2>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Email (optional)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Phone (optional)</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={saving} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Client group</Label>
            <Select value={group} onChange={(e) => setGroup(e.target.value as CustomerGroup)} className="w-full rounded-none" disabled={saving}>
              {Object.entries(CUSTOMER_GROUP_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
