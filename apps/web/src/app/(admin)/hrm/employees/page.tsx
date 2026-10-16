"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Filter, Plus, RefreshCw, Settings2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Employee } from "@/lib/mock-data/employees";
import type { EmployeeGridHandle } from "@/components/hrm/employee-grid";
import { listHrmBranches } from "@/lib/api/hrm-branches";
import { listHrmDepartments } from "@/lib/api/hrm-departments";
import { listHrmDesignations } from "@/lib/api/hrm-designations";
import {
  apiEmployeeToEmployee,
  buildOrgNameLookup,
  createHrmEmployee,
  deleteHrmEmployee,
  listHrmEmployees,
  updateHrmEmployee,
} from "@/lib/api/hrm-employees";
import {
  apiEmployeeDocumentToUi,
  listHrmEmployeeDocuments,
  syncEmployeeDocuments,
} from "@/lib/api/hrm-employee-documents";
import { listHrmDocumentTypes } from "@/lib/api/hrm-document-types";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";

const EmployeeGrid = dynamic(
  () => import("@/components/hrm/employee-grid").then((module) => module.EmployeeGrid),
  {
    ssr: false,
    loading: () => <ContentDataSkeleton label="Loading employees…" />,
  },
);

const EmployeeFormDialog = dynamic(
  () =>
    import("@/components/hrm/employee-form-dialog").then((module) => module.EmployeeFormDialog),
  { ssr: false },
);

const EmployeeViewDialog = dynamic(
  () =>
    import("@/components/hrm/employee-view-dialog").then((module) => module.EmployeeViewDialog),
  { ssr: false },
);

function buildEmployeesUrl(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/hrm/employees?${query}` : "/hrm/employees";
}

type OrgState = {
  branches: { id: string; name: string }[];
  departments: { id: string; name: string; branchId: string }[];
  designations: { id: string; name: string; departmentId: string }[];
};

function EmployeeListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canWrite = useAdminCanWrite();
  const employeeGridRef = useRef<EmployeeGridHandle>(null);
  const [advancedFilterCount, setAdvancedFilterCount] = useState(0);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [org, setOrg] = useState<OrgState>({
    branches: [],
    departments: [],
    designations: [],
  });
  const [documentTypes, setDocumentTypes] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  const createOpen = searchParams.get("create") === "1";
  const editId = searchParams.get("edit");
  const viewId = searchParams.get("view");

  const editEmployee = useMemo(
    () => (editId ? employees.find((e) => e.id === editId) ?? null : null),
    [editId, employees],
  );

  const viewEmployee = useMemo(
    () => (viewId ? employees.find((e) => e.id === viewId) ?? null : null),
    [viewId, employees],
  );

  const departmentOptions = useMemo(() => {
    const names = new Set<string>();
    for (const d of org.departments) names.add(d.name);
    for (const e of employees) if (e.department) names.add(e.department);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [org.departments, employees]);

  const documentTypeName = useCallback(
    (id: string | null | undefined) => {
      if (!id) return "—";
      return documentTypes.find((t) => t.id === id)?.name ?? "—";
    },
    [documentTypes],
  );

  const loadAll = useCallback(async (showToast = false) => {
    setLoading(true);
    try {
      const [branchRows, deptRows, desigRows, docTypeRows, empRes] = await Promise.all([
        listHrmBranches(),
        listHrmDepartments(),
        listHrmDesignations(),
        listHrmDocumentTypes(),
        listHrmEmployees({ page: 1, per_page: 200 }),
      ]);
      const nextOrg: OrgState = {
        branches: branchRows.map((r) => ({
          id: String(r.id),
          name: String(r.name ?? ""),
        })),
        departments: deptRows.map((r) => ({
          id: String(r.id),
          name: String(r.name ?? ""),
          branchId: String(r.branch_id ?? ""),
        })),
        designations: desigRows.map((r) => ({
          id: String(r.id),
          name: String(r.name ?? ""),
          departmentId: String(r.department_id ?? ""),
        })),
      };
      const lookup = buildOrgNameLookup({
        ...nextOrg,
        employees: empRes.rows.map((r) => ({ id: r.id, name: r.name })),
      });
      setOrg(nextOrg);
      setDocumentTypes(
        docTypeRows.map((r) => ({ id: String(r.id), name: String(r.name ?? "") })),
      );
      setEmployees(empRes.rows.map((row) => apiEmployeeToEmployee(row, lookup)));
      if (showToast) toast.success("Employee list refreshed");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load employees";
      toast.error(message);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  /** Load documents when opening edit / view. */
  useEffect(() => {
    const id = editId || viewId;
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listHrmEmployeeDocuments({ employee_id: id });
        if (cancelled) return;
        const docs = rows.map((r) => apiEmployeeDocumentToUi(r, documentTypeName));
        setEmployees((prev) =>
          prev.map((e) => (e.id === id ? { ...e, documents: docs } : e)),
        );
      } catch {
        /* keep prior docs; toast only on save failures */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId, viewId, documentTypeName]);

  const pushParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      router.push(buildEmployeesUrl(params), { scroll: false });
    },
    [router, searchParams],
  );

  const openCreate = () => {
    pushParams((params) => {
      params.delete("edit");
      params.delete("view");
      params.set("create", "1");
    });
  };

  const handleEdit = (employee: Employee) => {
    pushParams((params) => {
      params.delete("create");
      params.delete("view");
      params.set("edit", employee.id);
    });
  };

  const handleView = (employee: Employee) => {
    pushParams((params) => {
      params.delete("create");
      params.delete("edit");
      params.set("view", employee.id);
    });
  };

  const handleEditFromView = (employee: Employee) => {
    handleEdit(employee);
  };

  const closeForm = useCallback(() => {
    pushParams((params) => {
      params.delete("create");
      params.delete("edit");
    });
  }, [pushParams]);

  const closeView = useCallback(() => {
    pushParams((params) => {
      params.delete("view");
    });
  }, [pushParams]);

  useViewerWriteUrlGuard(createOpen || !!editId, closeForm);

  useEffect(() => {
    if (editId && !loading && !editEmployee) {
      toast.error("Employee not found");
      closeForm();
    }
  }, [editId, editEmployee, loading, closeForm]);

  useEffect(() => {
    if (viewId && !loading && !viewEmployee && !createOpen && !editEmployee) {
      toast.error("Employee not found");
      closeView();
    }
  }, [viewId, viewEmployee, loading, createOpen, editEmployee, closeView]);

  const viewOpen = !!viewId && !createOpen && !editEmployee;

  const refetch = () => {
    void loadAll(true);
  };

  const handleSaved = async (saved: Employee) => {
    const lookup = buildOrgNameLookup({
      ...org,
      employees: [
        ...employees.map((e) => ({ id: e.id, name: e.name })),
        { id: saved.id, name: saved.name },
      ],
    });
    const previousDocs = createOpen
      ? []
      : (
          await listHrmEmployeeDocuments({ employee_id: saved.id })
        ).map((r) => apiEmployeeDocumentToUi(r, documentTypeName));
    try {
      let mapped: Employee;
      if (createOpen) {
        const row = await createHrmEmployee(saved);
        mapped = apiEmployeeToEmployee(row, lookup);
      } else {
        const row = await updateHrmEmployee(saved.id, saved);
        mapped = apiEmployeeToEmployee(row, lookup);
      }
      const syncedDocs = await syncEmployeeDocuments(
        mapped.id,
        saved.documents ?? [],
        previousDocs,
        documentTypeName,
        (doc) => {
          const raw = (doc.documentTypeId || "").trim();
          if (documentTypes.some((t) => t.id === raw)) return raw;
          const byName = documentTypes.find(
            (t) =>
              t.name.toLowerCase() === raw.toLowerCase() ||
              t.name.toLowerCase() === doc.type.toLowerCase(),
          );
          return byName?.id;
        },
      );
      mapped = { ...mapped, documents: syncedDocs };
      if (createOpen) {
        setEmployees((prev) => [mapped, ...prev]);
        toast.success("Employee created");
      } else {
        setEmployees((prev) => prev.map((e) => (e.id === mapped.id ? mapped : e)));
        toast.success("Employee updated");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      throw err;
    }
  };

  const handleDelete = async (employee: Employee) => {
    if (!window.confirm(`Delete employee “${employee.name}”?`)) return;
    try {
      await deleteHrmEmployee(employee.id);
      setEmployees((prev) => prev.filter((e) => e.id !== employee.id));
      if (viewId === employee.id) closeView();
      if (editId === employee.id) closeForm();
      toast.success("Employee deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const headerLeftActions = (
    <ListGridHeaderStart title="Employees">
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={openCreate}>
          Create employee
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="relative h-[26px] w-[26px] shrink-0 rounded-none"
            aria-label="Settings"
            title="Settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {advancedFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-none bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
                {advancedFilterCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem] rounded-none">
          <DropdownMenuItem onClick={refetch} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => employeeGridRef.current?.openFilters()}>
            <Filter className="mr-1.5 h-3 w-3" />
            Filters
            {advancedFilterCount > 0 ? (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {advancedFilterCount}
              </span>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => toast.info("Import — prototype")}>
            <Upload className="mr-1.5 h-3 w-3" />
            Import
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toast.success("Export started (mock CSV)")}>
            <Download className="mr-1.5 h-3 w-3" />
            Export
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <EmployeeGrid
        ref={employeeGridRef}
        employees={employees}
        loading={loading}
        onView={handleView}
        onEdit={handleEdit}
        onDelete={canWrite ? (e) => void handleDelete(e) : undefined}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onAdvancedFilterCountChange={setAdvancedFilterCount}
        headerLeftActions={headerLeftActions}
        className="min-h-0 flex-1"
        branchOptions={org.branches}
        departmentOptions={departmentOptions}
      />

      {canWrite ? (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-none p-0 shadow-lg md:hidden"
          onClick={openCreate}
          aria-label="Add employee"
        >
          <Plus className="h-5 w-5" />
        </Button>
      ) : null}

      {viewOpen ? (
        <EmployeeViewDialog
          open
          onOpenChange={(open) => {
            if (!open) closeView();
          }}
          employee={viewEmployee}
          documentTypeName={documentTypeName}
          onEdit={canWrite ? handleEditFromView : undefined}
        />
      ) : null}

      {canWrite && (createOpen || !!editEmployee) ? (
        <EmployeeFormDialog
          open
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
          mode={createOpen ? "create" : "edit"}
          employee={editEmployee}
          existingEmployees={employees}
          org={org}
          documentTypes={documentTypes}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}

export default function HrmEmployeesPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ContentDataSkeleton label="Loading employees…" />}>
        <EmployeeListContent />
      </Suspense>
    </div>
  );
}
