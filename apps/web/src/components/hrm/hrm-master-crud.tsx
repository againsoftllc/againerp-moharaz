"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Filter, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  createMasterId,
  emptyMasterForm,
  formFromMasterRow,
  payloadFromMasterForm,
  type MasterCrudApi,
  type MasterEntityConfig,
  type MasterFieldDef,
  type MasterRow,
} from "@/lib/mock-data/hrm-recruitment-setup";
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
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

function fieldListVisible(f: MasterFieldDef) {
  if (f.list != null) return f.list;
  return f.type !== "textarea";
}

function optionLabel(f: MasterFieldDef, value: string | number | boolean) {
  const v = String(value);
  return f.options?.find((o) => o.value === v)?.label ?? v;
}

function formatCell(f: MasterFieldDef, row: MasterRow) {
  const raw = row[f.key];
  if (f.type === "checkbox") {
    return raw === true || raw === "true" || raw === "yes" ? "Yes" : "No";
  }
  if (f.type === "select") return optionLabel(f, raw ?? "");
  if (raw == null || raw === "") return "—";
  const value = String(raw);
  return f.suffix ? `${value} ${f.suffix}` : value;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "active":
    case "published":
    case "approved":
    case "completed":
    case "resolved":
    case "paid":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "inactive":
    case "closed":
    case "cancelled":
      return "border-border bg-muted/40 text-muted-foreground";
    case "draft":
    case "pending":
    case "planned":
    case "open":
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "rejected":
      return "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300";
    case "investigating":
    case "ongoing":
      return "border-violet-500/30 bg-violet-500/15 text-violet-800 dark:text-violet-300";
    default:
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
  }
}

type Props = {
  config: MasterEntityConfig;
  /** When set, list/create/update/delete go through the real API instead of local seed. */
  api?: MasterCrudApi;
};

export function HrmMasterCrud({ config, api }: Props) {
  const canWrite = useAdminCanWrite();
  const [fields, setFields] = useState<MasterFieldDef[]>(() =>
    config.fields.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined })),
  );
  const listFields = useMemo(() => fields.filter(fieldListVisible), [fields]);
  const primaryRequired = fields.find((f) => f.required)?.key ?? "name";

  const [rows, setRows] = useState<MasterRow[]>(() =>
    api ? [] : config.seed.map((r) => ({ ...r })),
  );
  const [loading, setLoading] = useState(Boolean(api));
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);

  const [viewRow, setViewRow] = useState<MasterRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(() =>
    emptyMasterForm(config.fields),
  );

  const hasStatus = fields.some((f) => f.key === "status");

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const loaders = api.optionLoaders ?? {};
        const optionEntries = await Promise.all(
          Object.entries(loaders).map(async ([key, load]) => [key, await load()] as const),
        );
        if (!cancelled && optionEntries.length > 0) {
          const optionMap = Object.fromEntries(optionEntries);
          setFields((prev) =>
            prev.map((f) =>
              optionMap[f.key] ? { ...f, options: optionMap[f.key] } : f,
            ),
          );
        }
        const data = await api.list();
        if (!cancelled) setRows(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load";
        if (!cancelled) {
          setLoadError(message);
          setRows([]);
          toast.error(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const filtered = useMemo(() => {
    let list = rows;
    if (hasStatus && statusFilter !== "all") {
      list = list.filter((r) => String(r.status) === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        fields.some((f) => {
          const raw = String(r[f.key] ?? "");
          if (raw.toLowerCase().includes(q)) return true;
          if (f.type === "select") {
            return optionLabel(f, raw).toLowerCase().includes(q);
          }
          return false;
        }),
      );
    }
    return list;
  }, [rows, statusFilter, search, hasStatus, fields]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyMasterForm(fields));
    setFormOpen(true);
  }

  function openEdit(row: MasterRow) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromMasterRow(fields, row));
    setFormOpen(true);
  }

  async function saveForm() {
    if (primaryRequired && !String(form[primaryRequired] ?? "").trim()) {
      toast.error(`${fields.find((f) => f.key === primaryRequired)?.label ?? "Name"} is required`);
      return;
    }
    const payload = payloadFromMasterForm(fields, form);
    if (api) {
      setSaving(true);
      try {
        if (formMode === "edit" && editId) {
          const updated = await api.update(editId, payload);
          setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
          setViewRow((v) => (v?.id === editId ? updated : v));
          toast.success("Updated");
        } else {
          const created = await api.create(payload);
          setRows((prev) => [created, ...prev]);
          toast.success("Created");
        }
        setFormOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
      return;
    }
    if (formMode === "edit" && editId) {
      setRows((prev) => prev.map((r) => (r.id === editId ? { ...r, ...payload } : r)));
      setViewRow((v) => (v?.id === editId ? { ...v, ...payload } : v));
      toast.success("Updated");
    } else {
      setRows((prev) => [
        { id: createMasterId(config.idPrefix, prev), ...payload },
        ...prev,
      ]);
      toast.success("Created");
    }
    setFormOpen(false);
  }

  async function remove(row: MasterRow) {
    if (api) {
      setSaving(true);
      try {
        await api.remove(row.id);
        setRows((prev) => prev.filter((r) => r.id !== row.id));
        setViewRow((v) => (v?.id === row.id ? null : v));
        toast.success("Deleted");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      } finally {
        setSaving(false);
      }
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    setViewRow((v) => (v?.id === row.id ? null : v));
    toast.success("Deleted");
  }

  const statusOptions = fields.find((f) => f.key === "status")?.options ?? [];

  if (loading) {
    return <ContentDataSkeleton label={`Loading ${config.title.toLowerCase()}…`} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{config.title}</h1>
        {canWrite ? (
          <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd} disabled={saving}>
            <Plus className="size-3.5" />
            {config.addLabel}
          </Button>
        ) : null}
      </div>

      {loadError ? (
        <div className="rounded-none border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {loadError}
        </div>
      ) : null}

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
        {hasStatus ? (
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
        ) : null}
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

      {filtersOpen && hasStatus ? (
        <div className="rounded-none border border-border bg-card p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[140px] flex-col gap-1 text-xs text-muted-foreground">
              Status
              <select
                value={draftStatus}
                onChange={(e) => setDraftStatus(e.target.value)}
                className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="all">All</option>
                {statusOptions.map((s) => (
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
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="w-12 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              {listFields.map((f) => (
                <th
                  key={f.key}
                  className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {f.label}
                </th>
              ))}
              <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={listFields.length + 2}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  No records found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  {listFields.map((f) => (
                    <td key={f.key} className="px-3 py-2.5">
                      {f.key === "status" ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-none text-[10px] font-normal",
                            statusBadgeClass(String(row.status ?? "")),
                          )}
                        >
                          {formatCell(f, row)}
                        </Badge>
                      ) : f.key === "name" ||
                        f.key === "employeeName" ||
                        f.key === "complainant" ||
                        f.key === "purpose" ||
                        f.label === "Task" ||
                        f.label === "Question" ? (
                        <span className="font-medium text-foreground">{formatCell(f, row)}</span>
                      ) : (
                        formatCell(f, row)
                      )}
                    </td>
                  ))}
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
                            onClick={() => void remove(row)}
                            disabled={saving}
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
          title={viewRow ? `${config.title} — details` : config.title}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          {viewRow ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-border px-4 py-3 pr-10">
                <p className="text-base font-semibold">
                  {String(
                    viewRow.name ??
                      viewRow.employeeName ??
                      viewRow.purpose ??
                      viewRow.complainant ??
                      viewRow.title ??
                      "Details",
                  )}
                </p>
                {viewRow.status != null ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      "mt-1.5 rounded-none text-[10px] font-normal",
                      statusBadgeClass(String(viewRow.status)),
                    )}
                  >
                    {optionLabel(
                      fields.find((f) => f.key === "status") ?? {
                        key: "status",
                        label: "Status",
                        type: "text",
                      },
                      viewRow.status,
                    )}
                  </Badge>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <dl className="divide-y divide-border rounded-none border border-border text-sm">
                  {fields
                    .filter((f) => f.type !== "textarea")
                    .map((f) => (
                      <div key={f.key} className="flex items-start justify-between gap-3 px-3 py-2">
                        <dt className="shrink-0 text-xs text-muted-foreground">{f.label}</dt>
                        <dd className="max-w-[60%] text-right text-sm">{formatCell(f, viewRow)}</dd>
                      </div>
                    ))}
                </dl>
                {fields
                  .filter((f) => f.type === "textarea" && String(viewRow[f.key] ?? "").trim())
                  .map((f) => (
                    <div
                      key={f.key}
                      className="rounded-none border border-border bg-muted/20 px-3 py-2 text-sm"
                    >
                      <p className="mb-1 text-xs text-muted-foreground">{f.label}</p>
                      <p className="whitespace-pre-wrap">{String(viewRow[f.key])}</p>
                    </div>
                  ))}
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

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          title={formMode === "add" ? config.addLabel : `Edit ${config.title}`}
          resizable
          resizeMaxWidth={720}
          closeButton="chevron"
          className="w-[min(100%,28rem)] min-w-[280px] max-w-[720px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 pr-10 text-left">
              <SheetTitle className="text-base">
                {formMode === "add" ? config.addLabel : `Edit ${config.title}`}
              </SheetTitle>
              <SheetDescription className="text-xs">{config.sheetHint}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {fields.map((f) => {
                if (f.type === "textarea") {
                  return (
                    <label key={f.key} className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                      {f.label}
                      {f.required ? " *" : ""}
                      <Textarea
                        value={form[f.key] ?? ""}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        className="min-h-[80px] rounded-none"
                        placeholder={f.placeholder}
                      />
                    </label>
                  );
                }
                if (f.type === "checkbox") {
                  return (
                    <label
                      key={f.key}
                      className="flex items-center gap-2 text-sm text-foreground"
                    >
                      <input
                        type="checkbox"
                        checked={form[f.key] === "true"}
                        onChange={(e) =>
                          setForm({ ...form, [f.key]: e.target.checked ? "true" : "false" })
                        }
                        className="size-4 rounded-none border border-border"
                      />
                      {f.label}
                    </label>
                  );
                }
                if (f.type === "select") {
                  return (
                    <label key={f.key} className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                      {f.label}
                      {f.required ? " *" : ""}
                      <select
                        value={form[f.key] ?? ""}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
                      >
                        {(f.options ?? []).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }
                return (
                  <label key={f.key} className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    {f.label}
                    {f.required ? " *" : ""}
                    {f.suffix ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                          value={form[f.key] ?? ""}
                          onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                          className="h-9 flex-1 rounded-none"
                          placeholder={f.placeholder}
                        />
                        <span className="shrink-0 text-xs text-muted-foreground">{f.suffix}</span>
                      </div>
                    ) : (
                      <Input
                        type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                        value={form[f.key] ?? ""}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        className="h-9 rounded-none"
                        placeholder={f.placeholder}
                      />
                    )}
                  </label>
                );
              })}
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
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
