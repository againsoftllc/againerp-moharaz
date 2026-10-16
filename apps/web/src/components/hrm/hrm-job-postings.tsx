"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Eye,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  createJobPostingView,
  deleteJobPostingView,
  listJobPostingsView,
  listRecruitmentBranchOptions,
  listRecruitmentDepartmentOptions,
  listRecruitmentLocationOptions,
  toggleJobPostingPublishView,
  updateJobPostingView,
  type NamedOption,
} from "@/lib/api/hrm-recruitment";
import {
  JOB_STATUS_LABEL,
  JOB_STATUS_OPTIONS,
  JOB_TYPE_LABEL,
  JOB_TYPE_OPTIONS,
  formatSalaryRange,
  type JobPosting,
  type JobPostingStatus,
  type JobTypeKey,
} from "@/lib/mock-data/hrm-job-postings";
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

type SortKey = "code" | "title" | "deadline" | "applications";
type SortDir = "asc" | "desc";

type FormState = {
  title: string;
  jobType: JobTypeKey;
  location: string;
  branch: string;
  department: string;
  priority: JobPosting["priority"];
  requiredSkills: string;
  startDate: string;
  deadline: string;
  minExperience: string;
  maxExperience: string;
  minSalary: string;
  maxSalary: string;
  numberOfPositions: string;
  description: string;
  requirements: string;
  benefits: string;
  isFeatured: boolean;
  status: JobPostingStatus;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function emptyForm(
  locations: NamedOption[] = [],
  branches: NamedOption[] = [],
  departments: NamedOption[] = [],
): FormState {
  return {
    title: "",
    jobType: "full_time",
    location: locations[0]?.name ?? "",
    branch: branches[0]?.name ?? "",
    department: departments[0]?.name ?? "",
    priority: "normal",
    requiredSkills: "",
    startDate: todayYmd(),
    deadline: todayYmd(),
    minExperience: "1",
    maxExperience: "3",
    minSalary: "30000",
    maxSalary: "50000",
    numberOfPositions: "1",
    description: "",
    requirements: "",
    benefits: "",
    isFeatured: false,
    status: "draft",
  };
}

function formFromRow(row: JobPosting): FormState {
  return {
    title: row.title,
    jobType: row.jobType,
    location: row.location,
    branch: row.branch,
    department: row.department,
    priority: row.priority,
    requiredSkills: row.requiredSkills,
    startDate: row.startDate,
    deadline: row.deadline,
    minExperience: String(row.minExperience),
    maxExperience: String(row.maxExperience),
    minSalary: String(row.minSalary),
    maxSalary: String(row.maxSalary),
    numberOfPositions: String(row.numberOfPositions),
    description: row.description,
    requirements: row.requirements,
    benefits: row.benefits,
    isFeatured: row.isFeatured,
    status: row.status,
  };
}

function publishedBadgeClass(yes: boolean) {
  return yes
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
}

function statusBadgeClass(status: JobPostingStatus) {
  switch (status) {
    case "published":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "closed":
      return "border-border bg-muted/50 text-muted-foreground";
    case "on_hold":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    default:
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
}

export function HrmJobPostings() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<JobPosting[]>([]);
  const [locationOptions, setLocationOptions] = useState<NamedOption[]>([]);
  const [branchOptions, setBranchOptions] = useState<NamedOption[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<NamedOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | JobPostingStatus>("all");
  const [draftType, setDraftType] = useState<"all" | JobTypeKey>("all");
  const [draftPublished, setDraftPublished] = useState<"all" | "yes" | "no">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | JobPostingStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | JobTypeKey>("all");
  const [publishedFilter, setPublishedFilter] = useState<"all" | "yes" | "no">("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<JobPosting | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [data, locations, branches, departments] = await Promise.all([
          listJobPostingsView(),
          listRecruitmentLocationOptions(),
          listRecruitmentBranchOptions(),
          listRecruitmentDepartmentOptions(),
        ]);
        if (cancelled) return;
        setRows(data);
        setLocationOptions(locations);
        setBranchOptions(branches);
        setDepartmentOptions(departments);
        setForm(emptyForm(locations, branches, departments));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load job postings");
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
    if (typeFilter !== "all") list = list.filter((r) => r.jobType === typeFilter);
    if (publishedFilter === "yes") list = list.filter((r) => r.isPublished);
    if (publishedFilter === "no") list = list.filter((r) => !r.isPublished);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.location.toLowerCase().includes(q) ||
          JOB_TYPE_LABEL[r.jobType].toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, statusFilter, typeFilter, publishedFilter, search, sortKey, sortDir]);

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
    setForm(emptyForm(locationOptions, branchOptions, departmentOptions));
    setFormOpen(true);
  }

  function openEdit(row: JobPosting) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setViewRow(null);
    setFormOpen(true);
  }

  async function saveForm() {
    if (!form.title.trim()) {
      toast.error("Job title is required");
      return;
    }
    const payload: Omit<JobPosting, "id" | "applications"> = {
      code: "",
      title: form.title.trim(),
      jobType: form.jobType,
      location: form.location,
      branch: form.branch,
      department: form.department,
      priority: form.priority,
      requiredSkills: form.requiredSkills.trim(),
      startDate: form.startDate,
      deadline: form.deadline,
      minExperience: Number(form.minExperience) || 0,
      maxExperience: Number(form.maxExperience) || 0,
      minSalary: Number(form.minSalary) || 0,
      maxSalary: Number(form.maxSalary) || 0,
      numberOfPositions: Number(form.numberOfPositions) || 1,
      description: form.description.trim(),
      requirements: form.requirements.trim(),
      benefits: form.benefits.trim(),
      isFeatured: form.isFeatured,
      status: form.status,
      isPublished: form.status === "published",
      publishDate: form.status === "published" ? todayYmd() : "",
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateJobPostingView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        toast.success("Job posting updated");
      } else {
        const created = await createJobPostingView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Job posting created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(row: JobPosting) {
    setSaving(true);
    try {
      const updated = await toggleJobPostingPublishView(row);
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      toast.success(updated.isPublished ? `Published — ${row.title}` : `Unpublished — ${row.title}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish toggle failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: JobPosting) {
    setSaving(true);
    try {
      await deleteJobPostingView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Job posting deleted");
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Job Postings</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Job Posting
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
                onChange={(e) => setDraftStatus(e.target.value as "all" | JobPostingStatus)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {JOB_STATUS_OPTIONS.map((s) => (
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
                onChange={(e) => setDraftType(e.target.value as "all" | JobTypeKey)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {JOB_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[120px] flex-col gap-1 text-xs text-muted-foreground">
              Published
              <select
                value={draftPublished}
                onChange={(e) => setDraftPublished(e.target.value as "all" | "yes" | "no")}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
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
                  setPublishedFilter(draftPublished);
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
                  setDraftPublished("all");
                  setStatusFilter("all");
                  setTypeFilter("all");
                  setPublishedFilter("all");
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
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Code" col="code" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Title" col="title" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Type
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Location
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Salary Range
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Applications" col="applications" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Published
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Deadline" col="deadline" />
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
                  Loading job postings...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No job postings found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs tabular-nums">{row.code}</td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{row.title}</td>
                  <td className="px-3 py-2.5">{JOB_TYPE_LABEL[row.jobType]}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.location}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {formatSalaryRange(row.minSalary, row.maxSalary)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.applications}</td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        publishedBadgeClass(row.isPublished),
                      )}
                    >
                      {row.isPublished ? "Yes" : "No"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {JOB_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{row.deadline}</td>
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
                            className="h-7 w-7 rounded-none"
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
                            onClick={() => togglePublish(row)}
                            aria-label={row.isPublished ? "Unpublish" : "Publish"}
                            title={row.isPublished ? "Unpublish" : "Publish"}
                          >
                            {row.isPublished ? (
                              <Download className="h-3.5 w-3.5" />
                            ) : (
                              <Upload className="h-3.5 w-3.5" />
                            )}
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

      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          title={viewRow ? `Job — ${viewRow.title}` : "Job"}
          resizable
          resizeMaxWidth={900}
          closeButton="chevron"
          className="w-[min(100%,32rem)] min-w-[300px] max-w-[900px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-border px-4 py-3 pr-10">
                <p className="font-mono text-xs text-muted-foreground">{viewRow.code}</p>
                <p className="text-base font-semibold">{viewRow.title}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-none text-[10px] font-normal",
                      statusBadgeClass(viewRow.status),
                    )}
                  >
                    {JOB_STATUS_LABEL[viewRow.status]}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-none text-[10px] font-normal",
                      publishedBadgeClass(viewRow.isPublished),
                    )}
                  >
                    Published: {viewRow.isPublished ? "Yes" : "No"}
                  </Badge>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Type", JOB_TYPE_LABEL[viewRow.jobType]],
                      ["Location", viewRow.location],
                      ["Branch", viewRow.branch],
                      ["Department", viewRow.department],
                      ["Priority", viewRow.priority],
                      ["Salary", formatSalaryRange(viewRow.minSalary, viewRow.maxSalary)],
                      ["Experience", `${viewRow.minExperience}–${viewRow.maxExperience} yrs`],
                      ["Positions", String(viewRow.numberOfPositions)],
                      ["Applications", String(viewRow.applications)],
                      ["Start Date", viewRow.startDate],
                      ["Deadline", viewRow.deadline],
                      ["Publish Date", viewRow.publishDate || "—"],
                      ["Featured", viewRow.isFeatured ? "Yes" : "No"],
                      ["Required Skills", viewRow.requiredSkills || "—"],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                      <dd className="max-w-[60%] text-right text-sm capitalize">{value}</dd>
                    </div>
                  ))}
                </dl>
                {(
                  [
                    ["Description", viewRow.description],
                    ["Requirements", viewRow.requirements],
                    ["Benefits", viewRow.benefits],
                  ] as const
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-none border border-border bg-muted/20 px-3 py-2 text-sm"
                  >
                    <p className="mb-1 text-xs text-muted-foreground">{label}</p>
                    <p>{value || "—"}</p>
                  </div>
                ))}
              </div>
              {canWrite ? (
                <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-4 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none"
                    onClick={() => openEdit(viewRow)}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className={cn("rounded-none", GREEN_BTN)}
                    onClick={() => togglePublish(viewRow)}
                  >
                    {viewRow.isPublished ? (
                      <>
                        <Download className="size-3.5" />
                        Unpublish
                      </>
                    ) : (
                      <>
                        <Upload className="size-3.5" />
                        Publish
                      </>
                    )}
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
          title={formMode === "add" ? "Add Job Posting" : "Edit Job Posting"}
          resizable
          resizeMaxWidth={900}
          closeButton="chevron"
          className="w-[min(100%,32rem)] min-w-[300px] max-w-[900px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Add Job Posting" : "Edit Job Posting"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — title, type, location, salary, deadline, description.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Job Title *
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="h-9 rounded-none"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Job Type *
                  <select
                    value={form.jobType}
                    onChange={(e) => setForm({ ...form, jobType: e.target.value as JobTypeKey })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {JOB_TYPE_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Priority
                  <select
                    value={form.priority}
                    onChange={(e) =>
                      setForm({ ...form, priority: e.target.value as JobPosting["priority"] })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {(["low", "normal", "high", "urgent"] as const).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Location *
                  <select
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {locationOptions.map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Branch *
                  <select
                    value={form.branch}
                    onChange={(e) => setForm({ ...form, branch: e.target.value })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {branchOptions.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Department *
                  <select
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {departmentOptions.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as JobPostingStatus })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {JOB_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
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
                  Application Deadline *
                  <Input
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Min Experience
                  <Input
                    type="number"
                    min={0}
                    value={form.minExperience}
                    onChange={(e) => setForm({ ...form, minExperience: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Max Experience
                  <Input
                    type="number"
                    min={0}
                    value={form.maxExperience}
                    onChange={(e) => setForm({ ...form, maxExperience: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Min Salary
                  <Input
                    type="number"
                    min={0}
                    value={form.minSalary}
                    onChange={(e) => setForm({ ...form, minSalary: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Max Salary
                  <Input
                    type="number"
                    min={0}
                    value={form.maxSalary}
                    onChange={(e) => setForm({ ...form, maxSalary: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Required Skills
                <Input
                  value={form.requiredSkills}
                  onChange={(e) => setForm({ ...form, requiredSkills: e.target.value })}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isFeatured}
                  onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })}
                  className="rounded-none"
                />
                Featured job
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Description
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="min-h-[72px] rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Requirements
                <Textarea
                  value={form.requirements}
                  onChange={(e) => setForm({ ...form, requirements: e.target.value })}
                  className="min-h-[72px] rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Benefits
                <Textarea
                  value={form.benefits}
                  onChange={(e) => setForm({ ...form, benefits: e.target.value })}
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
