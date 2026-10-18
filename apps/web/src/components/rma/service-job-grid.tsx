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
import { Banknote, Check, Eye } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { Badge } from "@/components/ui/badge";
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
import {
  SERVICE_JOB_STATUS_LABEL,
  SERVICE_JOB_STATUS_TONE,
  SERVICE_JOB_TYPE_LABEL,
  type ServiceJob,
} from "@/lib/api/service-jobs";
import { GridRefLink } from "@/components/shared/grid-ref-link";
import { AgainPartnerDrawer } from "@/components/shared/again-partner-drawer";
import { buildMinimalPartnerFromSales } from "@/lib/mock-data/partner-drawer-seed";
import type { Customer } from "@/lib/mock-data/customers";
import { toast } from "sonner";



type FilterState = { search: string; status: string; type: string };
const DEFAULT_FILTERS: FilterState = { search: "", status: "all", type: "all" };

const DEFAULT_VISIBLE = {
  jobNumber: true,
  customer: true,
  product: true,
  serial: true,
  type: true,
  status: true,
  total: true,
  rma: true,
  bill: true,
};

const COLUMN_LABELS: Record<keyof typeof DEFAULT_VISIBLE, string> = {
  jobNumber: "Job",
  customer: "Customer",
  product: "Product",
  serial: "Serial",
  type: "Type",
  status: "Status",
  total: "Total",
  rma: "RMA",
  bill: "Billing",
};

const DEFAULT_VISIBLE_FILTERS = { search: true, status: true, type: true };

export type ServiceJobGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
  resetFilters: () => void;
};

export const ServiceJobGrid = forwardRef<
  ServiceJobGridHandle,
  {
    jobs: ServiceJob[];
    loading?: boolean;
    onComplete?: (id: string) => void;
    onBill?: (id: string) => void;
    onOpenJob?: (id: string) => void;
    onFilterCountChange?: (count: number) => void;
    headerLeftActions?: ReactNode;
    className?: string;
  }
>(function ServiceJobGrid(
  { jobs, loading = false, onComplete, onBill, onOpenJob, onFilterCountChange, headerLeftActions, className },
  ref,
) {
  const router = useRouter();
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<ServiceJob> | null>(null);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [partnerRecord, setPartnerRecord] = useState<Customer | null>(null);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useUserScopedState("service-job-grid:columns", DEFAULT_VISIBLE);
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "service-job-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );

  const openCustomerDrawer = useCallback((row: ServiceJob) => {
    if (!row.customer_id) {
      toast.error("No customer record for this job");
      return;
    }
    setPartnerRecord(
      buildMinimalPartnerFromSales(row.customer_id, row.customer_name, row.customer_email, row.customer_phone),
    );
    setPartnerOpen(true);
  }, []);
  const resolvedCols = useMemo(() => ({ ...DEFAULT_VISIBLE, ...visibleCols }), [visibleCols]);
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );

  useImperativeHandle(ref, () => ({
    openFilters: () => setFilterSheetOpen(true),
    openColumns: () => setColumnSheetOpen(true),
    resetFilters: () => setFilters(DEFAULT_FILTERS),
  }));

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return jobs.filter((job) => {
      if (
        q &&
        !`${job.job_number} ${job.customer_name} ${job.sku} ${job.product_name} ${job.serial_number ?? ""}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      if (filters.status !== "all" && job.status !== filters.status) return false;
      if (filters.type !== "all" && job.service_type !== filters.type) return false;
      return true;
    });
  }, [jobs, filters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.status !== "all") n += 1;
    if (filters.type !== "all") n += 1;
    return n;
  }, [filters]);

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount);
  }, [activeFilterCount, onFilterCountChange]);

  const RowMenu = useCallback(
    ({ data }: { data: ServiceJob }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <RowActionsTrigger />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onOpenJob?.(data.id)}>
            <Eye className="mr-1.5 h-3 w-3" /> Open job
          </DropdownMenuItem>
          {data.rma_id ? (
            <DropdownMenuItem onClick={() => router.push(`/inventory/rma?claim=${data.rma_id}`)}>
              <Eye className="mr-1.5 h-3 w-3" /> Open RMA
            </DropdownMenuItem>
          ) : null}
          {canWrite && data.status === "in_progress" ? (
            <DropdownMenuItem onClick={() => onComplete?.(data.id)}>
              <Check className="mr-1.5 h-3 w-3" /> Complete
            </DropdownMenuItem>
          ) : null}
          {canWrite && data.is_billable && data.bill_status !== "billed" && Number(data.total) > 0 ? (
            <DropdownMenuItem onClick={() => onBill?.(data.id)}>
              <Banknote className="mr-1.5 h-3 w-3" /> Bill
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [router, canWrite, onComplete, onBill, onOpenJob],
  );

  const columnDefs = useMemo<ColDef<ServiceJob>[]>(
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
        cellRenderer: (p: ICellRendererParams<ServiceJob>) =>
          p.data ? <RowMenu data={p.data} /> : null,
      },
      {
        colId: "jobNumber",
        field: "job_number",
        headerName: COLUMN_LABELS.jobNumber,
        hide: !resolvedCols.jobNumber,
        pinned: "left",
        width: 150,
        minWidth: 120,
        cellClass: "font-mono text-[11px]",
        cellRenderer: (p: ICellRendererParams<ServiceJob>) =>
          p.data ? (
            <button
              type="button"
              className="truncate font-mono text-[11px] text-primary hover:underline"
              onClick={() => onOpenJob?.(p.data!.id)}
            >
              {p.data.job_number}
            </button>
          ) : null,
      },
      {
        colId: "customer",
        field: "customer_name",
        headerName: COLUMN_LABELS.customer,
        hide: !resolvedCols.customer,
        flex: 1,
        minWidth: 140,
        cellRenderer: (p: ICellRendererParams<ServiceJob>) => {
          const name = p.data?.customer_name?.trim();
          if (!name) return "—";
          return (
            <GridRefLink title={name} onClick={() => openCustomerDrawer(p.data!)}>
              {name}
            </GridRefLink>
          );
        },
      },
      {
        colId: "product",
        headerName: COLUMN_LABELS.product,
        hide: !resolvedCols.product,
        flex: 2,
        minWidth: 180,
        valueGetter: (p) => (p.data ? `${p.data.sku} ${p.data.product_name}` : ""),
        cellRenderer: (p: ICellRendererParams<ServiceJob>) =>
          p.data ? (
            <span className="truncate">
              <span className="font-mono text-[11px]">{p.data.sku || "—"}</span>
              <span className="ml-2 text-muted-foreground">{p.data.product_name}</span>
            </span>
          ) : null,
      },
      {
        colId: "serial",
        field: "serial_number",
        headerName: COLUMN_LABELS.serial,
        hide: !resolvedCols.serial,
        width: 150,
        minWidth: 110,
        cellClass: "font-mono text-[11px]",
      },
      {
        colId: "type",
        field: "service_type",
        headerName: COLUMN_LABELS.type,
        hide: !resolvedCols.type,
        width: 140,
        minWidth: 120,
        valueFormatter: (p) => SERVICE_JOB_TYPE_LABEL[p.value] ?? p.value,
      },
      {
        colId: "status",
        field: "status",
        headerName: COLUMN_LABELS.status,
        hide: !resolvedCols.status,
        width: 130,
        minWidth: 110,
        cellRenderer: (p: ICellRendererParams<ServiceJob>) =>
          p.data ? (
            <Badge
              variant="outline"
              className={cn("rounded-none text-[10px]", SERVICE_JOB_STATUS_TONE[p.data.status])}
            >
              {SERVICE_JOB_STATUS_LABEL[p.data.status] ?? p.data.status}
            </Badge>
          ) : null,
      },
      {
        colId: "total",
        field: "total",
        headerName: COLUMN_LABELS.total,
        hide: !resolvedCols.total,
        width: 120,
        minWidth: 100,
        type: "numericColumn",
        cellClass: "tabular-nums",
        valueFormatter: (p) => (Number(p.value) > 0 ? formatCurrency(Number(p.value)) : "—"),
      },
      {
        colId: "rma",
        headerName: COLUMN_LABELS.rma,
        hide: !resolvedCols.rma,
        width: 110,
        minWidth: 90,
        cellRenderer: (p: ICellRendererParams<ServiceJob>) =>
          p.data?.rma_id ? (
            <button
              type="button"
              className="text-left text-[11px] hover:underline"
              onClick={() => router.push(`/inventory/rma?claim=${p.data!.rma_id}`)}
            >
              Open RMA
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground">Direct</span>
          ),
      },
      {
        colId: "bill",
        field: "bill_status",
        headerName: COLUMN_LABELS.bill,
        hide: !resolvedCols.bill,
        width: 110,
        minWidth: 90,
        cellRenderer: (p: ICellRendererParams<ServiceJob>) => {
          const job = p.data;
          if (!job) return null;
          if (job.bill_status === "billed") {
            return (
              <Badge
                variant="outline"
                className="rounded-none border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
              >
                Billed
              </Badge>
            );
          }
          return <span className="text-[11px] text-muted-foreground">—</span>;
        },
      },
    ],
    [resolvedCols, RowMenu, router, onOpenJob, openCustomerDrawer],
  );

  return (
    <AgainListGrid<ServiceJob>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search job, customer, serial…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[220px] shrink-0 rounded-none"
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
                { value: "in_progress", label: "In progress" },
                { value: "completed", label: "Completed" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          )}
          {resolvedVisibleFilters.type && (
            <FilterSelect
              value={filters.type}
              onChange={(type) => setFilters((f) => ({ ...f, type }))}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Type"
              options={[
                { value: "all", label: "All types" },
                { value: "direct", label: "Direct service" },
                { value: "warranty_repair", label: "Warranty repair" },
                { value: "paid_repair", label: "Paid repair" },
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
      emptyTitle="No service jobs match your filters"
      emptyHint="Walk-in repairs that were not sold by us start here — not as an RMA."
      onOpenColumns={() => setColumnSheetOpen(true)}
      onRowClicked={(row) => onOpenJob?.(row.id)}
      apiRef={gridApiRef}
      mobile={
        <div className="divide-y divide-border">
          {filtered.map((job) => (
            <div key={job.id} className="px-3 py-2.5">
              <p className="font-mono text-[11px]">{job.job_number}</p>
              <p className="text-sm font-medium">{job.customer_name || "—"}</p>
              <p className="text-[11px] text-muted-foreground">
                {job.product_name || job.sku || "—"} · {SERVICE_JOB_STATUS_LABEL[job.status] ?? job.status}
              </p>
            </div>
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
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
                >
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
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 rounded-none text-xs"
            onClick={() => setFilters(DEFAULT_FILTERS)}
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
          closeButton="inside"
          className="w-[180px] min-w-[160px] max-w-[720px] gap-2 rounded-none p-3"
        >
          <h2 className="border-b border-border pb-2 pr-8 text-sm font-semibold">Columns</h2>
          <div className="mt-1 flex-1 space-y-1.5 overflow-y-auto">
            {(Object.keys(DEFAULT_VISIBLE) as (keyof typeof DEFAULT_VISIBLE)[]).map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
              >
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
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 rounded-none text-xs"
            onClick={() => setVisibleCols(DEFAULT_VISIBLE)}
          >
            Reset columns
          </Button>
        </SheetContent>
      </Sheet>
      <AgainPartnerDrawer
        open={partnerOpen}
        customer={partnerRecord}
        mode="edit"
        onOpenChange={setPartnerOpen}
      />
    </AgainListGrid>
  );
});
