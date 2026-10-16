"use client";

import "@/components/providers/ag-grid-provider";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { ColDef, GridApi, ICellRendererParams } from "ag-grid-community";
import { Check, Pencil, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { Badge } from "@/components/ui/badge";
import { GRID_CHIP_CLASS, GridChipBadge } from "@/components/shared/grid-chip-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WarehouseFormDialog } from "@/components/inventory/warehouse-form-dialog";
import { deleteWarehouse, updateWarehouse } from "@/lib/api/inventory";
import type { Warehouse } from "@/lib/mock-data/inventory";

const DEFAULT_VISIBLE = {
  name: true,
  code: true,
  branchName: true,
  type: true,
  address: true,
  locations: true,
  totalUnits: true,
  active: true,
  isDefault: true,
};

const COLUMN_LABELS: Record<keyof typeof DEFAULT_VISIBLE, string> = {
  name: "Name",
  code: "Code",
  branchName: "Branch",
  type: "Type",
  address: "Address",
  locations: "Locations",
  totalUnits: "Units on hand",
  active: "Active",
  isDefault: "Default",
};

export type WarehouseGridHandle = {
  openCreate: () => void;
  openColumns: () => void;
  exportCsv: () => void;
};

export const WarehouseGrid = forwardRef<
  WarehouseGridHandle,
  {
    warehouses: Warehouse[];
    loading?: boolean;
    onChanged?: () => void;
    headerLeftActions?: ReactNode;
    footerLeftActions?: ReactNode;
    className?: string;
  }
>(function WarehouseGrid(
  { warehouses, loading = false, onChanged, headerLeftActions, footerLeftActions, className },
  ref,
) {
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<Warehouse> | null>(null);

  const [search, setSearch] = useState("");
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Warehouse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);
  const [visibleCols, setVisibleCols] = useUserScopedState(
    "warehouse-grid:columns",
    DEFAULT_VISIBLE,
  );
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);

  const exportCsv = useCallback(() => {
    gridApiRef.current?.exportDataAsCsv({ fileName: "warehouses.csv" });
  }, []);

  useImperativeHandle(ref, () => ({
    openCreate: () => {
      setEditTarget(null);
      setFormOpen(true);
    },
    openColumns: () => setColumnSheetOpen(true),
    exportCsv,
  }));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return warehouses;
    return warehouses.filter((w) =>
      `${w.code} ${w.name} ${w.type} ${w.address}`.toLowerCase().includes(q),
    );
  }, [warehouses, search]);

  const makeDefault = useCallback(
    async (row: Warehouse) => {
      try {
        await updateWarehouse(row.id, { isDefault: true });
        toast.success(`${row.name} is now the default warehouse`);
        onChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not set default");
      }
    },
    [onChanged],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteWarehouse(deleteTarget.id);
      toast.success(`${deleteTarget.name} deleted`);
      setDeleteTarget(null);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }, [deleteTarget, onChanged]);

  const WarehouseRowMenu = useCallback(
    ({ data }: { data: Warehouse }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {canWrite && (
            <>
              <DropdownMenuItem
                onClick={() => {
                  setEditTarget(data);
                  setFormOpen(true);
                }}
              >
                <Pencil className="mr-1.5 h-3 w-3" /> Edit
              </DropdownMenuItem>
              {!data.isDefault && (
                <DropdownMenuItem onClick={() => void makeDefault(data)}>
                  <Star className="mr-1.5 h-3 w-3" /> Make default
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setDeleteTarget(data)}>
                <Trash2 className="mr-1.5 h-3 w-3" /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [canWrite, makeDefault],
  );

  const columnDefs = useMemo<ColDef<Warehouse>[]>(
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
        cellRenderer: (p: ICellRendererParams<Warehouse>) =>
          p.data ? <WarehouseRowMenu data={p.data} /> : null,
      },
      {
        colId: "name",
        field: "name",
        headerName: COLUMN_LABELS.name,
        hide: !resolvedCols.name,
        flex: 2,
        minWidth: 160,
        tooltipField: "name",
      },
      {
        colId: "code",
        field: "code",
        headerName: COLUMN_LABELS.code,
        hide: !resolvedCols.code,
        width: 130,
        minWidth: 100,
        cellClass: "font-mono text-[11px]",
      },
      {
        colId: "branchName",
        field: "branchName",
        headerName: COLUMN_LABELS.branchName,
        hide: !resolvedCols.branchName,
        width: 160,
        minWidth: 120,
        valueFormatter: (p) => (p.value ? String(p.value) : "—"),
      },
      {
        colId: "type",
        field: "type",
        headerName: COLUMN_LABELS.type,
        hide: !resolvedCols.type,
        width: 160,
        minWidth: 120,
      },
      {
        colId: "address",
        field: "address",
        headerName: COLUMN_LABELS.address,
        hide: !resolvedCols.address,
        flex: 2,
        minWidth: 180,
        tooltipField: "address",
      },
      {
        colId: "locations",
        field: "locations",
        headerName: COLUMN_LABELS.locations,
        hide: !resolvedCols.locations,
        width: 110,
        minWidth: 90,
        type: "numericColumn",
        cellClass: "tabular-nums",
      },
      {
        colId: "totalUnits",
        field: "totalUnits",
        headerName: COLUMN_LABELS.totalUnits,
        hide: !resolvedCols.totalUnits,
        width: 130,
        minWidth: 104,
        type: "numericColumn",
        cellClass: "tabular-nums font-medium",
      },
      {
        colId: "active",
        field: "active",
        headerName: COLUMN_LABELS.active,
        hide: !resolvedCols.active,
        width: 96,
        minWidth: 80,
        cellRenderer: (p: ICellRendererParams<Warehouse>) =>
          p.data?.active ? (
            <GridChipBadge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              Active
            </GridChipBadge>
          ) : (
            <GridChipBadge variant="muted">Inactive</GridChipBadge>
          ),
      },
      {
        colId: "isDefault",
        field: "isDefault",
        headerName: COLUMN_LABELS.isDefault,
        hide: !resolvedCols.isDefault,
        width: 96,
        minWidth: 80,
        cellRenderer: (p: ICellRendererParams<Warehouse>) =>
          p.data?.isDefault ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-foreground">
              <Check className="h-3 w-3 text-emerald-500" aria-hidden /> Default
            </span>
          ) : null,
      },
    ],
    [resolvedCols, WarehouseRowMenu],
  );

  return (
    <AgainListGrid<Warehouse>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <Input
          placeholder="Search code, name, type…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[240px] shrink-0 rounded-none"
        />
      }
      footerLeftActions={footerLeftActions}
      emptyTitle="No warehouses found"
      emptyHint="Create a warehouse to start tracking stock"
      onOpenColumns={() => setColumnSheetOpen(true)}
      apiRef={gridApiRef}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((w) => (
            <div key={w.id} className="px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{w.name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{w.code}</p>
                </div>
                {w.isDefault && (
                  <Badge variant="muted" className={cn("shrink-0", GRID_CHIP_CLASS)}>
                    Default
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {w.type} · {w.totalUnits} units · {w.locations} locations
              </p>
            </div>
          ))}
        </div>
      }
    >
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

      {/* key remounts the form per open, so its fields start fresh without a reset effect */}
      <WarehouseFormDialog
        key={`${editTarget?.id ?? "new"}:${formOpen}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        warehouse={editTarget}
        onSaved={onChanged}
      />

      <Dialog.Root open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(400px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-none border border-input bg-background p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold">Delete warehouse?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {`"${deleteTarget?.name}" will be removed. Locations with stock on hand cannot be deleted. If this is the default, another location becomes default.`}
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button size="sm" variant="destructive" onClick={() => void confirmDelete()}>
                Delete
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AgainListGrid>
  );
});
