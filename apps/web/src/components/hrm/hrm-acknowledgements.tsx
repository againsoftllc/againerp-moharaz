"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Eye,
  FileText,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  ACK_STATUS_LABEL,
  ACK_STATUS_OPTIONS,
  daysOverdue,
  resolveAckStatus,
  todayYmd,
  type AcknowledgementStatus,
  type DocumentAcknowledgement,
} from "@/lib/mock-data/hrm-acknowledgements";
import {
  acknowledgeHrmDocument,
  apiAckToView,
  buildDocumentLookups,
  createHrmDocumentAcknowledgment,
  deleteHrmDocumentAcknowledgment,
  listHrmDocumentAcknowledgments,
  listHrmHrDocuments,
  updateHrmDocumentAcknowledgment,
  type DocumentLookups,
} from "@/lib/api/hrm-documents";
import { listHrmEmployees } from "@/lib/api/hrm-employees";
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

type SortKey = "employeeName" | "status" | "dueDate" | "acknowledgedAt" | "assignedBy";
type SortDir = "asc" | "desc";

type AckRow = DocumentAcknowledgement & { documentId: string; userId: string };

type EmpOption = { authUserId: string; name: string };

type DocOption = { id: string; title: string };

type FormState = {
  documentId: string;
  userId: string;
  dueDate: string;
  note: string;
};

function emptyForm(employees: EmpOption[], documents: DocOption[]): FormState {
  return {
    documentId: documents[0]?.id ?? "",
    userId: employees[0]?.authUserId ?? "",
    dueDate: todayYmd(),
    note: "",
  };
}

function formFromRow(row: AckRow): FormState {
  return {
    documentId: row.documentId,
    userId: row.userId,
    dueDate: row.dueDate,
    note: row.note,
  };
}

function mapAckRow(
  apiRow: Awaited<ReturnType<typeof listHrmDocumentAcknowledgments>>[number],
  lookups: DocumentLookups,
): AckRow {
  return {
    ...apiAckToView(apiRow, lookups),
    documentId: apiRow.document_id ?? "",
    userId: apiRow.user_id ?? "",
  };
}

function statusBadgeClass(status: AcknowledgementStatus) {
  switch (status) {
    case "acknowledged":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "overdue":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    default:
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export function HrmAcknowledgements() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<AckRow[]>([]);
  const [employees, setEmployees] = useState<EmpOption[]>([]);
  const [documents, setDocuments] = useState<DocOption[]>([]);
  const [lookups, setLookups] = useState<DocumentLookups | null>(null);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | AcknowledgementStatus>("all");
  const [draftDoc, setDraftDoc] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | AcknowledgementStatus>("all");
  const [docFilter, setDocFilter] = useState("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("dueDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<AckRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm([], []));

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ackRows, docRows, empRes] = await Promise.all([
        listHrmDocumentAcknowledgments(),
        listHrmHrDocuments(),
        listHrmEmployees({ page: 1, per_page: 200 }),
      ]);

      const empOptions: EmpOption[] = empRes.rows
        .filter((e) => e.auth_user_id)
        .map((e) => ({
          authUserId: e.auth_user_id as string,
          name: e.name,
        }));

      const docOptions: DocOption[] = docRows
        .filter((d) => d.title)
        .map((d) => ({ id: d.id, title: d.title ?? "Untitled" }));

      const nextLookups = buildDocumentLookups({
        categories: [],
        documents: docRows,
        employees: empRes.rows.map((e) => ({
          name: e.name,
          auth_user_id: e.auth_user_id,
        })),
      });

      setEmployees(empOptions);
      setDocuments(docOptions);
      setLookups(nextLookups);
      setRows(ackRows.map((a) => mapAckRow(a, nextLookups)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load acknowledgments");
      setRows([]);
      setEmployees([]);
      setDocuments([]);
      setLookups(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const enriched = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        displayStatus: resolveAckStatus(r),
        overdueDays: daysOverdue(r.dueDate),
      })),
    [rows],
  );

  const filtered = useMemo(() => {
    let list = enriched;
    if (statusFilter !== "all") list = list.filter((r) => r.displayStatus === statusFilter);
    if (docFilter !== "all") list = list.filter((r) => r.documentId === docFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.employeeName.toLowerCase().includes(q) ||
          r.documentTitle.toLowerCase().includes(q) ||
          r.assignedBy.toLowerCase().includes(q),
      );
    }
    const sorted = [...list].sort((a, b) => {
      const key = sortKey === "status" ? "displayStatus" : sortKey;
      const av = a[key as keyof typeof a];
      const bv = b[key as keyof typeof b];
      const as = String(av ?? "").toLowerCase();
      const bs = String(bv ?? "").toLowerCase();
      if (as < bs) return sortDir === "asc" ? -1 : 1;
      if (as > bs) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [enriched, search, statusFilter, docFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(col: SortKey) {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(employees, documents));
    setFormOpen(true);
  }

  function openEdit(row: AckRow) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function saveForm() {
    if (!form.documentId || !form.userId) {
      toast.error("Employee and document are required");
      return;
    }
    if (!form.dueDate) {
      toast.error("Due date is required");
      return;
    }
    if (!lookups) {
      toast.error("Still loading — try again");
      return;
    }

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const apiRow = await updateHrmDocumentAcknowledgment(editId, {
          dueDate: form.dueDate,
          note: form.note.trim(),
        });
        const mapped = mapAckRow(apiRow, lookups);
        setRows((prev) => prev.map((r) => (r.id === editId ? mapped : r)));
        setViewRow((v) => (v?.id === editId ? mapped : v));
        toast.success("Assignment updated");
      } else {
        const apiRow = await createHrmDocumentAcknowledgment({
          documentId: form.documentId,
          userId: form.userId,
          dueDate: form.dueDate,
          note: form.note.trim(),
        });
        const mapped = mapAckRow(apiRow, lookups);
        setRows((prev) => [mapped, ...prev]);
        toast.success("Document assigned");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: AckRow) {
    if (!window.confirm(`Remove acknowledgment for “${row.employeeName}”?`)) return;
    try {
      await deleteHrmDocumentAcknowledgment(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Assignment deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function markAcknowledged(row: AckRow) {
    if (!lookups) return;
    try {
      const apiRow = await acknowledgeHrmDocument(row.id, row.note);
      const mapped = mapAckRow(apiRow, lookups);
      setRows((prev) => prev.map((r) => (r.id === row.id ? mapped : r)));
      setViewRow((v) => (v?.id === row.id ? mapped : v));
      toast.success("Marked as acknowledged");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Acknowledge failed");
    }
  }

  function openDocument(row: AckRow) {
    toast.message(row.documentTitle, { description: "Document preview not wired yet" });
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
    return <ContentDataSkeleton label="Loading acknowledgments…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Acknowledgments
        </h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Assign Document
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
                onChange={(e) =>
                  setDraftStatus(e.target.value as "all" | AcknowledgementStatus)
                }
                className={fieldClass}
              >
                <option value="all">All</option>
                {ACK_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[200px] flex-col gap-1 text-xs text-muted-foreground">
              Document
              <select
                value={draftDoc}
                onChange={(e) => setDraftDoc(e.target.value)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
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
                  setDocFilter(draftDoc);
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
                  setDraftDoc("all");
                  setStatusFilter("all");
                  setDocFilter("all");
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
                <SortHeader label="Employee" col="employeeName" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Acknowledged" col="acknowledgedAt" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Due Date" col="dueDate" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Assigned By" col="assignedBy" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Document
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No acknowledgments found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-none border border-border bg-muted/40 text-[10px] font-semibold text-muted-foreground">
                        {initials(row.employeeName)}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{row.employeeName}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <FileText className="size-3 shrink-0" />
                          <span className="truncate">{row.documentTitle}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none gap-1 text-[10px] font-normal",
                        statusBadgeClass(row.displayStatus),
                      )}
                    >
                      {row.displayStatus === "acknowledged" ? (
                        <Check className="size-3" />
                      ) : row.displayStatus === "overdue" ? (
                        <AlertTriangle className="size-3" />
                      ) : null}
                      {ACK_STATUS_LABEL[row.displayStatus]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-foreground">
                    {row.acknowledgedAt || "–"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 tabular-nums text-foreground">
                      <Calendar className="size-3.5 shrink-0 text-muted-foreground" />
                      {row.dueDate}
                    </div>
                    {row.displayStatus === "overdue" && row.overdueDays > 0 ? (
                      <div className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                        {row.overdueDays} {row.overdueDays === 1 ? "day" : "days"} overdue
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-foreground">{row.assignedBy}</td>
                  <td className="px-3 py-2.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-none text-sky-600 dark:text-sky-400"
                      onClick={() => openDocument(row)}
                      aria-label="Open document"
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
                          {row.displayStatus !== "acknowledged" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-none text-emerald-600 dark:text-emerald-400"
                              onClick={() => void markAcknowledged(row)}
                              aria-label="Mark acknowledged"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
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
          title="Acknowledgment details"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">Acknowledgment Details</SheetTitle>
            <SheetDescription className="sr-only">View acknowledgment</SheetDescription>
          </SheetHeader>
          {viewRow ? (
            <div className="flex-1 space-y-4 overflow-auto p-4">
              <div>
                <div className="text-base font-semibold text-foreground">
                  {viewRow.employeeName}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <FileText className="size-3.5" />
                  {viewRow.documentTitle}
                </div>
              </div>
              <dl className="grid gap-3 text-sm">
                {(
                  [
                    ["Status", ACK_STATUS_LABEL[resolveAckStatus(viewRow)]],
                    ["Acknowledged", viewRow.acknowledgedAt || "–"],
                    ["Due Date", viewRow.dueDate],
                    ["Assigned By", viewRow.assignedBy],
                    ["Assigned At", viewRow.assignedAt],
                    ["Note", viewRow.note || "—"],
                  ] as const
                ).map(([k, v]) => (
                  <div
                    key={k}
                    className="grid grid-cols-[110px_1fr] gap-2 border-b border-border/60 pb-2"
                  >
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
              {canWrite && resolveAckStatus(viewRow) !== "acknowledged" ? (
                <Button
                  type="button"
                  size="sm"
                  className={cn("h-9", GREEN_BTN)}
                  onClick={() => {
                    void markAcknowledged(viewRow);
                    setViewRow(null);
                  }}
                >
                  <CheckCircle2 className="size-3.5" />
                  Mark Acknowledged
                </Button>
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
          className="flex w-[460px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title={formMode === "edit" ? "Edit Assignment" : "Assign Document"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Assignment" : "Assign Document"}
            </SheetTitle>
            <SheetDescription className="sr-only">Acknowledgment form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            {formMode === "edit" ? (
              <>
                <div className="rounded-none border border-border bg-muted/20 px-3 py-2 text-sm">
                  <div className="text-xs text-muted-foreground">Employee</div>
                  <div className="font-medium text-foreground">
                    {employees.find((e) => e.authUserId === form.userId)?.name ??
                      rows.find((r) => r.id === editId)?.employeeName ??
                      "—"}
                  </div>
                </div>
                <div className="rounded-none border border-border bg-muted/20 px-3 py-2 text-sm">
                  <div className="text-xs text-muted-foreground">Document</div>
                  <div className="font-medium text-foreground">
                    {documents.find((d) => d.id === form.documentId)?.title ??
                      rows.find((r) => r.id === editId)?.documentTitle ??
                      "—"}
                  </div>
                </div>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Employee *
                  <select
                    value={form.userId}
                    onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                    className={fieldClass}
                  >
                    {employees.length === 0 ? (
                      <option value="">No employees with login</option>
                    ) : (
                      employees.map((e) => (
                        <option key={e.authUserId} value={e.authUserId}>
                          {e.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Document *
                  <select
                    value={form.documentId}
                    onChange={(e) => setForm((f) => ({ ...f, documentId: e.target.value }))}
                    className={fieldClass}
                  >
                    {documents.length === 0 ? (
                      <option value="">No documents</option>
                    ) : (
                      documents.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </>
            )}
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Due Date *
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                className="h-9 rounded-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Note
              <Textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className="min-h-[72px] rounded-none"
              />
            </label>
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              onClick={() => void saveForm()}
              disabled={
                saving ||
                (formMode === "add" && (employees.length === 0 || documents.length === 0))
              }
            >
              {saving ? "Saving…" : formMode === "edit" ? "Save Changes" : "Assign"}
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
