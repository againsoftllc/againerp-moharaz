"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Code2,
  Download,
  Eye,
  FileText,
  Filter,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import {
  DOC_TEMPLATE_FORMAT_OPTIONS,
  DOC_TEMPLATE_STATUS_LABEL,
  DOC_TEMPLATE_STATUS_OPTIONS,
  parseList,
  type DocumentTemplate,
  type DocumentTemplateFormat,
  type DocumentTemplateStatus,
} from "@/lib/mock-data/hrm-document-templates";
import {
  apiTemplateToView,
  buildDocumentLookups,
  createHrmDocumentTemplate,
  deleteHrmDocumentTemplate,
  listHrmDocumentCategories,
  listHrmDocumentTemplates,
  updateHrmDocumentTemplate,
  type DocumentLookups,
} from "@/lib/api/hrm-documents";
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

type SortKey = "name" | "category" | "status" | "createdAt" | "contentLength";
type SortDir = "asc" | "desc";

type TemplateRow = DocumentTemplate & { categoryId: string };

type CategoryOption = { id: string; name: string };

type FormState = {
  name: string;
  description: string;
  categoryId: string;
  placeholders: string;
  content: string;
  fileFormat: DocumentTemplateFormat;
  isDefault: boolean;
  status: DocumentTemplateStatus;
};

function emptyForm(categoryId = ""): FormState {
  return {
    name: "",
    description: "",
    categoryId,
    placeholders: "employee_name, company_name, issue_date",
    content: "Document for {{employee_name}} issued by {{company_name}} on {{issue_date}}.",
    fileFormat: "PDF",
    isDefault: false,
    status: "active",
  };
}

function formFromRow(row: TemplateRow): FormState {
  return {
    name: row.name,
    description: row.description,
    categoryId: row.categoryId,
    placeholders: row.placeholders.join(", "),
    content: row.content,
    fileFormat: row.fileFormat,
    isDefault: row.isDefault,
    status: row.status,
  };
}

function mapTemplateRow(
  apiRow: Awaited<ReturnType<typeof listHrmDocumentTemplates>>[number],
  lookups: Pick<DocumentLookups, "categoryName" | "categoryColor">,
): TemplateRow {
  return {
    ...apiTemplateToView(apiRow, lookups),
    categoryId: apiRow.category_id ?? "",
  };
}

function statusBadgeClass(status: DocumentTemplateStatus) {
  return status === "active"
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "border-border bg-muted/40 text-muted-foreground";
}

export function HrmDocumentTemplates() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [lookups, setLookups] = useState<Pick<
    DocumentLookups,
    "categoryName" | "categoryColor"
  > | null>(null);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | DocumentTemplateStatus>("all");
  const [draftCategory, setDraftCategory] = useState<string>("all");
  const [draftFormat, setDraftFormat] = useState<"all" | DocumentTemplateFormat>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | DocumentTemplateStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [formatFilter, setFormatFilter] = useState<"all" | DocumentTemplateFormat>("all");
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
      const [catRows, templateRows] = await Promise.all([
        listHrmDocumentCategories(),
        listHrmDocumentTemplates(),
      ]);
      const nextLookups = buildDocumentLookups({ categories: catRows });
      setCategories(catRows.map((c) => ({ id: c.id, name: c.name })));
      setLookups(nextLookups);
      setRows(templateRows.map((t) => mapTemplateRow(t, nextLookups)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load templates");
      setRows([]);
      setCategories([]);
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
    if (categoryFilter !== "all") list = list.filter((r) => r.categoryId === categoryFilter);
    if (formatFilter !== "all") list = list.filter((r) => r.fileFormat === formatFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q),
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
  }, [rows, search, statusFilter, categoryFilter, formatFilter, sortKey, sortDir]);

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
    setForm(emptyForm(categories[0]?.id ?? ""));
    setFormOpen(true);
  }

  function openEdit(row: TemplateRow) {
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
    if (!lookups) {
      toast.error("Still loading — try again");
      return;
    }

    const placeholders = parseList(form.placeholders);
    const input = {
      name,
      description: form.description.trim(),
      categoryId: form.categoryId || null,
      placeholders,
      content,
      fileFormat: form.fileFormat,
      isDefault: form.isDefault,
      status: form.status,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const apiRow = await updateHrmDocumentTemplate(editId, input);
        const mapped = mapTemplateRow(apiRow, lookups);
        setRows((prev) => {
          let next = prev.map((r) => (r.id === editId ? mapped : r));
          if (form.isDefault) {
            next = next.map((r) => (r.id === editId ? r : { ...r, isDefault: false }));
          }
          return next;
        });
        setViewRow((v) => (v?.id === editId ? mapped : v));
        toast.success("Template updated");
      } else {
        const apiRow = await createHrmDocumentTemplate(input);
        const mapped = mapTemplateRow(apiRow, lookups);
        setRows((prev) => {
          let next = [mapped, ...prev];
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
    if (!window.confirm(`Delete template “${row.name}”?`)) return;
    try {
      await deleteHrmDocumentTemplate(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Template deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function download(row: TemplateRow) {
    toast.success(`Download started: ${row.name}.${row.fileFormat.toLowerCase()}`);
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
          Document Templates
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
                  setDraftStatus(e.target.value as "all" | DocumentTemplateStatus)
                }
                className={fieldClass}
              >
                <option value="all">All</option>
                {DOC_TEMPLATE_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[180px] flex-col gap-1 text-xs text-muted-foreground">
              Category
              <select
                value={draftCategory}
                onChange={(e) => setDraftCategory(e.target.value)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[120px] flex-col gap-1 text-xs text-muted-foreground">
              Format
              <select
                value={draftFormat}
                onChange={(e) =>
                  setDraftFormat(e.target.value as "all" | DocumentTemplateFormat)
                }
                className={fieldClass}
              >
                <option value="all">All</option>
                {DOC_TEMPLATE_FORMAT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
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
                  setCategoryFilter(draftCategory);
                  setFormatFilter(draftFormat);
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
                  setDraftCategory("all");
                  setDraftFormat("all");
                  setStatusFilter("all");
                  setCategoryFilter("all");
                  setFormatFilter("all");
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
                <SortHeader label="Category" col="category" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Placeholders
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Format
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
                Actions
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
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-none border border-border"
                        style={{
                          backgroundColor: `${row.accentColor}18`,
                          color: row.accentColor,
                        }}
                      >
                        <FileText className="size-3.5" />
                      </span>
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
                  <td className="px-3 py-2.5 text-foreground">{row.category}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1 text-sm text-foreground">
                      <Code2 className="size-3.5 text-muted-foreground" />
                      {row.placeholders.length}{" "}
                      {row.placeholders.length === 1 ? "placeholder" : "placeholders"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-foreground">{row.fileFormat}</td>
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
                      {DOC_TEMPLATE_STATUS_LABEL[row.status]}
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
          className="flex w-[440px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title="Template details"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">Template Details</SheetTitle>
            <SheetDescription className="sr-only">View document template</SheetDescription>
          </SheetHeader>
          {viewRow ? (
            <div className="flex-1 space-y-4 overflow-auto p-4">
              <div className="flex items-start gap-2">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-none border border-border"
                  style={{
                    backgroundColor: `${viewRow.accentColor}18`,
                    color: viewRow.accentColor,
                  }}
                >
                  <FileText className="size-4" />
                </span>
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
              </div>
              <dl className="grid gap-3 text-sm">
                {(
                  [
                    ["Category", viewRow.category],
                    ["Format", viewRow.fileFormat],
                    ["Status", DOC_TEMPLATE_STATUS_LABEL[viewRow.status]],
                    ["Created", viewRow.createdAt],
                    ["Placeholders", String(viewRow.placeholders.length)],
                    ["Content Length", `${viewRow.content.length} characters`],
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
                  Placeholders
                </div>
                <div className="flex flex-wrap gap-1">
                  {viewRow.placeholders.map((p) => (
                    <Badge
                      key={p}
                      variant="outline"
                      className="rounded-none text-[10px] font-normal"
                    >
                      {`{{${p}}}`}
                    </Badge>
                  ))}
                </div>
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
            <SheetDescription className="sr-only">Document template form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Template Name *
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="e.g. Employment Offer Letter"
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
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Category *
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                  className={fieldClass}
                >
                  {categories.length === 0 ? (
                    <option value="">No categories</option>
                  ) : (
                    categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Format *
                <select
                  value={form.fileFormat}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      fileFormat: e.target.value as DocumentTemplateFormat,
                    }))
                  }
                  className={fieldClass}
                >
                  {DOC_TEMPLATE_FORMAT_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Placeholders
              <Textarea
                value={form.placeholders}
                onChange={(e) => setForm((f) => ({ ...f, placeholders: e.target.value }))}
                className="min-h-[56px] rounded-none"
                placeholder="Comma-separated, e.g. employee_name, issue_date"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Content *
              <Textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                className="min-h-[140px] rounded-none font-mono text-xs"
                placeholder="Use {{placeholder_name}}"
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
                    status: e.target.value as DocumentTemplateStatus,
                  }))
                }
                className={fieldClass}
              >
                {DOC_TEMPLATE_STATUS_OPTIONS.map((o) => (
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
              onClick={() => void saveForm()}
              disabled={saving || categories.length === 0}
            >
              {saving ? "Saving…" : formMode === "edit" ? "Save Changes" : "Create Template"}
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
