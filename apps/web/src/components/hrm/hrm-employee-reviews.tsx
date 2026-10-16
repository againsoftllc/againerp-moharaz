"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Eye, Filter, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  REVIEW_STATUS_LABEL,
  REVIEW_STATUS_OPTIONS,
  formatRating,
  reviewAvatar,
  type EmployeeReview,
  type ReviewStatus,
} from "@/lib/mock-data/hrm-employee-reviews";
import type { ReviewCycle } from "@/lib/mock-data/hrm-review-cycles";
import {
  createEmployeeReviewView,
  deleteEmployeeReviewView,
  listEmployeeReviewsView,
  listPerformanceEmployeeOptions,
  listPerformanceReviewerOptions,
  listReviewCyclesView,
  updateEmployeeReviewView,
  type EmployeeReviewWritePayload,
} from "@/lib/api/hrm-performance";
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

type SortKey = "employeeName" | "reviewCycle" | "reviewDate" | "status";
type SortDir = "asc" | "desc";

type ReviewRow = EmployeeReview & { reviewCycleId?: string };

type EmployeeOption = {
  id: string;
  name: string;
  email: string;
};

type ReviewerOption = {
  id: string;
  name: string;
  email: string;
};

type FormState = {
  employeeId: string;
  reviewerId: string;
  reviewCycleId: string;
  reviewDate: string;
  rating: string;
  comments: string;
  status: ReviewStatus;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function emptyForm(
  employees: EmployeeOption[] = [],
  reviewers: ReviewerOption[] = [],
  cycles: ReviewCycle[] = [],
): FormState {
  return {
    employeeId: employees[0]?.id ?? "",
    reviewerId: reviewers[0]?.id ?? "",
    reviewCycleId: cycles[0]?.id ?? "",
    reviewDate: todayYmd(),
    rating: "",
    comments: "",
    status: "scheduled",
  };
}

function formFromRow(row: ReviewRow): FormState {
  return {
    employeeId: row.employeeId,
    reviewerId: row.reviewerId,
    reviewCycleId: row.reviewCycleId ?? "",
    reviewDate: row.reviewDate,
    rating: row.rating != null ? String(row.rating) : "",
    comments: row.comments,
    status: row.status,
  };
}

function statusBadgeClass(status: ReviewStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "in_progress":
      return "border-orange-500/30 bg-orange-500/15 text-orange-800 dark:text-orange-300";
    default:
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
  }
}

function PersonCell({
  id,
  name,
  email,
}: {
  id: string;
  name: string;
  email: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={reviewAvatar(id)}
        alt=""
        className="h-8 w-8 shrink-0 rounded-none border border-border object-cover"
      />
      <div className="min-w-0">
        <div className="font-medium text-foreground">{name}</div>
        <div className="truncate text-xs text-muted-foreground">{email}</div>
      </div>
    </div>
  );
}

export function HrmEmployeeReviews() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [reviewerOptions, setReviewerOptions] = useState<ReviewerOption[]>([]);
  const [reviewCycleOptions, setReviewCycleOptions] = useState<ReviewCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | ReviewStatus>("all");
  const [draftCycle, setDraftCycle] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ReviewStatus>("all");
  const [cycleFilter, setCycleFilter] = useState("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("reviewDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<ReviewRow | null>(null);
  const [conductRow, setConductRow] = useState<ReviewRow | null>(null);
  const [conductRating, setConductRating] = useState("");
  const [conductComments, setConductComments] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [employees, reviewers, cycles, data] = await Promise.all([
          listPerformanceEmployeeOptions(),
          listPerformanceReviewerOptions(),
          listReviewCyclesView(),
          listEmployeeReviewsView(),
        ]);
        if (cancelled) return;
        setEmployeeOptions(employees);
        setReviewerOptions(reviewers);
        setReviewCycleOptions(cycles);
        setRows(data as ReviewRow[]);
        setForm(emptyForm(employees, reviewers, cycles));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load reviews");
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
    if (cycleFilter !== "all") list = list.filter((r) => r.reviewCycleId === cycleFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.employeeName.toLowerCase().includes(q) ||
          r.employeeEmail.toLowerCase().includes(q) ||
          r.reviewerName.toLowerCase().includes(q) ||
          r.reviewCycle.toLowerCase().includes(q) ||
          r.comments.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])) * dir);
  }, [rows, statusFilter, cycleFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "reviewDate" ? "desc" : "asc");
    }
  }

  function openSchedule() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(employeeOptions, reviewerOptions, reviewCycleOptions));
    setFormOpen(true);
  }

  function openEdit(row: ReviewRow) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  function openConduct(row: ReviewRow) {
    setConductRow(row);
    setConductRating(row.rating != null ? String(row.rating) : "");
    setConductComments(row.comments);
  }

  async function saveForm() {
    const emp = employeeOptions.find((e) => e.id === form.employeeId);
    const rev = reviewerOptions.find((r) => r.id === form.reviewerId);
    const cycle = reviewCycleOptions.find((c) => c.id === form.reviewCycleId);
    if (!emp || !rev) {
      toast.error("Select employee and reviewer");
      return;
    }
    if (!cycle || !form.reviewDate) {
      toast.error("Review cycle and date are required");
      return;
    }

    const ratingRaw = form.rating.trim();
    const rating = ratingRaw === "" ? null : Number(ratingRaw);
    if (rating != null && (Number.isNaN(rating) || rating < 0 || rating > 5)) {
      toast.error("Rating must be between 0 and 5");
      return;
    }

    const payload: EmployeeReviewWritePayload = {
      employeeId: emp.id,
      reviewerId: rev.id,
      reviewCycleId: cycle.id,
      reviewDate: form.reviewDate,
      rating: form.status === "completed" ? (rating ?? 0) : rating,
      comments: form.comments.trim(),
      status: form.status,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateEmployeeReviewView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? (updated as ReviewRow) : r)));
        setViewRow((v) => (v?.id === editId ? (updated as ReviewRow) : v));
        toast.success("Review updated");
      } else {
        const created = await createEmployeeReviewView(payload);
        setRows((prev) => [created as ReviewRow, ...prev]);
        toast.success("Review scheduled");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveConduct() {
    if (!conductRow) return;
    const ratingRaw = conductRating.trim();
    if (!ratingRaw) {
      toast.error("Rating is required to complete the review");
      return;
    }
    const rating = Number(ratingRaw);
    if (Number.isNaN(rating) || rating < 0 || rating > 5) {
      toast.error("Rating must be between 0 and 5");
      return;
    }

    const payload: EmployeeReviewWritePayload = {
      employeeId: conductRow.employeeId,
      reviewerId: conductRow.reviewerId,
      reviewCycleId: conductRow.reviewCycleId ?? "",
      reviewDate: conductRow.reviewDate,
      rating,
      comments: conductComments.trim(),
      status: "completed",
    };

    setSaving(true);
    try {
      const updated = await updateEmployeeReviewView(conductRow.id, payload);
      setRows((prev) => prev.map((r) => (r.id === conductRow.id ? (updated as ReviewRow) : r)));
      setViewRow((v) => (v?.id === conductRow.id ? (updated as ReviewRow) : v));
      setConductRow(null);
      toast.success(`Review completed — ${conductRow.employeeName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Complete failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: ReviewRow) {
    setSaving(true);
    try {
      await deleteEmployeeReviewView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      setConductRow((v) => (v?.id === row.id ? null : v));
      toast.success("Review deleted");
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Employee Reviews</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openSchedule}>
            <Plus className="size-3.5" />
            Schedule Review
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
              Review Cycle
              <select
                value={draftCycle}
                onChange={(e) => setDraftCycle(e.target.value)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {reviewCycleOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted-foreground">
              Status
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value as "all" | ReviewStatus)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {REVIEW_STATUS_OPTIONS.map((s) => (
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
                  setCycleFilter(draftCycle);
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
                  setDraftCycle("all");
                  setDraftStatus("all");
                  setCycleFilter("all");
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
        <table className="w-full min-w-[1080px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Employee" col="employeeName" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Reviewer
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Review Cycle" col="reviewCycle" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Review Date" col="reviewDate" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Rating
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
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
                  Loading reviews...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No reviews found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => {
                const open = row.status !== "completed";
                return (
                  <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {(pageSafe - 1) * perPage + idx + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <PersonCell
                        id={row.employeeId}
                        name={row.employeeName}
                        email={row.employeeEmail}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <PersonCell
                        id={row.reviewerId}
                        name={row.reviewerName}
                        email={row.reviewerEmail}
                      />
                    </td>
                    <td className="px-3 py-2.5">{row.reviewCycle}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.reviewDate}</td>
                    <td className="px-3 py-2.5 tabular-nums font-medium">
                      {formatRating(row.rating)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-none text-[10px] font-normal",
                          statusBadgeClass(row.status),
                        )}
                      >
                        {REVIEW_STATUS_LABEL[row.status]}
                      </Badge>
                    </td>
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
                        {canWrite && open ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-emerald-600"
                            onClick={() => openConduct(row)}
                            aria-label="Conduct review"
                          >
                            <ClipboardList className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        {canWrite ? (
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
                        ) : null}
                        {canWrite && open ? (
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
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
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
          title={viewRow ? `Review — ${viewRow.employeeName}` : "Review"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col" data-view="hrm-employee-review-workdo">
              <div className="shrink-0 border-b border-border px-4 py-4 pr-10">
                <p className="text-base font-semibold leading-snug">{viewRow.reviewCycle}</p>
                <p className="mt-1 text-xs text-muted-foreground">{viewRow.reviewDate}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-none text-[10px] font-normal",
                      statusBadgeClass(viewRow.status),
                    )}
                  >
                    {REVIEW_STATUS_LABEL[viewRow.status]}
                  </Badge>
                  <span className="text-sm font-medium tabular-nums">
                    Rating: {formatRating(viewRow.rating)}
                  </span>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <div className="grid grid-cols-1 gap-2">
                  <div className="rounded-none border border-border bg-muted/20 px-3 py-2.5">
                    <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Employee
                    </p>
                    <PersonCell
                      id={viewRow.employeeId}
                      name={viewRow.employeeName}
                      email={viewRow.employeeEmail}
                    />
                  </div>
                  <div className="rounded-none border border-border bg-muted/20 px-3 py-2.5">
                    <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Reviewer
                    </p>
                    <PersonCell
                      id={viewRow.reviewerId}
                      name={viewRow.reviewerName}
                      email={viewRow.reviewerEmail}
                    />
                  </div>
                </div>

                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Review Cycle", viewRow.reviewCycle],
                      ["Review Date", viewRow.reviewDate],
                      ["Rating", formatRating(viewRow.rating)],
                      ["Status", REVIEW_STATUS_LABEL[viewRow.status]],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 px-3 py-2.5">
                      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                      <dd className="max-w-[62%] text-right text-sm text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="rounded-none border border-border bg-muted/20 px-3 py-3">
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Comments
                  </p>
                  <p className="text-sm leading-relaxed text-foreground">
                    {viewRow.comments || "—"}
                  </p>
                </div>
              </div>

              {canWrite ? (
                <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-4 py-3">
                  {viewRow.status !== "completed" ? (
                    <Button
                      type="button"
                      size="sm"
                      className={cn("rounded-none", GREEN_BTN)}
                      onClick={() => {
                        setViewRow(null);
                        openConduct(viewRow);
                      }}
                    >
                      <ClipboardList className="size-3.5" />
                      Conduct
                    </Button>
                  ) : null}
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

      {/* Conduct review */}
      <Sheet open={!!conductRow} onOpenChange={(o) => !o && setConductRow(null)}>
        <SheetContent
          side="right"
          title={conductRow ? `Conduct — ${conductRow.employeeName}` : "Conduct Review"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {conductRow ? (
            <div className="flex h-full min-h-0 flex-col">
              <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
                <SheetTitle className="text-base">Conduct Review</SheetTitle>
                <SheetDescription className="text-xs">
                  {conductRow.employeeName} · {conductRow.reviewCycle}
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Rating * (0–5)
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step="0.1"
                    value={conductRating}
                    onChange={(e) => setConductRating(e.target.value)}
                    className="h-9 rounded-none"
                    placeholder="4.0"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Comments
                  <Textarea
                    value={conductComments}
                    onChange={(e) => setConductComments(e.target.value)}
                    className="min-h-[120px] rounded-none"
                    placeholder="Performance feedback"
                  />
                </label>
              </div>
              <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 rounded-none"
                  onClick={() => setConductRow(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={cn("flex-1", GREEN_BTN)}
                  onClick={() => void saveConduct()}
                  disabled={saving}
                >
                  Complete Review
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Schedule / Edit */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          title={formMode === "add" ? "Schedule Review" : "Edit Review"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Schedule Review" : "Edit Review"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — employee, reviewer, cycle, date, rating, comments.
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
                      {e.name} — {e.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Reviewer *
                <select
                  value={form.reviewerId}
                  onChange={(e) => setForm({ ...form, reviewerId: e.target.value })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {reviewerOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} — {r.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Review Cycle *
                <select
                  value={form.reviewCycleId}
                  onChange={(e) => setForm({ ...form, reviewCycleId: e.target.value })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  {reviewCycleOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  {reviewCycleOptions.some((c) => c.id === form.reviewCycleId)
                    ? null
                    : form.reviewCycleId && (
                        <option value={form.reviewCycleId}>Unknown cycle</option>
                      )}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Review Date *
                  <Input
                    type="date"
                    value={form.reviewDate}
                    onChange={(e) => setForm({ ...form, reviewDate: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as ReviewStatus })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {REVIEW_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Rating (0–5)
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step="0.1"
                    value={form.rating}
                    onChange={(e) => setForm({ ...form, rating: e.target.value })}
                    className="h-9 rounded-none"
                    placeholder="Leave empty if not rated yet"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Comments
                <Textarea
                  value={form.comments}
                  onChange={(e) => setForm({ ...form, comments: e.target.value })}
                  className="min-h-[90px] rounded-none"
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
              <Button
                type="button"
                size="sm"
                className={cn("flex-1", GREEN_BTN)}
                onClick={() => void saveForm()}
                disabled={saving}
              >
                Save
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
