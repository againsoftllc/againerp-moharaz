"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArrowRight, Mail, MessageCircle, Pencil, Phone, Plus, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  fetchCollabActivity,
  fetchCollabComments,
  createCollabComment,
  type CollabActivity,
  type CollabComment,
} from "@/lib/api/collaboration";
import {
  assignCrmLead,
  cancelCrmFollowUp,
  completeCrmFollowUp,
  convertCrmLead,
  createCrmTask,
  scheduleCrmFollowUp,
  transitionCrmLeadStatus,
  type ApiCrmLead,
} from "@/lib/api/crm";
import { COLLAB_ACTION_LABELS, FOLLOW_UP_TYPES, LEAD_NEXT_STATUS, LEAD_STATUS_LABELS } from "@/lib/crm/lead-constants";
import type { AdminUser } from "@/lib/store/admin-auth-store";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import { QualifyLeadDialog } from "./qualify-lead-dialog";
import { MarkLostDialog } from "./mark-lost-dialog";

const ENTITY = "lead";

const ACTIVITY_TYPES = [
  { value: "note", label: "Note" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
];

function money(value: string | null) {
  if (value === null) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? formatCurrency(n) : value;
}

function statusVariant(status: string) {
  if (status === "converted") return "success" as const;
  if (status === "qualified") return "warning" as const;
  if (status === "lost" || status === "unqualified") return "muted" as const;
  return "outline" as const;
}

function fmtDateTime(iso: string) {
  return formatDateTime(iso);
}

type TimelineEntry =
  | { kind: "activity"; id: string; created_at: string; data: CollabActivity }
  | { kind: "comment"; id: string; created_at: string; data: CollabComment };

type Tab = "overview" | "activity" | "followup";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: ApiCrmLead | null;
  users: Pick<AdminUser, "id" | "name">[];
  onUpdated: (lead: ApiCrmLead) => void;
  onConverted: () => void;
  onEdit: (lead: ApiCrmLead) => void;
};

export function LeadDetailDrawer({ open, onOpenChange, lead, users, onUpdated, onConverted, onEdit }: Props) {
  const currentUser = useAdminAuth((s) => s.user);
  const [tab, setTab] = React.useState<Tab>("overview");
  const [timeline, setTimeline] = React.useState<TimelineEntry[]>([]);
  const [loadingTimeline, setLoadingTimeline] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const [composerOpen, setComposerOpen] = React.useState(false);
  const [composerType, setComposerType] = React.useState("note");
  const [composerText, setComposerText] = React.useState("");
  const [meetingParticipants, setMeetingParticipants] = React.useState("");
  const [meetingOutcome, setMeetingOutcome] = React.useState("");
  const [meetingNextAction, setMeetingNextAction] = React.useState("");

  const [followUpFormOpen, setFollowUpFormOpen] = React.useState(false);
  const [followUpDate, setFollowUpDate] = React.useState("");
  const [followUpTime, setFollowUpTime] = React.useState("");
  const [followUpType, setFollowUpType] = React.useState("call");
  const [followUpNote, setFollowUpNote] = React.useState("");
  const [completeNote, setCompleteNote] = React.useState("");
  const [completingOpen, setCompletingOpen] = React.useState(false);

  const [assignOpen, setAssignOpen] = React.useState(false);
  const [assignTo, setAssignTo] = React.useState("");

  const [qualifyOpen, setQualifyOpen] = React.useState(false);
  const [lostOpen, setLostOpen] = React.useState(false);

  const loadTimeline = React.useCallback(async () => {
    if (!lead) return;
    setLoadingTimeline(true);
    try {
      const [activityRes, comments] = await Promise.all([
        fetchCollabActivity(ENTITY, lead.id, { limit: 100 }),
        fetchCollabComments(ENTITY, lead.id),
      ]);
      const merged: TimelineEntry[] = [
        ...activityRes.data
          .filter((a) => a.action !== "comment")
          .map((a) => ({ kind: "activity" as const, id: a.id, created_at: a.created_at, data: a })),
        ...comments.map((c) => ({ kind: "comment" as const, id: c.id, created_at: c.created_at, data: c })),
      ];
      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTimeline(merged);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setLoadingTimeline(false);
    }
  }, [lead]);

  const openedLeadId = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!open || !lead) {
      openedLeadId.current = null;
      return;
    }
    if (openedLeadId.current === lead.id) return;
    openedLeadId.current = lead.id;
    setTab("overview");
    setComposerOpen(false);
    setFollowUpFormOpen(false);
    setCompletingOpen(false);
    setAssignOpen(false);
    setAssignTo(lead.owner_id ?? "");
    void loadTimeline();
  }, [open, lead, loadTimeline]);

  if (!lead) return null;

  const isClosed = lead.status === "converted" || lead.status === "lost" || lead.status === "unqualified";
  const next = LEAD_NEXT_STATUS[lead.status];

  async function handleAdvance() {
    if (!lead || !next) return;
    setBusy(true);
    try {
      const res = await transitionCrmLeadStatus(lead.id, next);
      onUpdated(res.data);
      toast.success(`Lead marked ${LEAD_STATUS_LABELS[next]}`);
      void loadTimeline();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update lead");
    } finally {
      setBusy(false);
    }
  }

  async function handleConvert() {
    if (!lead) return;
    setBusy(true);
    try {
      await convertCrmLead(lead.id, { value: lead.estimated_value ?? undefined });
      toast.success(`${lead.name} converted to a deal`);
      onConverted();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to convert lead");
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign() {
    if (!lead) return;
    setBusy(true);
    try {
      const res = await assignCrmLead(lead.id, assignTo || null);
      onUpdated(res.data);
      toast.success("Lead reassigned");
      setAssignOpen(false);
      void loadTimeline();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reassign lead");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitActivity() {
    if (!lead) return;
    let body = composerText.trim();
    if (composerType === "meeting") {
      const lines = [
        meetingParticipants.trim() && `Participants: ${meetingParticipants.trim()}`,
        composerText.trim() && `Discussion: ${composerText.trim()}`,
        meetingOutcome.trim() && `Outcome: ${meetingOutcome.trim()}`,
        meetingNextAction.trim() && `Next action: ${meetingNextAction.trim()}`,
      ].filter(Boolean);
      body = `[Meeting] ${lines.join(" · ")}`;
    } else if (composerType !== "note") {
      const label = ACTIVITY_TYPES.find((t) => t.value === composerType)?.label ?? composerType;
      body = `[${label}] ${body}`;
    }
    if (!body.trim()) return;
    setBusy(true);
    try {
      await createCollabComment(ENTITY, lead.id, { comment: body });
      toast.success("Added to timeline");
      setComposerOpen(false);
      setComposerText("");
      setMeetingParticipants("");
      setMeetingOutcome("");
      setMeetingNextAction("");
      void loadTimeline();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add activity");
    } finally {
      setBusy(false);
    }
  }

  async function handleScheduleFollowUp() {
    if (!lead || !followUpDate) return;
    setBusy(true);
    try {
      const at = `${followUpDate}T${followUpTime || "09:00"}:00`;
      const res = await scheduleCrmFollowUp(lead.id, { at, type: followUpType, note: followUpNote.trim() || undefined });
      onUpdated(res.data);
      toast.success("Follow-up scheduled");
      setFollowUpFormOpen(false);
      void loadTimeline();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to schedule follow-up");
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteFollowUp() {
    if (!lead) return;
    setBusy(true);
    try {
      const res = await completeCrmFollowUp(lead.id, completeNote.trim() || undefined);
      onUpdated(res.data);
      toast.success("Follow-up completed");
      setCompletingOpen(false);
      setCompleteNote("");
      void loadTimeline();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete follow-up");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelFollowUp() {
    if (!lead) return;
    if (!window.confirm("Cancel this follow-up?")) return;
    setBusy(true);
    try {
      const res = await cancelCrmFollowUp(lead.id);
      onUpdated(res.data);
      toast.success("Follow-up cancelled");
      void loadTimeline();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel follow-up");
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickTask(title: string) {
    if (!lead || !title.trim()) return;
    setBusy(true);
    try {
      await createCrmTask({ title: title.trim(), related_type: "lead", related_id: lead.id });
      toast.success("Task created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title={lead.name} className="w-full max-w-2xl overflow-y-auto">
        {/* Header */}
        <div className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{lead.name}</h2>
            <Badge variant={statusVariant(lead.status)} className="capitalize">
              {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
            </Badge>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {lead.lead_score}/100
            </span>
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px] text-muted-foreground" onClick={() => onEdit(lead)}>
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{lead.company_name ?? "No company"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <button className="hover:underline" onClick={() => setAssignOpen((v) => !v)}>
              Assigned: <span className="font-medium text-foreground">{lead.owner_name ?? "Unassigned"}</span>
            </button>
            {lead.department && <span>Team: {lead.department}</span>}
            <span>Value: <span className="font-medium text-foreground">{money(lead.estimated_value)}</span></span>
          </div>
          {assignOpen && (
            <div className="mt-2 flex items-center gap-2 border border-input bg-muted/30 p-2">
              <Select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="h-7 flex-1 rounded-none text-xs">
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
              <Button size="sm" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => void handleAssign()}>
                Save
              </Button>
            </div>
          )}
        </div>

        {/* Quick actions */}
        {!isClosed && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-y border-border py-2">
            {lead.phone && (
              <a href={`tel:${lead.phone}`}>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]">
                  <Phone className="mr-1 h-3 w-3" /> Call
                </Button>
              </a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`}>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]">
                  <Mail className="mr-1 h-3 w-3" /> Email
                </Button>
              </a>
            )}
            {lead.phone && (
              <a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]">
                  <MessageCircle className="mr-1 h-3 w-3" /> WhatsApp
                </Button>
              </a>
            )}
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => { setTab("activity"); setComposerOpen(true); }}>
              <Plus className="mr-1 h-3 w-3" /> Add activity
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => { setTab("followup"); setFollowUpFormOpen(true); }}>
              Schedule follow-up
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              disabled={busy}
              onClick={() => void handleQuickTask(`Follow up with ${lead.name}`)}
            >
              Create task
            </Button>
            {lead.status === "qualified" ? (
              <Button size="sm" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => void handleConvert()}>
                Convert to Deal <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            ) : next ? (
              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => void handleAdvance()}>
                Mark {LEAD_STATUS_LABELS[next]}
              </Button>
            ) : null}
            {(lead.status === "interested" || lead.status === "qualified") && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setQualifyOpen(true)}>
                {lead.status === "qualified" ? "Edit qualification" : "Qualify"}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-destructive" onClick={() => setLostOpen(true)}>
              Mark lost
            </Button>
          </div>
        )}

        {/* Tabs */}
        <div className="mt-3 flex items-center gap-1 border-b border-border">
          {(["overview", "activity", "followup"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "border-b-2 px-3 py-1.5 text-xs font-medium capitalize",
                tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "followup" ? "Follow-up" : t}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="mt-3 space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Contact information</p>
              <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div><span className="text-muted-foreground">Name:</span> {lead.name}</div>
                <div><span className="text-muted-foreground">Job title:</span> {lead.job_title ?? "—"}</div>
                <div><span className="text-muted-foreground">Company:</span> {lead.company_name ?? "—"}</div>
                <div><span className="text-muted-foreground">Email:</span> {lead.email ?? "—"}</div>
                <div><span className="text-muted-foreground">Phone:</span> {lead.phone ?? "—"}</div>
                <div><span className="text-muted-foreground">Alt. phone:</span> {lead.alternate_phone ?? "—"}</div>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Lead information</p>
              <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div><span className="text-muted-foreground">Stage:</span> {LEAD_STATUS_LABELS[lead.status]}</div>
                <div><span className="text-muted-foreground">Source:</span> <span className="capitalize">{lead.source.replace("_", " ")}</span></div>
                <div><span className="text-muted-foreground">Assigned to:</span> {lead.owner_name ?? "Unassigned"}</div>
                <div><span className="text-muted-foreground">Sales team:</span> {lead.department ?? "—"}</div>
                <div><span className="text-muted-foreground">Estimated value:</span> {money(lead.estimated_value)}</div>
                <div><span className="text-muted-foreground">Lead score:</span> {lead.lead_score}/100</div>
              </div>
            </div>
            {(lead.qual_business_need || lead.qual_budget || lead.qual_timeline || lead.qual_decision_maker || lead.qual_requirements) && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Qualification</p>
                <div className="mt-1.5 space-y-1 text-xs">
                  {lead.qual_business_need && <div><span className="text-muted-foreground">Business need:</span> {lead.qual_business_need}</div>}
                  {lead.qual_budget && <div><span className="text-muted-foreground">Budget:</span> {lead.qual_budget}</div>}
                  {lead.qual_timeline && <div><span className="text-muted-foreground">Timeline:</span> {lead.qual_timeline}</div>}
                  {lead.qual_decision_maker && <div><span className="text-muted-foreground">Decision maker:</span> {lead.qual_decision_maker}</div>}
                  {lead.qual_requirements && <div><span className="text-muted-foreground">Requirements:</span> {lead.qual_requirements}</div>}
                </div>
              </div>
            )}
            {lead.notes && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
                <p className="mt-1.5 text-xs">{lead.notes}</p>
              </div>
            )}
            {lead.status === "lost" && (
              <div className="border border-destructive/30 bg-destructive/5 p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive">Lost</p>
                <p className="mt-1 text-xs">Reason: {lead.lost_reason?.replace(/_/g, " ")}</p>
                {lead.lost_note && <p className="mt-0.5 text-xs text-muted-foreground">{lead.lost_note}</p>}
              </div>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div className="mt-3">
            {composerOpen && (
              <div className="mb-3 space-y-2 border border-input bg-muted/30 p-2.5">
                <div className="flex gap-1">
                  {ACTIVITY_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setComposerType(t.value)}
                      className={cn(
                        "border px-2 py-1 text-[11px]",
                        composerType === t.value ? "border-primary bg-primary/10 font-medium" : "border-transparent text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {composerType === "meeting" && (
                  <Input value={meetingParticipants} onChange={(e) => setMeetingParticipants(e.target.value)} placeholder="Participants" className="h-7 text-xs" />
                )}
                <textarea
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  rows={2}
                  placeholder={composerType === "meeting" ? "Discussion" : "What happened?"}
                  className="w-full rounded-none border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {composerType === "meeting" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={meetingOutcome} onChange={(e) => setMeetingOutcome(e.target.value)} placeholder="Outcome" className="h-7 text-xs" />
                    <Input value={meetingNextAction} onChange={(e) => setMeetingNextAction(e.target.value)} placeholder="Next action" className="h-7 text-xs" />
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setComposerOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => void handleSubmitActivity()}>
                    Add
                  </Button>
                </div>
              </div>
            )}
            {!composerOpen && (
              <Button size="sm" variant="outline" className="mb-3 h-7 px-2 text-[11px]" onClick={() => setComposerOpen(true)}>
                <Plus className="mr-1 h-3 w-3" /> Add activity
              </Button>
            )}

            {loadingTimeline ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
            ) : timeline.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="space-y-0 border-l border-border pl-3">
                {timeline.map((entry) => (
                  <div key={`${entry.kind}-${entry.id}`} className="relative pb-3">
                    <div className="absolute -left-[16.5px] top-1 h-2 w-2 rounded-full bg-border" />
                    {entry.kind === "activity" ? (
                      <>
                        <p className="text-xs font-medium">{COLLAB_ACTION_LABELS[entry.data.action] ?? entry.data.action}</p>
                        {(entry.data.old_value || entry.data.new_value) && (
                          <p className="text-xs text-muted-foreground">
                            {entry.data.old_value && <span className="capitalize">{entry.data.old_value.replace(/_/g, " ")}</span>}
                            {entry.data.old_value && entry.data.new_value && " → "}
                            {entry.data.new_value && !entry.data.new_value.match(/^[0-9a-f-]{36}$/) && (
                              <span className="capitalize">{entry.data.new_value.replace(/_/g, " ")}</span>
                            )}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-medium">Note</p>
                        <p className="whitespace-pre-wrap text-xs text-muted-foreground">{entry.data.comment}</p>
                      </>
                    )}
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{fmtDateTime(entry.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "followup" && (
          <div className="mt-3 space-y-3">
            {lead.next_follow_up_at ? (
              <div className="border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{fmtDateTime(lead.next_follow_up_at)}</p>
                  <Badge variant={lead.follow_up_status === "overdue" ? "warning" : "outline"} className="capitalize">
                    {lead.follow_up_status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs capitalize text-muted-foreground">Type: {lead.next_follow_up_type?.replace(/_/g, " ")}</p>
                {lead.next_follow_up_note && <p className="mt-1 text-xs">{lead.next_follow_up_note}</p>}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => setCompletingOpen((v) => !v)}>
                    Complete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      setFollowUpDate(lead.next_follow_up_at!.slice(0, 10));
                      setFollowUpTime(lead.next_follow_up_at!.slice(11, 16));
                      setFollowUpType(lead.next_follow_up_type ?? "call");
                      setFollowUpNote(lead.next_follow_up_note ?? "");
                      setFollowUpFormOpen((v) => !v);
                    }}
                  >
                    Reschedule / Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-destructive"
                    disabled={busy}
                    onClick={() => void handleCancelFollowUp()}
                  >
                    Cancel
                  </Button>
                </div>
                {completingOpen && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    <textarea
                      value={completeNote}
                      onChange={(e) => setCompleteNote(e.target.value)}
                      rows={2}
                      placeholder="Result — e.g. Customer requested proposal."
                      className="w-full rounded-none border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="flex justify-end">
                      <Button size="sm" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => void handleCompleteFollowUp()}>
                        Mark completed
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No follow-up scheduled.</p>
            )}

            {!followUpFormOpen ? (
              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setFollowUpFormOpen(true)}>
                {lead.next_follow_up_at ? "Schedule another" : "Schedule follow-up"}
              </Button>
            ) : (
              <div className="space-y-2 border border-input bg-muted/30 p-2.5">
                <div className="grid grid-cols-3 gap-2">
                  <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="h-7 text-xs" />
                  <Input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} className="h-7 text-xs" />
                  <Select value={followUpType} onChange={(e) => setFollowUpType(e.target.value)} className="h-7 rounded-none text-xs">
                    {FOLLOW_UP_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <Input value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} placeholder="Purpose (optional)" className="h-7 text-xs" />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setFollowUpFormOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="h-7 px-2 text-[11px]" disabled={busy || !followUpDate} onClick={() => void handleScheduleFollowUp()}>
                    Save
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>

      <QualifyLeadDialog open={qualifyOpen} onOpenChange={setQualifyOpen} lead={lead} onQualified={(l) => { onUpdated(l); void loadTimeline(); }} />
      <MarkLostDialog open={lostOpen} onOpenChange={setLostOpen} lead={lead} onLost={(l) => { onUpdated(l); void loadTimeline(); onOpenChange(false); }} />
    </Sheet>
  );
}
