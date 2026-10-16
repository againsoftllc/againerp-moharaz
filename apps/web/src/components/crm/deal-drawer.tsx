"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { ApiCrmDeal } from "@/lib/api/crm";

export type DealInput = {
  title: string;
  contact_name?: string;
  contact_company?: string;
  value?: string;
  expected_close_date?: string;
  notes?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: ApiCrmDeal | null;
  onCreate: (input: DealInput) => Promise<void>;
  onSave: (id: string, input: DealInput) => Promise<void>;
};

export function DealDrawer({ open, onOpenChange, deal, onCreate, onSave }: Props) {
  const isEdit = Boolean(deal);
  const [title, setTitle] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [contactCompany, setContactCompany] = React.useState("");
  const [value, setValue] = React.useState("0");
  const [expectedCloseDate, setExpectedCloseDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (deal) {
      setTitle(deal.title);
      setContactName(deal.contact_name ?? "");
      setContactCompany(deal.contact_company ?? "");
      setValue(deal.value);
      setExpectedCloseDate(deal.expected_close_date ?? "");
      setNotes(deal.notes ?? "");
    } else {
      setTitle("");
      setContactName("");
      setContactCompany("");
      setValue("0");
      setExpectedCloseDate("");
      setNotes("");
    }
  }, [open, deal]);

  const isValid = title.trim().length > 0;

  async function handleSubmit() {
    if (!isValid) return;
    setSaving(true);
    const input: DealInput = {
      title: title.trim(),
      contact_name: contactName.trim() || undefined,
      contact_company: contactCompany.trim() || undefined,
      value: value || "0",
      expected_close_date: expectedCloseDate || undefined,
      notes: notes.trim() || undefined,
    };
    try {
      if (isEdit && deal) {
        await onSave(deal.id, input);
        toast.success("Deal updated");
      } else {
        await onCreate(input);
        toast.success("Deal created");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save deal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title={isEdit ? "Edit deal" : "New deal"} className="w-full max-w-md overflow-y-auto">
        <h2 className="pr-8 text-base font-semibold">{isEdit ? `Edit ${deal?.title}` : "New deal"}</h2>
        <p className="mt-1 text-xs text-muted-foreground">An opportunity being pursued — before it becomes a sales order.</p>

        <div className="mt-4 space-y-3.5">
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's the opportunity?" disabled={saving} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Contact name</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} disabled={saving} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Company</Label>
              <Input value={contactCompany} onChange={(e) => setContactCompany(e.target.value)} disabled={saving} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Value</Label>
              <Input type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} disabled={saving} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Expected close</Label>
              <Input type="date" value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)} disabled={saving} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Notes (optional)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-none border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={saving}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-input pt-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={!isValid || saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create deal"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
