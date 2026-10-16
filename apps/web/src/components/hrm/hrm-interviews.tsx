"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Eye,
  Filter,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import {
  createInterviewView,
  deleteInterviewView,
  listCandidateOptions,
  listInterviewsView,
  listRecruitmentEmployeeOptions,
  listRecruitmentInterviewRoundOptions,
  listRecruitmentInterviewTypeOptions,
  updateInterviewView,
  type CandidateOption,
  type NamedOption,
} from "@/lib/api/hrm-recruitment";
import {
  INTERVIEW_FEEDBACK_LABEL,
  INTERVIEW_FEEDBACK_OPTIONS,
  INTERVIEW_LOCATIONS,
  INTERVIEW_STATUS_LABEL,
  INTERVIEW_STATUS_OPTIONS,
  type Interview,
  type InterviewFeedbackStatus,
  type InterviewStatus,
} from "@/lib/mock-data/hrm-interviews";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

type SortKey = "candidateName" | "date" | "round" | "status";
type SortDir = "asc" | "desc";

type FormState = {
  candidateId: string;
  round: string;
  type: string;
  date: string;
  time: string;
  durationMin: string;
  location: string;
  meetingLink: string;
  interviewerId: string;
  notes: string;
  status: InterviewStatus;
  feedback: InterviewFeedbackStatus;
  feedbackNotes: string;
};

type FormMode = "add" | "edit" | "reschedule";

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function emptyForm(
  candidates: CandidateOption[] = [],
  rounds: NamedOption[] = [],
  types: NamedOption[] = [],
  employees: NamedOption[] = [],
): FormState {
  return {
    candidateId: candidates[0]?.id ?? "",
    round: rounds[0]?.name ?? "",
    type: types[0]?.name ?? "",
    date: todayYmd(),
    time: "10:00",
    durationMin: "45",
    location: "Online",
    meetingLink: "",
    interviewerId: employees[0]?.id ?? "",
    notes: "",
    status: "scheduled",
    feedback: "pending",
    feedbackNotes: "",
  };
}

function formFromRow(row: Interview, employees: NamedOption[] = []): FormState {
  return {
    candidateId: row.candidateId,
    round: row.round,
    type: row.type,
    date: row.date,
    time: row.time,
    durationMin: String(row.durationMin),
    location: row.location,
    meetingLink: row.meetingLink,
    interviewerId: employees.find((e) => e.name === row.interviewer)?.id ?? "",
    notes: row.notes,
    status: row.status,
    feedback: row.feedback,
    feedbackNotes: row.feedbackNotes,
  };
}

function statusBadgeClass(status: InterviewStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "cancelled":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    case "rescheduled":
      return "border-violet-500/30 bg-violet-500/15 text-violet-800 dark:text-violet-300";
    default:
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
  }
}

function feedbackBadgeClass(feedback: InterviewFeedbackStatus) {
  return feedback === "submitted"
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
}

export function HrmInterviews() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<Interview[]>([]);
  const [candidateOptions, setCandidateOptions] = useState<CandidateOption[]>([]);
  const [roundOptions, setRoundOptions] = useState<NamedOption[]>([]);
  const [typeOptions, setTypeOptions] = useState<NamedOption[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<NamedOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | InterviewStatus>("all");
  const [draftFeedback, setDraftFeedback] = useState<"all" | InterviewFeedbackStatus>("all");
  const [draftRound, setDraftRound] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | InterviewStatus>("all");
  const [feedbackFilter, setFeedbackFilter] = useState<"all" | InterviewFeedbackStatus>("all");
  const [roundFilter, setRoundFilter] = useState("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<Interview | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [data, candidates, rounds, types, employees] = await Promise.all([
          listInterviewsView(),
          listCandidateOptions(),
          listRecruitmentInterviewRoundOptions(),
          listRecruitmentInterviewTypeOptions(),
          listRecruitmentEmployeeOptions(),
        ]);
        if (cancelled) return;
        setRows(data);
        setCandidateOptions(candidates);
        setRoundOptions(rounds);
        setTypeOptions(types);
        setEmployeeOptions(employees);
        setForm(emptyForm(candidates, rounds, types, employees));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load interviews");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const roundFilterOptions = useMemo(() => {
    const names = new Set(roundOptions.map((r) => r.name));
    for (const row of rows) if (row.round) names.add(row.round);
    return [...names];
  }, [roundOptions, rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (feedbackFilter !== "all") list = list.filter((r) => r.feedback === feedbackFilter);
    if (roundFilter !== "all") list = list.filter((r) => r.round === roundFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.candidateName.toLowerCase().includes(q) ||
          r.jobTitle.toLowerCase().includes(q) ||
          r.jobCode.toLowerCase().includes(q) ||
          r.round.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          r.location.toLowerCase().includes(q) ||
          r.interviewer.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "date") {
        const av = `${a.date}T${a.time}`;
        const bv = `${b.date}T${b.time}`;
        return av.localeCompare(bv) * dir;
      }
      return String(a[sortKey]).localeCompare(String(b[sortKey])) * dir;
    });
  }, [rows, statusFilter, feedbackFilter, roundFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "candidateName" || key === "round" ? "asc" : "desc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(candidateOptions, roundOptions, typeOptions, employeeOptions));
    setFormOpen(true);
  }

  function openEdit(row: Interview) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row, employeeOptions));
    setFormOpen(true);
  }

  function openReschedule(row: Interview) {
    setFormMode("reschedule");
    setEditId(row.id);
    setForm({ ...formFromRow(row, employeeOptions), status: "rescheduled" });
    setFormOpen(true);
  }

  async function saveForm() {
    const cand = candidateOptions.find((c) => c.id === form.candidateId);
    if (!cand) {
      toast.error("Select a candidate");
      return;
    }
    if (!form.date || !form.time.trim()) {
      toast.error("Date and time are required");
      return;
    }
    if (!form.interviewerId) {
      toast.error("Interviewer is required");
      return;
    }

    const payload = {
      candidateId: cand.id,
      jobId: cand.jobId,
      round: form.round,
      type: form.type,
      date: form.date,
      time: form.time.trim(),
      durationMin: Number(form.durationMin) || 30,
      location: form.location,
      meetingLink: form.meetingLink.trim(),
      interviewerId: form.interviewerId,
      status: (formMode === "reschedule" ? "rescheduled" : form.status) as InterviewStatus,
    };

    setSaving(true);
    try {
      if ((formMode === "edit" || formMode === "reschedule") && editId) {
        const updated = await updateInterviewView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success(formMode === "reschedule" ? "Interview rescheduled" : "Interview updated");
      } else {
        const created = await createInterviewView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Interview scheduled");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Interview) {
    setSaving(true);
    try {
      await deleteInterviewView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Interview deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  const formTitle =
    formMode === "add"
      ? "Schedule Interview"
      : formMode === "reschedule"
        ? "Reschedule Interview"
        : "Edit Interview";

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      onClick={() => toggleSort(col)}
    >
      {label}
      <span className="text-[10px] opacity-60">
        {sortKey === col ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Interviews</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Schedule Interview
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search..."
            className="h-9 rounded-none pl-8"
          />
        </div>
        <Button type="button" size="sm" className={cn("h-9", GREEN_BTN)} onClick={() => setPage(1)}>
          <Search className="size-3.5" />
          Search
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-none"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <Filter className="size-3.5" />
          Filters
        </Button>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Per Page:
          <select
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
            className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
          >
            {[50, 100, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtersOpen ? (
        <div className="rounded-none border border-border bg-card p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted-foreground">
              Status
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value as "all" | InterviewStatus)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {INTERVIEW_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted-foreground">
              Feedback
              <select
                value={draftFeedback}
                onChange={(e) =>
                  setDraftFeedback(e.target.value as "all" | InterviewFeedbackStatus)
                }
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {INTERVIEW_FEEDBACK_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[160px] flex-col gap-1 text-xs text-muted-foreground">
              Round
              <select
                value={draftRound}
                onChange={(e) => setDraftRound(e.target.value)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {roundFilterOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className={cn("h-9", GREEN_BTN)}
                onClick={() => {
                  setStatusFilter(draftStatus);
                  setFeedbackFilter(draftFeedback);
                  setRoundFilter(draftRound);
                  setPage(1);
                }}
              >
                Apply Filters
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-none"
                onClick={() => {
                  setDraftStatus("all");
                  setDraftFeedback("all");
                  setDraftRound("all");
                  setStatusFilter("all");
                  setFeedbackFilter("all");
                  setRoundFilter("all");
                  setSearch("");
                  setPage(1);
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-none border border-border bg-card">
        <table className="w-full min-w-[1080px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Candidate" col="candidateName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Round" col="round" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Type
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Date & Time" col="date" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Location
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Feedback
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading interviews...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No interviews found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{row.candidateName}</div>
                      <div className="truncate text-xs text-muted-foreground">{row.jobTitle}</div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{row.round}</td>
                  <td className="px-3 py-2.5">{row.type}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium tabular-nums">{row.date}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.time} ({row.durationMin} min)
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {row.location === "Online" && row.meetingLink ? (
                      <a
                        href={row.meetingLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-600 underline-offset-2 hover:underline dark:text-sky-400"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Online
                      </a>
                    ) : (
                      row.location
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {INTERVIEW_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        feedbackBadgeClass(row.feedback),
                      )}
                    >
                      {INTERVIEW_FEEDBACK_LABEL[row.feedback]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-none"
                        onClick={() => setViewRow(row)}
                        aria-label="View"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {canWrite ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-amber-600"
                            onClick={() => openEdit(row)}
                            aria-label="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-emerald-600"
                            onClick={() => openReschedule(row)}
                            aria-label="Reschedule"
                            title="Reschedule"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-destructive"
                            onClick={() => remove(row)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing {(pageSafe - 1) * perPage + 1}–
            {Math.min(pageSafe * perPage, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none"
              disabled={pageSafe <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <span>
              Page {pageSafe}/{totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none"
              disabled={pageSafe >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {/* View */}
      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          title={viewRow ? `Interview — ${viewRow.candidateName}` : "Interview"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-border px-4 py-3 pr-10">
                <p className="text-base font-semibold">{viewRow.candidateName}</p>
                <p className="text-xs text-muted-foreground">
                  {viewRow.jobTitle} · {viewRow.jobCode}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-none text-[10px] font-normal",
                      statusBadgeClass(viewRow.status),
                    )}
                  >
                    {INTERVIEW_STATUS_LABEL[viewRow.status]}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-none text-[10px] font-normal",
                      feedbackBadgeClass(viewRow.feedback),
                    )}
                  >
                    Feedback: {INTERVIEW_FEEDBACK_LABEL[viewRow.feedback]}
                  </Badge>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Round", viewRow.round],
                      ["Type", viewRow.type],
                      ["Date", viewRow.date],
                      ["Time", `${viewRow.time} (${viewRow.durationMin} min)`],
                      ["Location", viewRow.location],
                      ["Meeting link", viewRow.meetingLink || "—"],
                      ["Interviewer", viewRow.interviewer],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                      <dd className="max-w-[60%] break-all text-right text-sm">{value}</dd>
                    </div>
                  ))}
                </dl>
                {viewRow.notes ? (
                  <div className="rounded-none border border-border bg-muted/20 px-3 py-2 text-sm">
                    <p className="mb-1 text-xs text-muted-foreground">Notes</p>
                    <p>{viewRow.notes}</p>
                  </div>
                ) : null}
                {viewRow.feedbackNotes ? (
                  <div className="rounded-none border border-border bg-muted/20 px-3 py-2 text-sm">
                    <p className="mb-1 text-xs text-muted-foreground">Feedback</p>
                    <p>{viewRow.feedbackNotes}</p>
                  </div>
                ) : null}
              </div>
              {canWrite ? (
                <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-4 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => {
                      setViewRow(null);
                      openEdit(viewRow);
                    }}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className={cn("rounded-none", GREEN_BTN)}
                    onClick={() => {
                      setViewRow(null);
                      openReschedule(viewRow);
                    }}
                  >
                    <CalendarClock className="size-3.5" />
                    Reschedule
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Schedule / Edit / Reschedule */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          title={formTitle}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">{formTitle}</SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — candidate, round, type, schedule, interviewer, feedback.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Candidate *
                <select
                  value={form.candidateId}
                  onChange={(e) => setForm({ ...form, candidateId: e.target.value })}
                  disabled={formMode === "reschedule"}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground disabled:opacity-60"
                >
                  {candidateOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.jobTitle}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Round *
                  <select
                    value={form.round}
                    onChange={(e) => setForm({ ...form, round: e.target.value })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {roundOptions.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Type *
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {typeOptions.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Date *
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Time *
                  <Input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Duration (min)
                  <Input
                    type="number"
                    min={15}
                    value={form.durationMin}
                    onChange={(e) => setForm({ ...form, durationMin: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Location
                  <select
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {INTERVIEW_LOCATIONS.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {form.location === "Online" ? (
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Meeting Link
                  <Input
                    value={form.meetingLink}
                    onChange={(e) => setForm({ ...form, meetingLink: e.target.value })}
                    className="h-9 rounded-none"
                    placeholder="https://meet.example.com/..."
                  />
                </label>
              ) : null}
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Interviewer *
                <select
                  value={form.interviewerId}
                  onChange={(e) => setForm({ ...form, interviewerId: e.target.value })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {employeeOptions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
              {formMode !== "reschedule" ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    Status
                    <select
                      value={form.status}
                      onChange={(e) =>
                        setForm({ ...form, status: e.target.value as InterviewStatus })
                      }
                      className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                    >
                      {INTERVIEW_STATUS_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    Feedback
                    <select
                      value={form.feedback}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          feedback: e.target.value as InterviewFeedbackStatus,
                        })
                      }
                      className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                    >
                      {INTERVIEW_FEEDBACK_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Notes
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="min-h-[72px] rounded-none"
                />
              </label>
              {formMode !== "reschedule" && form.feedback === "submitted" ? (
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Feedback Notes
                  <Textarea
                    value={form.feedbackNotes}
                    onChange={(e) => setForm({ ...form, feedbackNotes: e.target.value })}
                    className="min-h-[72px] rounded-none"
                  />
                </label>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 rounded-none"
                onClick={() => setFormOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" size="sm" className={cn("flex-1", GREEN_BTN)} onClick={saveForm}>
                Save
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
