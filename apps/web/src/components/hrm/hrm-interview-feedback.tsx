"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Filter, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import {
  createInterviewFeedbackView,
  deleteInterviewFeedbackView,
  listCandidateOptions,
  listInterviewFeedbackView,
  listInterviewOptions,
  listRecruitmentEmployeeOptions,
  updateInterviewFeedbackView,
  type CandidateOption,
  type InterviewOption,
  type NamedOption,
} from "@/lib/api/hrm-recruitment";
import {
  FEEDBACK_RECOMMENDATION_LABEL,
  FEEDBACK_RECOMMENDATION_OPTIONS,
  type FeedbackRecommendation,
  type InterviewFeedbackRow,
} from "@/lib/mock-data/hrm-interview-feedback";
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

type SortKey = "candidateName" | "submittedOn" | "overallRating" | "round";
type SortDir = "asc" | "desc";

type FormState = {
  interviewId: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  jobCode: string;
  round: string;
  interviewerId: string;
  overallRating: string;
  technicalSkills: string;
  communication: string;
  culturalFit: string;
  recommendation: FeedbackRecommendation;
  comments: string;
  nextSteps: string;
  submittedOn: string;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function clampRating(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.min(5, Math.max(0, Math.round(n * 10) / 10));
}

function emptyForm(
  interviews: InterviewOption[] = [],
  employees: NamedOption[] = [],
  candidates: CandidateOption[] = [],
): FormState {
  const interview = interviews[0];
  const cand = interview
    ? candidates.find((c) => c.id === interview.candidateId)
    : candidates[0];
  return {
    interviewId: interview?.id ?? "",
    candidateId: cand?.id ?? "",
    candidateName: cand?.name ?? "",
    jobTitle: cand?.jobTitle ?? "",
    jobCode: cand?.jobCode ?? "",
    round: "",
    interviewerId: employees[0]?.id ?? "",
    overallRating: "3",
    technicalSkills: "3",
    communication: "3",
    culturalFit: "3",
    recommendation: "maybe",
    comments: "",
    nextSteps: "",
    submittedOn: todayYmd(),
  };
}

function formFromRow(row: InterviewFeedbackRow, employees: NamedOption[] = []): FormState {
  return {
    interviewId: row.interviewId,
    candidateId: row.candidateId,
    candidateName: row.candidateName,
    jobTitle: row.jobTitle,
    jobCode: row.jobCode,
    round: row.round,
    interviewerId: employees.find((e) => e.name === row.interviewer)?.id ?? "",
    overallRating: String(row.overallRating),
    technicalSkills: String(row.technicalSkills),
    communication: String(row.communication),
    culturalFit: String(row.culturalFit),
    recommendation: row.recommendation,
    comments: row.comments,
    nextSteps: row.nextSteps,
    submittedOn: row.submittedOn,
  };
}

function recommendationBadgeClass(rec: FeedbackRecommendation) {
  switch (rec) {
    case "strong_hire":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "hire":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case "maybe":
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "strong_reject":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    default:
      return "border-orange-500/30 bg-orange-500/15 text-orange-800 dark:text-orange-300";
  }
}

function StarRating({ value, max = 5 }: { value: number; max?: number }) {
  const filled = Math.round(value);
  return (
    <span className="inline-flex items-center gap-1.5" title={`${value.toFixed(1)}/${max}`}>
      <span className="inline-flex items-center gap-0.5">
        {Array.from({ length: max }, (_, i) => (
          <Star
            key={i}
            className={cn(
              "size-3.5",
              i < filled
                ? "fill-amber-400 text-amber-400"
                : "fill-transparent text-muted-foreground/40",
            )}
          />
        ))}
      </span>
      <span className="tabular-nums text-xs text-muted-foreground">
        {value.toFixed(1)}/{max}
      </span>
    </span>
  );
}

export function HrmInterviewFeedback() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<InterviewFeedbackRow[]>([]);
  const [candidateOptions, setCandidateOptions] = useState<CandidateOption[]>([]);
  const [interviewOptions, setInterviewOptions] = useState<InterviewOption[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<NamedOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftRec, setDraftRec] = useState<"all" | FeedbackRecommendation>("all");
  const [draftRound, setDraftRound] = useState("all");
  const [recFilter, setRecFilter] = useState<"all" | FeedbackRecommendation>("all");
  const [roundFilter, setRoundFilter] = useState("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("submittedOn");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<InterviewFeedbackRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [data, candidates, interviews, employees] = await Promise.all([
          listInterviewFeedbackView(),
          listCandidateOptions(),
          listInterviewOptions(),
          listRecruitmentEmployeeOptions(),
        ]);
        if (cancelled) return;
        setRows(data);
        setCandidateOptions(candidates);
        setInterviewOptions(interviews);
        setEmployeeOptions(employees);
        setForm(emptyForm(interviews, employees, candidates));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load feedback");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const roundFilterOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) if (row.round) names.add(row.round);
    return [...names];
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (recFilter !== "all") list = list.filter((r) => r.recommendation === recFilter);
    if (roundFilter !== "all") list = list.filter((r) => r.round === roundFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.candidateName.toLowerCase().includes(q) ||
          r.jobTitle.toLowerCase().includes(q) ||
          r.round.toLowerCase().includes(q) ||
          r.interviewer.toLowerCase().includes(q) ||
          FEEDBACK_RECOMMENDATION_LABEL[r.recommendation].toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, recFilter, roundFilter, search, sortKey, sortDir]);

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

  function applyInterview(interviewId: string) {
    const interview = interviewOptions.find((i) => i.id === interviewId);
    const cand = interview
      ? candidateOptions.find((c) => c.id === interview.candidateId)
      : undefined;
    setForm((f) => ({
      ...f,
      interviewId,
      candidateId: cand?.id ?? "",
      candidateName: cand?.name ?? "",
      jobTitle: cand?.jobTitle ?? "",
      jobCode: cand?.jobCode ?? "",
    }));
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(interviewOptions, employeeOptions, candidateOptions));
    setFormOpen(true);
  }

  function openEdit(row: InterviewFeedbackRow) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row, employeeOptions));
    setFormOpen(true);
  }

  async function saveForm() {
    if (!form.interviewId || !form.interviewerId) {
      toast.error("Interview and interviewer are required");
      return;
    }

    const payload = {
      interviewId: form.interviewId,
      interviewerId: form.interviewerId,
      overallRating: clampRating(Number(form.overallRating)),
      technicalSkills: clampRating(Number(form.technicalSkills)),
      communication: clampRating(Number(form.communication)),
      culturalFit: clampRating(Number(form.culturalFit)),
      recommendation: form.recommendation,
      comments: [form.comments.trim(), form.nextSteps.trim()].filter(Boolean).join("\n\n"),
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateInterviewFeedbackView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success("Feedback updated");
      } else {
        const created = await createInterviewFeedbackView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Feedback added");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: InterviewFeedbackRow) {
    setSaving(true);
    try {
      await deleteInterviewFeedbackView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Feedback deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Interview Feedback
        </h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Feedback
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
            <label className="flex min-w-[160px] flex-col gap-1 text-xs text-muted-foreground">
              Recommendation
              <select
                value={draftRec}
                onChange={(e) =>
                  setDraftRec(e.target.value as "all" | FeedbackRecommendation)
                }
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {FEEDBACK_RECOMMENDATION_OPTIONS.map((s) => (
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
                  setRecFilter(draftRec);
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
                  setDraftRec("all");
                  setDraftRound("all");
                  setRecFilter("all");
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
        <table className="w-full min-w-[1040px] border-collapse text-sm">
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
                Interviewer
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Overall Rating" col="overallRating" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recommendation
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Submitted" col="submittedOn" />
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading feedback...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No feedback found.
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
                  <td className="px-3 py-2.5">{row.interviewer}</td>
                  <td className="px-3 py-2.5">
                    <StarRating value={row.overallRating} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        recommendationBadgeClass(row.recommendation),
                      )}
                    >
                      {FEEDBACK_RECOMMENDATION_LABEL[row.recommendation]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.submittedOn}</td>
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
          title={viewRow ? `Feedback — ${viewRow.candidateName}` : "Feedback"}
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
                  {viewRow.jobTitle} · {viewRow.round}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StarRating value={viewRow.overallRating} />
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-none text-[10px] font-normal",
                      recommendationBadgeClass(viewRow.recommendation),
                    )}
                  >
                    {FEEDBACK_RECOMMENDATION_LABEL[viewRow.recommendation]}
                  </Badge>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Interviewer", viewRow.interviewer],
                      ["Technical Skills", `${viewRow.technicalSkills.toFixed(1)}/5`],
                      ["Communication", `${viewRow.communication.toFixed(1)}/5`],
                      ["Cultural Fit", `${viewRow.culturalFit.toFixed(1)}/5`],
                      ["Submitted", viewRow.submittedOn],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-right text-sm">{value}</dd>
                    </div>
                  ))}
                </dl>
                {viewRow.comments ? (
                  <div className="rounded-none border border-border bg-muted/20 px-3 py-2 text-sm">
                    <p className="mb-1 text-xs text-muted-foreground">Comments</p>
                    <p>{viewRow.comments}</p>
                  </div>
                ) : null}
                {viewRow.nextSteps ? (
                  <div className="rounded-none border border-border bg-muted/20 px-3 py-2 text-sm">
                    <p className="mb-1 text-xs text-muted-foreground">Next Steps</p>
                    <p>{viewRow.nextSteps}</p>
                  </div>
                ) : null}
              </div>
              {canWrite ? (
                <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
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
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Add / Edit */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          title={formMode === "add" ? "Add Feedback" : "Edit Feedback"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Add Feedback" : "Edit Feedback"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — ratings ( /5 ), recommendation, comments, next steps.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Interview *
                <select
                  value={form.interviewId}
                  onChange={(e) => applyInterview(e.target.value)}
                  disabled={formMode === "edit"}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground disabled:opacity-60"
                >
                  {interviewOptions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </label>
              {form.candidateName ? (
                <p className="text-xs text-muted-foreground">
                  {form.candidateName} — {form.jobTitle} ({form.jobCode})
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
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
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Overall Rating (1–5)
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    value={form.overallRating}
                    onChange={(e) => setForm({ ...form, overallRating: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Recommendation
                  <select
                    value={form.recommendation}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        recommendation: e.target.value as FeedbackRecommendation,
                      })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {FEEDBACK_RECOMMENDATION_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Technical Skills
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    value={form.technicalSkills}
                    onChange={(e) => setForm({ ...form, technicalSkills: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Communication
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    value={form.communication}
                    onChange={(e) => setForm({ ...form, communication: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Cultural Fit
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    value={form.culturalFit}
                    onChange={(e) => setForm({ ...form, culturalFit: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Submitted
                  <Input
                    type="date"
                    value={form.submittedOn}
                    onChange={(e) => setForm({ ...form, submittedOn: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Comments
                <Textarea
                  value={form.comments}
                  onChange={(e) => setForm({ ...form, comments: e.target.value })}
                  className="min-h-[80px] rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Next Steps
                <Textarea
                  value={form.nextSteps}
                  onChange={(e) => setForm({ ...form, nextSteps: e.target.value })}
                  className="min-h-[64px] rounded-none"
                />
              </label>
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
