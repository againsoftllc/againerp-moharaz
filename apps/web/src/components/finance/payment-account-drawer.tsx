"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { name: string; kind: string; opening_balance: string; is_default: boolean }) => Promise<void>;
};

const KIND_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "mobile_wallet", label: "Mobile banking (bKash, Nagad…)" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

export function PaymentAccountDrawer({ open, onOpenChange, onCreate }: Props) {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState("cash");
  const [openingBalance, setOpeningBalance] = React.useState("0");
  const [isDefault, setIsDefault] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName("");
      setKind("cash");
      setOpeningBalance("0");
      setIsDefault(false);
    }
  }, [open]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onCreate({ name: trimmed, kind, opening_balance: openingBalance || "0", is_default: isDefault });
      toast.success(`${trimmed} added`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add payment account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title="New payment account" className="w-full max-w-sm overflow-y-auto">
        <h2 className="pr-8 text-base font-semibold">New payment account</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          A cash box, bank account, or mobile wallet where the company's money actually sits.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. City Bank — 1234, bKash Merchant"
              disabled={saving}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <FilterSelect value={kind} onChange={setKind} width="w-full" ariaLabel="Account type" options={KIND_OPTIONS} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Opening balance</Label>
            <Input
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              disabled={saving}
              className="mt-1"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} disabled={saving} />
            Make this the default account for new payments
          </label>
        </div>

        <Button size="sm" className="mt-5 w-full" onClick={() => void handleSave()} disabled={saving || !name.trim()}>
          Add account
        </Button>
      </SheetContent>
    </Sheet>
  );
}
