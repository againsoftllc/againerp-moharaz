"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, FileText, Filter, Pencil, Plus, Search, Trash2, User } from "lucide-react";
import {
  COMPLAINT_STATUS_LABEL,
  COMPLAINT_STATUS_OPTIONS,
  COMPLAINT_TYPE_LABEL,
  COMPLAINT_TYPE_OPTIONS,
  complaintAvatar,
  type Complaint,
  type ComplaintStatus,
  type ComplaintType,
} from "@/lib/mock-data/hrm-complaints";
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
import {
  createComplaintView,
  deleteComplaintView,
  listComplaintsView,
  listLifecycleEmployeeOptions,
  updateComplaintView,
  type LifecycleEmployeeOption,
} from "@/lib/api/hrm-lifecycle";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

type SortKey = "complainantName" | "type" | "date" | "status" | "assignedTo";
type SortDir = "asc" | "desc";

type FormState = {
  anonymous: boolean;
  complainantId: string;
  againstId: string;
  type: ComplaintType;
  date: string;
  status: ComplaintStatus;
  assignedTo: string;
  description: string;
  document: string;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function emptyForm(employees: LifecycleEmployeeOption[] = []): FormState {
  return {
    anonymous: false,
    complainantId: employees[0]?.id ?? "",
    againstId: "",
    type: "workplace",
    date: todayYmd(),
    status: "submitted",
    assignedTo: employees[0]?.id ?? "",
    description: "",
    document: "",
  };
}

function formFromRow(row: Complaint, employees: LifecycleEmployeeOption[]): FormState {
  const assignee =
    employees.find((e) => e.name === row.assignedTo) ??
    employees.find((e) => e.id === row.assignedTo);
  return {
    anonymous: row.anonymous,
    complainantId: row.complainantId ?? employees[0]?.id ?? "",
    againstId: row.againstId ?? "",
    type: row.type,
    date: row.date,
    status: row.status,
    assignedTo: assignee?.id ?? row.assignedTo,
    description: row.description,
    document: row.document,
  };
}

function statusBadgeClass(status: ComplaintStatus) {
  switch (status) {
    case "resolved":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "dismissed":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    default:
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
  }
}

function PersonCell({
  name,
  email,
  employeeId,
  empty,
}: {
  name: string;
  email: string;
  employeeId: string | null;
  empty?: boolean;
}) {
  if (empty || (!name && !employeeId)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const isAnon = name === "Anonymous" || !employeeId;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {isAnon ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-border bg-muted text-muted-foreground">
          <User className="size-3.5" />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={complaintAvatar(employeeId)}
          alt=""
          className="h-8 w-8 shrink-0 rounded-none border border-border object-cover"
        />
      )}
      <div className="min-w-0">
        <div className="font-medium text-foreground">{name}</div>
        {email ? (
          <div className="truncate text-xs text-muted-foreground">{email}</div>
        ) : null}
      </div>
    </div>
  );
}

export function HrmComplaints() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<Complaint[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<LifecycleEmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftType, setDraftType] = useState<"all" | ComplaintType>("all");
  const [draftStatus, setDraftStatus] = useState<"all" | ComplaintStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | ComplaintType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ComplaintStatus>("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<Complaint | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [employees, data] = await Promise.all([
          listLifecycleEmployeeOptions(),
          listComplaintsView(),
        ]);
        if (cancelled) return;
        setEmployeeOptions(employees);
        setRows(data);
        setForm(emptyForm(employees));
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load complaints");
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
    if (typeFilter !== "all") list = list.filter((r) => r.type === typeFilter);
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.complainantName.toLowerCase().includes(q) ||
          r.complainantEmail.toLowerCase().includes(q) ||
          r.againstName.toLowerCase().includes(q) ||
          r.againstEmail.toLowerCase().includes(q) ||
          COMPLAINT_TYPE_LABEL[r.type].toLowerCase().includes(q) ||
          r.assignedTo.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = sortKey === "type" ? COMPLAINT_TYPE_LABEL[a.type] : a[sortKey];
      const bv = sortKey === "type" ? COMPLAINT_TYPE_LABEL[b.type] : b[sortKey];
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, typeFilter, statusFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(employeeOptions));
    setFormOpen(true);
  }

  function openEdit(row: Complaint) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row, employeeOptions));
    setFormOpen(true);
  }

  async function saveForm() {
    if (!form.date || !form.description.trim()) {
      toast.error("Date and description are required");
      return;
    }

    let complainantId: string | null = null;
    let complainantName = "Anonymous";
    let complainantEmail = "";
    if (!form.anonymous) {
      const c = employeeOptions.find((p) => p.id === form.complainantId);
      if (!c) {
        toast.error("Select a complainant");
        return;
      }
      complainantId = c.id;
      complainantName = c.name;
      complainantEmail = c.email;
    }

    let againstId: string | null = null;
    let againstName = "";
    let againstEmail = "";
    if (form.againstId) {
      const a = employeeOptions.find((p) => p.id === form.againstId);
      if (a) {
        againstId = a.id;
        againstName = a.name;
        againstEmail = a.email;
      }
    }

    const assignee = employeeOptions.find((e) => e.id === form.assignedTo);

    const payload: Omit<Complaint, "id"> = {
      anonymous: form.anonymous,
      complainantId,
      complainantName,
      complainantEmail,
      againstId,
      againstName,
      againstEmail,
      type: form.type,
      date: form.date,
      status: form.status,
      assignedTo: assignee?.name ?? form.assignedTo,
      description: form.description.trim(),
      document: form.document.trim(),
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateComplaintView(editId, {
          ...payload,
          assignedTo: form.assignedTo,
        });
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success("Complaint updated");
      } else {
        const created = await createComplaintView({
          ...payload,
          assignedTo: form.assignedTo,
        });
        setRows((prev) => [created, ...prev]);
        toast.success("Complaint created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Complaint) {
    setSaving(true);
    try {
      await deleteComplaintView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Complaint deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  function openDocument(name: string) {
    if (!name) {
      toast.message("No document attached");
      return;
    }
    toast.message(`Document: ${name}`);
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Complaints</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Complaint
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
                onChange={(e) => setDraftType(e.target.value as "all" | ComplaintType)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {COMPLAINT_TYPE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted-foreground">
              Status
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value as "all" | ComplaintStatus)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {COMPLAINT_STATUS_OPTIONS.map((s) => (
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
                  setDraftType("all");
                  setDraftStatus("all");
                  setTypeFilter("all");
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
        <table className="w-full min-w-[1120px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Complainant" col="complainantName" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Against
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Type" col="type" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Date" col="date" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Assigned To" col="assignedTo" />
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Documents
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
                  Loading complaints...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No complaints found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <PersonCell
                      name={row.complainantName}
                      email={row.complainantEmail}
                      employeeId={row.complainantId}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <PersonCell
                      name={row.againstName}
                      email={row.againstEmail}
                      employeeId={row.againstId}
                      empty={!row.againstId && !row.againstName}
                    />
                  </td>
                  <td className="px-3 py-2.5">{COMPLAINT_TYPE_LABEL[row.type]}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.date}</td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {COMPLAINT_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">{row.assignedTo}</td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-7 w-7 rounded-none",
                        row.document ? "text-sky-600" : "text-muted-foreground/40",
                      )}
                      onClick={() => openDocument(row.document)}
                      aria-label={row.document ? "View document" : "No document"}
                      disabled={!row.document}
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
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

      {/* View */}
      <Sheet open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <SheetContent
          side="right"
          title={viewRow ? `Complaint — ${viewRow.complainantName}` : "Complaint"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col" data-view="hrm-complaint-workdo">
              <div className="shrink-0 border-b border-border px-4 py-4 pr-10">
                <p className="text-base font-semibold leading-snug">
                  {COMPLAINT_TYPE_LABEL[viewRow.type]}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{viewRow.date}</p>
                <Badge
                  variant="outline"
                  className={cn(
                    "mt-2 rounded-none text-[10px] font-normal",
                    statusBadgeClass(viewRow.status),
                  )}
                >
                  {COMPLAINT_STATUS_LABEL[viewRow.status]}
                </Badge>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <div className="grid grid-cols-1 gap-2">
                  <div className="rounded-none border border-border bg-muted/20 px-3 py-2.5">
                    <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Complainant
                    </p>
                    <PersonCell
                      name={viewRow.complainantName}
                      email={viewRow.complainantEmail}
                      employeeId={viewRow.complainantId}
                    />
                  </div>
                  <div className="rounded-none border border-border bg-muted/20 px-3 py-2.5">
                    <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Against
                    </p>
                    <PersonCell
                      name={viewRow.againstName}
                      email={viewRow.againstEmail}
                      employeeId={viewRow.againstId}
                      empty={!viewRow.againstId && !viewRow.againstName}
                    />
                  </div>
                </div>

                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {(
                    [
                      ["Type", COMPLAINT_TYPE_LABEL[viewRow.type]],
                      ["Date", viewRow.date],
                      ["Status", COMPLAINT_STATUS_LABEL[viewRow.status]],
                      ["Assigned To", viewRow.assignedTo],
                      ["Document", viewRow.document || "—"],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 px-3 py-2.5">
                      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                      <dd className="max-w-[62%] break-all text-right text-sm text-foreground">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="rounded-none border border-border bg-muted/20 px-3 py-3">
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Description
                  </p>
                  <p className="text-sm leading-relaxed text-foreground">
                    {viewRow.description || "—"}
                  </p>
                </div>
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
          title={formMode === "add" ? "Add Complaint" : "Edit Complaint"}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? "Add Complaint" : "Edit Complaint"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Workdo fields — complainant, against, type, status, assignee, document.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.anonymous}
                  onChange={(e) => setForm({ ...form, anonymous: e.target.checked })}
                  className="size-4 rounded-none border border-border"
                />
                Anonymous complainant
              </label>
              {!form.anonymous ? (
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Complainant *
                  <select
                    value={form.complainantId}
                    onChange={(e) => setForm({ ...form, complainantId: e.target.value })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {employeeOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.email}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Against
                <select
                  value={form.againstId}
                  onChange={(e) => setForm({ ...form, againstId: e.target.value })}
                  className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                >
                  <option value="">— None —</option>
                  {employeeOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.email}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Type *
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as ComplaintType })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {COMPLAINT_TYPE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Date *
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="h-9 rounded-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as ComplaintStatus })
                    }
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {COMPLAINT_STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Assigned To
                  <select
                    value={form.assignedTo}
                    onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                    className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                  >
                    <option value="">— Unassigned —</option>
                    {employeeOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
                  Document
                  <Input
                    value={form.document}
                    onChange={(e) => setForm({ ...form, document: e.target.value })}
                    className="h-9 rounded-none"
                    placeholder="complaint.pdf"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                Description *
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="min-h-[90px] rounded-none"
                  placeholder="Complaint details"
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
                onClick={saveForm}
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
