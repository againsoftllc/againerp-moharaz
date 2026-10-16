"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ProjectDrawer, type ProjectInput } from "@/components/crm/project-drawer";
import { ProjectDetailDrawer } from "@/components/crm/project-detail-drawer";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { createCrmProject, fetchCrmProjects, updateCrmProject, type ApiCrmProject } from "@/lib/api/crm";
import { formatCompanyIsoCell } from "@/lib/localisation/company-format";
import { getCompanyFormat } from "@/lib/store/company-format-store";
import { cn, formatMoney } from "@/lib/utils";

function money(value: string | null) {
  if (value === null) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? formatMoney(n) : value;
}

function statusVariant(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "active") return "warning" as const;
  if (status === "cancelled") return "muted" as const;
  return "outline" as const;
}

function dateCell(p: { value?: string | null }) {
  return p.value ? (formatCompanyIsoCell(p.value, getCompanyFormat()) as string) : "—";
}

const PROJECT_COLUMNS: ColDef<ApiCrmProject>[] = [
  { field: "name", headerName: "Name", flex: 1.4, minWidth: 160, cellClass: "font-medium" },
  {
    colId: "customer_name",
    headerName: "Client",
    flex: 1,
    minWidth: 120,
    valueGetter: (p) => p.data?.customer_name ?? "—",
  },
  { field: "start_date", headerName: "Start", width: 110, valueFormatter: dateCell },
  { field: "due_date", headerName: "Due", width: 110, valueFormatter: dateCell },
  {
    colId: "budget",
    headerName: "Budget",
    width: 110,
    headerClass: NUMERIC_HEADER,
    cellClass: NUMERIC_CELL,
    valueGetter: (p) => (p.data ? Number(p.data.budget ?? 0) : 0),
    valueFormatter: (p) => money(p.data?.budget ?? null),
  },
  {
    colId: "progress",
    headerName: "Progress",
    width: 150,
    sortable: false,
    cellRenderer: (p: ICellRendererParams<ApiCrmProject>) => {
      const project = p.data;
      if (!project) return null;
      if (project.task_count === 0) {
        return <span className="text-xs text-muted-foreground">No tasks</span>;
      }
      const donePct = Math.round(((project.task_count - project.open_task_count) / project.task_count) * 100);
      return (
        <div className="flex h-full items-center gap-1.5">
          <div className="h-1.5 w-16 overflow-hidden rounded-none bg-muted">
            <div className="h-full bg-primary" style={{ width: `${donePct}%` }} />
          </div>
          <Link
            href={`/crm/tasks?project_id=${project.id}`}
            className="text-[11px] text-primary hover:underline"
          >
            {donePct}%
          </Link>
        </div>
      );
    },
  },
  {
    field: "status",
    headerName: "Status",
    width: 120,
    cellRenderer: (p: ICellRendererParams<ApiCrmProject>) =>
      p.data ? (
        <GridChipBadge variant={statusVariant(p.data.status)} className="capitalize">
          {p.data.status.replace("_", " ")}
        </GridChipBadge>
      ) : null,
  },
];

type DetailState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; project: ApiCrmProject }
  | { mode: "view"; project: ApiCrmProject };

export default function CrmProjectsPage() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<ApiCrmProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [detail, setDetail] = useState<DetailState>({ mode: "closed" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCrmProjects({ status, search: search || undefined, overdue });
      setRows(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [status, search, overdue]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "crm-projects-api" });
  }, [error]);

  const headerLeftActions = useMemo(
    () => (
      <ListGridHeaderStart title="Projects">
        {canWrite && (
          <Button size="sm" onClick={() => setDetail({ mode: "create" })}>
            New
          </Button>
        )}
      </ListGridHeaderStart>
    ),
    [canWrite],
  );

  return (
    <AgainListGrid<ApiCrmProject>
      rowData={rows}
      columnDefs={PROJECT_COLUMNS}
      loading={loading}
      headerLeftActions={headerLeftActions}
      filterBar={
        <>
          <Input
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 w-[200px] rounded-none text-xs"
          />
          <FilterSelect
            value={status}
            onChange={setStatus}
            width="w-[150px]"
            ariaLabel="Status filter"
            options={[
              { value: "all", label: "All statuses" },
              { value: "planning", label: "Planning" },
              { value: "active", label: "Active" },
              { value: "on_hold", label: "On hold" },
              { value: "completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
          <Button
            size="sm"
            variant={overdue ? "default" : "outline"}
            className="h-7 px-2 text-[11px]"
            onClick={() => setOverdue((v) => !v)}
          >
            Overdue
          </Button>
        </>
      }
      emptyTitle="No projects match your filters"
      emptyHint="Try adjusting your search or filters."
      onResetFilters={() => {
        setSearch("");
        setStatus("all");
        setOverdue(false);
      }}
      onRowClicked={(project) => setDetail({ mode: "view", project })}
      footerLeftActions={
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-1.5"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh projects"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          <span className="text-[11px] text-muted-foreground">{loading ? "…" : `${rows.length} shown`}</span>
        </>
      }
    >
      <ProjectDrawer
        open={detail.mode === "create" || detail.mode === "edit"}
        onOpenChange={(open) => {
          if (!open) setDetail({ mode: "closed" });
        }}
        project={detail.mode === "edit" ? detail.project : null}
        onCreate={async (input: ProjectInput) => {
          const created = await createCrmProject(input);
          setRows((prev) => [created.data, ...prev]);
          void load();
        }}
        onSave={async (id, input: ProjectInput) => {
          const updated = await updateCrmProject(id, input);
          setRows((prev) => prev.map((r) => (r.id === id ? updated.data : r)));
          setDetail({ mode: "view", project: updated.data });
          void load();
        }}
      />

      <ProjectDetailDrawer
        open={detail.mode === "view"}
        onOpenChange={(open) => {
          if (!open) setDetail({ mode: "closed" });
        }}
        project={detail.mode === "view" ? detail.project : null}
        onEdit={(project) => setDetail({ mode: "edit", project })}
      />
    </AgainListGrid>
  );
}
