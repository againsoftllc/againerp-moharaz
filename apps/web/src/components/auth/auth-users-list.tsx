"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AdminUser } from "@/lib/store/admin-auth-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AuthUsersListProps = {
  users: AdminUser[];
  loading?: boolean;
  canEdit?: boolean;
  currentUserId?: string;
  onRowClick?: (user: AdminUser) => void;
  onRoleChange?: (userId: string, role: string) => Promise<void>;
  onStatusChange?: (userId: string, is_active: boolean) => Promise<void>;
  onDelete?: (userId: string) => Promise<void>;
};

function RoleChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
      {label}
    </span>
  );
}

export function AuthUsersList({
  users,
  loading = false,
  canEdit = false,
  currentUserId,
  onRowClick,
  onStatusChange,
  onDelete,
}: AuthUsersListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  // Removing a user is intentionally not offered yet — deactivate instead.
  const showActions = canEdit && Boolean(onDelete);
  const columnCount = showActions ? 5 : 4;

  async function handleDelete(user: AdminUser) {
    if (!onDelete) return;
    if (!window.confirm(`Remove ${user.name} from the team?`)) return;
    setDeletingId(user.id);
    try {
      await onDelete(user.id);
      toast.success(`${user.name} removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove user");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleStatusToggle(user: AdminUser) {
    if (!onStatusChange) return;
    setTogglingId(user.id);
    try {
      await onStatusChange(user.id, !user.is_active);
      toast.success(user.is_active ? `${user.name} deactivated` : `${user.name} activated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border bg-background">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="sticky top-0 z-[1] border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              {showActions ? <th className="w-10 px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columnCount} className="px-3 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!loading && users.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-3 py-10 text-center text-muted-foreground">
                  No team members yet
                </td>
              </tr>
            ) : null}
            {!loading &&
              users.map((user) => {
                const isSelf = user.id === currentUserId;
                const isToggling = togglingId === user.id;
                return (
                  <tr
                    key={user.id}
                    className="cursor-pointer border-b border-border/70 last:border-b-0 hover:bg-muted/30"
                    onClick={() => onRowClick?.(user)}
                  >
                    <td className="px-3 py-2 align-middle">
                      <div className="font-medium text-foreground">
                        {user.name}
                        {isSelf ? (
                          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                            (you)
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-muted-foreground">@{user.username}</div>
                    </td>
                    <td className="px-3 py-2 align-middle text-muted-foreground">{user.email}</td>
                    <td className="px-3 py-2 align-middle">
                      <div className="flex flex-wrap gap-1">
                        {user.roles?.length
                          ? user.roles.map((r) => <RoleChip key={r.id} label={r.name} />)
                          : (
                              <RoleChip
                                label={
                                  user.role === "admin"
                                    ? "System Manager"
                                    : user.role.charAt(0).toUpperCase() + user.role.slice(1)
                                }
                              />
                            )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                      {canEdit && onStatusChange && !isSelf ? (
                        <button
                          type="button"
                          disabled={isToggling}
                          onClick={() => void handleStatusToggle(user)}
                          className={cn(
                            "inline-flex items-center gap-1.5 border px-2 py-0.5 text-[11px] font-medium transition-colors",
                            user.is_active
                              ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-700 dark:text-emerald-400"
                              : "border-border bg-muted text-muted-foreground hover:border-emerald-600/30 hover:bg-emerald-500/10 hover:text-emerald-700",
                            isToggling && "cursor-not-allowed opacity-50",
                          )}
                          title={user.is_active ? "Click to deactivate" : "Click to activate"}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0",
                              user.is_active ? "bg-emerald-500" : "bg-muted-foreground",
                            )}
                          />
                          {isToggling ? "…" : user.is_active ? "Active" : "Inactive"}
                        </button>
                      ) : (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 border px-2 py-0.5 text-[11px] font-medium",
                            user.is_active
                              ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : "border-border bg-muted text-muted-foreground",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0",
                              user.is_active ? "bg-emerald-500" : "bg-muted-foreground",
                            )}
                          />
                          {user.is_active ? "Active" : "Inactive"}
                        </span>
                      )}
                    </td>
                    {showActions ? (
                      <td className="px-3 py-2 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                        {!isSelf && onDelete ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-none text-muted-foreground hover:text-destructive"
                            disabled={deletingId === user.id}
                            onClick={() => void handleDelete(user)}
                            title="Remove user"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <p className="shrink-0 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        Open a user to edit details, change password, or assign roles — permissions are the union of
        all roles. To revoke access, set the user Inactive.
      </p>
    </div>
  );
}
