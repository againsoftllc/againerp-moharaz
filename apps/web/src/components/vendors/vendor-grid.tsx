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
import { Archive, Ban, CheckCircle2, ExternalLink, Eye, Globe, Pencil, ShoppingCart, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VendorFormSheet } from "@/components/vendors/vendor-form-sheet";
import { VendorDetailDrawer } from "@/components/vendors/vendor-detail-drawer";
import { updateVendor, type Vendor, type VendorGroup, type VendorType } from "@/lib/api/vendors";

/**
 * Vendors list on the shared AgainListGrid datatable — same shape as the supplier / customer /
 * product grids: pinned row-actions + selection columns, user-scoped column chooser and filter
 * toggles, bulk banner, CSV export, mobile list, and an imperative handle for the page header menu.
 */

export const VENDOR_STATUSES = [
  "invited",
  "pending",
  "under_review",
  "approved",
  "active",
  "suspended",
  "blocked",
  "archived",
] as const;

const STATUS_LABEL: Record<string, string> = {
  invited: "Invited",
  pending: "Pending",
  under_review: "Under review",
  approved: "Approved",
  active: "Active",
  suspended: "Suspended",
  blocked: "Blocked",
  archived: "Archived",
};

const STATUS_TONE: Record<string, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  suspended: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  blocked: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  archived: "border-border bg-muted text-muted-foreground",
  invited: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  pending: "border-border text-muted-foreground",
  under_review: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

type FilterState = { search: string; status: string; type: string; group: string; portal: string };
const DEFAULT_FILTERS: FilterState = { search: "", status: "all", type: "all", group: "all", portal: "all" };

const DEFAULT_VISIBLE = {
  vendor: true,
  vendorCode: true,
  roles: true,
  type: true,
  group: true,
  contact: true,
  email: true,
  phone: false,
  country: false,
  paymentTerms: false,
  creditLimit: true,
  status: true,
  portal: true,
  lastOrder: false,
  updatedAt: false,
};

const COLUMN_LABELS: Record<keyof typeof DEFAULT_VISIBLE, string> = {
  vendor: "Vendor",
  vendorCode: "Code",
  roles: "Roles",
  type: "Type",
  group: "Group",
  contact: "Contact",
  email: "Email",
  phone: "Phone",
  country: "Country",
  paymentTerms: "Terms",
  creditLimit: "Credit limit",
  status: "Status",
  portal: "Portal",
  lastOrder: "Last order",
  updatedAt: "Updated",
};

const DEFAULT_VISIBLE_FILTERS = { search: true, status: true, type: true, group: true, portal: false };
const FILTER_LABELS: Record<keyof typeof DEFAULT_VISIBLE_FILTERS, string> = {
  search: "Search",
  status: "Status",
  type: "Type",
  group: "Group",
  portal: "Portal",
};

export type VendorGridHandle = {
  openCreate: () => void;
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
  exportCsv: () => void;
};

type Props = {
  vendors: Vendor[];
  vendorTypes: VendorType[];
  vendorGroups: VendorGroup[];
  loading?: boolean;
  onChanged?: () => void;
  onFilterCountChange?: (count: number) => void;
  headerLeftActions?: ReactNode;
  footerLeftActions?: ReactNode;
  className?: string;
};

export const VendorGrid = forwardRef<VendorGridHandle, Props>(function VendorGrid(
  { vendors, vendorTypes, vendorGroups, loading = false, onChanged, onFilterCountChange, headerLeftActions, footerLeftActions, className },
  ref,
) {
  const router = useRouter();
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<Vendor> | null>(null);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Vendor | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Vendor[]>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTargets, setArchiveTargets] = useState<Vendor[]>([]);
  const [archiving, setArchiving] = useState(false);

  const [visibleCols, setVisibleCols] = useUserScopedState("vendor-grid:columns", DEFAULT_VISIBLE);
  const [visibleFilters, setVisibleFilters] = useUserScopedState("vendor-grid:filters", DEFAULT_VISIBLE_FILTERS);
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(() => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }), [visibleFilters]);

  const typeName = useCallback((id: string | null) => vendorTypes.find((t) => t.id === id)?.name ?? "", [vendorTypes]);
  const groupName = useCallback((id: string | null) => vendorGroups.find((g) => g.id === id)?.name ?? "", [vendorGroups]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return vendors.filter((v) => {
      if (q && !`${v.vendor_code} ${v.company_name} ${v.display_name} ${v.contact_person} ${v.email} ${v.phone}`.toLowerCase().includes(q)) return false;
      // "all" hides archived vendors (the default); "everything" shows them too.
      if (filters.status === "all" && v.status === "archived") return false;
      if (filters.status !== "all" && filters.status !== "everything" && v.status !== filters.status) return false;
      if (filters.type !== "all" && v.vendor_type_id !== filters.type) return false;
      if (filters.group !== "all" && v.vendor_group_id !== filters.group) return false;
      if (filters.portal === "on" && !v.portal_enabled) return false;
      if (filters.portal === "off" && v.portal_enabled) return false;
      return true;
    });
  }, [vendors, filters]);

  const activeFilterCount = useMemo(
    () =>
      (filters.search.trim() ? 1 : 0) +
      (filters.status !== "all" ? 1 : 0) +
      (filters.type !== "all" ? 1 : 0) +
      (filters.group !== "all" ? 1 : 0) +
      (filters.portal !== "all" ? 1 : 0),
    [filters],
  );

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const patchVendor = useCallback(
    async (row: Vendor, patch: { status?: string; portal_enabled?: boolean }, message: string) => {
      try {
        await updateVendor(row.id, { company_name: row.company_name, ...patch });
        toast.success(message);
        onChanged?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    },
    [onChanged],
  );

  const openArchiveConfirm = useCallback((targets: Vendor[]) => {
    if (!targets.length) return;
    setArchiveTargets(targets);
    setArchiveOpen(true);
  }, []);

  const archiveVendors = useCallback(
    async (targets: Vendor[]) => {
      if (!targets.length) return;
      setArchiving(true);
      let done = 0;
      try {
        for (const row of targets) {
          await updateVendor(row.id, { company_name: row.company_name, status: "archived" });
          done += 1;
        }
        toast.success(`Archived ${done} vendor${done === 1 ? "" : "s"}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Archive failed");
      } finally {
        setArchiving(false);
        setArchiveOpen(false);
        setArchiveTargets([]);
        setSelected([]);
        gridApiRef.current?.deselectAll();
        onChanged?.();
      }
    },
    [onChanged],
  );

  const VendorRowMenu = useCallback(
    ({ data }: { data: Vendor }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => setViewId(data.id)}>
            <Eye className="mr-1.5 h-3 w-3" /> Open
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`/vendors/${data.id}`)}>
            <ExternalLink className="mr-1.5 h-3 w-3" /> Open full page
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`/vendors/order-requests?vendor=${data.id}`)}>
            <ShoppingCart className="mr-1.5 h-3 w-3" /> Order requests
          </DropdownMenuItem>
          {canWrite ? (
            <>
              <DropdownMenuItem
                onClick={() => {
                  setEditTarget(data);
                  setFormOpen(true);
                }}
              >
                <Pencil className="mr-1.5 h-3 w-3" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {data.status !== "active" ? (
                <DropdownMenuItem onClick={() => void patchVendor(data, { status: "active" }, `${data.company_name} activated`)}>
                  <CheckCircle2 className="mr-1.5 h-3 w-3" /> Activate
                </DropdownMenuItem>
              ) : null}
              {data.status !== "suspended" ? (
                <DropdownMenuItem onClick={() => void patchVendor(data, { status: "suspended" }, `${data.company_name} suspended`)}>
                  <Ban className="mr-1.5 h-3 w-3" /> Suspend
                </DropdownMenuItem>
              ) : null}
              {data.status !== "blocked" ? (
                <DropdownMenuItem onClick={() => void patchVendor(data, { status: "blocked" }, `${data.company_name} blocked`)}>
                  <Ban className="mr-1.5 h-3 w-3" /> Block
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onClick={() =>
                  void patchVendor(
                    data,
                    { portal_enabled: !data.portal_enabled },
                    `Portal ${data.portal_enabled ? "disabled" : "enabled"} for ${data.company_name}`,
                  )
                }
              >
                <Globe className="mr-1.5 h-3 w-3" /> {data.portal_enabled ? "Disable portal" : "Enable portal"}
              </DropdownMenuItem>
              {data.status !== "archived" ? (
                <DropdownMenuItem className="text-destructive" onClick={() => openArchiveConfirm([data])}>
                  <Archive className="mr-1.5 h-3 w-3" /> Archive
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [canWrite, router, patchVendor, openArchiveConfirm],
  );

  const columnDefs = useMemo<ColDef<Vendor>[]>(
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
        cellRenderer: (p: ICellRendererParams<Vendor>) => (p.data ? <VendorRowMenu data={p.data} /> : null),
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
        colId: "vendor",
        headerName: COLUMN_LABELS.vendor,
        hide: !resolvedCols.vendor,
        flex: 2,
        minWidth: 200,
        valueGetter: (p) => p.data?.company_name ?? "",
        tooltipValueGetter: (p) => p.data?.legal_name || p.data?.company_name || "",
        cellRenderer: (p: ICellRendererParams<Vendor>) =>
          p.data ? (
            <button type="button" className="truncate text-left font-medium hover:underline" onClick={() => setViewId(p.data!.id)}>
              {p.data.display_name || p.data.company_name}
            </button>
          ) : null,
      },
      {
        colId: "vendorCode",
        field: "vendor_code",
        headerName: COLUMN_LABELS.vendorCode,
        hide: !resolvedCols.vendorCode,
        width: 132,
        minWidth: 100,
        cellClass: "font-mono text-[11px]",
      },
      {
        colId: "roles",
        headerName: COLUMN_LABELS.roles,
        hide: !resolvedCols.roles,
        width: 170,
        minWidth: 140,
        sortable: false,
        valueGetter: (p) => (p.data?.roles ?? ["vendor"]).join(" "),
        cellRenderer: (p: ICellRendererParams<Vendor>) => {
          const roles = p.data?.roles ?? ["vendor"];
          return (
            <span className="inline-flex flex-wrap gap-1">
              {roles.includes("vendor") ? (
                <GridChipBadge className="border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400">Vendor</GridChipBadge>
              ) : null}
              {roles.includes("supplier") ? <GridChipBadge className="border-border">Supplier</GridChipBadge> : null}
              {roles.includes("customer") ? (
                <GridChipBadge className="border-[#00a09d]/40 bg-[#00a09d]/10 text-[#00a09d]">Customer</GridChipBadge>
              ) : null}
            </span>
          );
        },
      },
      {
        colId: "type",
        headerName: COLUMN_LABELS.type,
        hide: !resolvedCols.type,
        width: 140,
        minWidth: 110,
        valueGetter: (p) => typeName(p.data?.vendor_type_id ?? null),
        valueFormatter: (p) => p.value || "—",
      },
      {
        colId: "group",
        headerName: COLUMN_LABELS.group,
        hide: !resolvedCols.group,
        width: 140,
        minWidth: 110,
        valueGetter: (p) => groupName(p.data?.vendor_group_id ?? null),
        valueFormatter: (p) => p.value || "—",
      },
      {
        colId: "contact",
        field: "contact_person",
        headerName: COLUMN_LABELS.contact,
        hide: !resolvedCols.contact,
        flex: 1,
        minWidth: 140,
        valueFormatter: (p) => p.value || "—",
      },
      {
        colId: "email",
        field: "email",
        headerName: COLUMN_LABELS.email,
        hide: !resolvedCols.email,
        flex: 1,
        minWidth: 160,
        valueFormatter: (p) => p.value || "—",
      },
      {
        colId: "phone",
        field: "phone",
        headerName: COLUMN_LABELS.phone,
        hide: !resolvedCols.phone,
        width: 140,
        minWidth: 120,
        valueFormatter: (p) => p.value || "—",
      },
      {
        colId: "country",
        field: "country",
        headerName: COLUMN_LABELS.country,
        hide: !resolvedCols.country,
        width: 130,
        minWidth: 100,
        valueFormatter: (p) => p.value || "—",
      },
      {
        colId: "paymentTerms",
        field: "payment_terms",
        headerName: COLUMN_LABELS.paymentTerms,
        hide: !resolvedCols.paymentTerms,
        width: 120,
        minWidth: 90,
        valueFormatter: (p) => p.value || "—",
      },
      {
        colId: "creditLimit",
        headerName: COLUMN_LABELS.creditLimit,
        hide: !resolvedCols.creditLimit,
        width: 140,
        minWidth: 110,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueGetter: (p) => Number(p.data?.credit_limit ?? 0),
        valueFormatter: (p) => (p.data ? formatCurrency(Number(p.data.credit_limit || 0), p.data.currency) : ""),
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 130,
        minWidth: 100,
        cellRenderer: (p: ICellRendererParams<Vendor>) => {
          const status = p.data?.status;
          if (!status) return null;
          return (
            <GridChipBadge className={STATUS_TONE[status] ?? "border-border"} title={STATUS_LABEL[status] ?? status}>
              {STATUS_LABEL[status] ?? status}
            </GridChipBadge>
          );
        },
      },
      {
        colId: "portal",
        field: "portal_enabled",
        headerName: COLUMN_LABELS.portal,
        hide: !resolvedCols.portal,
        width: 96,
        minWidth: 80,
        cellRenderer: (p: ICellRendererParams<Vendor>) =>
          p.data ? (
            <GridChipBadge className={p.data.portal_enabled ? STATUS_TONE.active : STATUS_TONE.archived}>
              {p.data.portal_enabled ? "Enabled" : "Off"}
            </GridChipBadge>
          ) : null,
      },
      {
        colId: "lastOrder",
        field: "last_order_date",
        headerName: COLUMN_LABELS.lastOrder,
        hide: !resolvedCols.lastOrder,
        width: 120,
        minWidth: 100,
        valueFormatter: (p) => (p.value ? formatDate(p.value) : "—"),
      },
      {
        colId: "updatedAt",
        field: "updated_at",
        headerName: COLUMN_LABELS.updatedAt,
        hide: !resolvedCols.updatedAt,
        width: 120,
        minWidth: 100,
        valueFormatter: (p) => (p.value ? formatDate(p.value) : "—"),
      },
    ],
    [resolvedCols, canWrite, VendorRowMenu, typeName, groupName],
  );

  const exportSelected = useCallback(() => {
    const rows = selected.length ? selected : filtered;
    const header = ["Vendor", "Code", "Roles", "Type", "Group", "Contact", "Email", "Phone", "Country", "Terms", "Credit limit", "Currency", "Status", "Portal"];
    const body = rows.map((v) =>
      [
        v.company_name,
        v.vendor_code,
        (v.roles ?? ["vendor"]).join(" "),
        typeName(v.vendor_type_id),
        groupName(v.vendor_group_id),
        v.contact_person,
        v.email,
        v.phone,
        v.country,
        v.payment_terms,
        v.credit_limit,
        v.currency,
        v.status,
        v.portal_enabled ? "enabled" : "off",
      ]
        .map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} vendor${rows.length === 1 ? "" : "s"}`);
  }, [selected, filtered, typeName, groupName]);

  useImperativeHandle(ref, () => ({
    openCreate: () => {
      setEditTarget(null);
      setFormOpen(true);
    },
    openFilters: () => setFilterSheetOpen(true),
    openColumns: () => setColumnSheetOpen(true),
    resetFilters: () => setFilters(DEFAULT_FILTERS),
    exportCsv: exportSelected,
  }));

  const checkboxClass =
    "h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary";

  return (
    <AgainListGrid<Vendor>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      getRowId={(p) => p.data.id}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search ? (
            <Input
              placeholder="Search code, company, contact, email…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[240px] shrink-0 rounded-none"
            />
          ) : null}
          {resolvedVisibleFilters.status ? (
            <FilterSelect
              value={filters.status}
              onChange={(status) => setFilters((f) => ({ ...f, status }))}
              width="w-[150px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: "All except archived" },
                { value: "everything", label: "All incl. archived" },
                ...VENDOR_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
              ]}
            />
          ) : null}
          {resolvedVisibleFilters.type ? (
            <FilterSelect
              value={filters.type}
              onChange={(type) => setFilters((f) => ({ ...f, type }))}
              width="w-[150px]"
              className="shrink-0"
              ariaLabel="Vendor type"
              options={[{ value: "all", label: "All types" }, ...vendorTypes.map((t) => ({ value: t.id, label: t.name }))]}
            />
          ) : null}
          {resolvedVisibleFilters.group ? (
            <FilterSelect
              value={filters.group}
              onChange={(group) => setFilters((f) => ({ ...f, group }))}
              width="w-[150px]"
              className="shrink-0"
              ariaLabel="Vendor group"
              options={[{ value: "all", label: "All groups" }, ...vendorGroups.map((g) => ({ value: g.id, label: g.name }))]}
            />
          ) : null}
          {resolvedVisibleFilters.portal ? (
            <FilterSelect
              value={filters.portal}
              onChange={(portal) => setFilters((f) => ({ ...f, portal }))}
              width="w-[130px]"
              className="shrink-0"
              ariaLabel="Portal"
              options={[
                { value: "all", label: "Portal: any" },
                { value: "on", label: "Portal enabled" },
                { value: "off", label: "Portal off" },
              ]}
            />
          ) : null}
          {activeFilterCount > 0 ? (
            <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-none text-xs" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Clear
            </Button>
          ) : null}
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
              <Button variant="destructive" size="sm" className="rounded-none" onClick={() => openArchiveConfirm(selected)}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Archive
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
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : null
      }
      footerLeftActions={footerLeftActions}
      emptyTitle="No vendors match your filters"
      emptyHint="Add a vendor or clear the filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      onRowClicked={(row) => setViewId(row.id)}
      apiRef={gridApiRef}
      gridProps={{
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
      }}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((v) => (
            <button key={v.id} type="button" className="block w-full px-3 py-2.5 text-left" onClick={() => setViewId(v.id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{v.display_name || v.company_name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{v.vendor_code}</p>
                </div>
                <GridChipBadge className={cn("shrink-0", STATUS_TONE[v.status] ?? "border-border")}>{STATUS_LABEL[v.status] ?? v.status}</GridChipBadge>
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {[typeName(v.vendor_type_id), groupName(v.vendor_group_id), v.contact_person || v.email].filter(Boolean).join(" · ") || "—"}
              </p>
            </button>
          ))}
        </div>
      }
    >
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="right" title="Filters" resizable closeButton="inside" className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3">
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Filters</h2>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {(Object.keys(DEFAULT_VISIBLE_FILTERS) as (keyof typeof DEFAULT_VISIBLE_FILTERS)[]).map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={resolvedVisibleFilters[key]}
                  onChange={(e) => setVisibleFilters({ ...resolvedVisibleFilters, [key]: e.target.checked })}
                  className={checkboxClass}
                />
                <span>{FILTER_LABELS[key]}</span>
              </label>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent side="right" title="Columns" resizable closeButton="inside" className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3">
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Columns</h2>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {(Object.keys(DEFAULT_VISIBLE) as (keyof typeof DEFAULT_VISIBLE)[]).map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={resolvedCols[key]}
                  onChange={(e) => setVisibleCols({ ...resolvedCols, [key]: e.target.checked })}
                  className={checkboxClass}
                />
                <span>{COLUMN_LABELS[key]}</span>
              </label>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-3 h-7 rounded-none text-xs" onClick={() => setVisibleCols(DEFAULT_VISIBLE)}>
            Reset columns
          </Button>
        </SheetContent>
      </Sheet>

      <VendorDetailDrawer
        open={Boolean(viewId)}
        vendorId={viewId}
        onOpenChange={(next) => {
          if (!next) setViewId(null);
        }}
        onChanged={onChanged}
      />

      {/* key remounts the sheet per open so the form starts fresh */}
      <VendorFormSheet
        key={`${editTarget?.id ?? "new"}:${formOpen}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        vendor={editTarget}
        vendorTypes={vendorTypes}
        vendorGroups={vendorGroups}
        onSaved={() => onChanged?.()}
      />

      <Dialog.Root
        open={archiveOpen}
        onOpenChange={(open) => {
          if (!archiving) setArchiveOpen(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(400px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-none border border-input bg-background p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold">Archive vendor{archiveTargets.length === 1 ? "" : "s"}?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {archiveTargets.length === 1
                ? `"${archiveTargets[0]?.company_name}" will be archived. Vendors are never deleted — the record, its price lists and order history stay available.`
                : `${archiveTargets.length} vendors will be archived. Vendors are never deleted — records, price lists and order history stay available.`}
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" className="rounded-none" disabled={archiving} onClick={() => setArchiveOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="destructive" className="rounded-none" disabled={archiving} onClick={() => void archiveVendors(archiveTargets)}>
                {archiving ? "Archiving…" : "Archive"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AgainListGrid>
  );
});
