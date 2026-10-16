"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  Briefcase,
  FileText,
  Filter,
  Folder,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Scale,
  Search,
  Shield,
  Trash2,
  User,
  Wallet,
} from "lucide-react";
import {
  DOC_CATEGORY_ICON_OPTIONS,
  DOC_CATEGORY_STATUS_LABEL,
  DOC_CATEGORY_STATUS_OPTIONS,
  type DocumentCategory,
  type DocumentCategoryIcon,
  type DocumentCategoryStatus,
} from "@/lib/mock-data/hrm-document-categories";
import {
  apiCategoryToView,
  createHrmDocumentCategory,
  deleteHrmDocumentCategory,
  listHrmDocumentCategories,
  listHrmHrDocuments,
  updateHrmDocumentCategory,
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

type SortKey = "name" | "documentsCount" | "status";
type SortDir = "asc" | "desc";

type FormState = {
  name: string;
  description: string;
  color: string;
  icon: DocumentCategoryIcon;
  isMandatory: boolean;
  status: DocumentCategoryStatus;
};

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    color: "#3B82F6",
    icon: "folder",
    isMandatory: false,
    status: "active",
  };
}

function formFromRow(row: DocumentCategory): FormState {
  return {
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    isMandatory: row.isMandatory,
    status: row.status,
  };
}

function statusBadgeClass(status: DocumentCategoryStatus) {
  return status === "active"
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "border-border bg-muted/40 text-muted-foreground";
}

function CategoryIcon({
  icon,
  className,
}: {
  icon: DocumentCategoryIcon;
  className?: string;
}) {
  const props = { className: cn("size-4", className) };
  const map: Record<DocumentCategoryIcon, ReactNode> = {
    folder: <Folder {...props} />,
    shield: <Shield {...props} />,
    user: <User {...props} />,
    file: <FileText {...props} />,
    briefcase: <Briefcase {...props} />,
    scale: <Scale {...props} />,
    wallet: <Wallet {...props} />,
    book: <BookOpen {...props} />,
  };
  return map[icon];
}

function DescriptionCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 60;
  if (!text) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="text-xs text-muted-foreground">
      <span className={cn(!expanded && long && "line-clamp-2")}>{text}</span>
      {long ? (
        <button
          type="button"
          className="mt-0.5 inline-flex text-sky-600 hover:underline dark:text-sky-400"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

export function HrmDocumentCategories() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<DocumentCategory[]>([]);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | DocumentCategoryStatus>("all");
  const [draftType, setDraftType] = useState<"all" | "mandatory" | "optional">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | DocumentCategoryStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "mandatory" | "optional">("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [catRows, docRows] = await Promise.all([
        listHrmDocumentCategories(),
        listHrmHrDocuments(),
      ]);
      const countByCat = new Map<string, number>();
      for (const d of docRows) {
        if (d.category_id) {
          countByCat.set(d.category_id, (countByCat.get(d.category_id) ?? 0) + 1);
        }
      }
      setRows(
        catRows.map((c) => apiCategoryToView(c, countByCat.get(c.id) ?? 0)),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load categories");
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
    if (typeFilter === "mandatory") list = list.filter((r) => r.isMandatory);
    if (typeFilter === "optional") list = list.filter((r) => !r.isMandatory);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
      );
    }
    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
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
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(row: DocumentCategory) {
    if (row.locked) {
      toast.error("Category is locked — unlock before editing");
      return;
    }
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  function toggleLock(row: DocumentCategory) {
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, locked: !r.locked } : r)),
    );
    toast.success(row.locked ? "Category unlocked" : "Category locked");
  }

  async function saveForm() {
    if (!form.name.trim()) {
      toast.error("Category name is required");
      return;
    }
    if (!form.color.trim()) {
      toast.error("Color is required");
      return;
    }

    const input = {
      name: form.name.trim(),
      description: form.description.trim(),
      color: form.color,
      icon: form.icon,
      isMandatory: form.isMandatory,
      status: form.status,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const apiRow = await updateHrmDocumentCategory(editId, input);
        const prev = rows.find((r) => r.id === editId);
        const mapped = apiCategoryToView(apiRow, prev?.documentsCount ?? 0);
        setRows((prevRows) =>
          prevRows.map((r) =>
            r.id === editId ? { ...mapped, locked: r.locked } : r,
          ),
        );
        toast.success("Category updated");
      } else {
        const apiRow = await createHrmDocumentCategory(input);
        setRows((prev) => [apiCategoryToView(apiRow, 0), ...prev]);
        toast.success("Category created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: DocumentCategory) {
    if (row.locked) {
      toast.error("Unlock before deleting");
      return;
    }
    if (row.documentsCount > 0) {
      toast.error("Cannot delete a category with documents");
      return;
    }
    if (!window.confirm(`Delete category “${row.name}”?`)) return;
    try {
      await deleteHrmDocumentCategory(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Category deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
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

  const fieldClass =
    "h-9 w-full rounded-none border border-border bg-background px-2 text-sm text-foreground";

  if (loading) {
    return <ContentDataSkeleton label="Loading categories…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Document Categories
        </h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Category
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
            placeholder="Search categories..."
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
                  setDraftStatus(e.target.value as "all" | DocumentCategoryStatus)
                }
                className={fieldClass}
              >
                <option value="all">All</option>
                {DOC_CATEGORY_STATUS_OPTIONS.map((s) => (
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
                onChange={(e) =>
                  setDraftType(e.target.value as "all" | "mandatory" | "optional")
                }
                className={fieldClass}
              >
                <option value="all">All</option>
                <option value="mandatory">Mandatory</option>
                <option value="optional">Optional</option>
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
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="px-3 py-2.5">
                <SortHeader label="Category" col="name" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Documents" col="documentsCount" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Type
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
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No categories found.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5">
                    <div className="flex items-start gap-2.5">
                      <span
                        className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-none text-white"
                        style={{ backgroundColor: row.color }}
                      >
                        <CategoryIcon icon={row.icon} className="size-4 text-white" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          {row.name}
                          {row.isMandatory ? (
                            <AlertTriangle
                              className="size-3.5 shrink-0 text-red-500"
                              aria-label="Mandatory"
                            />
                          ) : null}
                        </div>
                        <DescriptionCell text={row.description} />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 tabular-nums text-foreground">
                      <FileText className="size-3.5 text-muted-foreground" />
                      {row.documentsCount}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {row.isMandatory ? (
                      <Badge
                        variant="outline"
                        className="rounded-none gap-1 border-red-500/30 bg-red-500/15 text-[10px] font-normal text-red-700 dark:text-red-300"
                      >
                        <AlertTriangle className="size-3" />
                        Mandatory
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="rounded-none border-border bg-muted/40 text-[10px] font-normal text-muted-foreground"
                      >
                        Optional
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-none text-[10px] font-normal",
                          statusBadgeClass(row.status),
                        )}
                      >
                        {DOC_CATEGORY_STATUS_LABEL[row.status]}
                      </Badge>
                      {row.locked ? (
                        <Badge
                          variant="outline"
                          className="rounded-none border-amber-500/30 bg-amber-500/15 text-[10px] font-normal text-amber-800 dark:text-amber-300"
                        >
                          Locked
                        </Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {canWrite ? (
                      <div className="flex items-center gap-1">
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
                            <LockOpen className="h-3.5 w-3.5" />
                          ) : (
                            <Lock className="h-3.5 w-3.5" />
                          )}
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
                      </div>
                    ) : null}
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

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[460px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title={formMode === "edit" ? "Edit Category" : "Add Category"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Category" : "Add Category"}
            </SheetTitle>
            <SheetDescription className="sr-only">Document category form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Category Name *
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="e.g., HR Policies, Contracts"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Description
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="min-h-[72px] rounded-none"
                placeholder="Brief description of the category"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Color *
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    className="h-9 w-10 cursor-pointer rounded-none border border-border bg-background p-1"
                  />
                  <Input
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    className="h-9 flex-1 rounded-none font-mono text-xs"
                  />
                </div>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Icon *
                <select
                  value={form.icon}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      icon: e.target.value as DocumentCategoryIcon,
                    }))
                  }
                  className={fieldClass}
                >
                  {DOC_CATEGORY_ICON_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Mandatory Category
              <select
                value={form.isMandatory ? "yes" : "no"}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isMandatory: e.target.value === "yes" }))
                }
                className={fieldClass}
              >
                <option value="no">No, Optional</option>
                <option value="yes">Yes, Mandatory</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Status *
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as DocumentCategoryStatus,
                  }))
                }
                className={fieldClass}
              >
                {DOC_CATEGORY_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              onClick={() => void saveForm()}
              disabled={saving}
            >
              {saving ? "Saving…" : formMode === "edit" ? "Save Changes" : "Create Category"}
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
