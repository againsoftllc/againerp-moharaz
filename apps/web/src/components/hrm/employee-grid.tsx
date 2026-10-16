"use client";

import "@/components/providers/ag-grid-provider";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ColDef, GridApi, ICellRendererParams } from "ag-grid-community";
import { Eye, LayoutGrid, List, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  EMPLOYEE_DEPARTMENTS,
  EMPLOYEE_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  employeeAvatarUrl,
  type Employee,
  type EmployeeStatus,
} from "@/lib/mock-data/employees";
import { HRM_BRANCHES } from "@/lib/mock-data/hrm-org";
import { cn } from "@/lib/utils";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { Badge } from "@/components/ui/badge";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import { GridFullscreenHeader } from "@/components/shared/grid-fullscreen";
import { AgainListGrid, AgainListGridSkeleton } from "@/components/shared/again-list-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";



const COLUMN_KEYS = [
  "employeeCode",
  "department",
  "designation",
  "status",
  "phone",
  "email",
  "joinDate",
  "manager",
  "workLocation",
  "employmentType",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  employeeCode: "Employee ID",
  department: "Department",
  designation: "Designation",
  status: "Status",
  phone: "Phone",
  email: "Email",
  joinDate: "Join date",
  manager: "Manager",
  workLocation: "Location",
  employmentType: "Type",
};

const DEFAULT_VISIBLE: Record<ColumnKey, boolean> = {
  employeeCode: true,
  department: true,
  designation: true,
  status: true,
  phone: true,
  email: false,
  joinDate: true,
  manager: true,
  workLocation: false,
  employmentType: true,
};

const FILTER_VISIBILITY_KEYS = ["search", "status", "department", "employmentType", "branch"] as const;
type FilterVisibilityKey = (typeof FILTER_VISIBILITY_KEYS)[number];

const FILTER_LABELS: Record<FilterVisibilityKey, string> = {
  search: "Search",
  status: "Status",
  department: "Department",
  employmentType: "Employment type",
  branch: "Branch",
};

const DEFAULT_VISIBLE_FILTERS: Record<FilterVisibilityKey, boolean> = {
  search: true,
  status: true,
  department: true,
  employmentType: true,
  branch: true,
};

type FilterState = {
  search: string;
  status: EmployeeStatus | "all";
  department: string;
  employmentType: string;
  branch: string;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  status: "all",
  department: "all",
  employmentType: "all",
  branch: "all",
};

function statusTone(status: EmployeeStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "terminated" || status === "inactive") return "destructive";
  if (status === "on_leave") return "secondary";
  return "outline";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function applyEmployeeFilters(rows: Employee[], f: FilterState): Employee[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((e) => {
    if (
      q &&
      !e.name.toLowerCase().includes(q) &&
      !e.employeeCode.toLowerCase().includes(q) &&
      !(e.biometricCode ?? "").toLowerCase().includes(q) &&
      !e.email.toLowerCase().includes(q) &&
      !e.phone.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (f.status !== "all" && e.status !== f.status) return false;
    if (f.department !== "all" && e.department !== f.department) return false;
    if (f.employmentType !== "all" && e.employmentType !== f.employmentType) return false;
    if (f.branch !== "all" && e.branchId !== f.branch && e.workLocation !== f.branch) return false;
    return true;
  });
}

type ViewMode = "table" | "cards";

type Props = {
  employees: Employee[];
  loading?: boolean;
  onView: (employee: Employee) => void;
  onEdit: (employee: Employee) => void;
  onDelete?: (employee: Employee) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onAdvancedFilterCountChange?: (count: number) => void;
  headerLeftActions?: ReactNode;
  className?: string;
  /** Live branch filter options (id + name). Falls back to mock HRM_BRANCHES. */
  branchOptions?: { id: string; name: string }[];
  /** Live department name filter options. Falls back to EMPLOYEE_DEPARTMENTS. */
  departmentOptions?: string[];
};

export type EmployeeGridHandle = {
  openFilters: () => void;
  openColumns: () => void;
};

export const EmployeeGrid = forwardRef<EmployeeGridHandle, Props>(function EmployeeGrid(
  {
    employees,
    loading = false,
    onView,
    onEdit,
    onDelete,
    viewMode = "table",
    onViewModeChange,
    onAdvancedFilterCountChange,
    headerLeftActions,
    className,
    branchOptions,
    departmentOptions,
  },
  ref,
) {
  const filterBranches = branchOptions?.length ? branchOptions : HRM_BRANCHES;
  const filterDepartments = departmentOptions?.length
    ? departmentOptions
    : EMPLOYEE_DEPARTMENTS;
  const canWrite = useAdminCanWrite();
  const gridApiRef = useRef<GridApi<Employee> | null>(null);

  const [rowData, setRowData] = useState(employees);
  useEffect(() => {
    setRowData(employees);
  }, [employees]);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useUserScopedState(
    "hrm-employee-grid:columns",
    DEFAULT_VISIBLE,
  );
  const [visibleFilters, setVisibleFilters] = useUserScopedState(
    "hrm-employee-grid:filters",
    DEFAULT_VISIBLE_FILTERS,
  );
  const resolvedVisibleFilters = useMemo(
    () => ({ ...DEFAULT_VISIBLE_FILTERS, ...visibleFilters }),
    [visibleFilters],
  );
  const [selected, setSelected] = useState<Employee[]>([]);

  const filtered = useMemo(() => applyEmployeeFilters(rowData, filters), [rowData, filters]);

  const advancedFilterCount = useMemo(() => {
    let n = 0;
    if (filters.status !== "all") n += 1;
    if (filters.department !== "all") n += 1;
    if (filters.employmentType !== "all") n += 1;
    if (filters.branch !== "all") n += 1;
    if (filters.search.trim()) n += 1;
    return n;
  }, [filters]);

  useEffect(() => {
    onAdvancedFilterCountChange?.(advancedFilterCount);
  }, [advancedFilterCount, onAdvancedFilterCountChange]);

  useImperativeHandle(
    ref,
    () => ({
      openFilters: () => setFilterSheetOpen(true),
      openColumns: () => setColumnSheetOpen(true),
    }),
    [],
  );

  const columnDefs = useMemo<ColDef<Employee>[]>(() => {
    const vis = { ...DEFAULT_VISIBLE, ...visibleCols };
    const cols: ColDef<Employee>[] = [
      {
        headerName: "",
        checkboxSelection: true,
        headerCheckboxSelection: true,
        width: 40,
        maxWidth: 44,
        minWidth: 40,
        pinned: "left",
        sortable: false,
        resizable: false,
        suppressHeaderMenuButton: true,
      },
      {
        headerName: "Employee",
        field: "name",
        pinned: "left",
        minWidth: 200,
        flex: 1.4,
        cellRenderer: (p: ICellRendererParams<Employee>) => {
          if (!p.data) return null;
          const src = p.data.avatarUrl ?? employeeAvatarUrl(p.data.id, p.data.gender);
          return (
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 text-left hover:underline"
              onClick={() => onView(p.data!)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                className="h-7 w-7 shrink-0 rounded-none border border-border object-cover"
              />
              <span className="min-w-0 truncate font-medium">{p.data.name}</span>
            </button>
          );
        },
      },
    ];

    if (vis.employeeCode) {
      cols.push({
        headerName: COLUMN_LABELS.employeeCode,
        field: "employeeCode",
        minWidth: 110,
        width: 120,
      });
    }
    if (vis.department) {
      cols.push({
        headerName: COLUMN_LABELS.department,
        field: "department",
        minWidth: 120,
        flex: 1,
      });
    }
    if (vis.designation) {
      cols.push({
        headerName: COLUMN_LABELS.designation,
        field: "designation",
        minWidth: 140,
        flex: 1.1,
      });
    }
    if (vis.status) {
      cols.push({
        headerName: COLUMN_LABELS.status,
        field: "status",
        minWidth: 110,
        width: 120,
        cellRenderer: (p: ICellRendererParams<Employee>) => {
          if (!p.data) return null;
          return (
            <Badge variant={statusTone(p.data.status)} className="rounded-none font-normal">
              {EMPLOYEE_STATUS_LABELS[p.data.status]}
            </Badge>
          );
        },
      });
    }
    if (vis.phone) {
      cols.push({
        headerName: COLUMN_LABELS.phone,
        field: "phone",
        minWidth: 130,
        width: 140,
      });
    }
    if (vis.email) {
      cols.push({
        headerName: COLUMN_LABELS.email,
        field: "email",
        minWidth: 180,
        flex: 1.2,
      });
    }
    if (vis.joinDate) {
      cols.push({
        headerName: COLUMN_LABELS.joinDate,
        field: "joinDate",
        minWidth: 110,
        width: 118,
      });
    }
    if (vis.manager) {
      cols.push({
        headerName: COLUMN_LABELS.manager,
        field: "manager",
        minWidth: 130,
        flex: 1,
      });
    }
    if (vis.workLocation) {
      cols.push({
        headerName: COLUMN_LABELS.workLocation,
        field: "workLocation",
        minWidth: 120,
        flex: 1,
      });
    }
    if (vis.employmentType) {
      cols.push({
        headerName: COLUMN_LABELS.employmentType,
        field: "employmentType",
        minWidth: 110,
        width: 120,
        valueFormatter: (p) =>
          p.value ? EMPLOYMENT_TYPE_LABELS[p.value as Employee["employmentType"]] : "",
      });
    }

    cols.push({
      headerName: "",
      colId: "actions",
      width: 44,
      maxWidth: 48,
      pinned: "right",
      sortable: false,
      resizable: false,
      suppressHeaderMenuButton: true,
      headerComponent: GridFullscreenHeader,
      cellRenderer: (p: ICellRendererParams<Employee>) => {
        if (!p.data) return null;
        const emp = p.data;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <RowActionsTrigger />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[9rem] rounded-none">
              <DropdownMenuItem onClick={() => onView(emp)}>
                <Eye className="mr-1.5 h-3 w-3" />
                View
              </DropdownMenuItem>
              {canWrite ? (
                <DropdownMenuItem onClick={() => onEdit(emp)}>
                  <Pencil className="mr-1.5 h-3 w-3" />
                  Edit
                </DropdownMenuItem>
              ) : null}
              {canWrite && onDelete ? (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(emp)}
                >
                  <Trash2 className="mr-1.5 h-3 w-3" />
                  Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return cols;
  }, [visibleCols, canWrite, onView, onEdit, onDelete]);

  const resetAllFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setVisibleFilters(DEFAULT_VISIBLE_FILTERS);
  };

  return (
    <AgainListGrid<Employee>
      className={className}
      rowData={filtered}
      columnDefs={columnDefs}
      loading={loading || viewMode === "cards"}
      loadingFallback={
        loading ? undefined : viewMode === "cards" ? (
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {filtered.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No employees match your filters</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((emp) => {
                  const src = emp.avatarUrl ?? employeeAvatarUrl(emp.id, emp.gender);
                  return (
                    <div
                      key={emp.id}
                      className="flex flex-col rounded-none border border-border bg-card p-3"
                    >
                      <div className="flex items-start gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-none border border-border object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{emp.name}</p>
                              <p className="truncate text-xs text-muted-foreground">{emp.email}</p>
                              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                                {emp.employeeCode}
                                {emp.biometricCode ? ` · ${emp.biometricCode}` : ""}
                              </p>
                            </div>
                            <Badge
                              variant={statusTone(emp.status)}
                              className="shrink-0 rounded-none text-[10px] font-normal"
                            >
                              {EMPLOYEE_STATUS_LABELS[emp.status]}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 rounded-none border border-border bg-muted/30 px-2.5 py-2 text-xs">
                        <p>
                          <span className="text-muted-foreground">Department:</span> {emp.department}
                        </p>
                        <p className="mt-0.5">
                          <span className="text-muted-foreground">Designation:</span> {emp.designation}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">{emp.joinDate}</span>
                        <div className="flex gap-1">
                          {canWrite ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-none px-2"
                              onClick={() => onEdit(emp)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-none px-2"
                            onClick={() => onView(emp)}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          {canWrite && onDelete ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-none px-2 text-destructive"
                              onClick={() => onDelete(emp)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : undefined
      }
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          {resolvedVisibleFilters.search && (
            <Input
              placeholder="Search name, ID, phone…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-[220px] shrink-0 rounded-none"
            />
          )}
          {resolvedVisibleFilters.status && (
            <FilterSelect
              value={filters.status}
              onChange={(status) =>
                setFilters((f) => ({ ...f, status: status as FilterState["status"] }))
              }
              width="w-[140px]"
              className="shrink-0"
              ariaLabel="Status"
              options={[
                { value: "all", label: "All statuses" },
                ...Object.entries(EMPLOYEE_STATUS_LABELS).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />
          )}
          {resolvedVisibleFilters.department && (
            <FilterSelect
              value={filters.department}
              onChange={(department) => setFilters((f) => ({ ...f, department }))}
              width="w-[148px]"
              className="shrink-0"
              ariaLabel="Department"
              options={[
                { value: "all", label: "All departments" },
                ...filterDepartments.map((d) => ({ value: d, label: d })),
              ]}
            />
          )}
          {resolvedVisibleFilters.employmentType && (
            <FilterSelect
              value={filters.employmentType}
              onChange={(employmentType) => setFilters((f) => ({ ...f, employmentType }))}
              width="w-[148px]"
              className="shrink-0"
              ariaLabel="Employment type"
              options={[
                { value: "all", label: "All types" },
                ...Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />
          )}
          {resolvedVisibleFilters.branch && (
            <FilterSelect
              value={filters.branch}
              onChange={(branch) => setFilters((f) => ({ ...f, branch }))}
              width="w-[148px]"
              className="shrink-0"
              ariaLabel="Branch"
              options={[
                { value: "all", label: "All branches" },
                ...filterBranches.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          )}
          {onViewModeChange ? (
            <div className="ml-auto flex shrink-0 items-center border-l border-border pl-2">
              <button
                type="button"
                title="Table view"
                onClick={() => onViewModeChange("table")}
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-none border border-border",
                  viewMode === "table" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Card view"
                onClick={() => onViewModeChange("cards")}
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-none border border-l-0 border-border",
                  viewMode === "cards" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
        </>
      }
      banner={
        selected.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-xs font-medium">{selected.length} selected</span>
            <Button
              size="sm"
              className="rounded-none"
              onClick={() => {
                toast.success(`Export started for ${selected.length} employee(s)`);
                setSelected([]);
              }}
            >
              Export selected
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
      emptyTitle="No employees match your filters"
      emptyHint="Add an employee or clear filters"
      onResetFilters={() => setFilters(DEFAULT_FILTERS)}
      onOpenColumns={() => setColumnSheetOpen(true)}
      apiRef={gridApiRef}
      gridProps={{
        rowSelection: "multiple",
        suppressRowClickSelection: true,
        onSelectionChanged: (e) => setSelected(e.api.getSelectedRows()),
      }}
      mobile={
        <div className="space-y-2 p-2">
          {loading ? (
            <AgainListGridSkeleton rows={6} />
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No employees found</p>
          ) : (
            filtered.slice(0, 50).map((emp) => (
              <button
                key={emp.id}
                type="button"
                className="flex w-full items-center gap-3 rounded-none border border-border bg-card p-3 text-left"
                onClick={() => onView(emp)}
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-none border border-border bg-muted text-xs font-semibold">
                  {initials(emp.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{emp.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {emp.employeeCode} · {emp.department}
                  </p>
                </div>
                <Badge variant={statusTone(emp.status)} className="rounded-none font-normal">
                  {EMPLOYEE_STATUS_LABELS[emp.status]}
                </Badge>
              </button>
            ))
          )}
        </div>
      }
    >
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent
          side="right"
          title="Filters"
          resizable
          closeButton="inside"
          className="min-w-[160px] max-w-[720px] w-[320px] rounded-none p-0"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Filters</p>
            <p className="text-xs text-muted-foreground">Show or hide toolbar filters</p>
          </div>
          <div className="space-y-1 p-3">
            {FILTER_VISIBILITY_KEYS.map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-between gap-2 rounded-none border border-transparent px-2 py-1.5 text-sm hover:bg-muted/40"
              >
                <span>{FILTER_LABELS[key]}</span>
                <input
                  type="checkbox"
                  checked={resolvedVisibleFilters[key]}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setVisibleFilters((v) => ({
                      ...DEFAULT_VISIBLE_FILTERS,
                      ...v,
                      [key]: enabled,
                    }));
                    if (!enabled) {
                      setFilters((f) => ({
                        ...f,
                        ...(key === "search" ? { search: "" } : {}),
                        ...(key === "status" ? { status: "all" as const } : {}),
                        ...(key === "department" ? { department: "all" } : {}),
                        ...(key === "employmentType" ? { employmentType: "all" } : {}),
                        ...(key === "branch" ? { branch: "all" } : {}),
                      }));
                    }
                  }}
                />
              </label>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full rounded-none"
              onClick={resetAllFilters}
            >
              Reset filters
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={columnSheetOpen} onOpenChange={setColumnSheetOpen}>
        <SheetContent
          side="right"
          title="Columns"
          resizable
          closeButton="inside"
          className="min-w-[160px] max-w-[720px] w-[320px] rounded-none p-0"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Columns</p>
            <p className="text-xs text-muted-foreground">Choose visible grid columns</p>
          </div>
          <div className="space-y-1 p-3">
            {COLUMN_KEYS.map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-between gap-2 rounded-none border border-transparent px-2 py-1.5 text-sm hover:bg-muted/40"
              >
                <span>{COLUMN_LABELS[key]}</span>
                <input
                  type="checkbox"
                  checked={{ ...DEFAULT_VISIBLE, ...visibleCols }[key]}
                  onChange={(e) =>
                    setVisibleCols((v) => ({
                      ...DEFAULT_VISIBLE,
                      ...v,
                      [key]: e.target.checked,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </AgainListGrid>
  );
});
