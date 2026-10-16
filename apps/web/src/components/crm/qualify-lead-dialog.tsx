"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { qualifyCrmLead, type ApiCrmLead } from "@/lib/api/crm";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: ApiCrmLead | null;
  onQualified: (lead: ApiCrmLead) => void;
};

export function QualifyLeadDialog({ open, onOpenChange, lead, onQualified }: Props) {
  const [businessNeed, setBusinessNeed] = React.useState("");
  const [budget, setBudget] = React.useState("");
  const [timeline, setTimeline] = React.useState("");
  const [decisionMaker, setDecisionMaker] = React.useState("");
  const [requirements, setRequirements] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open || !lead) return;
    setBusinessNeed(lead.qual_business_need ?? "");
    setBudget(lead.qual_budget ?? "");
    setTimeline(lead.qual_timeline ?? "");
    setDecisionMaker(lead.qual_decision_maker ?? "");
    setRequirements(lead.qual_requirements ?? "");
  }, [open, lead]);

  async function handleSubmit() {
    if (!lead) return;
    setSaving(true);
    try {
      const res = await qualifyCrmLead(lead.id, {
        business_need: businessNeed.trim() || undefined,
        budget: budget.trim() || undefined,
        timeline: timeline.trim() || undefined,
        decision_maker: decisionMaker.trim() || undefined,
        requirements: requirements.trim() || undefined,
      });
      onQualified(res.data);
      toast.success(lead.status === "qualified" ? "Qualification details saved" : "Lead qualified");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to qualify lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title="Qualify lead" className="w-full max-w-md overflow-y-auto">
        {lead && (
          <>
            <h2 className="pr-8 text-base font-semibold">Qualify {lead.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {lead.status === "qualified" ? "Update the qualification details." : "Moves this lead to Qualified."}
            </p>

            <div className="mt-4 space-y-3.5">
              <div className="flex flex-col gap-1.5">
                <Label>Business need</Label>
                <textarea
                  value={businessNeed}
                  onChange={(e) => setBusinessNeed(e.target.value)}
                  rows={2}
                  className="w-full rounded-none border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={saving}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Budget</Label>
                  <Input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. 70,000–80,000" disabled={saving} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Purchase timeline</Label>
                  <Input value={timeline} onChange={(e) => setTimeline(e.target.value)} placeholder="e.g. Next quarter" disabled={saving} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Decision maker</Label>
                <Input value={decisionMaker} onChange={(e) => setDecisionMaker(e.target.value)} disabled={saving} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Requirements</Label>
                <textarea
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
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
              <Button size="sm" onClick={() => void handleSubmit()} disabled={saving}>
                {saving ? "Saving…" : lead.status === "qualified" ? "Save details" : "Qualify lead"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
