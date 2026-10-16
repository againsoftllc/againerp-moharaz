"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Filter, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  createCandidateAssessmentView,
  deleteCandidateAssessmentView,
  listCandidateAssessmentsView,
  listCandidateOptions,
  listRecruitmentEmployeeOptions,
  updateCandidateAssessmentView,
  type CandidateOption,
  type NamedOption,
} from "@/lib/api/hrm-recruitment";
import {
  ASSESSMENT_STATUS_LABEL,
  ASSESSMENT_STATUS_OPTIONS,
  ASSESSMENT_TYPE_LABEL,
  ASSESSMENT_TYPE_OPTIONS,
  formatScore,
  type AssessmentStatus,
  type AssessmentType,
  type CandidateAssessment,
} from "@/lib/mock-data/hrm-candidate-assessments";
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

type SortKey = "candidateName" | "assessmentDate" | "score" | "title" | "status";
type SortDir = "asc" | "desc";

type FormState = {
  candidateId: string;
  title: string;
  assessmentType: AssessmentType;
  assessmentDate: string;
  score: string;
  maxScore: string;
  durationMin: string;
  conductedBy: string;
  notes: string;
  status: AssessmentStatus;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function emptyForm(candidates: CandidateOption[] = [], employees: NamedOption[] = []): FormState {
  return {
    candidateId: candidates[0]?.id ?? "",
    title: "",
    assessmentType: "technical",
    assessmentDate: todayYmd(),
    score: "0",
    maxScore: "100",
    durationMin: "60",
    conductedBy: employees[0]?.name ?? "",
    notes: "",
    status: "scheduled",
  };
}

function formFromRow(row: CandidateAssessment): FormState {
  return {
    candidateId: row.candidateId,
    title: row.title,
    assessmentType: row.assessmentType,
    assessmentDate: row.assessmentDate,
    score: String(row.score),
    maxScore: String(row.maxScore),
    durationMin: String(row.durationMin),
    conductedBy: row.conductedBy,
    notes: row.notes,
    status: row.status,
  };
}

function statusBadgeClass(status: AssessmentStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "cancelled":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    default:
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
  }
}

function typeBadgeClass(type: AssessmentType) {
  switch (type) {
    case "technical":
      return "border-violet-500/30 bg-violet-500/15 text-violet-800 dark:text-violet-300";
    case "behavioral":
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "aptitude":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

export function HrmCandidateAssessments() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<CandidateAssessment[]>([]);
  const [candidateOptions, setCandidateOptions] = useState<CandidateOption[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<NamedOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | AssessmentStatus>("all");
  const [draftType, setDraftType] = useState<"all" | AssessmentType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | AssessmentStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | AssessmentType>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("assessmentDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<CandidateAssessment | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [data, candidates, employees] = await Promise.all([
          listCandidateAssessmentsView(),
          listCandidateOptions(),
          listRecruitmentEmployeeOptions(),
        ]);
        if (cancelled) return;
        setRows(data);
        setCandidateOptions(candidates);
        setEmployeeOptions(employees);
        setForm(emptyForm(candidates, employees));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load assessments");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (typeFilter !== "all") list = list.filter((r) => r.assessmentType === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.candidateName.toLowerCase().includes(q) ||
          r.jobTitle.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.conductedBy.toLowerCase().includes(q) ||
          ASSESSMENT_TYPE_LABEL[r.assessmentType].toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, statusFilter, typeFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "candidateName" || key === "title" || key === "status" ? "asc" : "desc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(candidateOptions, employeeOptions));
    setFormOpen(true);
  }

  function openEdit(row: CandidateAssessment) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function saveForm() {
    const cand = candidateOptions.find((c) => c.id === form.candidateId);
    if (!cand) {
      toast.error("Select a candidate");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Assessment title is required");
      return;
    }

    const employee = employeeOptions.find((e) => e.name === form.conductedBy);
    const payload = {
      candidateId: cand.id,
      title: form.title.trim(),
      assessmentDate: form.assessmentDate,
      score: Number(form.score) || 0,
      maxScore: Number(form.maxScore) || 100,
      conductedById: employee?.id ?? "",
      notes: form.notes.trim(),
      status: form.status,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateCandidateAssessmentView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success("Assessment updated");
      } else {
        const created = await createCandidateAssessmentView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Assessment added");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: CandidateAssessment) {
    setSaving(true);
    try {
      await deleteCandidateAssessmentView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Assessment deleted");
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
          Candidate Assessments
        </h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Assessment
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
                onChange={(e) => setDraftStatus(e.target.value as "all" | AssessmentStatus)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {ASSESSMENT_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted-foreground">
              Type
              <select
                value={draftType}
                onChange={(e) => setDraftType(e.target.value as "all" | AssessmentType)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {ASSESSMENT_TYPE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
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
                  setTypeFilter(draftType);
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
                  setDraftType("all");
                  setStatusFilter("all");
                  setTypeFilter("all");
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
                <SortHeader label="Assessment" col="title" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Score" col="score" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Conducted By
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Assessment Date" col="assessmentDate" />
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
                  Loading assessments...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No assessments found.
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
                  <td className="px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{row.title}</div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "mt-1 rounded-none text-[10px] font-normal",
                          typeBadgeClass(row.assessmentType),
                        )}
                      >
                        {ASSESSMENT_TYPE_LABEL[row.assessmentType]}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {row.status === "completed"
                      ? formatScore(row.score, row.maxScore)
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">{row.conductedBy}</td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {ASSESSMENT_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.assessmentDate}</td>
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
          title={viewRow ? `Assessment — ${viewRow.title}` : "Assessment"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-border px-4 py-3 pr-10">
                <p className="text-base font-semibold">{viewRow.title}</p>
                <p className="text-xs text-muted-foreground">
                  {viewRow.candidateName} · {viewRow.jobTitle}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-none text-[10px] font-normal",
                      statusBadgeClass(viewRow.status),
                    )}
                  >
                    {ASSESSMENT_STATUS_LABEL[viewRow.status]}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-none text-[10px] font-normal",
                      typeBadgeClass(viewRow.assessmentType),
                    )}
                  >
                    {ASSESSMENT_TYPE_LABEL[viewRow.assessmentType]}
                  </Badge>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Score", formatScore(viewRow.score, viewRow.maxScore)],
                      ["Duration", `${viewRow.durationMin} min`],
                      ["Conducted By", viewRow.conductedBy],
                      ["Assessment Date", viewRow.assessmentDate],
                      ["Job Code", viewRow.jobCode],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-right text-sm">{value}</dd>
                    </div>
                  ))}
                </dl>
                {viewRow.notes ? (
                  <div className="rounded-none border border-border bg-muted/20 px-3 py-2 text-sm">
                    <p className="mb-1 text-xs text-muted-foreground">Notes</p>
                    <p>{viewRow.notes}</p>
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
          title={formMode === "add" ? "Add Assessment" : "Edit Assessment"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Add Assessment" : "Edit Assessment"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — candidate, type, score, conducted by, status.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Candidate *
                <select
                  value={form.candidateId}
                  onChange={(e) => setForm({ ...form, candidateId: e.target.value })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {candidateOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.jobTitle}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Assessment Title *
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="h-9 rounded-none"
                  placeholder="e.g. System Design Challenge"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Type
                  <select
                    value={form.assessmentType}
                    onChange={(e) =>
                      setForm({ ...form, assessmentType: e.target.value as AssessmentType })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {ASSESSMENT_TYPE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as AssessmentStatus })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {ASSESSMENT_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Assessment Date
                  <Input
                    type="date"
                    value={form.assessmentDate}
                    onChange={(e) => setForm({ ...form, assessmentDate: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Duration (min)
                  <Input
                    type="number"
                    min={0}
                    value={form.durationMin}
                    onChange={(e) => setForm({ ...form, durationMin: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Score
                  <Input
                    type="number"
                    min={0}
                    value={form.score}
                    onChange={(e) => setForm({ ...form, score: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Max Score
                  <Input
                    type="number"
                    min={1}
                    value={form.maxScore}
                    onChange={(e) => setForm({ ...form, maxScore: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Conducted By
                <select
                  value={form.conductedBy}
                  onChange={(e) => setForm({ ...form, conductedBy: e.target.value })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {employeeOptions.map((e) => (
                    <option key={e.id} value={e.name}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Notes
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="min-h-[80px] rounded-none"
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
