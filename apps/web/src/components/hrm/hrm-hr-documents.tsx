"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell,
  Box,
  Clock,
  Download,
  Eye,
  Filter,
  Globe,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  HR_DOCUMENT_STATUS_LABEL,
  HR_DOCUMENT_STATUS_OPTIONS,
  isExpiringSoon,
  pctOfTotal,
  type HrDocument,
  type HrDocumentStatus,
} from "@/lib/mock-data/hrm-hr-documents";
import {
  apiHrDocumentToView,
  archiveHrmHrDocument,
  buildDocumentLookups,
  createHrmHrDocument,
  deleteHrmHrDocument,
  listHrmDocumentCategories,
  listHrmHrDocuments,
  publishHrmHrDocument,
  updateHrmHrDocument,
  type DocumentLookups,
} from "@/lib/api/hrm-documents";
import { uploadCatalogMediaFiles } from "@/lib/api/use-catalog-media";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

type HrDocumentRow = HrDocument & {
  categoryId: string;
  fileSizeBytes: number;
  filePath: string;
};

type CategoryOption = { id: string; name: string; color: string };

type FormState = {
  title: string;
  description: string;
  categoryId: string;
  version: string;
  status: HrDocumentStatus;
  requiresAcknowledgment: boolean;
  fileName: string;
  fileType: string;
  fileSize: string;
  filePath: string;
  fileSizeBytes: number;
  effectiveDate: string;
  expiryDate: string;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function parseFileSizeBytes(raw: string, fallback = 0): number {
  const s = raw.trim();
  if (!s || s === "—") return fallback;
  const m = s.match(/^([\d.]+)\s*(B|KB|MB)?$/i);
  if (!m) return fallback;
  const n = parseFloat(m[1]!);
  const unit = (m[2] || "B").toUpperCase();
  if (unit === "KB") return Math.round(n * 1024);
  if (unit === "MB") return Math.round(n * 1024 * 1024);
  return Math.round(n);
}

function emptyForm(categoryId = ""): FormState {
  return {
    title: "",
    description: "",
    categoryId,
    version: "1.0",
    status: "draft",
    requiresAcknowledgment: false,
    fileName: "",
    fileType: "PDF",
    fileSize: "",
    filePath: "",
    fileSizeBytes: 0,
    effectiveDate: todayYmd(),
    expiryDate: "",
  };
}

function formFromRow(row: HrDocumentRow): FormState {
  return {
    title: row.title,
    description: row.description,
    categoryId: row.categoryId,
    version: row.version,
    status: row.status,
    requiresAcknowledgment: row.requiresAcknowledgment,
    fileName: row.fileName,
    fileType: row.fileType,
    fileSize: row.fileSize === "—" ? "" : row.fileSize,
    filePath: row.filePath,
    fileSizeBytes: row.fileSizeBytes,
    effectiveDate: row.effectiveDate,
    expiryDate: row.expiryDate,
  };
}

function mapDocRow(
  apiRow: Awaited<ReturnType<typeof listHrmHrDocuments>>[number],
  lookups: Pick<DocumentLookups, "categoryName" | "categoryColor">,
): HrDocumentRow {
  return {
    ...apiHrDocumentToView(apiRow, lookups),
    categoryId: apiRow.category_id ?? "",
    fileSizeBytes: apiRow.file_size ?? 0,
    filePath: apiRow.file_path ?? "",
  };
}

function statusBadgeClass(status: HrDocumentStatus) {
  switch (status) {
    case "published":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case "archived":
      return "border-border bg-muted/40 text-muted-foreground";
    default:
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  iconClass,
  progress,
  progressClass,
  barClass,
}: {
  title: string;
  value: number;
  subtitle?: string;
  icon: ReactNode;
  iconClass: string;
  progress?: number;
  progressClass?: string;
  barClass?: string;
}) {
  return (
    <div className="rounded-none border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{title}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
          {subtitle ? (
            <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-none border",
            iconClass,
          )}
        >
          {icon}
        </div>
      </div>
      {typeof progress === "number" ? (
        <div className={cn("mt-3 h-1.5 w-full rounded-none bg-muted", barClass)}>
          <div
            className={cn("h-full rounded-none", progressClass)}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      ) : (
        <div className={cn("mt-3 h-1 w-full rounded-none bg-foreground/80", barClass)} />
      )}
    </div>
  );
}

export function HrmHrDocuments() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<HrDocumentRow[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [lookups, setLookups] = useState<Pick<
    DocumentLookups,
    "categoryName" | "categoryColor"
  > | null>(null);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | HrDocumentStatus>("all");
  const [draftCategory, setDraftCategory] = useState<string>("all");
  const [draftAck, setDraftAck] = useState<"all" | "yes" | "no">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | HrDocumentStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [ackFilter, setAckFilter] = useState<"all" | "yes" | "no">("all");
  const [perPage, setPerPage] = useState(12);
  const [page, setPage] = useState(1);

  const [viewRow, setViewRow] = useState<HrDocumentRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [catRows, docRows] = await Promise.all([
        listHrmDocumentCategories(),
        listHrmHrDocuments(),
      ]);
      const nextLookups = buildDocumentLookups({ categories: catRows });
      setCategories(
        catRows.map((c) => ({ id: c.id, name: c.name, color: c.color || "#3b82f6" })),
      );
      setLookups(nextLookups);
      setRows(docRows.map((d) => mapDocRow(d, nextLookups)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load documents");
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

  const stats = useMemo(() => {
    const total = rows.length;
    const published = rows.filter((r) => r.status === "published").length;
    const expiring = rows.filter((r) => isExpiringSoon(r)).length;
    const needsAck = rows.filter((r) => r.requiresAcknowledgment).length;
    return {
      total,
      published,
      publishedPct: pctOfTotal(published, total),
      expiring,
      needsAck,
      needsAckPct: pctOfTotal(needsAck, total),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (categoryFilter !== "all") list = list.filter((r) => r.categoryId === categoryFilter);
    if (ackFilter === "yes") list = list.filter((r) => r.requiresAcknowledgment);
    if (ackFilter === "no") list = list.filter((r) => !r.requiresAcknowledgment);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.fileName.toLowerCase().includes(q) ||
          r.uploadedBy.toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, search, statusFilter, categoryFilter, ackFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(categories[0]?.id ?? ""));
    setFormOpen(true);
  }

  function openEdit(row: HrDocumentRow) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function saveForm() {
    const title = form.title.trim();
    if (!title) {
      toast.error("Title is required");
      return;
    }
    if (!lookups) {
      toast.error("Still loading — try again");
      return;
    }

    const version = form.version.trim() || "1.0";
    const fileName =
      form.fileName.trim() ||
      `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${(form.fileType || "pdf").toLowerCase()}`;
    const prevRow = editId ? rows.find((r) => r.id === editId) : undefined;
    const fileSizeBytes =
      form.fileSizeBytes > 0
        ? form.fileSizeBytes
        : parseFileSizeBytes(form.fileSize, prevRow?.fileSizeBytes ?? 0);

    const input = {
      title,
      description: form.description.trim(),
      categoryId: form.categoryId || null,
      fileName,
      filePath: form.filePath.trim() || undefined,
      fileType: form.fileType.trim() || "PDF",
      fileSize: fileSizeBytes,
      version,
      effectiveDate: form.effectiveDate || undefined,
      expiryDate: form.expiryDate || undefined,
      requiresAcknowledgment: form.requiresAcknowledgment,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const apiRow = await updateHrmHrDocument(editId, {
          ...input,
          status: form.status,
        });
        const mapped = mapDocRow(apiRow, lookups);
        setRows((prev) => prev.map((r) => (r.id === editId ? mapped : r)));
        setViewRow((v) => (v?.id === editId ? mapped : v));
        toast.success("Document updated");
      } else {
        const apiRow = await createHrmHrDocument(input);
        const mapped = mapDocRow(apiRow, lookups);
        setRows((prev) => [mapped, ...prev]);
        toast.success("Document uploaded");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: HrDocumentRow) {
    if (!window.confirm(`Delete document “${row.title}”?`)) return;
    try {
      await deleteHrmHrDocument(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Document deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function publishDoc(row: HrDocumentRow) {
    if (!lookups) return;
    try {
      const apiRow = await publishHrmHrDocument(row.id);
      const mapped = mapDocRow(apiRow, lookups);
      setRows((prev) => prev.map((r) => (r.id === row.id ? mapped : r)));
      setViewRow((v) => (v?.id === row.id ? mapped : v));
      toast.success("Document published");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish failed");
    }
  }

  async function archiveDoc(row: HrDocumentRow) {
    if (!lookups) return;
    try {
      const apiRow = await archiveHrmHrDocument(row.id);
      const mapped = mapDocRow(apiRow, lookups);
      setRows((prev) => prev.map((r) => (r.id === row.id ? mapped : r)));
      setViewRow((v) => (v?.id === row.id ? mapped : v));
      toast.success("Document archived");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Archive failed");
    }
  }

  function download(row: HrDocumentRow) {
    if (!row.filePath) {
      toast.error("No file attached to this document");
      return;
    }
    window.open(row.filePath, "_blank", "noopener,noreferrer");
  }

  async function onPickFile(file: File | null) {
    if (!file) return;
    setSaving(true);
    try {
      const [media] = await uploadCatalogMediaFiles([file]);
      if (!media) throw new Error("Upload returned no file");
      const ext = file.name.includes(".")
        ? file.name.split(".").pop()?.toUpperCase() || "FILE"
        : "FILE";
      setForm((f) => ({
        ...f,
        fileName: media.name || file.name,
        fileType: ext.slice(0, 50),
        filePath: media.url,
        fileSizeBytes: file.size,
        fileSize:
          file.size < 1024
            ? `${file.size} B`
            : file.size < 1024 * 1024
              ? `${(file.size / 1024).toFixed(1)} KB`
              : `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      }));
      toast.success("File uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  const fieldClass =
    "h-9 w-full rounded-none border border-border bg-background px-2 text-sm text-foreground";

  if (loading) {
    return <ContentDataSkeleton label="Loading documents…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">HR Documents</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Upload Document
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Documents"
          value={stats.total}
          icon={<Box className="size-4" />}
          iconClass="border-border bg-muted/50 text-muted-foreground"
          barClass="bg-foreground/80"
        />
        <KpiCard
          title="Published"
          value={stats.published}
          subtitle={`${stats.publishedPct}% of total`}
          icon={<Globe className="size-4" />}
          iconClass="border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
          progress={stats.publishedPct}
          progressClass="bg-sky-500"
        />
        <KpiCard
          title="Expiring Soon"
          value={stats.expiring}
          subtitle="Within 30 days"
          icon={<Clock className="size-4" />}
          iconClass="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          progress={stats.total ? pctOfTotal(stats.expiring, stats.total) : 0}
          progressClass="bg-muted-foreground/40"
        />
        <KpiCard
          title="Needs Acknowledgment"
          value={stats.needsAck}
          subtitle={`${stats.needsAckPct}% of total`}
          icon={<Bell className="size-4" />}
          iconClass="border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
          progress={stats.needsAckPct}
          progressClass="bg-red-500"
        />
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
            {[12, 24, 48].map((n) => (
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
                onChange={(e) => setDraftStatus(e.target.value as "all" | HrDocumentStatus)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {HR_DOCUMENT_STATUS_OPTIONS.map((s) => (
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
            <label className="flex min-w-[160px] flex-col gap-1 text-xs text-muted-foreground">
              Acknowledgment
              <select
                value={draftAck}
                onChange={(e) => setDraftAck(e.target.value as "all" | "yes" | "no")}
                className={fieldClass}
              >
                <option value="all">All</option>
                <option value="yes">Required</option>
                <option value="no">Not required</option>
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
                  setAckFilter(draftAck);
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
                  setDraftAck("all");
                  setStatusFilter("all");
                  setCategoryFilter("all");
                  setAckFilter("all");
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

      {pageRows.length === 0 ? (
        <div className="rounded-none border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          No documents found.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {pageRows.map((row) => (
            <article
              key={row.id}
              className="flex flex-col rounded-none border border-border bg-card"
              style={{ borderTopWidth: 3, borderTopColor: row.accentColor }}
            >
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold leading-snug text-foreground">
                    {row.title}
                  </h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 rounded-none text-sky-600 dark:text-sky-400"
                    onClick={() => setViewRow(row)}
                    aria-label="Quick view"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Last Update: {row.lastUpdate}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="rounded-none border-border text-[10px] font-normal"
                    style={{
                      borderColor: `${row.accentColor}55`,
                      backgroundColor: `${row.accentColor}18`,
                      color: row.accentColor,
                    }}
                  >
                    {row.category}
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                    v.{row.version}
                    {row.requiresAcknowledgment ? (
                      <Bell className="size-3 text-red-500" aria-label="Needs acknowledgment" />
                    ) : null}
                  </span>
                </div>
                <div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-none text-[10px] font-normal",
                      statusBadgeClass(row.status),
                    )}
                  >
                    {HR_DOCUMENT_STATUS_LABEL[row.status]}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-border px-3 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-none border border-border bg-muted/40 text-[10px] font-semibold text-muted-foreground">
                    {(row.uploadedBy[0] || "C").toUpperCase()}
                  </span>
                  <span className="truncate text-xs text-foreground">{row.uploadedBy}</span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                  <Download className="size-3" />
                  {row.downloadCount}
                </span>
                <Button
                  type="button"
                  size="icon"
                  className={cn("h-7 w-7", GREEN_BTN)}
                  onClick={() => download(row)}
                  aria-label="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-none"
                      aria-label="More actions"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[9rem] rounded-none">
                    <DropdownMenuItem onClick={() => setViewRow(row)}>
                      <Eye className="mr-1.5 h-3 w-3" />
                      View
                    </DropdownMenuItem>
                    {canWrite ? (
                      <>
                        <DropdownMenuItem onClick={() => openEdit(row)}>
                          <Pencil className="mr-1.5 h-3 w-3" />
                          Edit
                        </DropdownMenuItem>
                        {row.status === "draft" ? (
                          <DropdownMenuItem onClick={() => void publishDoc(row)}>
                            <Globe className="mr-1.5 h-3 w-3" />
                            Publish
                          </DropdownMenuItem>
                        ) : null}
                        {row.status === "published" ? (
                          <DropdownMenuItem onClick={() => void archiveDoc(row)}>
                            <Box className="mr-1.5 h-3 w-3" />
                            Archive
                          </DropdownMenuItem>
                        ) : null}
                      </>
                    ) : null}
                    <DropdownMenuItem onClick={() => download(row)}>
                      <Download className="mr-1.5 h-3 w-3" />
                      Download
                    </DropdownMenuItem>
                    {canWrite ? (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => void remove(row)}
                      >
                        <Trash2 className="mr-1.5 h-3 w-3" />
                        Delete
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </article>
          ))}
        </div>
      )}

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
          title="Document details"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">Document Details</SheetTitle>
            <SheetDescription className="sr-only">View HR document</SheetDescription>
          </SheetHeader>
          {viewRow ? (
            <div className="flex-1 space-y-4 overflow-auto p-4">
              <div
                className="border-t-[3px] pt-3"
                style={{ borderTopColor: viewRow.accentColor }}
              >
                <div className="text-base font-semibold text-foreground">{viewRow.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {viewRow.description || "—"}
                </p>
              </div>
              <dl className="grid gap-3 text-sm">
                {(
                  [
                    ["Category", viewRow.category],
                    ["Version", `v.${viewRow.version}`],
                    ["Status", HR_DOCUMENT_STATUS_LABEL[viewRow.status]],
                    ["Last Update", viewRow.lastUpdate],
                    ["Uploaded By", viewRow.uploadedBy],
                    ["File", `${viewRow.fileName} (${viewRow.fileSize})`],
                    ["Type", viewRow.fileType],
                    ["Effective", viewRow.effectiveDate || "—"],
                    ["Expiry", viewRow.expiryDate || "—"],
                    [
                      "Acknowledgment",
                      viewRow.requiresAcknowledgment ? "Required" : "Not required",
                    ],
                    ["Downloads", String(viewRow.downloadCount)],
                  ] as const
                ).map(([k, v]) => (
                  <div
                    key={k}
                    className="grid grid-cols-[120px_1fr] gap-2 border-b border-border/60 pb-2"
                  >
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="break-all text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  className={cn("h-9", GREEN_BTN)}
                  onClick={() => download(viewRow)}
                >
                  <Download className="size-3.5" />
                  Download
                </Button>
                {canWrite ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-none"
                    onClick={() => {
                      openEdit(viewRow);
                      setViewRow(null);
                    }}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                ) : null}
              </div>
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
          title={formMode === "edit" ? "Edit Document" : "Upload Document"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Document" : "Upload Document"}
            </SheetTitle>
            <SheetDescription className="sr-only">HR document form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Title *
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="e.g. Remote Work Policy"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Description
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="min-h-[72px] rounded-none"
              />
            </label>
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
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Version
                <Input
                  value={form.version}
                  onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                  className="h-9 rounded-none"
                  placeholder="1.0"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Status *
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as HrDocumentStatus }))
                  }
                  className={fieldClass}
                >
                  {HR_DOCUMENT_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Upload file
              <Input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt"
                className="h-9 rounded-none file:mr-2 file:rounded-none file:border-0 file:bg-muted file:px-2 file:text-xs"
                disabled={saving}
                onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              File name
              <Input
                value={form.fileName}
                onChange={(e) => setForm((f) => ({ ...f, fileName: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="policy.pdf"
              />
            </label>
            {form.filePath ? (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                Attached —{" "}
                <a
                  href={form.filePath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  open file
                </a>
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Optional: upload via media library, or leave metadata only.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                File type
                <Input
                  value={form.fileType}
                  onChange={(e) => setForm((f) => ({ ...f, fileType: e.target.value }))}
                  className="h-9 rounded-none"
                  placeholder="PDF"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                File size
                <Input
                  value={form.fileSize}
                  onChange={(e) => setForm((f) => ({ ...f, fileSize: e.target.value }))}
                  className="h-9 rounded-none"
                  placeholder="250 KB"
                  readOnly={form.fileSizeBytes > 0}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Effective date
                <Input
                  type="date"
                  value={form.effectiveDate}
                  onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Expiry date
                <Input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.requiresAcknowledgment}
                onChange={(e) =>
                  setForm((f) => ({ ...f, requiresAcknowledgment: e.target.checked }))
                }
                className="size-4 rounded-none border-border"
              />
              Requires acknowledgment
            </label>
            {formMode === "add" ? (
              <div className="flex items-center gap-2 rounded-none border border-dashed border-border bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
                <Upload className="size-4 shrink-0" />
                Upload a file to attach it via the media library, then save the document.
              </div>
            ) : null}
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              onClick={() => void saveForm()}
              disabled={saving || categories.length === 0}
            >
              {saving ? "Saving…" : formMode === "edit" ? "Save Changes" : "Upload"}
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
