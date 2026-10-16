"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Filter, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import {
  deptKey,
  type TrainingType,
  type TrainingTypeDepartment,
} from "@/lib/mock-data/hrm-training-types";
import {
  branchIdFromDepartmentKeys,
  createTrainingTypeView,
  deleteTrainingTypeView,
  listTrainingDepartmentOptions,
  listTrainingTypesView,
  updateTrainingTypeView,
  type TrainingDepartmentOption,
} from "@/lib/api/hrm-training";
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

type SortKey = "name" | "programs";
type SortDir = "asc" | "desc";

type FormState = {
  name: string;
  description: string;
  departmentKeys: string[];
};

function emptyForm(deptOptions: TrainingDepartmentOption[] = []): FormState {
  const first = deptOptions[0];
  return {
    name: "",
    description: "",
    departmentKeys: first ? [deptKey(first)] : [],
  };
}

function formFromRow(row: TrainingType): FormState {
  return {
    name: row.name,
    description: row.description,
    departmentKeys: row.departments.map(deptKey),
  };
}

function DeptBadges({ departments }: { departments: TrainingTypeDepartment[] }) {
  if (departments.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {departments.map((d) => (
        <div
          key={deptKey(d)}
          className="rounded-none border border-border bg-background px-2 py-1"
        >
          <div className="text-xs font-medium text-foreground">{d.name}</div>
          <div className="text-[10px] text-muted-foreground">{d.branch}</div>
        </div>
      ))}
    </div>
  );
}

export function HrmTrainingTypes() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<TrainingType[]>([]);
  const [deptOptions, setDeptOptions] = useState<TrainingDepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftBranch, setDraftBranch] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [viewRow, setViewRow] = useState<TrainingType | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [assignRow, setAssignRow] = useState<TrainingType | null>(null);
  const [assignKeys, setAssignKeys] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [departments, data] = await Promise.all([
          listTrainingDepartmentOptions(),
          listTrainingTypesView(),
        ]);
        if (cancelled) return;
        setDeptOptions(departments);
        setRows(data);
        setForm(emptyForm(departments));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load training types");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const branchOptions = useMemo(() => {
    const set = new Set(deptOptions.map((d) => d.branch));
    return [...set].sort();
  }, [deptOptions]);

  const filtered = useMemo(() => {
    let list = rows;
    if (branchFilter !== "all") {
      list = list.filter((r) => r.departments.some((d) => d.branch === branchFilter));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.departments.some(
            (d) =>
              d.name.toLowerCase().includes(q) || d.branch.toLowerCase().includes(q),
          ),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "programs") return (a.programs - b.programs) * dir;
      return a.name.localeCompare(b.name) * dir;
    });
  }, [rows, branchFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(deptOptions));
    setFormOpen(true);
  }

  function openEdit(row: TrainingType) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  function openAssign(row: TrainingType) {
    setAssignRow(row);
    setAssignKeys(row.departments.map(deptKey));
  }

  function toggleFormDept(key: string) {
    setForm((f) => {
      const has = f.departmentKeys.includes(key);
      return {
        ...f,
        departmentKeys: has
          ? f.departmentKeys.filter((k) => k !== key)
          : [...f.departmentKeys, key],
      };
    });
  }

  function toggleAssignDept(key: string) {
    setAssignKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  async function saveForm() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (form.departmentKeys.length === 0) {
      toast.error("Select at least one department");
      return;
    }

    const branchId = branchIdFromDepartmentKeys(form.departmentKeys, deptOptions);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      departments: form.departmentKeys.map((key) => {
        const hit = deptOptions.find((d) => deptKey(d) === key);
        return hit ? { name: hit.name, branch: hit.branch } : { name: "", branch: "" };
      }),
      branchId,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateTrainingTypeView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success("Training type updated");
      } else {
        const created = await createTrainingTypeView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Training type created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveAssign() {
    if (!assignRow) return;
    if (assignKeys.length === 0) {
      toast.error("Select at least one department");
      return;
    }
    const branchId = branchIdFromDepartmentKeys(assignKeys, deptOptions);
    const departments = assignKeys.map((key) => {
      const hit = deptOptions.find((d) => deptKey(d) === key);
      return hit ? { name: hit.name, branch: hit.branch } : { name: "", branch: "" };
    });

    setSaving(true);
    try {
      const updated = await updateTrainingTypeView(assignRow.id, {
        name: assignRow.name,
        description: assignRow.description,
        departments,
        branchId,
      });
      setRows((prev) => prev.map((r) => (r.id === assignRow.id ? updated : r)));
      setViewRow((v) => (v?.id === assignRow.id ? updated : v));
      setAssignRow(null);
      toast.success("Departments updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: TrainingType) {
    setSaving(true);
    try {
      await deleteTrainingTypeView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      setAssignRow((v) => (v?.id === row.id ? null : v));
      toast.success("Training type deleted");
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

  const deptChecklist = (keys: string[], onToggle: (key: string) => void) => (
    <div className="grid max-h-56 gap-1.5 overflow-auto rounded-none border border-border p-2">
      {deptOptions.map((d) => {
        const key = deptKey(d);
        return (
          <label key={key} className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-0.5 rounded-none"
              checked={keys.includes(key)}
              onChange={() => onToggle(key)}
            />
            <span>
              <span className="font-medium">{d.name}</span>
              <span className="block text-xs text-muted-foreground">{d.branch}</span>
            </span>
          </label>
        );
      })}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Training Types
        </h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Training Type
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
              Branch
              <select
                value={draftBranch}
                onChange={(e) => setDraftBranch(e.target.value)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {branchOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
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
                  setBranchFilter(draftBranch);
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
                  setDraftBranch("all");
                  setBranchFilter("all");
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
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Departments
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Programs" col="programs" />
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading training types...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No training types found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{row.name}</td>
                  <td className="px-3 py-2.5">
                    <DeptBadges departments={row.departments} />
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.programs}</td>
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
                            className="h-7 w-7 rounded-none text-emerald-600 dark:text-emerald-400"
                            onClick={() => openAssign(row)}
                            aria-label="Assign departments"
                          >
                            <Users className="h-3.5 w-3.5" />
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
          title="Training type details"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">Training Type Details</SheetTitle>
            <SheetDescription className="sr-only">View training type</SheetDescription>
          </SheetHeader>
          {viewRow ? (
            <div className="flex-1 space-y-4 overflow-auto p-4">
              <div>
                <div className="text-base font-semibold text-foreground">{viewRow.name}</div>
                {viewRow.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{viewRow.description}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Departments</div>
                <DeptBadges departments={viewRow.departments} />
              </div>
              <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-border/60 pb-2 text-sm">
                <dt className="text-muted-foreground">Programs</dt>
                <dd className="text-foreground">{viewRow.programs}</dd>
              </div>
              {canWrite ? (
                <div className="flex flex-wrap gap-2 pt-2">
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
                    className="h-9 rounded-none"
                    onClick={() => {
                      openAssign(viewRow);
                      setViewRow(null);
                    }}
                  >
                    <Users className="size-3.5" />
                    Departments
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
          title={formMode === "edit" ? "Edit Training Type" : "Add Training Type"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Training Type" : "Add Training Type"}
            </SheetTitle>
            <SheetDescription className="sr-only">Training type form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Name *
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="e.g. Professional Certification"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Description
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="min-h-[80px] rounded-none"
              />
            </label>
            <fieldset className="space-y-2">
              <legend className="text-xs text-muted-foreground">Departments *</legend>
              {deptChecklist(form.departmentKeys, toggleFormDept)}
            </fieldset>
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              disabled={saving}
              onClick={saveForm}
            >
              {formMode === "edit" ? "Save Changes" : "Create Type"}
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

      <Sheet open={!!assignRow} onOpenChange={(o) => !o && setAssignRow(null)}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[420px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title="Assign departments"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">Assign Departments</SheetTitle>
            <SheetDescription className="text-xs">
              {assignRow ? assignRow.name : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            {deptChecklist(assignKeys, toggleAssignDept)}
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              disabled={saving}
              onClick={saveAssign}
            >
              Save Departments
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-none"
              onClick={() => setAssignRow(null)}
            >
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
