"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Save, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createAuthRole,
  deleteAuthRole,
  fetchAuthRoles,
  putAuthRolePermissions,
  type AuthRoleRecord,
  type RolePermissionFlags,
} from "@/lib/api/auth-roles";
import { useIsSystemManager } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

const ACTIONS = [
  { key: "can_read", label: "Read" },
  { key: "can_create", label: "Create" },
  { key: "can_write", label: "Write" },
  { key: "can_delete", label: "Delete" },
  { key: "can_publish", label: "Publish" },
  { key: "can_export", label: "Export" },
] as const;

type ActionKey = (typeof ACTIONS)[number]["key"];

function clonePermissions(role: AuthRoleRecord): RolePermissionFlags[] {
  return role.permissions.map((p) => ({ ...p }));
}

export default function SystemRolesPage() {
  const canManage = useIsSystemManager();
  const [roles, setRoles] = useState<AuthRoleRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RolePermissionFlags[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAuthRoles();
      setRoles(data);
      setSelectedId((prev) => prev ?? data[0]?.id ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => roles.find((r) => r.id === selectedId) ?? null,
    [roles, selectedId],
  );

  useEffect(() => {
    if (selected) setDraft(clonePermissions(selected));
    else setDraft([]);
  }, [selected]);

  const isSystemManager = selected?.slug === "system_manager";
  const dirty = useMemo(() => {
    if (!selected) return false;
    return JSON.stringify(draft) !== JSON.stringify(clonePermissions(selected));
  }, [draft, selected]);

  const toggle = (module: string, key: ActionKey) => {
    if (isSystemManager) return;
    setDraft((prev) =>
      prev.map((row) => {
        if (row.module !== module) return row;
        const next = { ...row, [key]: !row[key] };
        if (key !== "can_read" && next[key]) next.can_read = true;
        return next;
      }),
    );
  };

  /** Toggle every action on a single module row. */
  const toggleModuleAll = (module: string, checked: boolean) => {
    if (isSystemManager) return;
    setDraft((prev) =>
      prev.map((row) =>
        row.module !== module
          ? row
          : {
              ...row,
              can_read: checked,
              can_create: checked,
              can_write: checked,
              can_delete: checked,
              can_publish: checked,
              can_export: checked,
            },
      ),
    );
  };

  /** Toggle one action across every module (column bulk). */
  const toggleActionAll = (key: ActionKey, checked: boolean) => {
    if (isSystemManager) return;
    setDraft((prev) =>
      prev.map((row) => {
        const next = { ...row, [key]: checked };
        if (key !== "can_read" && checked) next.can_read = true;
        if (key === "can_read" && !checked) {
          next.can_create = false;
          next.can_write = false;
          next.can_delete = false;
          next.can_publish = false;
          next.can_export = false;
        }
        return next;
      }),
    );
  };

  const setAllPermissions = (checked: boolean) => {
    if (isSystemManager) return;
    setDraft((prev) =>
      prev.map((row) => ({
        ...row,
        can_read: checked,
        can_create: checked,
        can_write: checked,
        can_delete: checked,
        can_publish: checked,
        can_export: checked,
      })),
    );
  };

  const columnAllChecked = (key: ActionKey) =>
    draft.length > 0 && draft.every((row) => row[key]);
  const columnSomeChecked = (key: ActionKey) =>
    draft.some((row) => row[key]) && !columnAllChecked(key);

  const rowAllChecked = (row: RolePermissionFlags) =>
    row.can_read && row.can_create && row.can_write && row.can_delete && row.can_publish && row.can_export;
  const rowSomeChecked = (row: RolePermissionFlags) =>
    (row.can_read || row.can_create || row.can_write || row.can_delete || row.can_publish || row.can_export) && !rowAllChecked(row);

  const allChecked =
    draft.length > 0 && draft.every((row) => rowAllChecked(row));

  const handleSave = async () => {
    if (!selected || isSystemManager) return;
    setSaving(true);
    try {
      const updated = await putAuthRolePermissions(selected.id, draft);
      setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast.success("Permissions saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await createAuthRole({ name });
      setRoles((prev) => [...prev, created]);
      setSelectedId(created.id);
      setNewName("");
      toast.success(`Role “${created.name}” created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create role");
    }
  };

  const handleDelete = async () => {
    if (!selected || selected.is_system) return;
    if (!window.confirm(`Delete role “${selected.name}”?`)) return;
    try {
      await deleteAuthRole(selected.id);
      setRoles((prev) => prev.filter((r) => r.id !== selected.id));
      setSelectedId(null);
      toast.success("Role deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete role");
    }
  };

  if (!canManage) {
    return (
      <div className="rounded-lg border border-border/60 bg-card p-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">System Manager access required</p>
        <p className="mt-1">Only a System Manager can create roles or change permissions.</p>
        <Button variant="outline" size="sm" asChild className="mt-4">
          <Link href="/workspace/modules">Back to workspace</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-slate-600" />
          <h1 className="page-title">Roles & permissions</h1>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Module-level access for the ERP. Assign roles from{" "}
          <Link href="/workspace/business?tab=permission" className="underline underline-offset-2 hover:text-foreground">
            Permission → Users
          </Link>
          .
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[240px_1fr]">
        <div className="flex flex-col gap-2 rounded-lg border border-input bg-card p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Roles
          </p>
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : (
            <ul className="space-y-1">
              {roles.map((role) => (
                <li key={role.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(role.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
                      selectedId === role.id ? "bg-primary/10 text-foreground" : "hover:bg-muted/50",
                    )}
                  >
                    <span className="truncate font-medium">{role.name}</span>
                    {role.is_system ? (
                      <Badge variant="outline" className="ml-1 shrink-0 text-[10px]">
                        System
                      </Badge>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-auto space-y-2 border-t border-input pt-3">
            <Input
              placeholder="New role name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 rounded-none text-sm"
            />
            <Button size="sm" className="w-full" onClick={() => void handleCreate()} disabled={!newName.trim()}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Create role
            </Button>
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-input bg-card">
          {!selected ? (
            <p className="p-6 text-sm text-muted-foreground">Select a role to edit permissions.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-input px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">{selected.name}</h2>
                    <Badge variant="secondary" className="text-[10px]">
                      {selected.slug}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selected.description ||
                      (isSystemManager
                        ? "Full access — matrix is fixed."
                        : `${selected.user_count} user(s) assigned`)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/workspace/business?tab=permission">Users</Link>
                  </Button>
                  {!selected.is_system ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void handleDelete()}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    disabled={!dirty || saving || isSystemManager}
                    onClick={() => void handleSave()}
                  >
                    {saving ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 w-10 text-center">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-primary"
                          checked={allChecked}
                          disabled={isSystemManager || draft.length === 0}
                          ref={(el) => {
                            if (el) {
                              el.indeterminate =
                                !allChecked && draft.some((row) => rowAllChecked(row) || rowSomeChecked(row));
                            }
                          }}
                          onChange={(e) => setAllPermissions(e.target.checked)}
                          aria-label="Select all permissions"
                          title="Select all"
                        />
                      </th>
                      <th className="px-3 py-2.5">Module</th>
                      {ACTIONS.map((a) => (
                        <th key={a.key} className="px-3 py-2.5 text-center w-20">
                          <div className="flex flex-col items-center gap-1">
                            <span>{a.label}</span>
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 accent-primary"
                              checked={columnAllChecked(a.key)}
                              disabled={isSystemManager || draft.length === 0}
                              ref={(el) => {
                                if (el) el.indeterminate = columnSomeChecked(a.key);
                              }}
                              onChange={(e) => toggleActionAll(a.key, e.target.checked)}
                              aria-label={`Select all ${a.label}`}
                              title={`All modules · ${a.label}`}
                            />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {draft.map((row) => (
                      <tr key={row.module} className="border-t border-input/60 hover:bg-muted/20">
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-primary"
                            checked={rowAllChecked(row)}
                            disabled={isSystemManager}
                            ref={(el) => {
                              if (el) el.indeterminate = rowSomeChecked(row);
                            }}
                            onChange={(e) => toggleModuleAll(row.module, e.target.checked)}
                            aria-label={`Select all for ${row.module}`}
                            title={`All actions · ${row.module}`}
                          />
                        </td>
                        <td className="px-3 py-2 capitalize">{row.module}</td>
                        {ACTIONS.map((a) => (
                          <td key={a.key} className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 accent-primary"
                              checked={row[a.key]}
                              disabled={isSystemManager}
                              onChange={() => toggle(row.module, a.key)}
                              aria-label={`${row.module} ${a.label}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
