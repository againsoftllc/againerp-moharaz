"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Filter, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  approveJobRequisitionView,
  closeJobRequisitionView,
  createJobRequisitionView,
  deleteJobRequisitionView,
  holdJobRequisitionView,
  listJobRequisitionCategoryOptions,
  listJobRequisitionDepartmentOptions,
  listJobRequisitionsView,
  submitJobRequisitionView,
  updateJobRequisitionView,
} from "@/lib/api/hrm-job-requisitions";
import {
  REQUISITION_PRIORITY_LABEL,
  REQUISITION_PRIORITY_OPTIONS,
  REQUISITION_STATUS_LABEL,
  REQUISITION_STATUS_OPTIONS,
  formatBudgetRange,
  type JobRequisition,
  type JobRequisitionPriority,
  type JobRequisitionStatus,
} from "@/lib/mock-data/hrm-job-requisitions";
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

type SortKey = "code" | "title" | "department" | "positionsCount" | "status";
type SortDir = "asc" | "desc";

type NamedOption = { id: string; name: string };

type FormState = {
  title: string;
  category: string;
  department: string;
  positionsCount: string;
  budgetMin: string;
  budgetMax: string;
  skillsRequired: string;
  educationRequired: string;
  experienceRequired: string;
  description: string;
  responsibilities: string;
  priority: JobRequisitionPriority;
  status: JobRequisitionStatus;
};

function emptyForm(
  categories: NamedOption[] = [],
  departments: NamedOption[] = [],
): FormState {
  return {
    title: "",
    category: categories[0]?.name ?? "",
    department: departments[0]?.name ?? "",
    positionsCount: "1",
    budgetMin: "",
    budgetMax: "",
    skillsRequired: "",
    educationRequired: "",
    experienceRequired: "",
    description: "",
    responsibilities: "",
    priority: "medium",
    status: "draft",
  };
}

function formFromRow(row: JobRequisition): FormState {
  return {
    title: row.title,
    category: row.category,
    department: row.department,
    positionsCount: String(row.positionsCount),
    budgetMin: row.budgetMin > 0 ? String(row.budgetMin) : "",
    budgetMax: row.budgetMax > 0 ? String(row.budgetMax) : "",
    skillsRequired: row.skillsRequired,
    educationRequired: row.educationRequired,
    experienceRequired: row.experienceRequired,
    description: row.description,
    responsibilities: row.responsibilities,
    priority: row.priority,
    status: row.status,
  };
}

function statusBadgeClass(status: JobRequisitionStatus) {
  switch (status) {
    case "approved":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "pending_approval":
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "on_hold":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case "closed":
      return "border-border bg-muted/50 text-muted-foreground";
    default:
      return "border-border bg-card text-foreground";
  }
}

export function HrmJobRequisitions() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<JobRequisition[]>([]);
  const [categories, setCategories] = useState<NamedOption[]>([]);
  const [departments, setDepartments] = useState<NamedOption[]>([]);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | JobRequisitionStatus>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | JobRequisitionStatus>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<JobRequisition | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [data, categoryOpts, departmentOpts] = await Promise.all([
        listJobRequisitionsView(),
        listJobRequisitionCategoryOptions(),
        listJobRequisitionDepartmentOptions(),
      ]);
      setRows(data);
      setCategories(categoryOpts);
      setDepartments(departmentOpts);
      setForm(emptyForm(categoryOpts, departmentOpts));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load job requisitions");
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
          r.code.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          REQUISITION_STATUS_LABEL[r.status].toLowerCase().includes(q),
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
      setSortDir(key === "title" ? "asc" : "desc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(categories, departments));
    setFormOpen(true);
  }

  function openEdit(row: JobRequisition) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setViewRow(null);
    setFormOpen(true);
  }

  async function saveForm() {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    const payload = {
      title: form.title.trim(),
      category: form.category,
      department: form.department,
      positionsCount: Number(form.positionsCount) || 1,
      budgetMin: Number(form.budgetMin) || 0,
      budgetMax: Number(form.budgetMax) || 0,
      skillsRequired: form.skillsRequired.trim(),
      educationRequired: form.educationRequired.trim(),
      experienceRequired: form.experienceRequired.trim(),
      description: form.description.trim(),
      responsibilities: form.responsibilities.trim(),
      priority: form.priority,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateJobRequisitionView(editId, {
          ...payload,
          status: form.status,
        });
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success("Requisition updated");
      } else {
        const created = await createJobRequisitionView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Requisition created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function runWorkflow(
    row: JobRequisition,
    action: "submit" | "approve" | "hold" | "close",
  ) {
    setSaving(true);
    try {
      let updated: JobRequisition;
      if (action === "submit") updated = await submitJobRequisitionView(row.id);
      else if (action === "approve") updated = await approveJobRequisitionView(row.id);
      else if (action === "hold") updated = await holdJobRequisitionView(row.id);
      else updated = await closeJobRequisitionView(row.id);
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      setViewRow((v) => (v?.id === row.id ? updated : v));
      toast.success(`Requisition ${REQUISITION_STATUS_LABEL[updated.status].toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: JobRequisition) {
    if (!window.confirm(`Delete requisition “${row.title}”?`)) return;
    setSaving(true);
    try {
      await deleteJobRequisitionView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Requisition deleted");
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

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-4" data-page="hrm-job-requisitions">
        <ContentDataSkeleton rows={10} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4" data-page="hrm-job-requisitions">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="page-subtitle">AgainERP › HRM › Recruitment</p>
          <h1 className="page-title">Job Requisitions</h1>
        </div>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Requisition
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
            placeholder="Search requisitions…"
            className="h-9 rounded-none pl-8"
          />
        </div>
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
        <div className="flex flex-wrap items-end gap-3 rounded-none border border-border bg-card p-3">
          <label className="flex flex-col gap-1 text-xs">
            Status
            <select
              value={draftStatus}
              onChange={(e) => setDraftStatus(e.target.value as typeof draftStatus)}
              className="h-9 min-w-[160px] rounded-none border border-border bg-background px-2 text-sm"
            >
              <option value="all">All</option>
              {REQUISITION_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            size="sm"
            className={GREEN_BTN}
            onClick={() => {
              setStatusFilter(draftStatus);
              setPage(1);
            }}
          >
            Apply
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-none border border-border bg-card">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Code" col="code" />
              </th>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Title" col="title" />
              </th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Department" col="department" />
              </th>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Positions" col="positionsCount" />
              </th>
              <th className="px-3 py-2 text-left">Budget</th>
              <th className="px-3 py-2 text-left">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  No requisitions found.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr key={row.id} className="border-b border-border hover:bg-muted/30">
                  <td className="px-3 py-2 tabular-nums text-xs text-muted-foreground">{row.code}</td>
                  <td className="px-3 py-2 font-medium">{row.title}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.category}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.department}</td>
                  <td className="px-3 py-2 tabular-nums">{row.positionsCount}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatBudgetRange(row.budgetMin, row.budgetMax)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={cn("rounded-none text-[10px]", statusBadgeClass(row.status))}>
                      {REQUISITION_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-none"
                        onClick={() => setViewRow(row)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {canWrite ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none"
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-destructive"
                            onClick={() => void remove(row)}
                            disabled={saving}
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
          Showing {(pageSafe - 1) * perPage + 1}–{Math.min(pageSafe * perPage, filtered.length)} of{" "}
          {filtered.length}
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-none"
            disabled={pageSafe <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-none"
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
          title="Requisition details"
          className="w-[480px] min-w-[160px] max-w-[720px] rounded-none p-0"
        >
          {viewRow ? (
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-border px-4 py-3 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={cn("rounded-none text-[10px]", statusBadgeClass(viewRow.status))}>
                    {REQUISITION_STATUS_LABEL[viewRow.status]}
                  </Badge>
                  <Badge variant="outline" className="rounded-none text-[10px] font-normal">
                    {REQUISITION_PRIORITY_LABEL[viewRow.priority]} priority
                  </Badge>
                </div>
                <SheetTitle className="text-base">{viewRow.title}</SheetTitle>
                <SheetDescription>{viewRow.code}</SheetDescription>
              </SheetHeader>
              <div className="flex-1 space-y-2 overflow-auto p-4 text-sm">
                {[
                  ["Category", viewRow.category],
                  ["Department", viewRow.department],
                  ["Positions", String(viewRow.positionsCount)],
                  ["Budget", formatBudgetRange(viewRow.budgetMin, viewRow.budgetMax)],
                  ["Skills", viewRow.skillsRequired || "—"],
                  ["Education", viewRow.educationRequired || "—"],
                  ["Experience", viewRow.experienceRequired || "—"],
                  ["Created", viewRow.createdAt || "—"],
                  ["Approved", viewRow.approvalDate || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[110px_1fr] gap-2 border-b border-border py-2">
                    <span className="text-muted-foreground">{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
                {viewRow.description ? (
                  <div>
                    <p className="mb-1 text-muted-foreground">Description</p>
                    <p className="whitespace-pre-wrap">{viewRow.description}</p>
                  </div>
                ) : null}
                {viewRow.responsibilities ? (
                  <div>
                    <p className="mb-1 text-muted-foreground">Responsibilities</p>
                    <p className="whitespace-pre-wrap">{viewRow.responsibilities}</p>
                  </div>
                ) : null}
              </div>
              {canWrite ? (
                <div className="flex flex-wrap gap-2 border-t border-border p-4">
                  {viewRow.status === "draft" ? (
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-none"
                      disabled={saving}
                      onClick={() => void runWorkflow(viewRow, "submit")}
                    >
                      Submit
                    </Button>
                  ) : null}
                  {viewRow.status === "pending_approval" ? (
                    <Button
                      type="button"
                      size="sm"
                      className={GREEN_BTN}
                      disabled={saving}
                      onClick={() => void runWorkflow(viewRow, "approve")}
                    >
                      Approve
                    </Button>
                  ) : null}
                  {viewRow.status === "approved" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-none"
                      disabled={saving}
                      onClick={() => void runWorkflow(viewRow, "hold")}
                    >
                      Hold
                    </Button>
                  ) : null}
                  {viewRow.status !== "closed" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-none"
                      disabled={saving}
                      onClick={() => void runWorkflow(viewRow, "close")}
                    >
                      Close
                    </Button>
                  ) : null}
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
          title={formMode === "add" ? "Add requisition" : "Edit requisition"}
          className="w-[480px] min-w-[160px] max-w-[720px] rounded-none p-0"
        >
          <div className="flex h-full flex-col">
            <SheetHeader className="border-b border-border px-4 py-3 text-left">
              <SheetTitle>{formMode === "add" ? "Add Requisition" : "Edit Requisition"}</SheetTitle>
              <SheetDescription>Hiring request before job posting</SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-3 overflow-auto p-4">
              <label className="block space-y-1 text-sm">
                Title *
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="rounded-none"
                />
              </label>
              <label className="block space-y-1 text-sm">
                Category
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="h-9 w-full rounded-none border border-border bg-background px-2"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                Department
                <select
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                  className="h-9 w-full rounded-none border border-border bg-background px-2"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1 text-sm">
                  Positions
                  <Input
                    type="number"
                    min={1}
                    value={form.positionsCount}
                    onChange={(e) => setForm((f) => ({ ...f, positionsCount: e.target.value }))}
                    className="rounded-none"
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  Priority
                  <select
                    value={form.priority}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, priority: e.target.value as JobRequisitionPriority }))
                    }
                    className="h-9 w-full rounded-none border border-border bg-background px-2"
                  >
                    {REQUISITION_PRIORITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1 text-sm">
                  Budget min
                  <Input
                    type="number"
                    min={0}
                    value={form.budgetMin}
                    onChange={(e) => setForm((f) => ({ ...f, budgetMin: e.target.value }))}
                    className="rounded-none"
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  Budget max
                  <Input
                    type="number"
                    min={0}
                    value={form.budgetMax}
                    onChange={(e) => setForm((f) => ({ ...f, budgetMax: e.target.value }))}
                    className="rounded-none"
                  />
                </label>
              </div>
              <label className="block space-y-1 text-sm">
                Skills required
                <Input
                  value={form.skillsRequired}
                  onChange={(e) => setForm((f) => ({ ...f, skillsRequired: e.target.value }))}
                  className="rounded-none"
                />
              </label>
              <label className="block space-y-1 text-sm">
                Education required
                <Input
                  value={form.educationRequired}
                  onChange={(e) => setForm((f) => ({ ...f, educationRequired: e.target.value }))}
                  className="rounded-none"
                />
              </label>
              <label className="block space-y-1 text-sm">
                Experience required
                <Input
                  value={form.experienceRequired}
                  onChange={(e) => setForm((f) => ({ ...f, experienceRequired: e.target.value }))}
                  className="rounded-none"
                />
              </label>
              <label className="block space-y-1 text-sm">
                Description
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="min-h-[80px] rounded-none"
                />
              </label>
              <label className="block space-y-1 text-sm">
                Responsibilities
                <Textarea
                  value={form.responsibilities}
                  onChange={(e) => setForm((f) => ({ ...f, responsibilities: e.target.value }))}
                  className="min-h-[80px] rounded-none"
                />
              </label>
              {formMode === "edit" ? (
                <label className="block space-y-1 text-sm">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value as JobRequisitionStatus }))
                    }
                    className="h-9 w-full rounded-none border border-border bg-background px-2"
                  >
                    {REQUISITION_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-border p-4">
              <Button type="button" variant="outline" className="rounded-none" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="button" className={GREEN_BTN} disabled={saving} onClick={() => void saveForm()}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
