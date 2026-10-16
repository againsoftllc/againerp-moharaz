"use client";

import "@/components/providers/ag-grid-provider";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { ColDef, GridApi, ICellRendererParams } from "ag-grid-community";
import { Ban, Eye, Pencil, ShoppingCart, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import { cn, formatCurrency } from "@/lib/utils";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AgainPartnerDrawer } from "@/components/shared/again-partner-drawer";
import { SupplierDetailDrawer } from "@/components/suppliers/supplier-detail-drawer";
import { updateCommerceSupplierStatus, bulkDeleteCommerceSuppliers } from "@/lib/api/use-commerce-suppliers";
import type { Supplier, SupplierStatus } from "@/lib/mock-data/suppliers";

/** Keep numbers on the same edge as `numericColumn` headers (`cellClass` otherwise replaces AG Grid's). */
const NUMERIC_CELL = "ag-right-aligned-cell tabular-nums";
const NUMERIC_HEADER = "ag-right-aligned-header";

const STATUS_LABEL: Record<SupplierStatus, string> = {
  active: "Active",
  preferred: "Preferred",
  blocked: "Blocked",
};

const STATUS_TONE: Record<SupplierStatus, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  preferred: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  blocked: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

type FilterState = { search: string; status: string; country: string };
const DEFAULT_FILTERS: FilterState = { search: "", status: "all", country: "all" };

const DEFAULT_VISIBLE = {
  name: true,
  vendorCode: true,
  email: true,
  phone: true,
  country: true,
  paymentTerms: true,
  leadTimeDays: true,
  rating: true,
  openPos: true,
  spendYtd: true,
  buyerName: false,
  status: true,
  roles: true,
  updatedAt: false,
};

const COLUMN_LABELS: Record<keyof typeof DEFAULT_VISIBLE, string> = {
  name: "Supplier",
  vendorCode: "Code",
  email: "Email",
  phone: "Phone",
  country: "Country",
  paymentTerms: "Terms",
  leadTimeDays: "Lead time",
  rating: "Rating",
  openPos: "Open POs",
  spendYtd: "Spend YTD",
  buyerName: "Buyer",
  status: "Status",
  roles: "Roles",
  updatedAt: "Updated",
};

const DEFAULT_VISIBLE_FILTERS = { search: true, status: true, country: true };

export type SupplierGridHandle = {
  openCreate: () => void;
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
  exportCsv: () => void;
};

export const SupplierGrid = forwardRef<
  SupplierGridHandle,
  {
    suppliers: Supplier[];
    loading?: boolean;
    onChanged?: () => void;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    footerLeftActions?: ReactNode;
    className?: string;
  }
>(function SupplierGrid(
  { suppliers, loading = false, onChanged, onFilterCountChange, headerLeftActions, footerLeftActions, className },
  ref,
) {
  const router = useRouter();
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<Supplier> | null>(null);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Supplier[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<Supplier[]>([]);
  const [deleting, setDeleting] = useState(false);

  const [visibleCols, setVisibleCols] = useUserScopedState("supplier-grid:columns", DEFAULT_VISIBLE);
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "supplier-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const s of suppliers) if (s.country) set.add(s.country);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [suppliers]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (q && !`${s.vendorCode} ${s.name} ${s.email} ${s.phone}`.toLowerCase().includes(q))
        return false;
      if (filters.status !== "all" && s.status !== filters.status) return false;
      if (filters.country !== "all" && s.country !== filters.country) return false;
      return true;
    });
  }, [suppliers, filters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.status !== "all") n += 1;
    if (filters.country !== "all") n += 1;
    return n;
  }, [filters]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const setStatus = useCallback(
    async (row: Supplier, status: SupplierStatus) => {
      try {
        await updateCommerceSupplierStatus(row.id, status);
        toast.success(`${row.name} marked ${STATUS_LABEL[status].toLowerCase()}`);
        onChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Status update failed");
      }
    },
    [onChanged],
  );

  const openDeleteConfirm = useCallback((targets: Supplier[]) => {
    if (!targets.length) return;
    setDeleteTargets(targets);
    setDeleteOpen(true);
  }, []);

  const deleteSuppliers = useCallback(
    async (targets: Supplier[]) => {
      if (!targets.length) return;
      setDeleting(true);
      try {
        const result = await bulkDeleteCommerceSuppliers(targets.map((s) => s.id));
        setSelected([]);
        gridApiRef.current?.deselectAll();
        setDeleteOpen(false);
        setDeleteTargets([]);
        onChanged?.();
        if (result.deleted > 0) {
          toast.success(`Deleted ${result.deleted} supplier${result.deleted > 1 ? "s" : ""}`);
        }
        if (result.skipped.length > 0) {
          toast.error(
            `${result.skipped.length} supplier${result.skipped.length > 1 ? "s" : ""} skipped (purchase orders or payables linked)`,
          );
        }
        if (result.deleted === 0 && result.skipped.length === 0) {
          toast.error("No suppliers deleted");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      } finally {
        setDeleting(false);
      }
    },
    [onChanged],
  );

  const SupplierRowMenu = useCallback(
    ({ data }: { data: Supplier }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => setViewId(data.id)}>
            <Eye className="mr-1.5 h-3 w-3" /> Open
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => router.push(`/purchase/orders?supplier=${data.id}`)}
          >
            <ShoppingCart className="mr-1.5 h-3 w-3" /> Purchase orders
          </DropdownMenuItem>
          {canWrite && (
            <>
              <DropdownMenuItem onClick={() => setViewId(data.id)}>
                <Pencil className="mr-1.5 h-3 w-3" /> Edit
              </DropdownMenuItem>
              {data.status !== "preferred" && (
                <DropdownMenuItem onClick={() => void setStatus(data, "preferred")}>
                  <Star className="mr-1.5 h-3 w-3" /> Mark preferred
                </DropdownMenuItem>
              )}
              {data.status !== "blocked" ? (
                <DropdownMenuItem onClick={() => void setStatus(data, "blocked")}>
                  <Ban className="mr-1.5 h-3 w-3" /> Block
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => void setStatus(data, "active")}>
                  Unblock
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => openDeleteConfirm([data])}
              >
                <Trash2 className="mr-1.5 h-3 w-3" /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [canWrite, router, setStatus, openDeleteConfirm],
  );

  const columnDefs = useMemo<ColDef<Supplier>[]>(
    () => [
      {
        colId: "actions",
        headerName: "",
        width: 26,
        maxWidth: 26,
        minWidth: 26,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        suppressSizeToFit: true,
        sortable: false,
        headerClass: "product-grid-actions-col",
        cellClass: "product-grid-actions-col",
        headerComponent: GridFullscreenHeader,
        cellRenderer: (p: ICellRendererParams<Supplier>) =>
          p.data ? <SupplierRowMenu data={p.data} /> : null,
      },
      {
        colId: "controls",
        headerName: "",
        headerCheckboxSelection: canWrite,
        checkboxSelection: canWrite,
        width: canWrite ? 40 : 24,
        maxWidth: canWrite ? 40 : 24,
        minWidth: canWrite ? 40 : 24,
        pinned: "left",
        resizable: false,
        suppressMovable: true,
        suppressHeaderMenuButton: true,
        suppressSizeToFit: true,
        sortable: false,
        headerClass: "product-grid-controls-col",
        cellClass: "product-grid-controls-col",
      },
      {
        colId: "name",
        field: "name",
        headerName: COLUMN_LABELS.name,
        hide: !resolvedCols.name,
        flex: 2,
        minWidth: 180,
        tooltipField: "name",
        cellRenderer: (p: ICellRendererParams<Supplier>) =>
          p.data ? (
            <button
              type="button"
              className="truncate text-left hover:underline"
                onClick={() => setViewId(p.data!.id)}
            >
              {p.data.name}
            </button>
          ) : null,
      },
      {
        colId: "roles",
        headerName: COLUMN_LABELS.roles,
        hide: !resolvedCols.roles,
        width: 170,
        minWidth: 140,
        sortable: false,
        valueGetter: (p) => (p.data?.roles ?? []).join(" "),
        cellRenderer: (p: ICellRendererParams<Supplier>) => {
          const roles = p.data?.roles ?? ["supplier"];
          return (
            <span className="inline-flex flex-wrap gap-1">
              {roles.includes("supplier") ? (
                <GridChipBadge className="border-border">Supplier</GridChipBadge>
              ) : null}
              {roles.includes("customer") ? (
                <GridChipBadge className="border-[#00a09d]/40 bg-[#00a09d]/10 text-[#00a09d]">Customer</GridChipBadge>
              ) : null}
              {roles.includes("vendor") ? (
                <GridChipBadge className="border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400">Vendor</GridChipBadge>
              ) : null}
            </span>
          );
        },
      },
      {
        colId: "vendorCode",
        field: "vendorCode",
        headerName: COLUMN_LABELS.vendorCode,
        hide: !resolvedCols.vendorCode,
        width: 132,
        minWidth: 100,
        cellClass: "font-mono text-[11px]",
      },
      {
        colId: "email",
        field: "email",
        headerName: COLUMN_LABELS.email,
        hide: !resolvedCols.email,
        flex: 1,
        minWidth: 150,
      },
      {
        colId: "phone",
        field: "phone",
        headerName: COLUMN_LABELS.phone,
        hide: !resolvedCols.phone,
        width: 150,
        minWidth: 120,
      },
      {
        colId: "country",
        field: "country",
        headerName: COLUMN_LABELS.country,
        hide: !resolvedCols.country,
        width: 130,
        minWidth: 100,
      },
      {
        colId: "paymentTerms",
        field: "paymentTerms",
        headerName: COLUMN_LABELS.paymentTerms,
        hide: !resolvedCols.paymentTerms,
        width: 110,
        minWidth: 90,
      },
      {
        colId: "leadTimeDays",
        field: "leadTimeDays",
        headerName: COLUMN_LABELS.leadTimeDays,
        hide: !resolvedCols.leadTimeDays,
        width: 110,
        minWidth: 90,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => (p.value == null ? "" : `${p.value}d`),
      },
      {
        colId: "rating",
        field: "rating",
        headerName: COLUMN_LABELS.rating,
        hide: !resolvedCols.rating,
        width: 96,
        minWidth: 76,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => (p.value ? Number(p.value).toFixed(1) : "—"),
      },
      {
        colId: "openPos",
        field: "openPos",
        headerName: COLUMN_LABELS.openPos,
        hide: !resolvedCols.openPos,
        width: 104,
        minWidth: 84,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: `${NUMERIC_CELL} font-medium`,
      },
      {
        colId: "spendYtd",
        field: "spendYtd",
        headerName: COLUMN_LABELS.spendYtd,
        hide: !resolvedCols.spendYtd,
        width: 140,
        minWidth: 110,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => formatCurrency(Number(p.value ?? 0)),
      },
      {
        colId: "buyerName",
        field: "buyerName",
        headerName: COLUMN_LABELS.buyerName,
        hide: !resolvedCols.buyerName,
        width: 140,
        minWidth: 110,
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 120,
        minWidth: 100,
        cellRenderer: (p: ICellRendererParams<Supplier>) => {
          const status = p.data?.status;
          if (!status) return null;
          return (
            <GridChipBadge className={STATUS_TONE[status]} title={STATUS_LABEL[status]}>
              {STATUS_LABEL[status]}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "updatedAt",
        field: "updatedAt",
        headerName: COLUMN_LABELS.updatedAt,
        hide: !resolvedCols.updatedAt,
        width: 116,
        minWidth: 96,
      },
    ],
    [resolvedCols, canWrite, SupplierRowMenu],
  );

  const exportSelected = useCallback(() => {
    const rows = selected.length ? selected : filtered;
    const header = ["Supplier", "Code", "Email", "Phone", "Country", "Terms", "Open POs", "Spend YTD", "Status"];
    const body = rows.map((r) =>
      [r.name, r.vendorCode, r.email, r.phone, r.country, r.paymentTerms, r.openPos, r.spendYtd, r.status]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `suppliers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} supplier${rows.length === 1 ? "" : "s"}`);
  }, [selected, filtered]);

  useImperativeHandle(ref, () => ({
    openCreate: () => setCreateOpen(true),
    openFilters: () => setFilterSheetOpen(true),
    openColumns: () => setColumnSheetOpen(true),
    resetFilters: () => setFilters(DEFAULT_FILTERS),
    exportCsv: exportSelected,
  }));

  return (
    <AgainListGrid<Supplier>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search code, name, email…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[240px] shrink-0 rounded-none"
            />
          )}
          {resolvedVisibleFilters.status && (
            <FilterSelect
              value={filters.status}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
              width="w-[150px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "preferred", label: "Preferred" },
                { value: "blocked", label: "Blocked" },
              ]}
            />
          )}
          {resolvedVisibleFilters.country && (
            <FilterSelect
              value={filters.country}
              onChange={(country) => setFilters((f) => ({ ...f, country }))}
              width="w-[170px]"
              className="shrink-0"
              ariaLabel="Country"
              options={[
                { value: "all", label: "All countries" },
                ...countries.map((c) => ({ value: c, label: c })),
              ]}
            />
          )}
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 rounded-none text-xs"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              Clear
            </Button>
          )}
        </>
      }
      banner={
        selected.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-2 py-1.5">
          <span className="text-xs font-medium">{selected.length} selected</span>
          <Button variant="outline" size="sm" className="rounded-none" onClick={exportSelected}>
            Export selected
          </Button>
          {canWrite ? (
            <Button
              variant="destructive"
              size="sm"
              className="rounded-none"
              onClick={() => openDeleteConfirm(selected)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 w-7 rounded-none p-0"
            onClick={() => {
              setSelected([]);
              gridApiRef.current?.deselectAll();
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        ) : null
      }
      footerLeftActions={footerLeftActions}
      emptyTitle="No suppliers match your filters"
      emptyHint="Add a supplier or clear the filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      apiRef={gridApiRef}
      gridProps={{
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
      }}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              className="block w-full px-3 py-2.5 text-left"
              onClick={() => setViewId(s.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {s.vendorCode}
                  </p>
                </div>
                <GridChipBadge className={cn("shrink-0", STATUS_TONE[s.status])}>
                  {STATUS_LABEL[s.status]}
                </GridChipBadge>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {s.country} · {s.paymentTerms} · {s.openPos} open PO
              </p>
            </button>
          ))}
        </div>
      }
    >
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent
          side="right"
          title="Filters"
          resizable
          closeButton="inside"
          className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
        >
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Filters</h2>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {(Object.keys(DEFAULT_VISIBLE_FILTERS) as (keyof typeof DEFAULT_VISIBLE_FILTERS)[]).map(
              (key) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={resolvedVisibleFilters[key]}
                    onChange={(e) =>
                      setVisibleFilters({ ...resolvedVisibleFilters, [key]: e.target.checked })
                    }
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                  />
                  <span className="capitalize">{key}</span>
                </label>
              ),
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent
          side="right"
          title="Columns"
          resizable
          closeButton="inside"
          className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
        >
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Columns</h2>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {(Object.keys(DEFAULT_VISIBLE) as (keyof typeof DEFAULT_VISIBLE)[]).map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={resolvedCols[key]}
                  onChange={(e) => setVisibleCols({ ...resolvedCols, [key]: e.target.checked })}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                />
                <span>{COLUMN_LABELS[key]}</span>
              </label>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <SupplierDetailDrawer
        open={Boolean(viewId)}
        supplierId={viewId}
        supplier={viewId ? (suppliers.find((row) => row.id === viewId) ?? null) : null}
        onOpenChange={(next) => {
          if (!next) setViewId(null);
        }}
        onChanged={onChanged}
      />
      {/* key remounts the drawer per open, so the form starts fresh */}
      <AgainPartnerDrawer
        key={`new:${createOpen}`}
        open={createOpen}
        customer={null}
        mode="create"
        originRole="supplier"
        onOpenChange={setCreateOpen}
        onSaved={onChanged}
      />
      <Dialog.Root
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleting) setDeleteOpen(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(400px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-none border border-input bg-background p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold">
              Delete supplier{deleteTargets.length === 1 ? "" : "s"}?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {deleteTargets.length === 1
                ? `"${deleteTargets[0]?.name}" will be permanently deleted. Suppliers with purchase orders or payables are skipped.`
                : `${deleteTargets.length} suppliers will be permanently deleted. Suppliers with purchase orders or payables are skipped.`}
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-none"
                disabled={deleting}
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="rounded-none"
                disabled={deleting}
                onClick={() => void deleteSuppliers(deleteTargets)}
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AgainListGrid>
  );
});
