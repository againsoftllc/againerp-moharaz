"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { ICellRendererParams } from "ag-grid-community";
import { Download, Eye, Filter, RefreshCw, Settings2, SlidersHorizontal, Trash2, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { UserDrawer } from "@/components/auth/user-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterSelect } from "@/components/shared/filter-select";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { RowActionsTrigger } from "@/components/shared/row-actions-icon";
import {
  FinanceAgListGrid,
  type FinanceAgListGridColumn,
  type FinanceAgListGridHandle,
} from "@/components/finance/finance-ag-list-grid";
import { useAuthUsers } from "@/lib/api/use-auth-users";
import { useApiHealth } from "@/lib/api/use-api-health";
import { listWarehouses } from "@/lib/api/inventory";
import { useCanManageWorkspace } from "@/lib/auth/permissions";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import type { AdminUser } from "@/lib/store/admin-auth-store";
import type { Warehouse } from "@/lib/mock-data/inventory";
import { cn } from "@/lib/utils";

type DrawerState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; user: AdminUser };

type Filters = { search: string; role: string; status: string };
const DEFAULT_FILTERS: Filters = { search: "", role: "all", status: "all" };

const FILTER_TOGGLES = [
  { key: "search", label: "Search" },
  { key: "role", label: "Role" },
  { key: "status", label: "Status" },
];

type UserRow = AdminUser & { id: string };

/** The role names a user holds, falling back to the legacy single role. */
function roleNames(user: AdminUser): string[] {
  if (user.roles?.length) return user.roles.map((r) => r.name);
  return [user.role === "admin" ? "System Manager" : user.role.charAt(0).toUpperCase() + user.role.slice(1)];
}

/** An inactive member is not live: dimmed so the live ones stand out (datatablecommon.md §3.3). */
const dim = (p: { data?: AdminUser }) => (p.data && !p.data.is_active ? "opacity-45" : "");
const dimWith = (cls: string) => (p: { data?: AdminUser }) => [cls, dim(p)].filter(Boolean);

export function WorkspaceUsersPanel({ embedded = false }: { embedded?: boolean }) {
  const currentUser = useAdminAuth((s) => s.user);
  const isAdmin = useCanManageWorkspace();
  const apiHealth = useApiHealth();
  const { users, loading, error, refetch, createUser, patchUser, removeUser } = useAuthUsers();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [drawer, setDrawer] = useState<DrawerState>({ mode: "closed" });
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const gridRef = useRef<FinanceAgListGridHandle>(null);
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "auth-users-api" });
  }, [error]);

  useEffect(() => {
    void listWarehouses()
      .then(setWarehouses)
      .catch(() => setWarehouses([]));
  }, []);

  const roleOptions = useMemo(() => {
    const names = new Set<string>();
    for (const user of users) for (const name of roleNames(user)) names.add(name);
    return [{ value: "all", label: "All roles" }, ...[...names].sort().map((name) => ({ value: name, label: name }))];
  }, [users]);

  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase().trim();
    return users.filter((user) => {
      if (filters.role !== "all" && !roleNames(user).includes(filters.role)) return false;
      if (filters.status === "active" && !user.is_active) return false;
      if (filters.status === "inactive" && user.is_active) return false;
      if (!q) return true;
      return (
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.username.toLowerCase().includes(q)
      );
    });
  }, [users, filters]);

  const activeFilters =
    Number(Boolean(filters.search.trim())) + Number(filters.role !== "all") + Number(filters.status !== "all");

  const warehouseLabel = useCallback(
    (user: AdminUser) => {
      const ids = user.warehouse_ids ?? [];
      if (ids.length === 0) return "All warehouses";
      const names = ids.map((id) => warehouses.find((w) => w.id === id)?.name ?? "").filter(Boolean);
      return names.length ? names.join(", ") : `${ids.length} warehouse${ids.length === 1 ? "" : "s"}`;
    },
    [warehouses],
  );

  const setActive = useCallback(
    async (user: AdminUser, is_active: boolean) => {
      try {
        await patchUser(user.id, { is_active });
        toast.success(is_active ? `${user.name} activated` : `${user.name} deactivated`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update status");
      }
    },
    [patchUser],
  );

  const remove = useCallback(
    async (user: AdminUser) => {
      if (!window.confirm(`Remove ${user.name} from the team?`)) return;
      try {
        await removeUser(user.id);
        toast.success(`${user.name} removed`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to remove user");
      }
    },
    [removeUser],
  );

  const rowActions = useMemo(
    () =>
      function RowActions(row: AdminUser) {
        const isSelf = row.id === currentUser?.id;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <RowActionsTrigger />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setDrawer({ mode: "edit", user: row })}>
                <Eye className="mr-1.5 h-3 w-3" /> Open
              </DropdownMenuItem>
              {!isSelf ? (
                <DropdownMenuItem onClick={() => void setActive(row, !row.is_active)}>
                  {row.is_active ? <UserX className="mr-1.5 h-3 w-3" /> : <UserCheck className="mr-1.5 h-3 w-3" />}
                  {row.is_active ? "Deactivate" : "Activate"}
                </DropdownMenuItem>
              ) : null}
              {!isSelf ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void remove(row)}>
                    <Trash2 className="mr-1.5 h-3 w-3" /> Remove
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    [currentUser?.id, remove, setActive],
  );

  const columns = useMemo<FinanceAgListGridColumn<any>[]>(
    () => [
      {
        colId: "name",
        field: "name",
        headerName: "Name",
        flex: 1.4,
        minWidth: 180,
        cellClass: dim,
        cellRenderer: (p: ICellRendererParams<AdminUser>) =>
          p.data ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-[#00a09d] text-[9px] font-bold uppercase text-white">
                {p.data.name.slice(0, 2)}
              </span>
              <span className="truncate font-medium">{p.data.name}</span>
              {p.data.id === currentUser?.id ? <span className="shrink-0 text-muted-foreground">(you)</span> : null}
            </span>
          ) : null,
      },
      { colId: "username", field: "username", headerName: "Username", width: 140, minWidth: 100, cellClass: dim, valueFormatter: (p) => `@${p.value ?? ""}` },
      { colId: "email", field: "email", headerName: "Email", flex: 1.4, minWidth: 180, cellClass: dim },
      {
        colId: "roles",
        headerName: "Roles",
        flex: 1.2,
        minWidth: 160,
        cellClass: dim,
        valueGetter: (p) => (p.data ? roleNames(p.data).join(", ") : ""),
        cellRenderer: (p: ICellRendererParams<AdminUser>) =>
          p.data ? (
            <span className="flex min-w-0 items-center gap-1">
              {roleNames(p.data).map((name) => (
                <GridChipBadge key={name} className="border-border bg-muted/40 text-foreground" title={name}>
                  {name}
                </GridChipBadge>
              ))}
            </span>
          ) : null,
      },
      {
        colId: "warehouses",
        headerName: "Warehouses",
        width: 190,
        minWidth: 120,
        cellClass: dim,
        valueGetter: (p) => (p.data ? warehouseLabel(p.data) : ""),
      },
      {
        colId: "status",
        field: "is_active",
        headerName: "Status",
        width: 110,
        cellClass: dim,
        valueGetter: (p) => (p.data?.is_active ? "Active" : "Inactive"),
        cellRenderer: (p: ICellRendererParams<AdminUser>) =>
          p.data ? (
            <GridChipBadge
              className={
                p.data.is_active
                  ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-border bg-muted text-muted-foreground"
              }
              title={p.data.is_active ? "Active" : "Inactive"}
            >
              {p.data.is_active ? "Active" : "Inactive"}
            </GridChipBadge>
          ) : null,
      },
    ],
    [currentUser?.id, warehouseLabel],
  );

  if (!isAdmin) {
    return (
      <div className="rounded-none border border-border bg-card p-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Admin access required</p>
        <p className="mt-1">Only administrators can manage team roles.</p>
        <Button variant="outline" size="sm" asChild className="mt-4 rounded-none">
          <Link href="/workspace/modules">Back to workspace</Link>
        </Button>
      </div>
    );
  }

  const drawerOpen = drawer.mode !== "closed";

  const headerLeftActions: ReactNode = (
    <ListGridHeaderStart title="Users">
      <Button size="sm" className="rounded-none" onClick={() => setDrawer({ mode: "create" })}>
        New
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "relative h-[26px] w-[26px] shrink-0 rounded-none",
              apiHealth.status === "connected" &&
                "border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400",
              apiHealth.status === "partial" &&
                "border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400",
              apiHealth.status === "disconnected" &&
                "border-red-500/50 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400",
              apiHealth.status === "checking" && "text-muted-foreground",
            )}
            aria-label="Settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {activeFilters > 0 && (
              <span className="absolute -right-1 -top-1 rounded-none bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
                {activeFilters}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          <DropdownMenuItem
            onClick={() => {
              void refetch();
              apiHealth.recheck();
            }}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openFilters()}>
            <Filter className="mr-1.5 h-3 w-3" />
            Filters
            {activeFilters > 0 ? <span className="ml-auto text-[10px] text-muted-foreground">{activeFilters}</span> : null}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openColumns()}>
            <SlidersHorizontal className="mr-1.5 h-3 w-3" />
            Columns
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => gridRef.current?.exportCsv()}>
            <Download className="mr-1.5 h-3.5 w-3" />
            Export
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.resetFilters()}>Reset filters</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <div
      className={cn(
        "flex min-h-112 min-w-0 flex-1 flex-col",
        embedded && "border border-t-0 border-border bg-card",
      )}
    >
      <FinanceAgListGrid
        className="min-h-0 flex-1"
        gridRef={gridRef}
        storageKey="workspace-users"
        rows={filtered as UserRow[]}
        columns={columns as unknown as FinanceAgListGridColumn[]}
        loading={loading && users.length === 0}
        headerLeftActions={headerLeftActions}
        rowActions={rowActions as unknown as (row: any) => ReactNode}
        onRowClicked={(row) => setDrawer({ mode: "edit", user: row as AdminUser })}
        onResetFilters={() => setFilters(DEFAULT_FILTERS)}
        filterToggles={FILTER_TOGGLES}
        emptyTitle={users.length === 0 ? "No team members yet" : "No users match your filters"}
        emptyHint={
          users.length === 0
            ? "Click New to add the first one."
            : "Open a user to change details, reset a password or assign roles. To revoke access, set the user Inactive."
        }
        csvFileName={`users-${new Date().toISOString().slice(0, 10)}.csv`}
        csvHeaders={["Name", "Username", "Email", "Roles", "Warehouses", "Status"]}
        csvRow={(row: AdminUser) => [
          row.name,
          row.username,
          row.email,
          roleNames(row).join("; "),
          warehouseLabel(row),
          row.is_active ? "Active" : "Inactive",
        ]}
        mobileLine={(row: AdminUser) => ({
          title: row.name,
          meta: `${row.email} · ${roleNames(row).join(", ")}`,
          value: row.is_active ? "Active" : "Inactive",
        })}
        filterBar={(visible) => (
          <>
            {visible.search !== false ? (
              <Input
                placeholder="Search name, email, username…"
                value={filters.search}
                onChange={(e) => set("search", e.target.value)}
                className="w-[240px] shrink-0 rounded-none"
              />
            ) : null}
            {visible.role !== false ? (
              <FilterSelect
                value={filters.role}
                onChange={(v) => set("role", v)}
                width="w-[170px]"
                className="shrink-0"
                ariaLabel="Role filter"
                options={roleOptions}
              />
            ) : null}
            {visible.status !== false ? (
              <FilterSelect
                value={filters.status}
                onChange={(v) => set("status", v)}
                width="w-[140px]"
                className="shrink-0"
                ariaLabel="Status filter"
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
              />
            ) : null}
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-none text-xs" onClick={() => setFilters(DEFAULT_FILTERS)}>
                Clear
              </Button>
            )}
          </>
        )}
      />

      {drawer.mode === "create" && (
        <UserDrawer
          mode="create"
          open={drawerOpen}
          onOpenChange={(open) => {
            if (!open) setDrawer({ mode: "closed" });
          }}
          onAdd={async (payload) => {
            await createUser(payload);
          }}
        />
      )}

      {drawer.mode === "edit" && (
        <UserDrawer
          mode="edit"
          user={drawer.user}
          open={drawerOpen}
          onOpenChange={(open) => {
            if (!open) setDrawer({ mode: "closed" });
          }}
          isSelf={drawer.user.id === currentUser?.id}
          onSave={async (userId, patch) => {
            const updated = await patchUser(userId, patch);
            setDrawer({ mode: "edit", user: updated });
          }}
          onDelete={async (userId) => {
            await removeUser(userId);
            setDrawer({ mode: "closed" });
          }}
        />
      )}
    </div>
  );
}
