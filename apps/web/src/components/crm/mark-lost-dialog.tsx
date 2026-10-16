"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { LEAD_LOST_REASONS } from "@/lib/crm/lead-constants";
import { transitionCrmLeadStatus, type ApiCrmLead } from "@/lib/api/crm";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: ApiCrmLead | null;
  onLost: (lead: ApiCrmLead) => void;
};

export function MarkLostDialog({ open, onOpenChange, lead, onLost }: Props) {
  const [reason, setReason] = React.useState("budget_issue");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setReason("budget_issue");
    setNote("");
  }, [open]);

  async function handleSubmit() {
    if (!lead) return;
    setSaving(true);
    try {
      const res = await transitionCrmLeadStatus(lead.id, "lost", reason, note.trim() || undefined);
      onLost(res.data);
      toast.success(`${lead.name} marked lost`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title="Mark lead lost" className="w-full max-w-sm overflow-y-auto">
        {lead && (
          <>
            <h2 className="pr-8 text-base font-semibold">Mark {lead.name} lost</h2>
            <p className="mt-1 text-xs text-muted-foreground">This closes the lead. A reason is required.</p>

            <div className="mt-4 space-y-3.5">
              <div className="flex flex-col gap-1.5">
                <Label>Reason</Label>
                <Select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-none" disabled={saving}>
                  {LEAD_LOST_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Note (optional)</Label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
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
              <Button variant="destructive" size="sm" onClick={() => void handleSubmit()} disabled={saving}>
                {saving ? "Saving…" : "Mark lost"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
