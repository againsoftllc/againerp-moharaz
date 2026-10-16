"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/shared/filter-select";
import { AgainListGrid } from "@/components/shared/again-list-grid";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { TaskDrawer, type TaskInput } from "@/components/crm/task-drawer";
import { TaskDetailDrawer } from "@/components/crm/task-detail-drawer";
import { useOpenFromUrl } from "@/lib/hooks/use-open-from-url";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import {
  completeCrmTask,
  createCrmTask,
  deleteCrmTask,
  fetchCrmProjects,
  fetchCrmTasks,
  updateCrmTask,
  type ApiCrmProject,
  type ApiCrmTask,
} from "@/lib/api/crm";
import { cn } from "@/lib/utils";

function isOverdue(task: ApiCrmTask) {
  if (!task.due_date || task.status === "done" || task.status === "cancelled") return false;
  return task.due_date < new Date().toISOString().slice(0, 10);
}

type DrawerState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; task: ApiCrmTask }
  | { mode: "view"; task: ApiCrmTask };

export default function CrmTasksPage() {
  return (
    <Suspense fallback={<ContentDataSkeleton label="Loading Tasks…" />}>
      <CrmTasksPageContent />
    </Suspense>
  );
}

function CrmTasksPageContent() {
  const canWrite = useAdminCanWrite();
  const searchParams = useSearchParams();
  const projectIdFilter = searchParams.get("project_id") ?? "all";

  const [rows, setRows] = useState<ApiCrmTask[]>([]);
  const [projects, setProjects] = useState<ApiCrmProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [drawer, setDrawer] = useState<DrawerState>({ mode: "closed" });
  const [busyId, setBusyId] = useState<string | null>(null);

  // Deep link: /crm/tasks?open=<id> (e.g. from an Aladin "created task — open it" link)
  useOpenFromUrl(rows, (t) => t.id, (task) => setDrawer({ mode: "view", task }));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, projectsRes] = await Promise.all([
        fetchCrmTasks({ status, project_id: projectIdFilter === "all" ? undefined : projectIdFilter }),
        fetchCrmProjects(),
      ]);
      setRows(res.data);
      setProjects(projectsRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [status, projectIdFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "crm-tasks-api" });
  }, [error]);

  async function handleComplete(task: ApiCrmTask) {
    setBusyId(task.id);
    try {
      const res = await completeCrmTask(task.id);
      setRows((prev) => prev.map((r) => (r.id === task.id ? res.data : r)));
      toast.success("Task completed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete task");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(task: ApiCrmTask) {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    setBusyId(task.id);
    try {
      await deleteCrmTask(task.id);
      setRows((prev) => prev.filter((r) => r.id !== task.id));
      toast.success("Task deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete task");
    } finally {
      setBusyId(null);
    }
  }

  const filteredProject = projects.find((p) => p.id === projectIdFilter);

  const columnDefs: ColDef<ApiCrmTask>[] = useMemo(() => [
    {
      field: "title",
      headerName: "Title",
      flex: 1.4,
      minWidth: 160,
      cellRenderer: (p: ICellRendererParams<ApiCrmTask>) =>
        p.data ? (
          <span className={cn("font-medium", p.data.status === "done" && "text-muted-foreground line-through")}>
            {p.data.title}
          </span>
        ) : null,
    },
    {
      field: "id",
      headerName: "ID",
      width: 100,
      cellClass: "text-muted-foreground",
      valueFormatter: (p) => (p.value ? String(p.value).slice(0, 8) : ""),
      tooltipValueGetter: (p) => p.value ?? "",
    },
    {
      field: "start_date",
      headerName: "Start date",
      width: 110,
      valueGetter: (p) => p.data?.start_date ?? "—",
    },
    {
      field: "due_date",
      headerName: "Deadline",
      width: 110,
      cellRenderer: (p: ICellRendererParams<ApiCrmTask>) => {
        if (!p.data) return null;
        const overdue = isOverdue(p.data);
        return (
          <span className={overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"}>
            {p.data.due_date ?? "—"}
          </span>
        );
      },
    },
    {
      colId: "milestone_title",
      headerName: "Milestone",
      flex: 1,
      minWidth: 120,
      valueGetter: (p) => p.data?.milestone_title ?? "—",
    },
    {
      colId: "related_name",
      headerName: "Related to",
      flex: 1,
      minWidth: 130,
      valueGetter: (p) => (p.data?.related_name ? `${p.data.related_type}: ${p.data.related_name}` : "—"),
    },
    {
      colId: "assignee_name",
      headerName: "Assigned to",
      flex: 1,
      minWidth: 120,
      valueGetter: (p) => p.data?.assignee_name ?? "—",
    },
    {
      colId: "collaborator_names",
      headerName: "Collaborators",
      flex: 1,
      minWidth: 140,
      sortable: false,
      valueGetter: (p) => ((p.data?.collaborator_names ?? []).length ? p.data!.collaborator_names.join(", ") : "—"),
    },
    {
      colId: "status",
      headerName: "Status",
      width: 110,
      cellClass: "capitalize text-muted-foreground",
      valueGetter: (p) => p.data?.status.replace("_", " ") ?? "",
    },
    ...(canWrite
      ? [
          {
            colId: "actions",
            headerName: "",
            width: 70,
            pinned: "right" as const,
            sortable: false,
            resizable: false,
            suppressMovable: true,
            suppressHeaderMenuButton: true,
            cellRenderer: (p: ICellRendererParams<ApiCrmTask>) => {
              const task = p.data;
              if (!task) return null;
              const busy = busyId === task.id;
              return (
                <div className="flex h-full items-center justify-end gap-1">
                  {task.status !== "done" && task.status !== "cancelled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-6 px-0 text-emerald-600 hover:text-emerald-700"
                      disabled={busy}
                      onClick={() => void handleComplete(task)}
                      title="Mark done"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 px-0 text-muted-foreground hover:text-destructive"
                    disabled={busy}
                    onClick={() => void handleDelete(task)}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            },
          },
        ]
      : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [canWrite, busyId]);

  return (
      <AgainListGrid<ApiCrmTask>
        rowData={rows}
        columnDefs={columnDefs}
        loading={loading}
        headerLeftActions={
          <ListGridHeaderStart title="Tasks">
            {canWrite && (
              <Button size="sm" onClick={() => setDrawer({ mode: "create" })}>
                New
              </Button>
            )}
          </ListGridHeaderStart>
        }
        filterBar={
          <>
            <FilterSelect
              value={status}
              onChange={setStatus}
              width="w-[140px]"
              ariaLabel="Status filter"
              options={[
                { value: "all", label: "All statuses" },
                { value: "todo", label: "To do" },
                { value: "in_progress", label: "In progress" },
                { value: "done", label: "Done" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
            {filteredProject && <Badge variant="outline">Project: {filteredProject.name}</Badge>}
          </>
        }
        emptyTitle="No tasks match your filters"
        emptyHint="Try adjusting your filters."
        onResetFilters={() => setStatus("all")}
        onRowClicked={(task) => setDrawer({ mode: "view", task })}
        footerLeftActions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-1.5"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Refresh tasks"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            <span className="text-[11px] text-muted-foreground">{loading ? "…" : `${rows.length} shown`}</span>
          </>
        }
      >
        <TaskDrawer
          open={drawer.mode === "create" || drawer.mode === "edit"}
          onOpenChange={(open) => {
            if (!open) setDrawer({ mode: "closed" });
          }}
          task={drawer.mode === "edit" ? drawer.task : null}
          projects={projects}
          defaultProjectId={projectIdFilter !== "all" ? projectIdFilter : undefined}
          onCreate={async (input: TaskInput) => {
            const created = await createCrmTask(input);
            setRows((prev) => [created.data, ...prev]);
            void load();
          }}
          onSave={async (id, input: TaskInput) => {
            const updated = await updateCrmTask(id, input);
            setRows((prev) => prev.map((r) => (r.id === id ? updated.data : r)));
            void load();
          }}
        />

        <TaskDetailDrawer
          open={drawer.mode === "view"}
          onOpenChange={(open) => {
            if (!open) setDrawer({ mode: "closed" });
          }}
          task={drawer.mode === "view" ? drawer.task : null}
          onEdit={(task) => setDrawer({ mode: "edit", task })}
          onCloned={(task) => {
            setRows((prev) => [task, ...prev]);
            setDrawer({ mode: "view", task });
            void load();
          }}
          onUpdated={(task) => {
            setRows((prev) => prev.map((r) => (r.id === task.id ? task : r)));
            setDrawer({ mode: "view", task });
          }}
        />
      </AgainListGrid>
  );
}
