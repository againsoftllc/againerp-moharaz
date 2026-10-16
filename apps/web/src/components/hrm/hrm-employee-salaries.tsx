"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  Calendar,
  DollarSign,
  Eye,
  FileText,
  Filter,
  Layers,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
  User,
} from "lucide-react";
import {
  SALARY_STATUS_LABEL,
  SALARY_STATUS_OPTIONS,
  formatSalary,
  salaryAvatar,
  type EmployeeSalary,
  type SalaryStatus,
} from "@/lib/mock-data/hrm-employee-salaries";
import type { SalaryComponent } from "@/lib/mock-data/hrm-salary-components";
import {
  apiEmployeeSalaryToUi,
  createHrmEmployeeSalary,
  deleteHrmEmployeeSalary,
  listHrmEmployeeSalaries,
  updateHrmEmployeeSalary,
  type EmployeeSalaryLookups,
} from "@/lib/api/hrm-employee-salaries";
import { listHrmSalaryComponents } from "@/lib/api/hrm-salary-components";
import { listHrmEmployees, type ApiHrmEmployee } from "@/lib/api/hrm-employees";
import { listHrmDepartments } from "@/lib/api/hrm-departments";
import { listHrmDesignations } from "@/lib/api/hrm-designations";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
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

type SortKey = "employeeName" | "basicSalary" | "createdAt" | "status";
type SortDir = "asc" | "desc";

type EmpOption = {
  id: string;
  name: string;
  code: string;
  department: string;
  designation: string;
};

type ComponentFormState = {
  salaryComponentId: string;
  isEnabled: boolean;
  amountOverride: string;
};

type FormState = {
  employeeId: string;
  basicSalary: string;
  status: SalaryStatus;
  notes: string;
  components: ComponentFormState[];
};

function emptyForm(employees: EmpOption[], components: SalaryComponent[]): FormState {
  return {
    employeeId: employees[0]?.id ?? "",
    basicSalary: "",
    status: "active",
    notes: "",
    components: components.map((c) => ({
      salaryComponentId: c.id,
      isEnabled: false,
      amountOverride: "",
    })),
  };
}

function formFromRow(row: EmployeeSalary, components: SalaryComponent[]): FormState {
  const assignments = row.componentAssignments ?? [];
  return {
    employeeId: row.employeeId,
    basicSalary: String(row.basicSalary),
    status: row.status,
    notes: row.notes,
    components: components.map((c) => {
      const existing = assignments.find((a) => a.salaryComponentId === c.id);
      return {
        salaryComponentId: c.id,
        isEnabled: existing?.isEnabled ?? false,
        amountOverride:
          existing?.amountOverride != null ? String(existing.amountOverride) : "",
      };
    }),
  };
}

function buildLookups(
  employees: ApiHrmEmployee[],
  departments: Map<string, string>,
  designations: Map<string, string>,
): EmployeeSalaryLookups {
  const empById = new Map(employees.map((e) => [e.id, e]));
  return {
    employeeName: (id) => (id ? empById.get(id)?.name ?? "—" : "—"),
    employeeCode: (id) => (id ? empById.get(id)?.employee_code ?? "—" : "—"),
    department: (id) => {
      if (!id) return "—";
      const emp = empById.get(id);
      if (!emp?.department_id) return "—";
      return departments.get(emp.department_id) ?? "—";
    },
    designation: (id) => {
      if (!id) return "—";
      const emp = empById.get(id);
      if (!emp?.designation_id) return "—";
      return designations.get(emp.designation_id) ?? "—";
    },
  };
}

function statusBadgeClass(status: SalaryStatus) {
  return status === "active"
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "border-border bg-muted/40 text-muted-foreground";
}

function DetailField({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="text-muted-foreground/80">{icon}</span>
        {label}
      </div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function EmployeeSalaryDetails({ row }: { row: EmployeeSalary }) {
  return (
    <div className="flex-1 space-y-5 overflow-auto p-4">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <DetailField icon={<User className="size-3.5" />} label="Employee">
          <span className="font-medium">{row.employeeName}</span>
        </DetailField>
        <DetailField icon={<DollarSign className="size-3.5" />} label="Basic Salary">
          <span className="font-medium">{formatSalary(row.basicSalary)}</span>
        </DetailField>
        <DetailField icon={<Lock className="size-3.5" />} label="Status">
          <Badge
            variant="outline"
            className={cn("rounded-none text-[10px]", statusBadgeClass(row.status))}
          >
            {SALARY_STATUS_LABEL[row.status]}
          </Badge>
        </DetailField>
        <DetailField icon={<Calendar className="size-3.5" />} label="Created At">
          {row.createdAt}
        </DetailField>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Layers className="size-3.5" />
          Salary Components
        </div>
        <div className="flex flex-wrap gap-1.5">
          {row.components.length === 0 ? (
            <span className="text-xs text-muted-foreground">No components assigned</span>
          ) : (
            row.components.map((c) => (
              <span
                key={`${c.kind}-${c.name}`}
                className={cn(
                  "border px-2 py-0.5 text-xs",
                  c.kind === "earning"
                    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                    : "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300",
                )}
              >
                {c.name}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="size-3.5" />
          Notes
        </div>
        <p className="text-sm text-foreground">{row.notes || "—"}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 border border-border bg-muted/20 p-3 text-xs">
        <div>
          <div className="text-muted-foreground">Allowances</div>
          <div className="mt-0.5 font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatSalary(row.allowances)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Deductions</div>
          <div className="mt-0.5 font-medium tabular-nums text-red-600 dark:text-red-400">
            {formatSalary(row.deductions)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Net Salary</div>
          <div className="mt-0.5 font-semibold tabular-nums text-foreground">
            {formatSalary(row.netSalary)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Effective Date</div>
          <div className="mt-0.5 font-medium text-foreground">{row.effectiveDate}</div>
        </div>
      </div>
    </div>
  );
}

export function HrmEmployeeSalaries() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<EmployeeSalary[]>([]);
  const [employees, setEmployees] = useState<EmpOption[]>([]);
  const [salaryComponents, setSalaryComponents] = useState<SalaryComponent[]>([]);
  const [lookups, setLookups] = useState<EmployeeSalaryLookups | null>(null);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | SalaryStatus>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | SalaryStatus>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("employeeName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [viewRow, setViewRow] = useState<EmployeeSalary | null>(null);
  const [historyRow, setHistoryRow] = useState<EmployeeSalary | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm([], []));
  const [locked, setLocked] = useState<Set<string>>(new Set());

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [deptRows, desigRows, empRes, components, salaryRows] = await Promise.all([
        listHrmDepartments(),
        listHrmDesignations(),
        listHrmEmployees({ page: 1, per_page: 200 }),
        listHrmSalaryComponents(),
        listHrmEmployeeSalaries(),
      ]);

      const deptMap = new Map(deptRows.map((d) => [String(d.id), String(d.name ?? "")]));
      const desigMap = new Map(desigRows.map((d) => [String(d.id), String(d.name ?? "")]));
      const nextLookups = buildLookups(empRes.rows, deptMap, desigMap);
      const empOptions: EmpOption[] = empRes.rows.map((e) => ({
        id: e.id,
        name: e.name,
        code: e.employee_code,
        department: e.department_id ? deptMap.get(e.department_id) ?? "—" : "—",
        designation: e.designation_id ? desigMap.get(e.designation_id) ?? "—" : "—",
      }));

      setEmployees(empOptions);
      setSalaryComponents(components);
      setLookups(nextLookups);
      setRows(salaryRows.rows.map((r) => apiEmployeeSalaryToUi(r, nextLookups)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load employee salaries");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.employeeName.toLowerCase().includes(q) ||
          r.employeeCode.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q) ||
          r.designation.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, statusFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "employeeName" || key === "status" ? "asc" : "desc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(employees, salaryComponents));
    setFormOpen(true);
  }

  function openEdit(row: EmployeeSalary) {
    if (locked.has(row.id)) {
      toast.error("Salary is locked — unlock before editing");
      return;
    }
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row, salaryComponents));
    setFormOpen(true);
  }

  function toggleLock(row: EmployeeSalary) {
    setLocked((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
    toast.success(locked.has(row.id) ? "Salary unlocked" : "Salary locked");
  }

  function toggleComponent(salaryComponentId: string) {
    setForm((f) => ({
      ...f,
      components: f.components.map((c) =>
        c.salaryComponentId === salaryComponentId ? { ...c, isEnabled: !c.isEnabled } : c,
      ),
    }));
  }

  function setComponentOverride(salaryComponentId: string, value: string) {
    setForm((f) => ({
      ...f,
      components: f.components.map((c) =>
        c.salaryComponentId === salaryComponentId ? { ...c, amountOverride: value } : c,
      ),
    }));
  }

  async function saveForm() {
    if (!form.employeeId) {
      toast.error("Select an employee");
      return;
    }
    const basicSalary = Math.max(0, Number(form.basicSalary) || 0);
    if (basicSalary <= 0) {
      toast.error("Basic salary is required");
      return;
    }
    if (formMode === "add" && rows.some((r) => r.employeeId === form.employeeId)) {
      toast.error("This employee already has a salary record");
      return;
    }

    const input = {
      employeeId: form.employeeId,
      basicSalary,
      isActive: form.status === "active",
      notes: form.notes.trim(),
      components: form.components.map((c) => ({
        salaryComponentId: c.salaryComponentId,
        isEnabled: c.isEnabled,
        amountOverride: c.amountOverride.trim() === "" ? null : Number(c.amountOverride) || 0,
      })),
    };

    if (!lookups) {
      toast.error("Still loading — try again");
      return;
    }

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const row = await updateHrmEmployeeSalary(editId, input);
        const mapped = apiEmployeeSalaryToUi(row, lookups);
        setRows((prev) => prev.map((r) => (r.id === editId ? mapped : r)));
        setViewRow((v) => (v?.id === editId ? mapped : v));
        toast.success("Salary updated");
      } else {
        const row = await createHrmEmployeeSalary(input);
        const mapped = apiEmployeeSalaryToUi(row, lookups);
        setRows((prev) => [mapped, ...prev]);
        toast.success("Salary created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: EmployeeSalary) {
    if (locked.has(row.id)) {
      toast.error("Unlock before deleting");
      return;
    }
    if (!window.confirm(`Delete salary record for “${row.employeeName}”?`)) return;
    try {
      await deleteHrmEmployeeSalary(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      setHistoryRow((v) => (v?.id === row.id ? null : v));
      toast.success("Salary deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
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

  if (loading) {
    return <ContentDataSkeleton label="Loading employee salaries…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Employee Salaries
        </h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Salary
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
                onChange={(e) => setDraftStatus(e.target.value as "all" | SalaryStatus)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {SALARY_STATUS_OPTIONS.map((s) => (
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
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Employee" col="employeeName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Basic Salary" col="basicSalary" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Created At" col="createdAt" />
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No employee salaries found.
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
                        src={salaryAvatar(row.employeeId)}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-none border border-border object-cover"
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{row.employeeName}</div>
                        <div className="text-xs text-muted-foreground">{row.employeeCode}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-medium text-emerald-700 dark:text-emerald-300">
                    {formatSalary(row.basicSalary)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-none text-[10px] font-normal",
                          statusBadgeClass(row.status),
                        )}
                      >
                        {SALARY_STATUS_LABEL[row.status]}
                      </Badge>
                      {locked.has(row.id) ? (
                        <Badge
                          variant="outline"
                          className="rounded-none border-amber-500/30 bg-amber-500/15 text-[10px] font-normal text-amber-800 dark:text-amber-300"
                        >
                          Locked
                        </Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.createdAt}</td>
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
                            className="h-7 w-7 rounded-none text-amber-500 dark:text-amber-300"
                            onClick={() => toggleLock(row)}
                            aria-label={locked.has(row.id) ? "Unlock" : "Lock"}
                          >
                            {locked.has(row.id) ? (
                              <LockOpen className="h-3.5 w-3.5" />
                            ) : (
                              <Lock className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-none text-sky-600 dark:text-sky-400"
                        onClick={() => setHistoryRow(row)}
                        aria-label="Salary history"
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                      </Button>
                      {canWrite ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-none text-red-600 dark:text-red-400"
                          onClick={() => void remove(row)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
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
          className="flex w-[440px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title="Employee salary details"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <DollarSign className="size-4" />
              </div>
              <div>
                <SheetTitle className="text-base">Employee Salary Details</SheetTitle>
                <SheetDescription className="sr-only">View employee salary</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          {viewRow ? <EmployeeSalaryDetails row={viewRow} /> : null}
        </SheetContent>
      </Sheet>

      <Sheet open={!!historyRow} onOpenChange={(o) => !o && setHistoryRow(null)}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[420px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title="Salary history"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">Salary History</SheetTitle>
            <SheetDescription className="text-xs">
              {historyRow ? `${historyRow.employeeName} · ${historyRow.employeeCode}` : ""}
            </SheetDescription>
          </SheetHeader>
          {historyRow ? (
            <div className="flex-1 space-y-2 overflow-auto p-4">
              <div className="rounded-none border border-border px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {formatSalary(historyRow.basicSalary)}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {historyRow.effectiveDate}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">Current</div>
              </div>
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
          title={formMode === "edit" ? "Edit Salary" : "Add Salary"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Salary" : "Add Salary"}
            </SheetTitle>
            <SheetDescription className="sr-only">Employee salary form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Employee *
              <select
                value={form.employeeId}
                disabled={formMode === "edit"}
                onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
                className={fieldClass}
              >
                {employees.length === 0 ? (
                  <option value="">No employees</option>
                ) : (
                  employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.code})
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Basic Salary *
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.basicSalary}
                onChange={(e) => setForm((f) => ({ ...f, basicSalary: e.target.value }))}
                className="h-9 rounded-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Status
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as SalaryStatus }))
                }
                className={fieldClass}
              >
                {SALARY_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Layers className="size-3.5" />
                Salary Components
              </div>
              {salaryComponents.length === 0 ? (
                <p className="text-xs text-muted-foreground">No salary components defined.</p>
              ) : (
                <div className="divide-y divide-border border border-border">
                  {salaryComponents.map((comp) => {
                    const state = form.components.find(
                      (c) => c.salaryComponentId === comp.id,
                    );
                    return (
                      <div key={comp.id} className="flex items-center gap-2 px-2.5 py-2">
                        <input
                          type="checkbox"
                          checked={state?.isEnabled ?? false}
                          onChange={() => toggleComponent(comp.id)}
                          className="h-3.5 w-3.5 rounded-none border-border accent-[#4caf50]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-foreground">{comp.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {comp.componentType === "earning" ? "Earning" : "Deduction"} ·{" "}
                            {comp.calculationType === "percentage"
                              ? `${comp.value}% of basic`
                              : formatSalary(comp.value)}
                          </div>
                        </div>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Override"
                          disabled={!(state?.isEnabled ?? false)}
                          value={state?.amountOverride ?? ""}
                          onChange={(e) => setComponentOverride(comp.id, e.target.value)}
                          className="h-8 w-24 rounded-none text-xs"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Notes
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="min-h-[80px] rounded-none"
                placeholder="Notes about this salary setup"
              />
            </label>
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              onClick={() => void saveForm()}
              disabled={saving || employees.length === 0}
            >
              {saving ? "Saving…" : formMode === "edit" ? "Save Changes" : "Create Salary"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-none"
              onClick={() => setFormOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
