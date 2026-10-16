"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Code2,
  Download,
  Eye,
  FileText,
  Filter,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import {
  CONTRACT_TEMPLATE_STATUS_LABEL,
  CONTRACT_TEMPLATE_STATUS_OPTIONS,
  CONTRACT_TYPE_OPTIONS,
  parseList,
  type ContractTemplate,
  type ContractTemplateStatus,
} from "@/lib/mock-data/hrm-contract-templates";
import {
  apiContractTemplateToView,
  buildContractLookups,
  createHrmContractTemplate,
  deleteHrmContractTemplate,
  listHrmContractTemplates,
  listHrmContractTypes,
  updateHrmContractTemplate,
  type ContractLookups,
} from "@/lib/api/hrm-contracts";
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

type SortKey = "name" | "contractType" | "status" | "createdAt" | "contentLength";
type SortDir = "asc" | "desc";

type TemplateRow = ContractTemplate & { contractTypeId: string };

type ContractTypeOption = { id: string; name: string };

type FormState = {
  name: string;
  description: string;
  contractTypeId: string;
  variables: string;
  clauses: string;
  content: string;
  isDefault: boolean;
  status: ContractTemplateStatus;
};

function emptyForm(contractTypeId = ""): FormState {
  return {
    name: "",
    description: "",
    contractTypeId,
    variables: "employee_name, company_name, start_date",
    clauses: "Term, Role, Pay",
    content: "Agreement between {{company_name}} and {{employee_name}} effective {{start_date}}.",
    isDefault: false,
    status: "active",
  };
}

function formFromRow(row: TemplateRow): FormState {
  return {
    name: row.name,
    description: row.description,
    contractTypeId: row.contractTypeId,
    variables: row.variables.join(", "),
    clauses: row.clauses.join(", "),
    content: row.content,
    isDefault: row.isDefault,
    status: row.status,
  };
}

function mapTemplateRow(
  apiRow: Awaited<ReturnType<typeof listHrmContractTemplates>>[number],
  lookups: Pick<ContractLookups, "typeName">,
): TemplateRow {
  return {
    ...apiContractTemplateToView(apiRow, lookups),
    contractTypeId: apiRow.contract_type_id ?? "",
  };
}

function statusBadgeClass(status: ContractTemplateStatus) {
  return status === "active"
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "border-border bg-muted/40 text-muted-foreground";
}

export function HrmContractTemplates() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [contractTypes, setContractTypes] = useState<ContractTypeOption[]>([]);
  const [lookups, setLookups] = useState<Pick<ContractLookups, "typeName"> | null>(
    null,
  );

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | ContractTemplateStatus>("all");
  const [draftType, setDraftType] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ContractTemplateStatus>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [viewRow, setViewRow] = useState<TemplateRow | null>(null);
  const [previewRow, setPreviewRow] = useState<TemplateRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [typeRows, templateRows] = await Promise.all([
        listHrmContractTypes(),
        listHrmContractTemplates(),
      ]);
      const nextLookups = buildContractLookups({ types: typeRows });
      setContractTypes(typeRows.map((t) => ({ id: t.id, name: t.name })));
      setLookups(nextLookups);
      setRows(templateRows.map((t) => mapTemplateRow(t, nextLookups)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load templates");
      setRows([]);
      setContractTypes([]);
      setLookups(null);
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
    if (typeFilter !== "all") {
      list = list.filter((r) => r.contractTypeId === typeFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.contractType.toLowerCase().includes(q),
      );
    }
    const sorted = [...list].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortKey === "contentLength") {
        av = a.content.length;
        bv = b.content.length;
      } else {
        av = a[sortKey];
        bv = b[sortKey];
      }
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return sortDir === "asc" ? -1 : 1;
      if (as > bs) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [rows, search, statusFilter, typeFilter, sortKey, sortDir]);

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
    setForm(emptyForm(contractTypes[0]?.id ?? ""));
    setFormOpen(true);
  }

  function openEdit(row: TemplateRow) {
    if (row.locked) {
      toast.error("Template is locked");
      return;
    }
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function saveForm() {
    const name = form.name.trim();
    if (!name) {
      toast.error("Template name is required");
      return;
    }
    const content = form.content.trim();
    if (!content) {
      toast.error("Template content is required");
      return;
    }
    if (!form.contractTypeId) {
      toast.error("Contract type is required");
      return;
    }
    const variables = parseList(form.variables);
    const clauses = parseList(form.clauses);

    const input = {
      name,
      description: form.description.trim(),
      contractTypeId: form.contractTypeId,
      variables,
      clauses,
      content,
      isDefault: form.isDefault,
      status: form.status,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId && lookups) {
        const apiRow = await updateHrmContractTemplate(editId, input);
        const mapped = mapTemplateRow(apiRow, lookups);
        setRows((prev) => {
          let next = prev.map((r) =>
            r.id === editId ? { ...mapped, locked: r.locked } : r,
          );
          if (form.isDefault) {
            next = next.map((r) =>
              r.id === editId ? r : { ...r, isDefault: false },
            );
          }
          return next;
        });
        toast.success("Template updated");
      } else if (lookups) {
        const apiRow = await createHrmContractTemplate(input);
        const mapped = mapTemplateRow(apiRow, lookups);
        setRows((prev) => {
          let next = [{ ...mapped, locked: false }, ...prev];
          if (form.isDefault) {
            next = next.map((r) => (r.id === mapped.id ? r : { ...r, isDefault: false }));
          }
          return next;
        });
        toast.success("Template added");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: TemplateRow) {
    if (row.locked) {
      toast.error("Unlock the template before deleting");
      return;
    }
    if (!window.confirm(`Delete template “${row.name}”?`)) return;
    try {
      await deleteHrmContractTemplate(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Template deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function toggleLock(row: TemplateRow) {
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, locked: !r.locked } : r)),
    );
    toast.success(row.locked ? "Template unlocked" : "Template locked");
  }

  function download(row: TemplateRow) {
    toast.success(`Download started: ${row.name}`);
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
    return <ContentDataSkeleton label="Loading templates…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Contract Templates
        </h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Template
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
                  setDraftStatus(e.target.value as "all" | ContractTemplateStatus)
                }
                className={fieldClass}
              >
                <option value="all">All</option>
                {CONTRACT_TEMPLATE_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[180px] flex-col gap-1 text-xs text-muted-foreground">
              Contract Type
              <select
                value={draftType}
                onChange={(e) => setDraftType(e.target.value)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {contractTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
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
                  setTypeFilter(draftType);
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
                  setStatusFilter("all");
                  setTypeFilter("all");
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
                <SortHeader label="Template Name" col="name" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Contract Type" col="contractType" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Variables
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Clauses
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Content Length" col="contentLength" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Created" col="createdAt" />
              </th>
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No templates found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-start gap-1.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          {row.name}
                          {row.isDefault ? (
                            <Star
                              className="size-3.5 shrink-0 fill-amber-400 text-amber-400"
                              aria-label="Default template"
                            />
                          ) : null}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {row.description || "—"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-foreground">{row.contractType}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1 text-sm text-foreground">
                      <Code2 className="size-3.5 text-muted-foreground" />
                      {row.variables.length}{" "}
                      {row.variables.length === 1 ? "variable" : "variables"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-foreground">
                    {row.clauses.length} {row.clauses.length === 1 ? "clause" : "clauses"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-foreground">
                    {row.content.length} characters
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-none text-[10px] font-normal",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {CONTRACT_TEMPLATE_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-foreground">{row.createdAt}</td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-0.5">
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-none text-violet-600 dark:text-violet-400"
                        onClick={() => setPreviewRow(row)}
                        aria-label="Preview content"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-none text-emerald-600 dark:text-emerald-400"
                        onClick={() => download(row)}
                        aria-label="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
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
                            aria-label={row.locked ? "Unlock" : "Lock"}
                          >
                            {row.locked ? (
                              <Lock className="h-3.5 w-3.5" />
                            ) : (
                              <LockOpen className="h-3.5 w-3.5" />
                            )}
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
          className="flex w-[440px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title="Template details"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">Template Details</SheetTitle>
            <SheetDescription className="sr-only">View contract template</SheetDescription>
          </SheetHeader>
          {viewRow ? (
            <div className="flex-1 space-y-4 overflow-auto p-4">
              <div>
                <div className="flex items-center gap-1.5 text-base font-semibold text-foreground">
                  {viewRow.name}
                  {viewRow.isDefault ? (
                    <Star className="size-3.5 fill-amber-400 text-amber-400" />
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {viewRow.description || "—"}
                </p>
              </div>
              <dl className="grid gap-3 text-sm">
                {(
                  [
                    ["Contract Type", viewRow.contractType],
                    ["Status", CONTRACT_TEMPLATE_STATUS_LABEL[viewRow.status]],
                    ["Created", viewRow.createdAt],
                    ["Variables", `${viewRow.variables.length}`],
                    ["Clauses", `${viewRow.clauses.length}`],
                    ["Content Length", `${viewRow.content.length} characters`],
                    ["Locked", viewRow.locked ? "Yes" : "No"],
                  ] as const
                ).map(([k, v]) => (
                  <div
                    key={k}
                    className="grid grid-cols-[120px_1fr] gap-2 border-b border-border/60 pb-2"
                  >
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Variables
                </div>
                <div className="flex flex-wrap gap-1">
                  {viewRow.variables.map((v) => (
                    <Badge
                      key={v}
                      variant="outline"
                      className="rounded-none text-[10px] font-normal"
                    >
                      {`{{${v}}}`}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Clauses
                </div>
                <ul className="list-inside list-disc text-sm text-foreground">
                  {viewRow.clauses.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={!!previewRow} onOpenChange={(o) => !o && setPreviewRow(null)}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[480px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title="Template content"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">Template Content</SheetTitle>
            <SheetDescription className="sr-only">Preview template body</SheetDescription>
          </SheetHeader>
          {previewRow ? (
            <div className="flex-1 overflow-auto p-4">
              <div className="mb-2 text-sm font-medium text-foreground">{previewRow.name}</div>
              <pre className="whitespace-pre-wrap rounded-none border border-border bg-muted/20 p-3 font-mono text-xs leading-relaxed text-foreground">
                {previewRow.content}
              </pre>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[480px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title={formMode === "edit" ? "Edit Template" : "Add Template"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Template" : "Add Template"}
            </SheetTitle>
            <SheetDescription className="sr-only">Contract template form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Template Name *
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="e.g. Standard Permanent Employment Contract"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Description
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="min-h-[64px] rounded-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Contract Type *
              <select
                value={form.contractTypeId}
                onChange={(e) => setForm((f) => ({ ...f, contractTypeId: e.target.value }))}
                className={fieldClass}
              >
                {contractTypes.length === 0 ? (
                  <option value="">No contract types</option>
                ) : (
                  contractTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Variables
              <Textarea
                value={form.variables}
                onChange={(e) => setForm((f) => ({ ...f, variables: e.target.value }))}
                className="min-h-[56px] rounded-none"
                placeholder="Comma-separated, e.g. employee_name, start_date"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Clauses
              <Textarea
                value={form.clauses}
                onChange={(e) => setForm((f) => ({ ...f, clauses: e.target.value }))}
                className="min-h-[56px] rounded-none"
                placeholder="Comma-separated clause titles"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Content *
              <Textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                className="min-h-[140px] rounded-none font-mono text-xs"
                placeholder="Use {{variable_name}} placeholders"
              />
              <span className="tabular-nums text-[10px] text-muted-foreground">
                {form.content.length} characters
              </span>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Status *
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as ContractTemplateStatus,
                  }))
                }
                className={fieldClass}
              >
                {CONTRACT_TEMPLATE_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                className="size-4 rounded-none border-border"
              />
              Set as default template
            </label>
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              disabled={saving}
              onClick={() => void saveForm()}
            >
              {formMode === "edit" ? "Save Changes" : "Create Template"}
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
    </div>
  );
}
