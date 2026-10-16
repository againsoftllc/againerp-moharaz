"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Filter, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  ASSESSMENT_TYPE_LABEL,
  ASSESSMENT_TYPE_OPTIONS,
  formatPassingScore,
  type AssessmentType,
  type TrainingAssessment,
} from "@/lib/mock-data/hrm-training-assessments";
import {
  createTrainingAssessmentView,
  deleteTrainingAssessmentView,
  listTrainingAssessmentsView,
  listTrainingProgramOptions,
  updateTrainingAssessmentView,
  type TrainingAssessmentWritePayload,
  type TrainingProgramOption,
} from "@/lib/api/hrm-training";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type SortKey = "name" | "assessmentType" | "passingScore" | "results";
type SortDir = "asc" | "desc";

type AssessmentRow = TrainingAssessment & { programId?: string };

type FormState = {
  name: string;
  programId: string;
  assessmentType: AssessmentType;
  passingScore: string;
};

function emptyForm(programOptions: TrainingProgramOption[] = []): FormState {
  return {
    name: "",
    programId: programOptions[0]?.id ?? "",
    assessmentType: "quiz",
    passingScore: "75",
  };
}

function formFromRow(row: AssessmentRow): FormState {
  return {
    name: row.name,
    programId: row.programId ?? "",
    assessmentType: row.assessmentType,
    passingScore: String(row.passingScore),
  };
}

function typeBadgeClass(type: AssessmentType) {
  switch (type) {
    case "practical":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "presentation":
      return "border-violet-500/30 bg-violet-500/15 text-violet-800 dark:text-violet-300";
    default:
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
  }
}

export function HrmTrainingAssessments() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<AssessmentRow[]>([]);
  const [programOptions, setProgramOptions] = useState<TrainingProgramOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftType, setDraftType] = useState<"all" | AssessmentType>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | AssessmentType>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [viewRow, setViewRow] = useState<AssessmentRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [programs, data] = await Promise.all([
          listTrainingProgramOptions(),
          listTrainingAssessmentsView(),
        ]);
        if (cancelled) return;
        setProgramOptions(programs);
        setRows(data as AssessmentRow[]);
        setForm(emptyForm(programs));
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
    if (typeFilter !== "all") list = list.filter((r) => r.assessmentType === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.programName.toLowerCase().includes(q) ||
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
  }, [rows, typeFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" || key === "assessmentType" ? "asc" : "desc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(programOptions));
    setFormOpen(true);
  }

  function openEdit(row: AssessmentRow) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function saveForm() {
    const program = programOptions.find((p) => p.id === form.programId);
    if (!form.name.trim() || !program) {
      toast.error("Name and training program are required");
      return;
    }
    const passingScore = Math.min(100, Math.max(0, Number(form.passingScore) || 0));

    const payload: TrainingAssessmentWritePayload = {
      name: form.name.trim(),
      programId: program.id,
      assessmentType: form.assessmentType,
      passingScore,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateTrainingAssessmentView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? (updated as AssessmentRow) : r)));
        setViewRow((v) => (v?.id === editId ? (updated as AssessmentRow) : v));
        toast.success("Assessment updated");
      } else {
        const created = await createTrainingAssessmentView(payload);
        setRows((prev) => [created as AssessmentRow, ...prev]);
        toast.success("Assessment created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: AssessmentRow) {
    setSaving(true);
    try {
      await deleteTrainingAssessmentView(row.id);
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

  const fieldClass =
    "h-9 w-full rounded-none border border-border bg-background px-2 text-sm text-foreground";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Training Assessments
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
              Type
              <select
                value={draftType}
                onChange={(e) => setDraftType(e.target.value as "all" | AssessmentType)}
                className={fieldClass}
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
                  setDraftType("all");
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
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Name" col="name" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Type" col="assessmentType" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Passing Score" col="passingScore" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Results" col="results" />
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading training assessments...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No training assessments found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.programName}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        typeBadgeClass(row.assessmentType),
                      )}
                    >
                      {ASSESSMENT_TYPE_LABEL[row.assessmentType]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {formatPassingScore(row.passingScore)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.results}</td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-none text-sky-600 dark:text-sky-400"
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
                            className="h-7 w-7 rounded-none text-amber-600 dark:text-amber-400"
                            onClick={() => openEdit(row)}
                            aria-label="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-red-600 dark:text-red-400"
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

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing{" "}
          {filtered.length === 0 ? 0 : (pageSafe - 1) * perPage + 1}–
          {Math.min(pageSafe * perPage, filtered.length)} of {filtered.length}
        </span>
        <div className="flex items-center gap-1">
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
          <span className="px-2 tabular-nums">
            {pageSafe} / {totalPages}
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

      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[420px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title="Assessment details"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">Assessment Details</SheetTitle>
            <SheetDescription className="sr-only">View training assessment</SheetDescription>
          </SheetHeader>
          {viewRow ? (
            <div className="flex-1 space-y-4 overflow-auto p-4">
              <div>
                <div className="text-base font-semibold text-foreground">{viewRow.name}</div>
                <div className="text-sm text-muted-foreground">{viewRow.programName}</div>
              </div>
              <dl className="grid gap-3 text-sm">
                {(
                  [
                    ["Type", ASSESSMENT_TYPE_LABEL[viewRow.assessmentType]],
                    ["Passing Score", formatPassingScore(viewRow.passingScore)],
                    ["Results", String(viewRow.results)],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[120px_1fr] gap-2 border-b border-border/60 pb-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
              {canWrite ? (
                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    size="sm"
                    className={cn("h-9", GREEN_BTN)}
                    onClick={() => {
                      openEdit(viewRow);
                      setViewRow(null);
                    }}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-none text-red-600"
                    onClick={() => {
                      remove(viewRow);
                      setViewRow(null);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[440px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title={formMode === "edit" ? "Edit Assessment" : "Add Assessment"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Assessment" : "Add Assessment"}
            </SheetTitle>
            <SheetDescription className="sr-only">Training assessment form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Name *
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="e.g. Coding Skills Assessment"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Training Program *
              <select
                value={form.programId}
                onChange={(e) => setForm((f) => ({ ...f, programId: e.target.value }))}
                className={fieldClass}
              >
                {programOptions.length === 0 ? (
                  <option value="">No programs</option>
                ) : (
                  programOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Type
              <select
                value={form.assessmentType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    assessmentType: e.target.value as AssessmentType,
                  }))
                }
                className={fieldClass}
              >
                {ASSESSMENT_TYPE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Passing Score (%)
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.passingScore}
                onChange={(e) => setForm((f) => ({ ...f, passingScore: e.target.value }))}
                className="h-9 rounded-none"
              />
            </label>
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              disabled={saving}
              onClick={saveForm}
            >
              {formMode === "edit" ? "Save Changes" : "Create Assessment"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-none"
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
