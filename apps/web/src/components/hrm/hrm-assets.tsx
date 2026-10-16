"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Download,
  Eye,
  Filter,
  LayoutDashboard,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  ASSET_CONDITION_LABEL,
  ASSET_CONDITION_OPTIONS,
  ASSET_STATUS_LABEL,
  ASSET_STATUS_OPTIONS,
  defaultAssetDetail,
  formatAssetCost,
  type AssetCondition,
  type AssetStatus,
  type CompanyAsset,
} from "@/lib/mock-data/hrm-assets";
import {
  createCompanyAsset,
  deleteCompanyAsset,
  listCompanyAssets,
  listHrmAssetTypesView,
  updateCompanyAsset,
} from "@/lib/api/hrm-assets";
import type { AssetType } from "@/lib/mock-data/hrm-asset-types";
import { HrmAssetDetail, type AssetDetailTab } from "@/components/hrm/hrm-asset-detail";
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

type SortKey = "name" | "purchaseDate" | "purchaseCost" | "status" | "location";
type SortDir = "asc" | "desc";

type FormState = {
  name: string;
  assetType: string;
  assetCode: string;
  secondaryCode: string;
  serialNumber: string;
  status: AssetStatus;
  assignedTo: string;
  purchaseDate: string;
  purchaseCost: string;
  location: string;
  condition: AssetCondition;
  description: string;
  supplier: string;
  warrantyExpiry: string;
};

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function emptyForm(assetTypes: string[], locations: string[]): FormState {
  return {
    name: "",
    assetType: assetTypes[0] ?? "",
    assetCode: "",
    secondaryCode: "",
    serialNumber: "",
    status: "available",
    assignedTo: "",
    purchaseDate: todayYmd(),
    purchaseCost: "0",
    location: locations[0] ?? "",
    condition: "good",
    description: "",
    supplier: "",
    warrantyExpiry: "",
  };
}

function formFromRow(row: CompanyAsset): FormState {
  return {
    name: row.name,
    assetType: row.assetType,
    assetCode: row.assetCode,
    secondaryCode: row.secondaryCode,
    serialNumber: row.serialNumber,
    status: row.status,
    assignedTo: row.assignedTo ?? "",
    purchaseDate: row.purchaseDate,
    purchaseCost: String(row.purchaseCost),
    location: row.location,
    condition: row.condition,
    description: row.description,
    supplier: row.supplier,
    warrantyExpiry: row.warrantyExpiry ?? "",
  };
}

function statusBadgeClass(status: AssetStatus) {
  switch (status) {
    case "available":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "assigned":
      return "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case "under_maintenance":
      return "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

export function HrmAssets() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<CompanyAsset[]>([]);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"all" | AssetStatus>("all");
  const [draftType, setDraftType] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | AssetStatus>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [viewRow, setViewRow] = useState<CompanyAsset | null>(null);
  const [detailTab, setDetailTab] = useState<AssetDetailTab>("assignments");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm([], []));

  const assetTypeOptions = useMemo(() => assetTypes.map((row) => row.name), [assetTypes]);
  const locationOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.location).filter(Boolean))).sort(),
    [rows],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [assetRows, typeRows] = await Promise.all([
          listCompanyAssets(),
          listHrmAssetTypesView(),
        ]);
        if (!cancelled) {
          setRows(assetRows);
          setAssetTypes(typeRows);
          setForm((prev) =>
            prev.assetType || prev.location
              ? prev
              : emptyForm(
                  typeRows.map((row) => row.name),
                  Array.from(new Set(assetRows.map((row) => row.location).filter(Boolean))).sort(),
                ),
          );
        }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load assets");
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
    if (typeFilter !== "all") list = list.filter((r) => r.assetType === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.assetType.toLowerCase().includes(q) ||
          r.assetCode.toLowerCase().includes(q) ||
          r.secondaryCode.toLowerCase().includes(q) ||
          r.location.toLowerCase().includes(q) ||
          (r.assignedTo?.toLowerCase().includes(q) ?? false),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, statusFilter, typeFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" || key === "status" || key === "location" ? "asc" : "desc");
    }
  }

  function openAdd() {
    setFormMode("add");
    setEditId(null);
    setForm(emptyForm(assetTypeOptions, locationOptions));
    setFormOpen(true);
  }

  function openEdit(row: CompanyAsset) {
    setFormMode("edit");
    setEditId(row.id);
    setForm(formFromRow(row));
    setFormOpen(true);
  }

  async function saveForm() {
    if (!form.name.trim() || !form.assetCode.trim() || !form.assetType.trim()) {
      toast.error("Name, asset type, and asset code are required");
      return;
    }
    const purchaseCost = Math.max(0, Number(form.purchaseCost) || 0);
    const assignedTo =
      form.status === "assigned"
        ? form.assignedTo.trim() || "Employee"
        : form.assignedTo.trim() || null;

    const detail =
      formMode === "edit" && editId
        ? (() => {
            const existing = rows.find((r) => r.id === editId);
            return {
              warrantyLabel: existing?.warrantyLabel ?? null,
              checkOutDate:
                form.status === "assigned"
                  ? (existing?.checkOutDate ?? form.purchaseDate)
                  : null,
              assignmentNotes:
                existing?.assignmentNotes ||
                (form.status === "assigned"
                  ? "Asset assigned for regular business use"
                  : ""),
              assignments: existing?.assignments ?? [],
              maintenance: existing?.maintenance ?? [],
              depreciation: existing?.depreciation ?? [],
            };
          })()
        : defaultAssetDetail(purchaseCost, form.purchaseDate, form.status, assignedTo);

    const payload: Omit<CompanyAsset, "id"> = {
      name: form.name.trim(),
      assetType: form.assetType.trim(),
      assetCode: form.assetCode.trim(),
      secondaryCode: form.secondaryCode.trim(),
      serialNumber: form.serialNumber.trim(),
      status: form.status,
      assignedTo: form.status === "available" || form.status === "disposed" ? null : assignedTo,
      purchaseDate: form.purchaseDate,
      purchaseCost,
      location: form.location,
      condition: form.condition,
      description: form.description.trim(),
      supplier: form.supplier.trim(),
      warrantyExpiry: form.warrantyExpiry || null,
      ...detail,
    };

    setSaving(true);
    try {
      if (formMode === "edit" && editId) {
        const updated = await updateCompanyAsset(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        setViewRow((v) => (v?.id === editId ? updated : v));
        toast.success("Asset updated");
      } else {
        const created = await createCompanyAsset(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Asset created");
      }
      setFormOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: CompanyAsset) {
    try {
      await deleteCompanyAsset(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setViewRow((v) => (v?.id === row.id ? null : v));
      toast.success("Asset deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function exportCsv() {
    const header = [
      "Name",
      "Type",
      "Asset Code",
      "Secondary Code",
      "Status",
      "Assigned To",
      "Purchase Date",
      "Purchase Cost",
      "Location",
    ];
    const lines = filtered.map((r) =>
      [
        r.name,
        r.assetType,
        r.assetCode,
        r.secondaryCode,
        ASSET_STATUS_LABEL[r.status],
        r.assignedTo ?? "",
        r.purchaseDate,
        r.purchaseCost,
        r.location,
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "assets.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported assets");
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Assets</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-none"
            onClick={exportCsv}
          >
            <Download className="size-3.5" />
            Export
          </Button>
          {canWrite ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-none"
              onClick={() => toast.message("Import: choose a CSV of assets")}
            >
              <Upload className="size-3.5" />
              Import
            </Button>
          ) : null}
          <Button asChild type="button" variant="outline" size="sm" className="h-9 rounded-none">
            <Link href="/hrm/assets/dashboard">
              <LayoutDashboard className="size-3.5" />
              Dashboard
            </Link>
          </Button>
          <Button asChild type="button" variant="outline" size="sm" className="h-9 rounded-none">
            <Link href="/hrm/assets/depreciation">
              <BarChart3 className="size-3.5" />
              Depreciation Report
            </Link>
          </Button>
          {canWrite ? (
            <Button type="button" size="sm" className={GREEN_BTN} onClick={openAdd}>
              <Plus className="size-3.5" />
              Add Asset
            </Button>
          ) : null}
        </div>
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
                onChange={(e) => setDraftStatus(e.target.value as "all" | AssetStatus)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {ASSET_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[160px] flex-col gap-1 text-xs text-muted-foreground">
              Type
              <select
                value={draftType}
                onChange={(e) => setDraftType(e.target.value)}
                className={fieldClass}
              >
                <option value="all">All</option>
                {assetTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
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
                <SortHeader label="Name" col="name" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Asset Code
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Status" col="status" />
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Assigned To
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Purchase Date" col="purchaseDate" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Purchase Cost" col="purchaseCost" />
              </th>
              <th className="px-3 py-2.5">
                <SortHeader label="Location" col="location" />
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
                    Loading assets...
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No assets found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {(pageSafe - 1) * perPage + idx + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.assetType}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="tabular-nums text-foreground">{row.assetCode}</div>
                    {row.secondaryCode ? (
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {row.secondaryCode}
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
                      {ASSET_STATUS_LABEL[row.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">{row.assignedTo || "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums">{row.purchaseDate}</td>
                  <td className="px-3 py-2.5 tabular-nums font-medium">
                    {formatAssetCost(row.purchaseCost)}
                  </td>
                  <td className="px-3 py-2.5">{row.location}</td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-none text-sky-600 dark:text-sky-400"
                        onClick={() => {
                          setDetailTab("assignments");
                          setViewRow(row);
                        }}
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

      <Sheet
        open={!!viewRow}
        onOpenChange={(o) => {
          if (!o) {
            setViewRow(null);
            setDetailTab("assignments");
          }
        }}
      >
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          resizeMaxWidth={960}
          className="flex w-[720px] min-w-[320px] max-w-[960px] flex-col gap-0 p-0"
          title="Asset details"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Asset Details</SheetTitle>
            <SheetDescription>View asset</SheetDescription>
          </SheetHeader>
          {viewRow ? (
            <HrmAssetDetail
              row={viewRow}
              tab={detailTab}
              onTabChange={setDetailTab}
              canWrite={canWrite}
              onEdit={() => {
                openEdit(viewRow);
                setViewRow(null);
                setDetailTab("assignments");
              }}
              onClose={() => {
                setViewRow(null);
                setDetailTab("assignments");
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent
          side="right"
          resizable
          closeButton="chevron"
          className="flex w-[460px] min-w-[160px] max-w-[720px] flex-col gap-0 p-0"
          title={formMode === "edit" ? "Edit Asset" : "Add Asset"}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base">
              {formMode === "edit" ? "Edit Asset" : "Add Asset"}
            </SheetTitle>
            <SheetDescription className="sr-only">Asset form</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Name *
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9 rounded-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Asset Type *
              <select
                value={form.assetType}
                onChange={(e) => setForm((f) => ({ ...f, assetType: e.target.value }))}
                className={fieldClass}
              >
                <option value="">Select type</option>
                {assetTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Asset Code *
                <Input
                  value={form.assetCode}
                  onChange={(e) => setForm((f) => ({ ...f, assetCode: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Secondary Code
                <Input
                  value={form.secondaryCode}
                  onChange={(e) => setForm((f) => ({ ...f, secondaryCode: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Serial Number
              <Input
                value={form.serialNumber}
                onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
                className="h-9 rounded-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Status
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as AssetStatus }))
                  }
                  className={fieldClass}
                >
                  {ASSET_STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Assigned To
                <Input
                  value={form.assignedTo}
                  onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
                  className="h-9 rounded-none"
                  placeholder="Employee name"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Purchase Date
                <Input
                  type="date"
                  value={form.purchaseDate}
                  onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Purchase Cost
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.purchaseCost}
                  onChange={(e) => setForm((f) => ({ ...f, purchaseCost: e.target.value }))}
                  className="h-9 rounded-none"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Location
                <select
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  className={fieldClass}
                >
                  <option value="">Select location</option>
                  {locationOptions.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Condition
                <select
                  value={form.condition}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, condition: e.target.value as AssetCondition }))
                  }
                  className={fieldClass}
                >
                  {ASSET_CONDITION_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Supplier
              <Input
                value={form.supplier}
                onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
                className="h-9 rounded-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Warranty Expiry
              <Input
                type="date"
                value={form.warrantyExpiry}
                onChange={(e) => setForm((f) => ({ ...f, warrantyExpiry: e.target.value }))}
                className="h-9 rounded-none"
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
          </div>
          <div className="flex gap-2 border-t border-border p-4">
            <Button
              type="button"
              size="sm"
              className={cn("h-9", GREEN_BTN)}
              onClick={() => void saveForm()}
              disabled={saving}
            >
              {formMode === "edit" ? "Save Changes" : "Create Asset"}
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
