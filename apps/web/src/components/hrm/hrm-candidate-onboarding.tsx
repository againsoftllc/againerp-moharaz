"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Eye, Filter, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  createCandidateOnboardingView,
  deleteCandidateOnboardingView,
  listCandidateOnboardingView,
  listCandidateOptions,
  listRecruitmentChecklistOptions,
  listRecruitmentEmployeeOptions,
  updateCandidateOnboardingView,
  type CandidateOption,
  type NamedOption,
} from "@/lib/api/hrm-recruitment";
import {
  ONBOARDING_STATUS_LABEL,
  ONBOARDING_STATUS_OPTIONS,
  calcProgress,
  type CandidateOnboarding,
  type OnboardingStatus,
} from "@/lib/mock-data/hrm-candidate-onboarding";
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

type SortKey = "candidateName" | "startDate" | "progress" | "createdOn" | "status";
type SortDir = "asc" | "desc";

type FormState = {
  candidateId: string;
  checklistId: string;
  startDate: string;
  expectedCompletion: string;
  buddyEmployeeId: string;
  assignedTo: string;
  status: OnboardingStatus;
  notes: string;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function emptyForm(
  candidates: CandidateOption[] = [],
  checklists: NamedOption[] = [],
  employees: NamedOption[] = [],
): FormState {
  const c = candidates[0];
  return {
    candidateId: c?.id ?? "",
    checklistId: checklists[0]?.id ?? "",
    startDate: todayYmd(),
    expectedCompletion: todayYmd(),
    buddyEmployeeId: employees[0]?.id ?? "",
    assignedTo: "",
    status: "not_started",
    notes: "",
  };
}

function formFromRow(row: CandidateOnboarding, employees: NamedOption[] = []): FormState {
  return {
    candidateId: row.candidateId,
    checklistId: row.checklistId,
    startDate: row.startDate,
    expectedCompletion: row.expectedCompletion,
    buddyEmployeeId: employees.find((e) => e.name === row.buddyName)?.id ?? "",
    assignedTo: row.assignedTo,
    status: row.status,
    notes: row.notes,
  };
}

function statusBadgeClass(status: OnboardingStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "in_progress":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case "on_hold":
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

export function HrmCandidateOnboarding() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<CandidateOnboarding[]>([]);
  const [candidateOptions, setCandidateOptions] = useState<CandidateOption[]>([]);
  const [checklistOptions, setChecklistOptions] = useState<NamedOption[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<NamedOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | OnboardingStatus>("all");
  const [draftChecklist, setDraftChecklist] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | OnboardingStatus>("all");
  const [checklistFilter, setChecklistFilter] = useState("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("createdOn");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<CandidateOnboarding | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [data, hiredCandidates, checklists, employees] = await Promise.all([
          listCandidateOnboardingView(),
          listCandidateOptions("hired"),
          listRecruitmentChecklistOptions(),
          listRecruitmentEmployeeOptions(),
        ]);
        if (cancelled) return;
        setRows(data);
        setCandidateOptions(hiredCandidates);
        setChecklistOptions(checklists);
        setEmployeeOptions(employees);
        setForm(emptyForm(hiredCandidates, checklists, employees));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load onboarding");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const candidateOptionsForForm = useMemo(() => {
    const byId = new Map(candidateOptions.map((c) => [c.id, c]));
    for (const r of rows) {
      if (!byId.has(r.candidateId)) {
        byId.set(r.candidateId, {
          id: r.candidateId,
          name: r.candidateName,
          jobTitle: r.jobTitle,
          jobCode: r.jobCode,
          jobId: "",
          department: "",
          employeeConverted: true,
          status: "hired",
        });
      }
    }
    return [...byId.values()];
  }, [candidateOptions, rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (checklistFilter !== "all") list = list.filter((r) => r.checklistId === checklistFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.candidateName.toLowerCase().includes(q) ||
          r.jobTitle.toLowerCase().includes(q) ||
          r.checklistName.toLowerCase().includes(q) ||
          r.buddyName.toLowerCase().includes(q) ||
          r.assignedTo.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, statusFilter, checklistFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "candidateName" || key === "status" ? "asc" : "desc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(candidateOptions, checklistOptions, employeeOptions));
    setFormOpen(true);
  }

  function openEdit(row: CandidateOnboarding) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row, employeeOptions));
    setFormOpen(true);
  }

  async function saveForm() {
    const cand = candidateOptionsForForm.find((c) => c.id === form.candidateId);
    const chk = checklistOptions.find((c) => c.id === form.checklistId);
    if (!cand || !chk) {
      toast.error("Candidate and checklist are required");
      return;
    }

    const payload = {
      candidateId: cand.id,
      checklistId: chk.id,
      startDate: form.startDate,
      buddyEmployeeId: form.buddyEmployeeId,
      status: form.status,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateCandidateOnboardingView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success("Onboarding updated");
      } else {
        const created = await createCandidateOnboardingView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Onboarding created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function toggleTask(rowId: string, taskId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const tasks = r.tasks.map((t) =>
          t.id === taskId ? { ...t, done: !t.done } : t,
        );
        const progress = calcProgress(tasks);
        const status: OnboardingStatus =
          progress >= 100 ? "completed" : progress > 0 ? "in_progress" : r.status;
        return { ...r, tasks, progress, status };
      }),
    );
    setViewRow((v) => {
      if (!v || v.id !== rowId) return v;
      const tasks = v.tasks.map((t) =>
        t.id === taskId ? { ...t, done: !t.done } : t,
      );
      const progress = calcProgress(tasks);
      const status: OnboardingStatus =
        progress >= 100 ? "completed" : progress > 0 ? "in_progress" : v.status;
      return { ...v, tasks, progress, status };
    });
  }

  async function remove(row: CandidateOnboarding) {
    setSaving(true);
    try {
      await deleteCandidateOnboardingView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Onboarding deleted");
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
          Candidate Onboarding
        </h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Create Onboarding
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
                onChange={(e) => setDraftStatus(e.target.value as "all" | OnboardingStatus)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {ONBOARDING_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[180px] flex-col gap-1 text-xs text-muted-foreground">
              Checklist
              <select
                value={draftChecklist}
                onChange={(e) => setDraftChecklist(e.target.value)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {checklistOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
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
                  setChecklistFilter(draftChecklist);
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
                  setDraftChecklist("all");
                  setStatusFilter("all");
                  setChecklistFilter("all");
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
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Checklist
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Start Date" col="startDate" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Buddy
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Progress" col="progress" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Created" col="createdOn" />
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
                  Loading onboarding...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No onboarding records found.
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
                  <td className="px-3 py-2.5">{row.checklistName}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.startDate}</td>
                  <td className="px-3 py-2.5">{row.buddyName}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex min-w-[100px] items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-none bg-muted">
                        <div
                          className="h-1.5 rounded-none bg-[#4caf50]"
                          style={{ width: `${row.progress}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {row.progress}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {ONBOARDING_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.createdOn}</td>
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

      {/* View — details + task checklist */}
      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          title={viewRow ? `Onboarding — ${viewRow.candidateName}` : "Onboarding"}
          resizable
          resizeMaxWidth={800}
          closeButton="chevron"
          className="w-[min(100%,32rem)] min-w-[300px] max-w-[800px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-border px-4 py-3 pr-10">
                <p className="text-base font-semibold">{viewRow.candidateName}</p>
                <p className="text-xs text-muted-foreground">
                  {viewRow.jobTitle} · {viewRow.checklistName}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-none text-[10px] font-normal",
                      statusBadgeClass(viewRow.status),
                    )}
                  >
                    {ONBOARDING_STATUS_LABEL[viewRow.status]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{viewRow.progress}% complete</span>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Buddy", viewRow.buddyName],
                      ["Assigned To", viewRow.assignedTo],
                      ["Start Date", viewRow.startDate],
                      ["Expected Completion", viewRow.expectedCompletion],
                      ["Created", viewRow.createdOn],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-right text-sm">{value}</dd>
                    </div>
                  ))}
                </dl>

                <section className="rounded-none border border-border">
                  <div className="border-b border-border px-3 py-2.5">
                    <h3 className="text-sm font-semibold">Checklist Tasks</h3>
                    <p className="text-xs text-muted-foreground">
                      Toggle tasks to update progress
                    </p>
                  </div>
                  <ul className="divide-y divide-border">
                    {viewRow.tasks.map((task) => (
                      <li key={task.id} className="flex items-start gap-2 px-3 py-2.5">
                        <button
                          type="button"
                          disabled={!canWrite}
                          onClick={() => toggleTask(viewRow.id, task.id)}
                          className={cn(
                            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-none border border-border",
                            task.done && "border-emerald-600 bg-emerald-600 text-white",
                            !canWrite && "opacity-60",
                          )}
                          aria-label={task.done ? "Mark incomplete" : "Mark complete"}
                        >
                          {task.done ? <Check className="size-3" /> : null}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-sm",
                              task.done && "text-muted-foreground line-through",
                            )}
                          >
                            {task.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {task.category} · Due day {task.dueDay}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>

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

      {/* Create / Edit */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          title={formMode === "add" ? "Create Onboarding" : "Edit Onboarding"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Create Onboarding" : "Edit Onboarding"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — candidate, checklist, buddy, start date, assignee.
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
                  {candidateOptionsForForm.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.jobTitle}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Checklist *
                <select
                  value={form.checklistId}
                  onChange={(e) => setForm({ ...form, checklistId: e.target.value })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {checklistOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Start Date
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Expected Completion
                  <Input
                    type="date"
                    value={form.expectedCompletion}
                    onChange={(e) => setForm({ ...form, expectedCompletion: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Buddy Employee
                  <select
                    value={form.buddyEmployeeId}
                    onChange={(e) => setForm({ ...form, buddyEmployeeId: e.target.value })}
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
                  Assigned To
                  <Input
                    value={form.assignedTo}
                    onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                    className="h-9 rounded-none"
                    placeholder="Optional assignee"
                  />
                </label>
                <label className="col-span-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as OnboardingStatus })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {ONBOARDING_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Notes
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="min-h-[72px] rounded-none"
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
