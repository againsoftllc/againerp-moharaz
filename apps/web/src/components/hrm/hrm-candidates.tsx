"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Briefcase,
  Building2,
  Clock,
  Eye,
  FileText,
  Filter,
  LayoutGrid,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import {
  createCandidateView,
  deleteCandidateView,
  listCandidatesView,
  listJobPostingOptions,
  listRecruitmentSourceOptions,
  patchCandidateStatusView,
  updateCandidateView,
  type JobPostingOption,
} from "@/lib/api/hrm-recruitment";
import {
  CANDIDATE_GENDER_LABEL,
  CANDIDATE_STATUS_LABEL,
  CANDIDATE_STATUS_OPTIONS,
  formatAppliedOn,
  formatDisplayDate,
  formatSalary,
  type Candidate,
  type CandidateStatus,
} from "@/lib/mock-data/hrm-candidates";
import { employeeAvatarUrl } from "@/lib/mock-data/employees";
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

type SortKey = "name" | "appliedOn" | "expectedSalary" | "totalExperience";
type SortDir = "asc" | "desc";

type FormState = {
  name: string;
  email: string;
  phone: string;
  jobId: string;
  source: string;
  totalExperience: string;
  expectedSalary: string;
  currentCompany: string;
  currentPosition: string;
  resume: string;
  coverLetter: string;
  status: CandidateStatus;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function emptyForm(
  jobOptions: JobPostingOption[] = [],
  sourceOptions: string[] = [],
): FormState {
  return {
    name: "",
    email: "",
    phone: "",
    jobId: jobOptions[0]?.id ?? "",
    source: sourceOptions[0] ?? "",
    totalExperience: "2",
    expectedSalary: "50000",
    currentCompany: "",
    currentPosition: "",
    resume: "",
    coverLetter: "",
    status: "new",
  };
}

function statusBadgeClass(status: CandidateStatus) {
  switch (status) {
    case "offer":
      return "border-orange-500/30 bg-orange-500/15 text-orange-800 dark:text-orange-300";
    case "interview":
      return "border-violet-500/30 bg-violet-500/15 text-violet-800 dark:text-violet-300";
    case "screening":
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "hired":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "rejected":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    default:
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
  }
}

export function HrmCandidates() {
  const canWrite = useAdminCanWrite();
  const searchParams = useSearchParams();
  const jobFromQuery = searchParams.get("job")?.trim() || "";
  const appliedJobQuery = useRef(false);

  const [rows, setRows] = useState<Candidate[]>([]);
  const [jobOptions, setJobOptions] = useState<JobPostingOption[]>([]);
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | CandidateStatus>("all");
  const [draftSource, setDraftSource] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | CandidateStatus>("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("appliedOn");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<Candidate | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Candidate | null>(null);
  const [nextStatus, setNextStatus] = useState<CandidateStatus>("new");

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [data, jobs, sources] = await Promise.all([
          listCandidatesView(),
          listJobPostingOptions(),
          listRecruitmentSourceOptions(),
        ]);
        if (cancelled) return;
        setRows(data);
        setJobOptions(jobs);
        setSourceOptions(sources);
        const base = emptyForm(jobs, sources);
        if (jobFromQuery && jobs.some((j) => j.id === jobFromQuery)) {
          setForm({ ...base, jobId: jobFromQuery });
        } else {
          setForm(base);
        }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load candidates");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobFromQuery]);

  useEffect(() => {
    if (appliedJobQuery.current || loading || !canWrite || !jobFromQuery) return;
    if (!jobOptions.some((j) => j.id === jobFromQuery)) return;
    appliedJobQuery.current = true;
    setFormMode("add");
    setEditId(null);
    setForm((prev) => ({ ...prev, jobId: jobFromQuery }));
    setFormOpen(true);
    toast.message("Applying for selected job — complete the candidate form");
  }, [loading, canWrite, jobFromQuery, jobOptions]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (sourceFilter !== "all") list = list.filter((r) => r.source === sourceFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.jobTitle.toLowerCase().includes(q) ||
          r.jobCode.toLowerCase().includes(q) ||
          r.source.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, statusFilter, sourceFilter, search, sortKey, sortDir]);

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
    setForm(emptyForm(jobOptions, sourceOptions));
    setFormOpen(true);
  }

  function openChangeStatus(row: Candidate) {
    setStatusTarget(row);
    setNextStatus(row.status);
    setStatusOpen(true);
  }

  async function applyStatus() {
    if (!statusTarget) return;
    setSaving(true);
    try {
      const updated = await patchCandidateStatusView(statusTarget.id, nextStatus);
      setRows((prev) => prev.map((r) => (r.id === statusTarget.id ? updated : r)));
      setViewRow((v) => (v?.id === statusTarget.id ? updated : v));
      setStatusOpen(false);
      toast.success(`Status → ${CANDIDATE_STATUS_LABEL[nextStatus]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveForm() {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (!form.jobId) {
      toast.error("Select a job posting");
      return;
    }
    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      jobId: form.jobId,
      source: form.source,
      totalExperience: Number(form.totalExperience) || 0,
      expectedSalary: Number(form.expectedSalary) || 0,
      currentCompany: form.currentCompany.trim(),
      currentPosition: form.currentPosition.trim(),
      resume: form.resume.trim(),
      coverLetter: form.coverLetter.trim(),
      status: form.status,
      appliedOn: todayYmd(),
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateCandidateView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        toast.success("Candidate updated");
      } else {
        const created = await createCandidateView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Candidate added");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Candidate) {
    setSaving(true);
    try {
      await deleteCandidateView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Candidate deleted");
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Candidates</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Candidate
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
                onChange={(e) => setDraftStatus(e.target.value as "all" | CandidateStatus)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {CANDIDATE_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[160px] flex-col gap-1 text-xs text-muted-foreground">
              Source
              <select
                value={draftSource}
                onChange={(e) => setDraftSource(e.target.value)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {sourceOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
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
                  setSourceFilter(draftSource);
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
                  setDraftSource("all");
                  setStatusFilter("all");
                  setSourceFilter("all");
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
                <SortHeader label="Name" col="name" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Job
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Source
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Experience" col="totalExperience" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Expected Salary" col="expectedSalary" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Employee Converted
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Applied" col="appliedOn" />
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading candidates...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No candidates found.
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
                      <div className="font-medium text-foreground">{row.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{row.email}</div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{row.jobTitle}</div>
                      <div className="font-mono text-xs text-muted-foreground">{row.jobCode}</div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{row.source}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.totalExperience} years</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatSalary(row.expectedSalary)}</td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {CANDIDATE_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">{row.employeeConverted ? "Yes" : "No"}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.appliedOn}</td>
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
                            className="h-7 w-7 rounded-none text-emerald-600"
                            onClick={() => openChangeStatus(row)}
                            aria-label="Change status"
                            title="Change status"
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

      {/* View — Workdo candidate details layout */}
      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          title={viewRow ? `Candidate — ${viewRow.name}` : "Candidate"}
          resizable
          resizeMaxWidth={1100}
          closeButton="chevron"
          className="w-[min(100%,48rem)] min-w-[320px] max-w-[1100px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col" data-view="hrm-candidate-workdo">
              <div className="shrink-0 border-b border-border px-4 py-3 pr-10">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={employeeAvatarUrl(viewRow.id, viewRow.gender)}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-none border border-border object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold leading-snug">{viewRow.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {viewRow.currentPosition || "—"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {viewRow.currentCompany || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        statusBadgeClass(viewRow.status),
                      )}
                    >
                      {CANDIDATE_STATUS_LABEL[viewRow.status]}
                    </Badge>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Applied on {formatAppliedOn(viewRow.appliedOn)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                <div className="grid gap-3 lg:grid-cols-3">
                  {/* Contact */}
                  <section className="rounded-none border border-border bg-card">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                      <Phone className="size-3.5 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Contact Information</h3>
                    </div>
                    <ul className="space-y-2.5 px-3 py-3 text-sm">
                      <li className="flex items-start gap-2">
                        <Mail className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        <span className="break-all">{viewRow.email || "—"}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Phone className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        <span>{viewRow.phone || "—"}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        <span>{viewRow.address || "—"}</span>
                      </li>
                      <li className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-2.5 text-xs">
                        <div>
                          <p className="text-muted-foreground">City</p>
                          <p className="text-sm text-foreground">{viewRow.city || "—"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">State</p>
                          <p className="text-sm text-foreground">{viewRow.state || "—"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Country</p>
                          <p className="text-sm text-foreground">{viewRow.country || "—"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Zip Code</p>
                          <p className="text-sm text-foreground">{viewRow.zipCode || "—"}</p>
                        </div>
                      </li>
                    </ul>
                  </section>

                  {/* Applied Position */}
                  <section className="rounded-none border border-border bg-card">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                      <Briefcase className="size-3.5 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Applied Position</h3>
                    </div>
                    <div className="space-y-2.5 px-3 py-3 text-sm">
                      <div>
                        <p className="font-medium text-foreground">{viewRow.jobTitle}</p>
                        <p className="font-mono text-xs text-muted-foreground">{viewRow.jobCode}</p>
                      </div>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <Building2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <span>{viewRow.office || "—"}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <span>{viewRow.jobLocation || "—"}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Clock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <span>{viewRow.jobType || "—"}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <LayoutGrid className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <span>Department: {viewRow.department || "—"}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Users className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <span>Source: {viewRow.source || "—"}</span>
                        </li>
                      </ul>
                    </div>
                  </section>

                  {/* Professional */}
                  <section className="rounded-none border border-border bg-card">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                      <span className="text-sm font-semibold text-muted-foreground">$</span>
                      <h3 className="text-sm font-semibold">Professional Information</h3>
                    </div>
                    <dl className="divide-y divide-border text-sm">
                      {(
                        [
                          ["Experience", `${viewRow.totalExperience} years`],
                          ["Current Salary", formatSalary(viewRow.currentSalary)],
                          ["Expected Salary", formatSalary(viewRow.expectedSalary)],
                          ["Notice Period", viewRow.noticePeriod || "—"],
                          ["Gender", CANDIDATE_GENDER_LABEL[viewRow.gender]],
                          [
                            "Date of Birth",
                            viewRow.dateOfBirth
                              ? formatDisplayDate(viewRow.dateOfBirth)
                              : "—",
                          ],
                        ] as const
                      ).map(([label, value]) => (
                        <div
                          key={label}
                          className="flex items-start justify-between gap-3 px-3 py-2"
                        >
                          <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                          <dd className="text-right text-sm text-foreground">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                </div>

                {/* Documents */}
                <section className="rounded-none border border-border bg-card">
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                    <FileText className="size-3.5 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Documents</h3>
                  </div>
                  {viewRow.documents.length === 0 && !viewRow.resume && !viewRow.coverLetter ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground">No documents uploaded.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {(viewRow.documents.length > 0
                        ? viewRow.documents
                        : [
                            ...(viewRow.resume
                              ? [{ name: viewRow.resume, type: "Resume" }]
                              : []),
                            ...(viewRow.coverLetter
                              ? [{ name: "cover-letter.txt", type: "Cover Letter" }]
                              : []),
                          ]
                      ).map((doc) => (
                        <li
                          key={`${doc.type}-${doc.name}`}
                          className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{doc.name}</p>
                              <p className="text-xs text-muted-foreground">{doc.type}</p>
                            </div>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">Mock file</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {viewRow.coverLetter ? (
                    <div className="border-t border-border px-3 py-3">
                      <p className="mb-1 text-xs text-muted-foreground">Cover Letter</p>
                      <p className="text-sm text-foreground">{viewRow.coverLetter}</p>
                    </div>
                  ) : null}
                </section>
              </div>

              {canWrite ? (
                <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
                  <Button
                    type="button"
                    size="sm"
                    className={cn("rounded-none", GREEN_BTN)}
                    onClick={() => {
                      setViewRow(null);
                      openChangeStatus(viewRow);
                    }}
                  >
                    <RefreshCw className="size-3.5" />
                    Change Status
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Change status */}
      <Sheet open={statusOpen} onOpenChange={setStatusOpen}>
        <SheetContent
          side="right"
          title="Change Status"
          resizable
          resizeMaxWidth={520}
          closeButton="chevron"
          className="w-[min(100%,24rem)] min-w-[260px] max-w-[520px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">Change Status</SheetTitle>
              <SheetDescription className="text-xs">
                {statusTarget
                  ? `${statusTarget.name} — ${statusTarget.jobTitle}`
                  : "Update hiring stage"}
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Status
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value as CandidateStatus)}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {CANDIDATE_STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-muted-foreground">
                Stages: New → Screening → Interview → Offer → Hired (or Rejected).
              </p>
            </div>
            <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 rounded-none"
                onClick={() => setStatusOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" size="sm" className={cn("flex-1", GREEN_BTN)} onClick={applyStatus}>
                Save
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Add / Edit */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          title={formMode === "add" ? "Add Candidate" : "Edit Candidate"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Add Candidate" : "Edit Candidate"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — candidate, job, source, experience, salary, status.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Name *
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Email *
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Phone
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Applied For *
                <select
                  value={form.jobId}
                  onChange={(e) => setForm({ ...form, jobId: e.target.value })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {jobOptions.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} ({j.code})
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Source
                  <select
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {sourceOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as CandidateStatus })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {CANDIDATE_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Experience (years)
                  <Input
                    type="number"
                    min={0}
                    value={form.totalExperience}
                    onChange={(e) => setForm({ ...form, totalExperience: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Expected Salary
                  <Input
                    type="number"
                    min={0}
                    value={form.expectedSalary}
                    onChange={(e) => setForm({ ...form, expectedSalary: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Current / Previous Company
                <Input
                  value={form.currentCompany}
                  onChange={(e) => setForm({ ...form, currentCompany: e.target.value })}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Resume / CV
                <Input
                  value={form.resume}
                  onChange={(e) => setForm({ ...form, resume: e.target.value })}
                  className="h-9 rounded-none"
                  placeholder="Filename (mock)"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Cover Letter
                <Textarea
                  value={form.coverLetter}
                  onChange={(e) => setForm({ ...form, coverLetter: e.target.value })}
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
