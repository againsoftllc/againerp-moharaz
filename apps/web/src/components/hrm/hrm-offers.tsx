"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  Filter,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import {
  createOfferView,
  deleteOfferView,
  listCandidateOptions,
  listOffersView,
  updateOfferView,
  sendOfferView,
  type CandidateOption,
} from "@/lib/api/hrm-recruitment";
import {
  OFFER_STATUS_LABEL,
  OFFER_STATUS_OPTIONS,
  formatSalary,
  isOfferExpired,
  type Offer,
  type OfferStatus,
} from "@/lib/mock-data/hrm-offers";
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

type SortKey = "candidateName" | "salary" | "startDate" | "expiresOn" | "offerDate" | "status";
type SortDir = "asc" | "desc";

type FormState = {
  candidateId: string;
  salary: string;
  startDate: string;
  expiresOn: string;
  offerDate: string;
  approvedBy: string;
  benefits: string;
  notes: string;
  status: OfferStatus;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function emptyForm(candidates: CandidateOption[] = []): FormState {
  return {
    candidateId: candidates[0]?.id ?? "",
    salary: "50000",
    startDate: todayYmd(),
    expiresOn: todayYmd(),
    offerDate: todayYmd(),
    approvedBy: "",
    benefits: "",
    notes: "",
    status: "draft",
  };
}

function formFromRow(row: Offer): FormState {
  return {
    candidateId: row.candidateId,
    salary: String(row.salary),
    startDate: row.startDate,
    expiresOn: row.expiresOn,
    offerDate: row.offerDate,
    approvedBy: row.approvedBy,
    benefits: row.benefits,
    notes: row.notes,
    status: row.status,
  };
}

function statusBadgeClass(status: OfferStatus) {
  switch (status) {
    case "sent":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case "accepted":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "negotiation":
      return "border-violet-500/30 bg-violet-500/15 text-violet-800 dark:text-violet-300";
    case "declined":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    case "expired":
      return "border-orange-500/30 bg-orange-500/15 text-orange-800 dark:text-orange-300";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

export function HrmOffers() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<Offer[]>([]);
  const [candidateOptions, setCandidateOptions] = useState<CandidateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | OfferStatus>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | OfferStatus>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("offerDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<Offer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [data, candidates] = await Promise.all([
          listOffersView(),
          listCandidateOptions(),
        ]);
        if (cancelled) return;
        setRows(data);
        setCandidateOptions(candidates);
        setForm(emptyForm(candidates));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load offers");
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
          r.candidateName.toLowerCase().includes(q) ||
          r.jobTitle.toLowerCase().includes(q) ||
          r.jobCode.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q) ||
          OFFER_STATUS_LABEL[r.status].toLowerCase().includes(q),
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
      setSortDir(key === "candidateName" || key === "status" ? "asc" : "desc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(candidateOptions));
    setFormOpen(true);
  }

  function openEdit(row: Offer) {
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
    if (!form.salary || Number(form.salary) <= 0) {
      toast.error("Salary is required");
      return;
    }

    const payload = {
      candidateId: cand.id,
      salary: Number(form.salary) || 0,
      startDate: form.startDate,
      expiresOn: form.expiresOn,
      offerDate: form.offerDate || todayYmd(),
      benefits: form.benefits.trim(),
      notes: form.notes.trim(),
      status: form.status,
      department: cand.department,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateOfferView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success("Offer updated");
      } else {
        const created = await createOfferView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Offer created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function sendOrConvert(row: Offer) {
    if (row.status === "draft") {
      setSaving(true);
      try {
        const updated = await sendOfferView(row.id);
        setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
        setViewRow((v) => (v?.id === row.id ? updated : v));
        toast.success("Offer sent to candidate");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Send failed");
      } finally {
        setSaving(false);
      }
      return;
    }
    if (row.status === "accepted" && !row.employeeConverted) {
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, employeeConverted: true } : r)),
      );
      setViewRow((v) => (v?.id === row.id ? { ...v, employeeConverted: true } : v));
      toast.success("Candidate marked as converted to employee");
      return;
    }
    if (row.status === "sent") {
      toast.success("Offer resent to candidate");
      return;
    }
    toast.message("No action available for this status");
  }

  async function remove(row: Offer) {
    setSaving(true);
    try {
      await deleteOfferView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Offer deleted");
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Offers</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Create Offer
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
                onChange={(e) => setDraftStatus(e.target.value as "all" | OfferStatus)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {OFFER_STATUS_OPTIONS.map((s) => (
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
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Candidate" col="candidateName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Salary" col="salary" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Start Date" col="startDate" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Expires" col="expiresOn" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Offer Date" col="offerDate" />
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
                  Loading offers...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No offers found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => {
                const expired = isOfferExpired(row.expiresOn);
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-b-0 hover:bg-muted/20"
                  >
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {(pageSafe - 1) * perPage + idx + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{row.candidateName}</div>
                        <div className="truncate text-xs text-muted-foreground">{row.jobTitle}</div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{formatSalary(row.salary)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.startDate}</td>
                    <td className="px-3 py-2.5">
                      <div
                        className={cn(
                          "tabular-nums",
                          expired ? "font-medium text-red-600 dark:text-red-400" : "",
                        )}
                      >
                        {row.expiresOn}
                      </div>
                      {expired ? (
                        <div className="text-xs font-medium text-red-600 dark:text-red-400">
                          Expired
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-none text-[10px] font-normal",
                          statusBadgeClass(row.status),
                        )}
                      >
                        {OFFER_STATUS_LABEL[row.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{row.offerDate}</td>
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
                              className="h-7 w-7 rounded-none text-emerald-600"
                              onClick={() => sendOrConvert(row)}
                              aria-label={
                                row.status === "draft"
                                  ? "Send offer"
                                  : row.status === "accepted"
                                    ? "Convert to employee"
                                    : "Resend offer"
                              }
                              title={
                                row.status === "draft"
                                  ? "Send offer"
                                  : row.status === "accepted"
                                    ? "Convert to employee"
                                    : "Resend offer"
                              }
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
          title={viewRow ? `Offer — ${viewRow.candidateName}` : "Offer"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-border px-4 py-3 pr-10">
                <p className="text-base font-semibold">{viewRow.candidateName}</p>
                <p className="text-xs text-muted-foreground">
                  {viewRow.jobTitle} · {viewRow.jobCode}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-none text-[10px] font-normal",
                      statusBadgeClass(viewRow.status),
                    )}
                  >
                    {OFFER_STATUS_LABEL[viewRow.status]}
                  </Badge>
                  {isOfferExpired(viewRow.expiresOn) ? (
                    <Badge
                      variant="outline"
                      className="rounded-none border-red-500/30 bg-red-500/15 text-[10px] font-normal text-red-700 dark:text-red-300"
                    >
                      Expired
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Department", viewRow.department || "—"],
                      ["Salary", formatSalary(viewRow.salary)],
                      ["Start Date", viewRow.startDate],
                      ["Expires", viewRow.expiresOn],
                      ["Offer Date", viewRow.offerDate],
                      ["Approved By", viewRow.approvedBy || "—"],
                      ["Employee Converted", viewRow.employeeConverted ? "Yes" : "No"],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-right text-sm">{value}</dd>
                    </div>
                  ))}
                </dl>
                {viewRow.benefits ? (
                  <div className="rounded-none border border-border bg-muted/20 px-3 py-2 text-sm">
                    <p className="mb-1 text-xs text-muted-foreground">Benefits</p>
                    <p>{viewRow.benefits}</p>
                  </div>
                ) : null}
                {viewRow.notes ? (
                  <div className="rounded-none border border-border bg-muted/20 px-3 py-2 text-sm">
                    <p className="mb-1 text-xs text-muted-foreground">Notes</p>
                    <p>{viewRow.notes}</p>
                  </div>
                ) : null}
              </div>
              {canWrite ? (
                <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-4 py-3">
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
                  <Button
                    type="button"
                    size="sm"
                    className={cn("rounded-none", GREEN_BTN)}
                    onClick={() => sendOrConvert(viewRow)}
                  >
                    <RefreshCw className="size-3.5" />
                    {viewRow.status === "draft"
                      ? "Send"
                      : viewRow.status === "accepted"
                        ? "Convert"
                        : "Resend"}
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
          title={formMode === "add" ? "Create Offer" : "Edit Offer"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Create Offer" : "Edit Offer"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — candidate, salary, start/expiry, status, benefits.
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
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Salary *
                  <Input
                    type="number"
                    min={0}
                    value={form.salary}
                    onChange={(e) => setForm({ ...form, salary: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as OfferStatus })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {OFFER_STATUS_OPTIONS.map((s) => (
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
                  Expires
                  <Input
                    type="date"
                    value={form.expiresOn}
                    onChange={(e) => setForm({ ...form, expiresOn: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Offer Date
                  <Input
                    type="date"
                    value={form.offerDate}
                    onChange={(e) => setForm({ ...form, offerDate: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Approved By
                  <Input
                    value={form.approvedBy}
                    onChange={(e) => setForm({ ...form, approvedBy: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Benefits
                <Textarea
                  value={form.benefits}
                  onChange={(e) => setForm({ ...form, benefits: e.target.value })}
                  className="min-h-[72px] rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Notes
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="min-h-[64px] rounded-none"
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
