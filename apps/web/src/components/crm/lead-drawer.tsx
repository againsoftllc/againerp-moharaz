"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { LEAD_SOURCES, FOLLOW_UP_TYPES } from "@/lib/crm/lead-constants";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import type { ApiCrmLead } from "@/lib/api/crm";
import type { AdminUser } from "@/lib/store/admin-auth-store";

export type LeadInput = {
  name: string;
  company_name?: string;
  job_title?: string;
  email?: string;
  phone?: string;
  alternate_phone?: string;
  source?: string;
  estimated_value?: string;
  owner_id?: string;
  department?: string;
  notes?: string;
  next_follow_up_at?: string;
  next_follow_up_type?: string;
  next_follow_up_note?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: ApiCrmLead | null;
  users: Pick<AdminUser, "id" | "name">[];
  onCreate: (input: LeadInput) => Promise<void>;
  onSave: (id: string, input: LeadInput) => Promise<void>;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function LeadDrawer({ open, onOpenChange, lead, users, onCreate, onSave }: Props) {
  const isEdit = Boolean(lead);
  const currentUser = useAdminAuth((s) => s.user);

  const [name, setName] = React.useState("");
  const [companyName, setCompanyName] = React.useState("");
  const [jobTitle, setJobTitle] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [alternatePhone, setAlternatePhone] = React.useState("");
  const [source, setSource] = React.useState("other");
  const [estimatedValue, setEstimatedValue] = React.useState("0");
  const [ownerId, setOwnerId] = React.useState("");
  const [department, setDepartment] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [followUpDate, setFollowUpDate] = React.useState("");
  const [followUpTime, setFollowUpTime] = React.useState("");
  const [followUpType, setFollowUpType] = React.useState("call");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (lead) {
      setName(lead.name);
      setCompanyName(lead.company_name ?? "");
      setJobTitle(lead.job_title ?? "");
      setEmail(lead.email ?? "");
      setPhone(lead.phone ?? "");
      setAlternatePhone(lead.alternate_phone ?? "");
      setSource(lead.source);
      setEstimatedValue(lead.estimated_value ?? "0");
      setOwnerId(lead.owner_id ?? "");
      setDepartment(lead.department ?? "");
      setNotes(lead.notes ?? "");
      setFollowUpDate("");
      setFollowUpTime("");
      setFollowUpType("call");
    } else {
      setName("");
      setCompanyName("");
      setJobTitle("");
      setEmail("");
      setPhone("");
      setAlternatePhone("");
      setSource("other");
      setEstimatedValue("0");
      setOwnerId(currentUser?.id ?? "");
      setDepartment("");
      setNotes("");
      setFollowUpDate("");
      setFollowUpTime("");
      setFollowUpType("call");
    }
  }, [open, lead, currentUser]);

  const isValid = name.trim().length > 0;

  async function handleSubmit() {
    if (!isValid) return;
    setSaving(true);
    const nextFollowUpAt = followUpDate ? `${followUpDate}T${followUpTime || "09:00"}:00` : undefined;
    try {
      if (isEdit && lead) {
        await onSave(lead.id, {
          name: name.trim(),
          company_name: companyName.trim() || undefined,
          job_title: jobTitle.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          alternate_phone: alternatePhone.trim() || undefined,
          source,
          estimated_value: estimatedValue || undefined,
          notes: notes.trim() || undefined,
        });
        toast.success("Lead updated");
      } else {
        await onCreate({
          name: name.trim(),
          company_name: companyName.trim() || undefined,
          job_title: jobTitle.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          alternate_phone: alternatePhone.trim() || undefined,
          source,
          estimated_value: estimatedValue || "0",
          owner_id: ownerId || undefined,
          department: department.trim() || undefined,
          notes: notes.trim() || undefined,
          next_follow_up_at: nextFollowUpAt,
          next_follow_up_type: nextFollowUpAt ? followUpType : undefined,
        });
        toast.success("Lead created");
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title={isEdit ? "Edit lead" : "New lead"} className="w-full max-w-md overflow-y-auto">
        <h2 className="pr-8 text-base font-semibold">{isEdit ? `Edit ${lead?.name}` : "New lead"}</h2>
        <p className="mt-1 text-xs text-muted-foreground">A prospect that hasn't been qualified into a deal yet.</p>

        <div className="mt-4 space-y-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Contact information</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Contact person</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" disabled={saving} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Job title</Label>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} disabled={saving} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Company</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={saving} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={saving} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Alternate phone (optional)</Label>
            <Input value={alternatePhone} onChange={(e) => setAlternatePhone(e.target.value)} disabled={saving} />
          </div>

          <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Lead management</p>
          {!isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Assigned to</Label>
                <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="w-full rounded-none" disabled={saving}>
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Sales team</Label>
                <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Enterprise Sales" disabled={saving} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Source</Label>
              <Select value={source} onChange={(e) => setSource(e.target.value)} className="w-full rounded-none" disabled={saving}>
                {LEAD_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Estimated value</Label>
              <Input type="number" min="0" step="0.01" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} disabled={saving} />
            </div>
          </div>

          {!isEdit && (
            <>
              <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Next follow-up (optional)</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Date</Label>
                  <Input type="date" min={todayIso()} value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} disabled={saving} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Time</Label>
                  <Input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} disabled={saving || !followUpDate} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Type</Label>
                  <Select value={followUpType} onChange={(e) => setFollowUpType(e.target.value)} className="w-full rounded-none" disabled={saving || !followUpDate}>
                    {FOLLOW_UP_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </>
          )}

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
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create lead"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
