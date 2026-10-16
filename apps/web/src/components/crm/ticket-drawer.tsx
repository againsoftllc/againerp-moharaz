"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { ApiCrmTicket } from "@/lib/api/crm";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "billing", label: "Billing" },
  { value: "technical", label: "Technical" },
  { value: "complaint", label: "Complaint" },
  { value: "other", label: "Other" },
];
const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export type TicketInput = {
  subject: string;
  description?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  category?: string;
  priority?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: ApiCrmTicket | null;
  onCreate: (input: TicketInput) => Promise<void>;
  onSave: (id: string, input: TicketInput) => Promise<void>;
};

export function TicketDrawer({ open, onOpenChange, ticket, onCreate, onSave }: Props) {
  const isEdit = Boolean(ticket);
  const [subject, setSubject] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [category, setCategory] = React.useState("general");
  const [priority, setPriority] = React.useState("medium");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (ticket) {
      setSubject(ticket.subject);
      setDescription(ticket.description ?? "");
      setContactName(ticket.contact_name ?? "");
      setContactEmail(ticket.contact_email ?? "");
      setContactPhone(ticket.contact_phone ?? "");
      setCategory(ticket.category);
      setPriority(ticket.priority);
    } else {
      setSubject("");
      setDescription("");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setCategory("general");
      setPriority("medium");
    }
  }, [open, ticket]);

  const isValid = subject.trim().length > 0;

  async function handleSubmit() {
    if (!isValid) return;
    setSaving(true);
    const input: TicketInput = {
      subject: subject.trim(),
      description: description.trim() || undefined,
      contact_name: contactName.trim() || undefined,
      contact_email: contactEmail.trim() || undefined,
      contact_phone: contactPhone.trim() || undefined,
      category,
      priority,
    };
    try {
      if (isEdit && ticket) {
        await onSave(ticket.id, input);
        toast.success("Ticket updated");
      } else {
        await onCreate(input);
        toast.success("Ticket created");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save ticket");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title={isEdit ? "Edit ticket" : "New ticket"} className="w-full max-w-md overflow-y-auto">
        <h2 className="pr-8 text-base font-semibold">{isEdit ? `Edit ${ticket?.ticket_number}` : "New support ticket"}</h2>

        <div className="mt-4 space-y-3.5">
          <div className="flex flex-col gap-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={saving} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Description (optional)</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-none border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Contact name</Label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} disabled={saving} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} disabled={saving} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Phone</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} disabled={saving} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-none" disabled={saving}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full rounded-none" disabled={saving}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-input pt-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={!isValid || saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create ticket"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
