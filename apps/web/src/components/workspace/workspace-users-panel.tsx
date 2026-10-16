"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Filter, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AuthUsersList } from "@/components/auth/auth-users-list";
import { UserDrawer } from "@/components/auth/user-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { FilterSelect } from "@/components/shared/filter-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuthUsers } from "@/lib/api/use-auth-users";
import { useCanManageWorkspace } from "@/lib/auth/permissions";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import type { AdminUser } from "@/lib/store/admin-auth-store";
import { cn } from "@/lib/utils";

type DrawerState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; user: AdminUser };

type RoleFilter = "all" | "admin" | "staff" | "viewer" | "system_manager";
type StatusFilter = "all" | "active" | "inactive";

export function WorkspaceUsersPanel({ embedded = false }: { embedded?: boolean }) {
  const currentUser = useAdminAuth((s) => s.user);
  const isAdmin = useCanManageWorkspace();
  const { users, total, loading, error, refetch, createUser, patchUser, removeUser } = useAuthUsers();
  const [drawer, setDrawer] = useState<DrawerState>({ mode: "closed" });
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "auth-users-api" });
  }, [error]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter((user) => {
      if (
        roleFilter !== "all" &&
        user.role !== roleFilter &&
        !(roleFilter === "admin" && user.roles?.some((r) => r.slug === "system_manager")) &&
        !user.roles?.some((r) => r.slug === roleFilter)
      ) {
        return false;
      }
      if (statusFilter === "active" && !user.is_active) return false;
      if (statusFilter === "inactive" && user.is_active) return false;
      if (!q) return true;
      return (
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.username.toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter, statusFilter]);

  const resetFilters = () => {
    setSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
  };

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

  return (
    <div
      className={cn(
        "flex min-h-0 max-w-none flex-1 flex-col overflow-hidden",
        embedded
          ? "min-h-[28rem] rounded-none border border-border bg-card"
          : "-m-3 w-[calc(100%+1.5rem)] lg:-m-4 lg:w-[calc(100%+2rem)]",
      )}
    >
      <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <div
          data-component="users-filters"
          className="product-grid-filters flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-0"
        >
          <div className="flex shrink-0 items-center gap-2 border-r border-border bg-background pr-2">
            <Button size="sm" className="rounded-none" onClick={() => setDrawer({ mode: "create" })}>
              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
              New
            </Button>
            <Button size="sm" variant="outline" className="rounded-none" asChild>
              <Link href="/workspace/roles">Roles</Link>
            </Button>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Input
              placeholder="Search name, email, username…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[220px] shrink-0 rounded-none"
            />
            <FilterSelect
              value={roleFilter}
              onChange={(next) => setRoleFilter(next as RoleFilter)}
              width="w-[120px]"
              className="shrink-0"
              ariaLabel="Role filter"
              options={[
                { value: "all", label: "All roles" },
                { value: "admin", label: "Admin" },
                { value: "staff", label: "Staff" },
                { value: "viewer", label: "Viewer" },
              ]}
            />
            <FilterSelect
              value={statusFilter}
              onChange={(next) => setStatusFilter(next as StatusFilter)}
              width="w-[130px]"
              className="shrink-0"
              ariaLabel="Status filter"
              options={[
                { value: "all", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-background px-3 py-3">
          <AuthUsersList
            users={filtered}
            loading={loading}
            canEdit={isAdmin}
            currentUserId={currentUser?.id}
            onRowClick={(user) => setDrawer({ mode: "edit", user })}
            onStatusChange={async (userId, is_active) => {
              await patchUser(userId, { is_active });
            }}
            onDelete={removeUser}
          />
        </div>

        <div className="flex h-[34px] shrink-0 items-center gap-2 border-t border-border bg-background px-2.5">
          <span className="text-sm font-medium">Users</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={loading}
            aria-label="Refresh users"
            title={error ? `API error: ${error}` : "API connected"}
            className={cn(
              "rounded-none",
              !error &&
                "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-400",
              error &&
                "border-red-500/40 bg-red-500/10 text-red-700 hover:bg-red-500/15 hover:text-red-700 dark:text-red-400",
            )}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 rounded-none"
            onClick={() => setFilterSheetOpen(true)}
            aria-label="Filters"
            title="Filters"
          >
            <Filter className="h-3.5 w-3.5" />
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {loading ? "…" : `${filtered.length} shown · ${total} total`}
          </span>
        </div>

        <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
          <SheetContent side="right" className="w-full max-w-sm overflow-y-auto rounded-none">
            <h2 className="pr-8 text-base font-semibold">Filters</h2>
            <p className="mt-1 text-xs text-muted-foreground">Narrow the team list by role and status.</p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Role</span>
                <Select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                  className="w-full rounded-none"
                >
                  <option value="all">All roles</option>
                  <option value="admin">Admin</option>
                  <option value="staff">Staff</option>
                  <option value="viewer">Viewer</option>
                </Select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Status</span>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="w-full rounded-none"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </label>
            </div>
            <Button variant="outline" size="sm" className="mt-4 rounded-none" onClick={resetFilters}>
              Reset all filters
            </Button>
          </SheetContent>
        </Sheet>

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
    </div>
  );
}
