"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Download,
  Eye,
  Filter,
  Plus,
  Search,
  UserPlus,
} from "lucide-react";
import {
  TRAINING_RESULT_LABEL,
  TRAINING_STATUS_LABEL,
  TRAINING_STATUS_OPTIONS,
  formatScore,
  trainingAvatar,
  type EmployeeTraining,
  type TrainingAssignStatus,
  type TrainingResult,
} from "@/lib/mock-data/hrm-employee-trainings";
import {
  createEmployeeTrainingView,
  listEmployeeTrainingsView,
  listTrainingEmployeeOptions,
  listTrainingProgramOptions,
  type EmployeeTrainingWritePayload,
  type TrainingEmployeeOption,
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

type SortKey = "employeeName" | "programName" | "assignedDate" | "status";
type SortDir = "asc" | "desc";

type TrainingRow = EmployeeTraining & { programId?: string };

type FormState = {
  employeeId: string;
  programId: string;
  status: TrainingAssignStatus;
  assignedDate: string;
  completionDate: string;
  score: string;
  result: "" | "passed" | "failed";
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function emptyForm(
  employees: TrainingEmployeeOption[] = [],
  programs: TrainingProgramOption[] = [],
): FormState {
  return {
    employeeId: employees[0]?.id ?? "",
    programId: programs[0]?.id ?? "",
    status: "assigned",
    assignedDate: todayYmd(),
    completionDate: "",
    score: "",
    result: "",
  };
}

function statusBadgeClass(status: TrainingAssignStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "in_progress":
      return "border-orange-500/30 bg-orange-500/15 text-orange-800 dark:text-orange-300";
    default:
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
  }
}

export function HrmEmployeeTrainings() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<TrainingRow[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<TrainingEmployeeOption[]>([]);
  const [programOptions, setProgramOptions] = useState<TrainingProgramOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | TrainingAssignStatus>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | TrainingAssignStatus>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("assignedDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<TrainingRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [bulkEmployeeIds, setBulkEmployeeIds] = useState<string[]>([]);
  const [bulkProgramId, setBulkProgramId] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [employees, programs, data] = await Promise.all([
          listTrainingEmployeeOptions(),
          listTrainingProgramOptions(),
          listEmployeeTrainingsView(),
        ]);
        if (cancelled) return;
        setEmployeeOptions(employees);
        setProgramOptions(programs);
        setRows(data as TrainingRow[]);
        setForm(emptyForm(employees, programs));
        setBulkProgramId(programs[0]?.id ?? "");
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load employee trainings");
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
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.employeeName.toLowerCase().includes(q) ||
          r.employeeCode.toLowerCase().includes(q) ||
          r.programName.toLowerCase().includes(q) ||
          r.programCategory.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])) * dir);
  }, [rows, statusFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  const stats = useMemo(() => {
    const assigned = rows.filter((r) => r.status === "assigned").length;
    const inProgress = rows.filter((r) => r.status === "in_progress").length;
    const completed = rows.filter((r) => r.status === "completed").length;
    return { total: rows.length, assigned, inProgress, completed };
  }, [rows]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "assignedDate" ? "desc" : "asc");
    }
  }

  function openAssign() {
    setForm(emptyForm(employeeOptions, programOptions));
    setFormOpen(true);
  }

  async function saveAssign() {
    const emp = employeeOptions.find((e) => e.id === form.employeeId);
    const prog = programOptions.find((p) => p.id === form.programId);
    if (!emp || !prog) {
      toast.error("Select employee and program");
      return;
    }
    if (!form.assignedDate) {
      toast.error("Assigned date is required");
      return;
    }

    const scoreRaw = form.score.trim();
    const score = scoreRaw === "" ? null : Number(scoreRaw);
    if (score != null && (Number.isNaN(score) || score < 0 || score > 100)) {
      toast.error("Score must be 0–100");
      return;
    }

    const result: TrainingResult =
      form.result === "" ? null : (form.result as "passed" | "failed");

    const payload: EmployeeTrainingWritePayload = {
      employeeId: emp.id,
      programId: prog.id,
      status: form.status,
      assignedDate: form.assignedDate,
      completionDate: form.completionDate || null,
      score,
      result,
    };

    setSaving(true);
    try {
      const created = await createEmployeeTrainingView(payload);
      setRows((prev) => [created as TrainingRow, ...prev]);
      toast.success("Training assigned");
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveBulk() {
    if (bulkEmployeeIds.length === 0) {
      toast.error("Select at least one employee");
      return;
    }
    const prog = programOptions.find((p) => p.id === bulkProgramId);
    if (!prog) {
      toast.error("Select a program");
      return;
    }
    const date = todayYmd();

    setSaving(true);
    try {
      const createdRows: TrainingRow[] = [];
      for (const id of bulkEmployeeIds) {
        const created = await createEmployeeTrainingView({
          employeeId: id,
          programId: prog.id,
          status: "assigned",
          assignedDate: date,
          completionDate: null,
          score: null,
          result: null,
        });
        createdRows.push(created as TrainingRow);
      }
      setRows((prev) => [...createdRows, ...prev]);
      toast.success(`Assigned to ${bulkEmployeeIds.length} employee(s)`);
      setBulkOpen(false);
      setBulkEmployeeIds([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk assign failed");
    } finally {
      setSaving(false);
    }
  }

  function downloadCertificate(row: TrainingRow) {
    if (!row.hasCertificate) {
      toast.message("No certificate available");
      return;
    }
    toast.message(`Certificate: ${row.programName} — ${row.employeeName}`);
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
          Employee Trainings
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-none"
            onClick={() => setDashboardOpen(true)}
          >
            <BarChart3 className="size-3.5" />
            Dashboard
          </Button>
          {canWrite ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-none"
                onClick={() => setBulkOpen(true)}
              >
                <UserPlus className="size-3.5" />
                Bulk Assign
              </Button>
              <Button type="button" size="sm" className={GREEN_BTN} onClick={openAssign}>
                <Plus className="size-3.5" />
                Assign Training
              </Button>
            </>
          ) : null}
        </div>
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
                onChange={(e) => setDraftStatus(e.target.value as "all" | TrainingAssignStatus)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {TRAINING_STATUS_OPTIONS.map((s) => (
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
                  setStatusFilter("all");
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
        <table className="w-full min-w-[1280px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Employee" col="employeeName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Training Program" col="programName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Assigned Date" col="assignedDate" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Completion Date
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Score
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Result
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Assessments
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Certificate
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading employee trainings...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No employee trainings found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={trainingAvatar(row.employeeId)}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-none border border-border object-cover"
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{row.employeeName}</div>
                        <div className="text-xs text-muted-foreground">{row.employeeCode}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{row.programName}</div>
                    <div className="text-xs text-muted-foreground">{row.programCategory}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {TRAINING_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.assignedDate}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.completionDate || "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatScore(row.score)}</td>
                  <td className="px-3 py-2.5">
                    {row.result ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-none text-[10px] font-normal",
                          row.result === "passed"
                            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300",
                        )}
                      >
                        {TRAINING_RESULT_LABEL[row.result]}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.assessments}</td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 rounded-none",
                        row.hasCertificate
                          ? "border-sky-500/40 text-sky-700 dark:text-sky-300"
                          : "text-muted-foreground",
                      )}
                      disabled={!row.hasCertificate}
                      onClick={() => downloadCertificate(row)}
                    >
                      <Download className="size-3.5" />
                      Download
                    </Button>
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
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
          title={viewRow ? `Training — ${viewRow.employeeName}` : "Training"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col" data-view="hrm-employee-training-workdo">
              <div className="shrink-0 border-b border-border px-4 py-4 pr-10">
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={trainingAvatar(viewRow.employeeId)}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-none border border-border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold leading-snug">{viewRow.employeeName}</p>
                    <p className="text-xs text-muted-foreground">{viewRow.employeeCode}</p>
                    <p className="mt-1.5 text-sm font-medium">{viewRow.programName}</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "mt-2 rounded-none text-[10px] font-normal",
                        statusBadgeClass(viewRow.status),
                      )}
                    >
                      {TRAINING_STATUS_LABEL[viewRow.status]}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Program", viewRow.programName],
                      ["Category", viewRow.programCategory],
                      ["Assigned Date", viewRow.assignedDate],
                      ["Completion Date", viewRow.completionDate || "—"],
                      ["Score", formatScore(viewRow.score)],
                      [
                        "Result",
                        viewRow.result ? TRAINING_RESULT_LABEL[viewRow.result] : "—",
                      ],
                      ["Assessments", String(viewRow.assessments)],
                      ["Certificate", viewRow.hasCertificate ? "Available" : "—"],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 px-3 py-2.5">
                      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                      <dd className="max-w-[62%] text-right text-sm text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              {viewRow.hasCertificate ? (
                <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => downloadCertificate(viewRow)}
                  >
                    <Download className="size-3.5" />
                    Download Certificate
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Dashboard */}
      <Sheet open={dashboardOpen} onOpenChange={setDashboardOpen}>
        <SheetContent
          side="right"
          title="Training Dashboard"
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,24rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">Training Dashboard</SheetTitle>
              <SheetDescription className="text-xs">
                Snapshot of assigned employee trainings
              </SheetDescription>
            </SheetHeader>
            <div className="grid grid-cols-2 gap-2 p-4">
              {(
                [
                  ["Total", stats.total],
                  ["Assigned", stats.assigned],
                  ["In Progress", stats.inProgress],
                  ["Completed", stats.completed],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-none border border-border bg-muted/20 px-3 py-3"
                >
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Bulk Assign */}
      <Sheet open={bulkOpen} onOpenChange={setBulkOpen}>
        <SheetContent
          side="right"
          title="Bulk Assign"
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">Bulk Assign Training</SheetTitle>
              <SheetDescription className="text-xs">
                Assign one program to multiple employees
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Training Program
                <select
                  value={bulkProgramId}
                  onChange={(e) => setBulkProgramId(e.target.value)}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {programOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Employees</p>
                {employeeOptions.map((e) => {
                  const checked = bulkEmployeeIds.includes(e.id);
                  return (
                    <label
                      key={e.id}
                      className="flex items-center gap-2 rounded-none border border-border px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setBulkEmployeeIds((prev) =>
                            checked ? prev.filter((id) => id !== e.id) : [...prev, e.id],
                          )
                        }
                        className="size-4 rounded-none border border-border"
                      />
                      {e.name} ({e.code})
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 rounded-none"
                onClick={() => setBulkOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className={cn("flex-1", GREEN_BTN)}
                disabled={saving}
                onClick={saveBulk}
              >
                Assign
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Assign Training */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          title="Assign Training"
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">Assign Training</SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — employee, program, status, dates, score, result.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Employee *
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {employeeOptions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Training Program *
                <select
                  value={form.programId}
                  onChange={(e) => setForm({ ...form, programId: e.target.value })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {programOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.category}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as TrainingAssignStatus })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {TRAINING_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Assigned Date *
                  <Input
                    type="date"
                    value={form.assignedDate}
                    onChange={(e) => setForm({ ...form, assignedDate: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Completion Date
                  <Input
                    type="date"
                    value={form.completionDate}
                    onChange={(e) => setForm({ ...form, completionDate: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Score %
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.score}
                    onChange={(e) => setForm({ ...form, score: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Result
                  <select
                    value={form.result}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        result: e.target.value as "" | "passed" | "failed",
                      })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    <option value="">—</option>
                    <option value="passed">Passed</option>
                    <option value="failed">Failed</option>
                  </select>
                </label>
              </div>
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
              <Button
                type="button"
                size="sm"
                className={cn("flex-1", GREEN_BTN)}
                disabled={saving}
                onClick={saveAssign}
              >
                Assign
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
