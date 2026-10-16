"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Eye, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  emptyRowFromEntity,
  getHrmEntityByHref,
} from "@/lib/hrm/hrm-entity-registry";
import {
  statusBadgeVariant,
  type HrmEntityDef,
  type HrmEntityRow,
  type HrmFieldDef,
} from "@/lib/hrm/hrm-entity-types";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { cn } from "@/lib/utils";

/** In-memory mock DB for the browser session (per entity + seed fingerprint). */
const memoryDb = new Map<string, HrmEntityRow[]>();

function seedFingerprint(entity: HrmEntityDef) {
  const first = entity.seed[0];
  return `${entity.id}:${entity.seed.length}:${String(first?.id ?? "")}:${String(first?.name ?? "")}`;
}

function loadRows(entity: HrmEntityDef): HrmEntityRow[] {
  const key = seedFingerprint(entity);
  const existing = memoryDb.get(key);
  if (existing) return existing;
  // Drop stale keys for this entity when seed changes (avoids “stuck” old mock data).
  for (const k of [...memoryDb.keys()]) {
    if (k.startsWith(`${entity.id}:`)) memoryDb.delete(k);
  }
  const seed = entity.seed.map((r) => ({ ...r }));
  memoryDb.set(key, seed);
  return seed;
}

function saveRows(entityId: string, rows: HrmEntityRow[]) {
  for (const k of [...memoryDb.keys()]) {
    if (k.startsWith(`${entityId}:`)) {
      memoryDb.set(k, rows);
      return;
    }
  }
  memoryDb.set(`${entityId}:live`, rows);
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: HrmFieldDef;
  value: string | number | boolean | undefined;
  onChange: (v: string) => void;
}) {
  const str = value == null ? "" : String(value);
  if (field.type === "textarea") {
    return (
      <textarea
        className="min-h-[80px] w-full rounded-none border border-input bg-background px-3 py-2 text-sm"
        value={str}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (field.type === "select" || field.type === "status") {
    const options = field.options ?? [];
    return (
      <FilterSelect
        value={str || options[0]?.value || ""}
        onChange={onChange}
        options={options}
        width="w-full"
        className="w-full"
      />
    );
  }
  return (
    <Input
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      value={str}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-none"
    />
  );
}

function EntityViewSheet({
  open,
  onOpenChange,
  entity,
  row,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entity: HrmEntityDef;
  row: HrmEntityRow | null;
  onEdit?: (row: HrmEntityRow) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={row ? `${entity.singular}: ${row.name}` : entity.singular}
        resizable
        resizeMaxWidth={900}
        closeButton="chevron"
        className="w-[min(100%,36rem)] min-w-[300px] max-w-[900px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
        aria-describedby={undefined}
      >
        {!row ? null : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 pr-10">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant={statusBadgeVariant(String(row.status))} className="rounded-none text-[10px] font-normal">
                    {String(row.status)}
                  </Badge>
                  <span className="font-mono text-[10px] text-muted-foreground">{row.id}</span>
                </div>
                <p className="truncate text-base font-semibold">{row.name}</p>
                <p className="text-xs text-muted-foreground">{entity.title}</p>
              </div>
              {onEdit ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 gap-1 rounded-none px-2.5 text-xs"
                  onClick={() => {
                    onOpenChange(false);
                    onEdit(row);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <dl className="divide-y divide-border rounded-none border border-border text-sm">
                {entity.fields.map((field) => (
                  <div key={field.key} className="flex items-start justify-between gap-3 px-3 py-2">
                    <dt className="shrink-0 text-xs text-muted-foreground">{field.label}</dt>
                    <dd className="text-right text-sm">{String(row[field.key] ?? "—")}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EntityFormSheet({
  open,
  onOpenChange,
  entity,
  mode,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entity: HrmEntityDef;
  mode: "create" | "edit";
  initial: HrmEntityRow | null;
  onSave: (row: HrmEntityRow) => void;
}) {
  const [form, setForm] = useState<HrmEntityRow>(() =>
    mode === "edit" && initial ? { ...initial } : emptyRowFromEntity(entity),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setForm(mode === "edit" && initial ? { ...initial } : emptyRowFromEntity(entity));
  }, [mode, initial, entity, open]);

  const setField = (key: string, value: string) => {
    setForm((prev) => {
      const field = entity.fields.find((f) => f.key === key);
      const nextVal: string | number = field?.type === "number" ? Number(value) || 0 : value;
      const next = { ...prev, [key]: nextVal };
      if (key === "name") next.name = String(nextVal);
      return next;
    });
  };

  const submit = () => {
    for (const field of entity.fields) {
      if (!field.required) continue;
      const v = form[field.key];
      if (v == null || String(v).trim() === "") {
        setError(`${field.label} is required`);
        return;
      }
    }
    const name = String(form.name || form.employeeName || entity.singular).trim();
    onSave({
      ...form,
      id: mode === "edit" && initial?.id ? initial.id : `${entity.id}_${Date.now()}`,
      name,
      status: String(form.status || "active"),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={mode === "create" ? `Add ${entity.singular}` : `Edit ${entity.singular}`}
        resizable
        resizeMaxWidth={900}
        closeButton="chevron"
        className="w-[min(100%,40rem)] min-w-[300px] max-w-[900px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
        aria-describedby={undefined}
      >
        <div className="flex h-full min-h-0 flex-col px-4 pb-4 pt-3">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2">
            {entity.fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {field.label}
                  {field.required ? " *" : ""}
                </Label>
                <FieldInput
                  field={field}
                  value={form[field.key]}
                  onChange={(v) => setField(field.key, v)}
                />
              </div>
            ))}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border pt-3">
            <Button type="button" variant="outline" size="sm" className="rounded-none" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" className="rounded-none" onClick={submit}>
              {mode === "create" ? "Create" : "Save changes"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EntityCrudContent({ entity }: { entity: HrmEntityDef }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<HrmEntityRow[]>(() => loadRows(entity));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");
  const viewId = searchParams.get("view");

  const editRow = useMemo(
    () => (editId ? rows.find((r) => r.id === editId) ?? null : null),
    [editId, rows],
  );
  const viewRow = useMemo(
    () => (viewId ? rows.find((r) => r.id === viewId) ?? null : null),
    [viewId, rows],
  );

  const pushParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const q = params.toString();
      router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, searchParams, pathname],
  );

  const openCreate = () =>
    pushParams((p) => {
      p.delete("edit");
      p.delete("view");
      p.set("create", "1");
    });
  const handleEdit = (row: HrmEntityRow) =>
    pushParams((p) => {
      p.delete("create");
      p.delete("view");
      p.set("edit", row.id);
    });
  const handleView = (row: HrmEntityRow) =>
    pushParams((p) => {
      p.delete("create");
      p.delete("edit");
      p.set("view", row.id);
    });
  const closeForm = useCallback(
    () =>
      pushParams((p) => {
        p.delete("create");
        p.delete("edit");
      }),
    [pushParams],
  );
  const closeView = useCallback(
    () =>
      pushParams((p) => {
        p.delete("view");
      }),
    [pushParams],
  );

  useViewerWriteUrlGuard(createOpen || !!editId, closeForm);

  useEffect(() => {
    if (editId && !editRow) {
      toast.error("Record not found");
      closeForm();
    }
  }, [editId, editRow, closeForm]);

  useEffect(() => {
    if (viewId && !viewRow && !createOpen && !editRow) {
      toast.error("Record not found");
      closeView();
    }
  }, [viewId, viewRow, createOpen, editRow, closeView]);

  const viewOpen = !!viewId && !createOpen && !editRow;

  const listFields = useMemo(() => {
    const listed = entity.fields.filter((f) => f.list !== false);
    return listed.slice(0, 6);
  }, [entity.fields]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && String(r.status) !== statusFilter) return false;
      if (!q) return true;
      return Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q));
    });
  }, [rows, search, statusFilter]);

  const persist = (next: HrmEntityRow[]) => {
    setRows(next);
    saveRows(entity.id, next);
  };

  const handleSaved = (row: HrmEntityRow) => {
    persist(
      createOpen
        ? [row, ...rows]
        : rows.map((r) => (r.id === row.id ? row : r)),
    );
    toast.success(createOpen ? `${entity.singular} created` : `${entity.singular} updated`);
    closeForm();
  };

  const handleDelete = (row: HrmEntityRow) => {
    persist(rows.filter((r) => r.id !== row.id));
    toast.success(`${entity.singular} deleted`);
    if (viewId === row.id) closeView();
    if (editId === row.id) closeForm();
  };

  const statusOptions = useMemo(() => {
    const set = new Set(rows.map((r) => String(r.status)));
    return [
      { value: "all", label: "All status" },
      ...[...set].map((s) => ({ value: s, label: s })),
    ];
  }, [rows]);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        {canWrite ? (
          <Button size="sm" className="rounded-none" onClick={openCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            New
          </Button>
        ) : null}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${entity.title.toLowerCase()}…`}
          className="h-8 max-w-xs rounded-none"
        />
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={statusOptions}
          width="w-[140px]"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto rounded-none"
          onClick={() => {
            const fresh = entity.seed.map((r) => ({ ...r }));
            persist(fresh);
            toast.success("Reset to mock seed");
          }}
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          Reset mock
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              {listFields.map((field) => (
                <th key={field.key} className="px-3 py-2 font-medium">
                  {field.label}
                </th>
              ))}
              <th className="w-[1%] px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={listFields.length + 1} className="px-3 py-10 text-center text-muted-foreground">
                  No records match your filters
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-border hover:bg-muted/40"
                  onClick={() => handleView(row)}
                >
                  {listFields.map((field) => (
                    <td key={field.key} className="px-3 py-2">
                      {field.key === "status" || field.type === "status" ? (
                        <Badge
                          variant={statusBadgeVariant(String(row[field.key] ?? ""))}
                          className="rounded-none text-[10px] font-normal capitalize"
                        >
                          {String(row[field.key] ?? "—")}
                        </Badge>
                      ) : field.key === "name" ? (
                        <span className="font-medium">{String(row[field.key] ?? "—")}</span>
                      ) : (
                        String(row[field.key] ?? "—")
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-none"
                        onClick={() => handleView(row)}
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
                            className="h-7 w-7 rounded-none"
                            onClick={() => handleEdit(row)}
                            aria-label="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-destructive"
                            onClick={() => handleDelete(row)}
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

      <div className="shrink-0 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
        {filtered.length} of {rows.length} · mock data — refine fields later
      </div>

      {viewOpen && (
        <EntityViewSheet
          open
          onOpenChange={(o) => {
            if (!o) closeView();
          }}
          entity={entity}
          row={viewRow}
          onEdit={canWrite ? handleEdit : undefined}
        />
      )}

      {canWrite && (createOpen || !!editRow) && (
        <EntityFormSheet
          open
          onOpenChange={(o) => {
            if (!o) closeForm();
          }}
          entity={entity}
          mode={createOpen ? "create" : "edit"}
          initial={editRow}
          onSave={handleSaved}
        />
      )}

      {canWrite ? (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-none p-0 shadow-lg md:hidden"
          onClick={openCreate}
          aria-label={`Add ${entity.singular}`}
        >
          <Plus className="h-5 w-5" />
        </Button>
      ) : null}
    </div>
  );
}

type Props = {
  /** Prefer pathname; can pass href override for redirects targets. */
  href?: string;
};

export function HrmEntityPage({ href }: Props) {
  const pathname = usePathname();
  const entityHref = href ?? pathname;
  const entity = getHrmEntityByHref(entityHref);

  if (!entity) {
    return (
      <div className="p-4 text-sm text-destructive">
        No CRUD entity registered for <code>{entityHref}</code>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <p className="page-subtitle">AgainERP › HRM</p>
        <h1 className="page-title">{entity.title}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{entity.description}</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Suspense fallback={<ContentDataSkeleton label={`Loading ${entity.title}…`} />}>
          <EntityCrudContent entity={entity} />
        </Suspense>
      </div>
    </div>
  );
}
