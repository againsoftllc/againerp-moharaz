"use client";

import { useEffect, useMemo, useState } from "react";
import { Boxes, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  ASSET_TYPE_STATUS_OPTIONS,
  type AssetType,
  type AssetTypeStatus,
} from "@/lib/mock-data/hrm-asset-types";
import {
  createHrmAssetTypeView,
  deleteHrmAssetTypeView,
  listHrmAssetTypesView,
  updateHrmAssetTypeView,
} from "@/lib/api/hrm-assets";
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

type SortKey = "name" | "assetsCount";
type SortDir = "asc" | "desc";

type FormState = {
  name: string;
  description: string;
  depreciationRate: string;
  assetsCount: string;
  status: AssetTypeStatus;
};

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    depreciationRate: "10",
    assetsCount: "0",
    status: "active",
  };
}

function formFromRow(row: AssetType): FormState {
  return {
    name: row.name,
    description: row.description,
    depreciationRate: String(row.depreciationRate),
    assetsCount: String(row.assetsCount),
    status: row.status,
  };
}

function DescriptionCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 80;
  if (!text) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="text-xs text-muted-foreground">
      <span className={cn(!expanded && long && "line-clamp-2")}>{text}</span>
      {long ? (
        <button
          type="button"
          className="mt-0.5 inline-flex items-center gap-0.5 text-sky-600 hover:underline dark:text-sky-400"
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

export function HrmAssetTypes() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await listHrmAssetTypesView();
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load asset types");
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
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "assetsCount") return (a.assetsCount - b.assetsCount) * dir;
      return a.name.localeCompare(b.name) * dir;
    });
  }, [rows, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(row: AssetType) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function saveForm() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const payload: Omit<AssetType, "id"> = {
      name: form.name.trim(),
      description: form.description.trim(),
      depreciationRate: Math.max(0, Number(form.depreciationRate) || 0),
      assetsCount: Math.max(0, Number(form.assetsCount) || 0),
      status: form.status,
    };
    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateHrmAssetTypeView(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        toast.success("Asset type updated");
      } else {
        const created = await createHrmAssetTypeView(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Asset type created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: AssetType) {
    try {
      await deleteHrmAssetTypeView(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Asset type deleted");
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search asset types..."
            className="h-9 rounded-none pl-8"
          />
        </div>
        <Button type="button" size="sm" className={cn("h-9", GREEN_BTN)}>
          <Search className="size-3.5" />
          Search
        </Button>
        {canWrite ? (
          <Button type="button" size="sm" className={cn("ml-auto h-9", GREEN_BTN)} onClick={openAdd}>
            <Plus className="size-3.5" />
            Add Asset Type
          </Button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border bg-card">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Asset Types</h1>
          <p className="text-xs text-muted-foreground">
            Manage asset types used to categorize company assets.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60">
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2.5">
                  <SortHeader label="Name" col="name" />
                </th>
                <th className="px-4 py-2.5 text-right">
                  <div className="inline-flex justify-end">
                    <SortHeader label="Assets" col="assetsCount" />
                  </div>
                </th>
                <th className="w-[1%] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Loading asset types...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No asset types found.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-b-0 hover:bg-muted/20"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300">
                          <Boxes className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">{row.name}</div>
                          <DescriptionCell text={row.description} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge
                        variant="outline"
                        className="rounded-none border-border bg-muted/40 text-[10px] font-normal text-muted-foreground"
                      >
                        {row.assetsCount} asset{row.assetsCount === 1 ? "" : "s"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
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
      </div>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[420px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title={formMode === "edit" ? "Edit Asset Type" : "Add Asset Type"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Asset Type" : "Add Asset Type"}
            </SheetTitle>
            <SheetDescription className="sr-only">Asset type form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Name *
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="e.g. Network Equipment"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Description
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="min-h-[90px] rounded-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Depreciation Rate (%)
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.depreciationRate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, depreciationRate: e.target.value }))
                  }
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Assets Count
                <Input
                  type="number"
                  min={0}
                  value={form.assetsCount}
                  onChange={(e) => setForm((f) => ({ ...f, assetsCount: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Status
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as AssetTypeStatus }))
                }
                className={fieldClass}
              >
                {ASSET_TYPE_STATUS_OPTIONS.map((s) => (
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
              {formMode === "edit" ? "Save Changes" : "Create Type"}
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
