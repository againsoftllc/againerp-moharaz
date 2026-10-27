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
  type SyntheticEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { ColDef, GridApi, ICellRendererParams, SortChangedEvent } from "ag-grid-community";
import { gridToTable } from "@/lib/list-io/grid-table";
import type { TableData } from "@/lib/list-io/spreadsheet";
import {
  ClipboardList,
  Crown,
  Eye,
  MoreHorizontal,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_GROUP_LABELS,
  type CustomerStatus,
} from "@/lib/mock-data/customers";
import {
  bulkDeleteCommerceCustomers,
  type CustomerListRow,
  type CustomerListSortKey,
} from "@/lib/api/commerce-customers";
import { useCustomerStore } from "@/lib/store/customer-store";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { FilterSelect } from "@/components/shared/filter-select";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CustomerListFilter } from "@/components/customers/customers-module-chrome";
import { CustomerMobileCards } from "@/components/customers/customer-mobile-cards";
import { useActivityStore } from "@/lib/store/activity-store";

// ─── Columns ──────────────────────────────────────────────────────────────────

type Customer = CustomerListRow;

const COLUMN_KEYS = [
  "customerId",
  "company",
  "phone",
  "additionalPhone",
  "email",
  "address",
  "city",
  "region",
  "country",
  "group",
  "tags",
  "totalOrders",
  "totalSpend",
  "due",
  "advance",
  "walletBalance",
  "rewardPoints",
  "openingBalance",
  "creditLimit",
  "lastOrderDate",
  "customerSince",
  "assignedStaff",
  "riskScore",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  customerId: "Customer ID",
  company: "Company",
  phone: "Phone",
  additionalPhone: "Additional Phone",
  email: "Email",
  address: "Address",
  city: "City",
  region: "State / Region",
  country: "Country",
  group: "Group",
  tags: "Tags",
  totalOrders: "Orders",
  totalSpend: "Total Spend",
  due: "Due",
  advance: "Advance",
  walletBalance: "Wallet",
  rewardPoints: "Points",
  openingBalance: "Opening Balance",
  creditLimit: "Credit Limit",
  lastOrderDate: "Last Order",
  customerSince: "Customer Since",
  assignedStaff: "Assigned Staff",
  riskScore: "Risk Score",
};

const DEFAULT_VISIBLE_COLUMNS: Record<ColumnKey, boolean> = {
  customerId: true,
  company: false,
  phone: true,
  additionalPhone: false,
  email: false,
  address: false,
  city: true,
  region: false,
  country: false,
  group: true,
  tags: false,
  totalOrders: true,
  totalSpend: true,
  due: true,
  advance: true,
  walletBalance: false,
  rewardPoints: false,
  openingBalance: false,
  creditLimit: false,
  lastOrderDate: true,
  customerSince: false,
  assignedStaff: true,
  riskScore: false,
};

const COLUMNS_STORAGE_KEY = "customers.columns";

function readStoredColumns(): Record<ColumnKey, boolean> {
  const next = { ...DEFAULT_VISIBLE_COLUMNS };
  if (typeof window === "undefined") return next;
  try {
    const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (!raw) return next;
    const parsed = JSON.parse(raw) as Partial<Record<ColumnKey, boolean>>;
    for (const key of COLUMN_KEYS) {
      if (typeof parsed[key] === "boolean") next[key] = parsed[key] as boolean;
    }
  } catch {
    /* storage unavailable or corrupt — fall back to defaults */
  }
  return next;
}

function writeStoredColumns(columns: Record<ColumnKey, boolean>) {
  try {
    window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(columns));
  } catch {
    /* storage unavailable */
  }
}

/** Grid column → list API sort key. Anything else is not sortable in server mode
 * (a client sort would only reorder the loaded page). */
const SERVER_SORT_BY_COLUMN: Partial<Record<string, CustomerListSortKey>> = {
  name: "name",
  totalOrders: "total_orders",
  totalSpend: "total_spend",
  due: "due",
  advance: "advance",
  lastOrderDate: "last_order_date",
  customerSince: "customer_since",
};

function moneyFormatter(p: { value: unknown }) {
  return formatCurrency(Number(p.value ?? 0));
}

function getPrimaryCustomerAddress(customer: Customer) {
  return (
    customer.addresses?.find(
      (a) => a.contactType !== "related" && (a.isDefault || a.contactType === "primary"),
    ) ?? customer.addresses?.find((a) => a.contactType !== "related")
  );
}

function getCustomerAdditionalPhone(customer: Customer): string {
  const mobile = getPrimaryCustomerAddress(customer)?.mobile?.trim() ?? "";
  const phone = customer.phone?.trim() ?? "";
  if (!mobile || mobile === phone) return "";
  return mobile;
}

function getCustomerAddressLine(customer: Customer): string {
  const primary = getPrimaryCustomerAddress(customer);
  const parts = [primary?.address?.trim(), primary?.street2?.trim()].filter(Boolean);
  return parts.join(", ");
}

// ─── Filters ──────────────────────────────────────────────────────────────────

// Only filters the list API applies across all rows. Page-local filters were
// removed: they silently narrowed the 25 loaded rows against a server total.
const FILTER_KEYS = ["search", "status", "group", "hasDue"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const FILTER_LABELS: Record<FilterKey, string> = {
  search: "Search",
  status: "Status",
  group: "Group",
  hasDue: "Has due",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterKey, boolean> = {
  search: true,
  status: true,
  group: true,
  hasDue: true,
};

type FilterState = {
  search: string;
  group: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  group: "all",
};

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  className?: string;
  customers?: Customer[];
  loading?: boolean;
  onStatusChange?: (id: string, status: CustomerStatus) => void | Promise<void>;
  /** Ignored — list always uses AgainListGrid chrome. Kept so callers can still pass it. */
  chromeMode?: boolean;
  listFilter?: CustomerListFilter;
  onListFilterChange?: (filter: CustomerListFilter) => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onFilteredCountChange?: (count: number) => void;
  onAdvancedFilterCountChange?: (count: number) => void;
  footerLeftActions?: ReactNode;
  headerLeftActions?: ReactNode;
  onOpenCustomer?: (customer: Customer) => void;
  onCustomersChanged?: () => void;
  serverTotal?: number;
  /** Sum of outstanding balances for the current server filter (summary line). */
  serverTotalDue?: number;
  serverPage?: number;
  serverPageSize?: number;
  onServerPageChange?: (page: number) => void;
  onServerPageSizeChange?: (pageSize: number) => void;
  onGroupQueryChange?: (group: string | undefined) => void;
  hasDue?: boolean;
  onHasDueChange?: (hasDue: boolean) => void;
  /** Column-header sort in server mode → refetch with this sort. */
  onSortChange?: (sort: { sort: CustomerListSortKey; order: "asc" | "desc" }) => void;
};

export type CustomerGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  openCreate: () => void;
  /** The visible columns of the rows loaded in the grid (the current page). */
  getExportTable: (opts?: { numbersAsText?: boolean }) => TableData;
};

export const CustomerGrid = forwardRef<CustomerGridHandle, Props>(function CustomerGrid(
  {
    className,
    customers: customersProp,
    loading = false,
    onStatusChange,
    listFilter: listFilterProp,
    onListFilterChange,
    searchQuery: searchQueryProp,
    onSearchChange,
    onFilteredCountChange,
    onAdvancedFilterCountChange,
    footerLeftActions,
    headerLeftActions,
    onOpenCustomer,
    onCustomersChanged,
    serverTotal,
    serverTotalDue,
    serverPage = 0,
    serverPageSize = 25,
    onServerPageChange,
    onServerPageSizeChange,
    onGroupQueryChange,
    hasDue = false,
    onHasDueChange,
    onSortChange,
  },
  ref,
) {
  const router = useRouter();
  const canWrite = useAdminCanWrite();
  const storeCustomers = useCustomerStore((s) => s.customers);
  const storeUpdateStatus = useCustomerStore((s) => s.updateStatus);
  const customers: Customer[] = customersProp ?? storeCustomers;
  const updateStatus = useCallback(
    (id: string, status: CustomerStatus) => {
      if (onStatusChange) {
        void onStatusChange(id, status);
        return;
      }
      storeUpdateStatus(id, status);
    },
    [onStatusChange, storeUpdateStatus],
  );

  const [activeTab, setActiveTab] = useState<CustomerStatus | "all">("all");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [visibleFilters, setVisibleFilters] = useState(DEFAULT_VISIBLE_FILTERS);
  const [visibleColumns, setVisibleColumns] = useState(readStoredColumns);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [selected, setSelected] = useState<Customer[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<Customer[]>([]);
  const [deleting, setDeleting] = useState(false);
  const serverPaging = typeof serverTotal === "number";
  const handleServerPageChange = useCallback(
    (next: number) => {
      onServerPageChange?.(next);
    },
    [onServerPageChange],
  );

  const openDeleteConfirm = useCallback((targets: Customer[]) => {
    if (!targets.length) return;
    setDeleteTargets(targets);
    setDeleteOpen(true);
  }, []);

  const deleteCustomers = useCallback(
    async (targets: Customer[]) => {
      if (!targets.length) return;
      setDeleting(true);
      try {
        const result = await bulkDeleteCommerceCustomers(targets.map((c) => c.id));
        setSelected([]);
        setDeleteOpen(false);
        setDeleteTargets([]);
        onCustomersChanged?.();
        if (result.deleted > 0) {
          toast.success(
            `Deleted ${result.deleted} customer${result.deleted > 1 ? "s" : ""}`,
          );
        }
        if (result.skipped.length > 0) {
          toast.error(
            `${result.skipped.length} customer${result.skipped.length > 1 ? "s" : ""} skipped (orders linked or missing)`,
          );
        }
        if (result.deleted === 0 && result.skipped.length === 0) {
          toast.error("No customers deleted");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      } finally {
        setDeleting(false);
      }
    },
    [onCustomersChanged],
  );

  const openCustomer = useCallback(
    (customer: Customer) => {
      if (onOpenCustomer) {
        onOpenCustomer(customer);
        return;
      }
      router.push(`/customers/${customer.id}`);
    },
    [onOpenCustomer, router],
  );

  const gridApiRef = useRef<GridApi<Customer> | null>(null);
  useImperativeHandle(ref, () => ({
    openFilters: () => setFilterSheetOpen(true),
    openColumns: () => setColumnSheetOpen(true),
    openCreate: () => {},
    getExportTable: (opts) => (gridApiRef.current ? gridToTable<Customer>(gridApiRef.current, opts) : { headers: [], rows: [] }),
  }));

  useEffect(() => {
    if (searchQueryProp !== undefined) {
      setFilters((f) => ({ ...f, search: searchQueryProp }));
    }
  }, [searchQueryProp]);

  useEffect(() => {
    if (listFilterProp !== undefined) {
      setActiveTab(listFilterProp);
    }
  }, [listFilterProp]);

  useEffect(() => {
    writeStoredColumns(visibleColumns);
  }, [visibleColumns]);

  const rows = useMemo(() => {
    if (serverPaging) return customers;
    return customers.filter((c) => {
      if (activeTab !== "all" && c.status !== activeTab) return false;
      const q = filters.search.toLowerCase().trim();
      if (q) {
        const company = (c.parentCompany ?? "").toLowerCase();
        const additional = getCustomerAdditionalPhone(c).toLowerCase();
        const address = getCustomerAddressLine(c).toLowerCase();
        const tagHay = (c.tags ?? []).join(" ").toLowerCase();
        const hit =
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.customerId.toLowerCase().includes(q) ||
          company.includes(q) ||
          additional.includes(q) ||
          address.includes(q) ||
          tagHay.includes(q);
        if (!hit) return false;
      }
      if (filters.group !== "all" && c.group !== filters.group) return false;
      if (hasDue && !((c.due ?? 0) > 0)) return false;
      return true;
    });
  }, [customers, activeTab, filters, serverPaging, hasDue]);

  const activeFilterCount = [
    filters.search !== "",
    activeTab !== "all",
    filters.group !== "all",
    hasDue,
  ].filter(Boolean).length;

  useEffect(() => {
    onFilteredCountChange?.(serverPaging ? (serverTotal ?? 0) : rows.length);
  }, [rows.length, onFilteredCountChange, serverPaging, serverTotal]);

  useEffect(() => {
    onAdvancedFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onAdvancedFilterCountChange]);

  const toggleVisibleFilter = (key: FilterKey, enabled: boolean) => {
    setVisibleFilters((v) => ({ ...v, [key]: enabled }));
    if (enabled) return;
    if (key === "status") {
      setActiveTab("all");
      onListFilterChange?.("all");
    }
    if (key === "search") {
      onSearchChange?.("");
      setFilters((f) => ({ ...f, search: "" }));
    }
    if (key === "group") {
      onGroupQueryChange?.(undefined);
      setFilters((f) => ({ ...f, group: "all" }));
    }
    if (key === "hasDue") onHasDueChange?.(false);
  };

  const resetAllFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setVisibleFilters(DEFAULT_VISIBLE_FILTERS);
    setActiveTab("all");
    onSearchChange?.("");
    onListFilterChange?.("all");
    onGroupQueryChange?.(undefined);
    onHasDueChange?.(false);
  };

  const handleSortChanged = useCallback(
    (e: SortChangedEvent<Customer>) => {
      if (!serverPaging || !onSortChange) return;
      const sorted = e.api
        .getColumnState()
        .filter((c) => c.sort)
        .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))[0];
      const key = sorted ? SERVER_SORT_BY_COLUMN[sorted.colId] : undefined;
      onSortChange(
        key && sorted
          ? { sort: key, order: sorted.sort === "desc" ? "desc" : "asc" }
          : { sort: "name", order: "asc" },
      );
    },
    [serverPaging, onSortChange],
  );

  // ── Cell renderers ────────────────────────────────────────────────────────

  const StatusCell = useCallback(
    ({ data }: ICellRendererParams<Customer>) => {
      if (!data) return null;
      if (!canWrite) {
        return (
          <span className="text-[11px] font-medium capitalize">
            {CUSTOMER_STATUS_LABELS[data.status]}
          </span>
        );
      }
      const stopRowOpen = (e: SyntheticEvent) => {
        e.stopPropagation();
      };
      return (
        <Select
          className="h-7 min-w-[100px] border-0 bg-transparent text-[11px] shadow-none"
          value={data.status}
          onChange={(e) => {
            updateStatus(data.id, e.target.value as CustomerStatus);
            toast.success(`${data.name} → ${CUSTOMER_STATUS_LABELS[e.target.value as CustomerStatus]}`);
          }}
          onClick={stopRowOpen}
          onMouseDown={stopRowOpen}
          onPointerDown={stopRowOpen}
        >
          {Object.entries(CUSTOMER_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
      );
    },
    [updateStatus, canWrite],
  );

  const RiskCell = useCallback(({ data }: ICellRendererParams<Customer>) => {
    if (!data) return null;
    const color =
      data.riskLevel === "high"
        ? "bg-destructive/10 text-destructive"
        : data.riskLevel === "medium"
        ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    return (
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
        {data.riskScore}%
      </span>
    );
  }, []);

  const CustomerRowMenu = useCallback(
    ({ data }: { data: Customer }) => {
      const openDrawer = useActivityStore.getState().openDrawer;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <RowActionsTrigger onClick={(e) => e.stopPropagation()} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                openCustomer(data);
              }}
            >
              <Eye className="mr-2 h-3.5 w-3.5" /> Open
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                openDrawer({
                  type: "customer",
                  id: data.id,
                  label: data.name,
                  subtitle: data.customerId,
                });
              }}
            >
              <ClipboardList className="mr-2 h-3.5 w-3.5" /> Activity
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    [openCustomer],
  );

  // ── Column definitions ────────────────────────────────────────────────────

  const columnDefs = useMemo<ColDef<Customer>[]>(() => {
    const cols: ColDef<Customer>[] = [
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
        cellRenderer: (p: ICellRendererParams<Customer>) =>
          p.data ? <CustomerRowMenu data={p.data} /> : null,
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
        field: "name",
        headerName: "Name",
        width: 170,
        pinned: "left",
        cellRenderer: (p: ICellRendererParams<Customer>) =>
          p.data ? (
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                className="min-w-0 max-w-full cursor-pointer truncate text-left font-semibold text-foreground no-underline hover:text-primary hover:no-underline focus-visible:outline-none"
                title={p.data.name}
                onClick={(e) => {
                  e.stopPropagation();
                  openCustomer(p.data!);
                }}
              >
                {p.data.name}
              </button>
              {(p.data.roles ?? []).includes("supplier") ? (
                <GridChipBadge className="border-border">Supplier</GridChipBadge>
              ) : null}
              {(p.data.roles ?? []).includes("vendor") ? (
                <GridChipBadge className="border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400">Vendor</GridChipBadge>
              ) : null}
              {p.data.status === "vip" ? (
                <Crown
                  className="h-3.5 w-3.5 shrink-0 text-yellow-500"
                  aria-label="VIP"
                  title="VIP"
                />
              ) : null}
            </div>
          ) : null,
      },
    ];

    if (visibleColumns.customerId)
      cols.push({ field: "customerId", headerName: "ID", width: 88 });

    if (visibleColumns.company)
      cols.push({
        colId: "company",
        headerName: "Company",
        width: 140,
        valueGetter: (p) => p.data?.parentCompany?.trim() || "—",
      });

    if (visibleColumns.phone)
      cols.push({ field: "phone", headerName: "Phone", width: 128 });

    if (visibleColumns.additionalPhone)
      cols.push({
        colId: "additionalPhone",
        headerName: "Additional Phone",
        width: 130,
        valueGetter: (p) => (p.data ? getCustomerAdditionalPhone(p.data) || "—" : "—"),
      });

    if (visibleColumns.email)
      cols.push({ field: "email", headerName: "Email", width: 170 });

    if (visibleColumns.address)
      cols.push({
        colId: "address",
        headerName: "Address",
        width: 180,
        valueGetter: (p) => (p.data ? getCustomerAddressLine(p.data) || "—" : "—"),
        tooltipValueGetter: (p) => (p.data ? getCustomerAddressLine(p.data) : ""),
      });

    if (visibleColumns.city)
      cols.push({ field: "city", headerName: "City", width: 96 });

    if (visibleColumns.region)
      cols.push({ field: "region", headerName: "State / Region", width: 120 });

    if (visibleColumns.country)
      cols.push({ field: "country", headerName: "Country", width: 110 });

    if (visibleColumns.group)
      cols.push({
        field: "group",
        headerName: "Group",
        width: 96,
        cellRenderer: (p: ICellRendererParams<Customer>) =>
          p.data ? (
            <span className="text-[11px] capitalize">{CUSTOMER_GROUP_LABELS[p.data.group]}</span>
          ) : null,
      });

    if (visibleColumns.tags)
      cols.push({
        colId: "tags",
        headerName: "Tags",
        width: 140,
        valueGetter: (p) => (p.data?.tags?.length ? p.data.tags.join(", ") : "—"),
        tooltipValueGetter: (p) => (p.data?.tags?.length ? p.data.tags.join(", ") : ""),
      });

    // Numeric/date columns keep raw values so sorting is numeric, not string.
    if (visibleColumns.totalOrders)
      cols.push({
        colId: "totalOrders",
        field: "totalOrders",
        headerName: "Orders",
        width: 72,
        cellClass: NUMERIC_CELL,
        headerClass: NUMERIC_HEADER,
      });

    if (visibleColumns.totalSpend)
      cols.push({
        colId: "totalSpend",
        field: "totalSpend",
        headerName: "Total Spend",
        width: 110,
        valueFormatter: moneyFormatter,
        cellClass: NUMERIC_CELL,
        headerClass: NUMERIC_HEADER,
      });

    if (visibleColumns.due)
      cols.push({
        colId: "due",
        headerName: "Due",
        width: 100,
        valueGetter: (p) => p.data?.due ?? 0,
        valueFormatter: moneyFormatter,
        cellClass: (p) => cn(NUMERIC_CELL, Number(p.value) > 0 && "font-semibold text-destructive"),
        headerClass: NUMERIC_HEADER,
        tooltipValueGetter: (p) =>
          p.data?.openInvoiceCount
            ? `${p.data.openInvoiceCount} open invoice${p.data.openInvoiceCount > 1 ? "s" : ""}`
            : "",
      });

    if (visibleColumns.advance)
      cols.push({
        colId: "advance",
        headerName: "Advance",
        width: 100,
        valueGetter: (p) => p.data?.advance ?? 0,
        valueFormatter: moneyFormatter,
        cellClass: (p) =>
          cn(NUMERIC_CELL, Number(p.value) > 0 && "font-semibold text-emerald-600 dark:text-emerald-400"),
        headerClass: NUMERIC_HEADER,
      });

    if (visibleColumns.walletBalance)
      cols.push({
        colId: "walletBalance",
        field: "walletBalance",
        headerName: "Wallet",
        width: 88,
        valueFormatter: moneyFormatter,
        cellClass: NUMERIC_CELL,
        headerClass: NUMERIC_HEADER,
      });

    if (visibleColumns.rewardPoints)
      cols.push({
        colId: "rewardPoints",
        field: "rewardPoints",
        headerName: "Points",
        width: 80,
        cellClass: NUMERIC_CELL,
        headerClass: NUMERIC_HEADER,
      });

    if (visibleColumns.openingBalance)
      cols.push({
        colId: "openingBalance",
        headerName: "Opening Balance",
        width: 120,
        valueGetter: (p) => p.data?.openingBalance ?? 0,
        valueFormatter: moneyFormatter,
        cellClass: NUMERIC_CELL,
        headerClass: NUMERIC_HEADER,
      });

    if (visibleColumns.creditLimit)
      cols.push({
        colId: "creditLimit",
        headerName: "Credit Limit",
        width: 110,
        valueGetter: (p) => p.data?.creditLimit ?? 0,
        valueFormatter: moneyFormatter,
        cellClass: NUMERIC_CELL,
        headerClass: NUMERIC_HEADER,
      });

    if (visibleColumns.lastOrderDate)
      cols.push({
        colId: "lastOrderDate",
        headerName: "Last Order",
        width: 100,
        valueGetter: (p) => p.data?.lastOrderDate ?? null,
        valueFormatter: (p) => (p.value ? formatDate(p.value) : "—"),
      });

    if (visibleColumns.customerSince)
      cols.push({
        colId: "customerSince",
        headerName: "Customer Since",
        width: 110,
        valueGetter: (p) => p.data?.customerSince ?? null,
        valueFormatter: (p) => (p.value ? formatDate(p.value) : "—"),
      });

    cols.push({
      colId: "status",
      field: "status",
      headerName: "Status",
      width: 120,
      cellRenderer: StatusCell,
    });

    if (visibleColumns.assignedStaff)
      cols.push({ field: "assignedStaff", headerName: "Assigned", width: 120 });

    if (visibleColumns.riskScore)
      cols.push({
        colId: "riskScore",
        headerName: "Risk",
        width: 72,
        cellRenderer: RiskCell,
      });

    if (!serverPaging) return cols;
    // Server mode: the API orders the whole result set, so the grid must not
    // re-sort the page (comparator 0 keeps server order); columns the API
    // cannot sort by are not offered for sorting at all.
    return cols.map((col) => {
      if (col.sortable === false) return col;
      const id = col.colId ?? col.field;
      return id && SERVER_SORT_BY_COLUMN[id]
        ? { ...col, comparator: () => 0 }
        : { ...col, sortable: false };
    });
  }, [CustomerRowMenu, StatusCell, RiskCell, canWrite, openCustomer, visibleColumns, serverPaging]);

  // ─── Render (sales-style chrome) ──────────────────────────────────────────

  return (
      <AgainListGrid<Customer>
        apiRef={gridApiRef}
        className={className}
        rowData={rows}
        columnDefs={columnDefs}
        loading={loading}
        loadingFallback={
          <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading customers…
          </div>
        }
        headerLeftActions={headerLeftActions}
        filterBar={
          <>
            {visibleFilters.search ? (
              <Input
                placeholder="Search name, phone, email, ID…"
                value={filters.search}
                onChange={(e) => {
                  const next = e.target.value;
                  setFilters((f) => ({ ...f, search: next }));
                  onSearchChange?.(next);
                }}
                className="w-[220px] shrink-0 rounded-none"
              />
            ) : null}
            {visibleFilters.status ? (
              <FilterSelect
                value={activeTab}
                onChange={(nextValue) => {
                  const next = nextValue as CustomerListFilter;
                  setActiveTab(next);
                  onListFilterChange?.(next);
                }}
                width="w-[140px]"
                className="shrink-0"
                ariaLabel="Status filter"
                options={[
                  { value: "all", label: "All customers" },
                  ...Object.entries(CUSTOMER_STATUS_LABELS).map(([k, v]) => ({
                    value: k,
                    label: v,
                  })),
                ]}
              />
            ) : null}
            {visibleFilters.group ? (
              <FilterSelect
                value={filters.group}
                onChange={(group) => {
                  setFilters((f) => ({ ...f, group }));
                  onGroupQueryChange?.(group === "all" ? undefined : group);
                }}
                width="w-[140px]"
                className="shrink-0"
                ariaLabel="Group"
                options={[
                  { value: "all", label: "All groups" },
                  ...Object.entries(CUSTOMER_GROUP_LABELS).map(([k, v]) => ({
                    value: k,
                    label: v,
                  })),
                ]}
              />
            ) : null}
            {visibleFilters.hasDue ? (
              <Button
                type="button"
                variant={hasDue ? "default" : "outline"}
                aria-pressed={hasDue}
                aria-label="Has due"
                className="shrink-0 rounded-none px-2 font-normal shadow-sm"
                onClick={() => onHasDueChange?.(!hasDue)}
              >
                Has due
              </Button>
            ) : null}
          </>
        }
        summary={
          serverPaging && typeof serverTotalDue === "number" ? (
            <div
              className="flex items-center justify-end gap-1.5 border-b border-border px-3 py-1 text-[11px] text-muted-foreground"
              data-testid="customers-total-due"
            >
              <span>Total due</span>
              <span className="font-semibold tabular-nums text-destructive">
                {formatCurrency(serverTotalDue)}
              </span>
            </div>
          ) : undefined
        }
        banner={
          selected.length > 0 && canWrite ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-xs font-medium">{selected.length} selected</span>
            <Button size="sm" variant="outline" className="h-7 rounded-none" onClick={() => toast.info("Bulk tag")}>
              Add tag
            </Button>
            <Button size="sm" variant="outline" className="h-7 rounded-none" onClick={() => toast.info("Bulk assign")}>
              Assign staff
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 rounded-none"
              onClick={() => openDeleteConfirm(selected)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
            <Button size="sm" variant="outline" className="h-7 rounded-none" onClick={() => toast.success("Export")}>
              Export
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 w-7 rounded-none p-0"
              onClick={() => setSelected([])}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          ) : null
        }
        footerLeftActions={footerLeftActions}
        emptyTitle="No customers match your filters"
        emptyHint="Clear filters or create a new customer"
        onResetFilters={resetAllFilters}
        onOpenColumns={() => setColumnSheetOpen(true)}
        defaultColDef={{ minWidth: 72 }}
        serverPaging={
          serverPaging
            ? {
                total: serverTotal ?? 0,
                page: serverPage,
                pageSize: serverPageSize,
                onPageChange: handleServerPageChange,
                onPageSizeChange: onServerPageSizeChange,
              }
            : undefined
        }
        gridProps={{
          rowSelection: "multiple",
          suppressRowClickSelection: true,
          onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
          onSortChanged: handleSortChanged,
        }}
        mobile={
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <CustomerMobileCards customers={rows} />
          </div>
        }
      >
        <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
          <SheetContent
            side="right"
            title="Filters"
            resizable
            className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
          >
            <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Filters</h2>
            <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
              {FILTER_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={visibleFilters[key]}
                    onChange={(e) => toggleVisibleFilter(key, e.target.checked)}
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                  />
                  {FILTER_LABELS[key]}
                </label>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-7 rounded-none text-xs"
              onClick={resetAllFilters}
            >
              Reset filters
            </Button>
          </SheetContent>
        </Sheet>

        <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
          <SheetContent
            side="right"
            title="Columns"
            resizable
            className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
          >
            <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Columns</h2>
            <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
              {COLUMN_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns[key]}
                    onChange={(e) =>
                      setVisibleColumns((v) => ({ ...v, [key]: e.target.checked }))
                    }
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                  />
                  {COLUMN_LABELS[key]}
                </label>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-7 rounded-none text-xs"
              onClick={() => setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)}
            >
              Reset columns
            </Button>
          </SheetContent>
        </Sheet>

        <Dialog.Root
          open={deleteOpen}
          onOpenChange={(open) => {
            if (!deleting) setDeleteOpen(open);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(400px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-none border border-input bg-background p-6 shadow-xl">
              <Dialog.Title className="text-base font-semibold">Delete customers?</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                {deleteTargets.length === 1
                  ? `"${deleteTargets[0]?.name}" will be permanently deleted. Customers with linked orders are skipped.`
                  : `${deleteTargets.length} customers will be permanently deleted. Customers with linked orders are skipped.`}
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
                  onClick={() => void deleteCustomers(deleteTargets)}
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
