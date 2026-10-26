"use client";

import * as React from "react";
import {
  X, Shield, Mail, AtSign, User, Save, Trash2, Lock, UserPlus,
  LogIn, Settings, UserCheck, UserX, KeyRound, Activity, Warehouse as WarehouseIcon,
} from "lucide-react";
import { toast } from "sonner";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatDate } from "@/lib/utils";
import type { AdminUser } from "@/lib/store/admin-auth-store";
import { fetchUserActivity, type ActivityEntry, type ApiUserCreate } from "@/lib/api/auth-users";
import { fetchAuthRoles, type AuthRoleRecord } from "@/lib/api/auth-roles";
import { listWarehouses } from "@/lib/api/inventory";
import type { Warehouse } from "@/lib/mock-data/inventory";

function roleVariant(role: string) {
  if (role === "admin" || role === "system_manager") return "default" as const;
  if (role === "staff") return "secondary" as const;
  return "outline" as const;
}

function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function deriveUsername(name: string) {
  return name.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "").slice(0, 32);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return "Just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30)  return `${days}d ago`;
  return formatDate(iso);
}

const ACTION_META: Record<string, { icon: React.ReactNode; label: string; color?: string }> = {
  login:             { icon: <LogIn className="h-3.5 w-3.5" />,     label: "Signed in",              color: "text-blue-500" },
  logout:            { icon: <LogIn className="h-3.5 w-3.5 rotate-180" />, label: "Signed out",      color: "text-muted-foreground" },
  account_created:   { icon: <UserCheck className="h-3.5 w-3.5" />, label: "Account created",        color: "text-green-500" },
  created_account:   { icon: <UserCheck className="h-3.5 w-3.5" />, label: "Created account",        color: "text-green-500" },
  profile_updated:   { icon: <Settings className="h-3.5 w-3.5" />,  label: "Profile updated",        color: "text-blue-400" },
  updated_profile:   { icon: <Settings className="h-3.5 w-3.5" />,  label: "Updated profile",        color: "text-blue-400" },
  deactivated:       { icon: <UserX className="h-3.5 w-3.5" />,     label: "Account deactivated",    color: "text-red-500" },
  deactivated_user:  { icon: <UserX className="h-3.5 w-3.5" />,     label: "Deactivated user",       color: "text-red-500" },
  reactivated:       { icon: <UserCheck className="h-3.5 w-3.5" />, label: "Account reactivated",    color: "text-green-500" },
  reactivated_user:  { icon: <UserCheck className="h-3.5 w-3.5" />, label: "Reactivated user",       color: "text-green-500" },
  role_changed:      { icon: <Shield className="h-3.5 w-3.5" />,    label: "Role changed",           color: "text-yellow-500" },
  changed_role:      { icon: <Shield className="h-3.5 w-3.5" />,    label: "Changed role",           color: "text-yellow-500" },
  warehouse_changed: { icon: <WarehouseIcon className="h-3.5 w-3.5" />, label: "Warehouse access changed", color: "text-yellow-500" },
  changed_warehouse: { icon: <WarehouseIcon className="h-3.5 w-3.5" />, label: "Changed warehouse access", color: "text-yellow-500" },
  deleted_account:   { icon: <UserX className="h-3.5 w-3.5" />,     label: "Removed user",           color: "text-red-500" },
  password_changed:  { icon: <KeyRound className="h-3.5 w-3.5" />,  label: "Password changed",       color: "text-muted-foreground" },
};

function ActivityTab({ userId }: { userId: string }) {
  const [entries, setEntries] = React.useState<ActivityEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    fetchUserActivity(userId)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Activity className="h-8 w-8 opacity-30" />
        <p>No activity yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {entries.map((e, i) => {
        const meta = ACTION_META[e.action] ?? { icon: <Activity className="h-3.5 w-3.5" />, label: e.action, color: "text-muted-foreground" };
        return (
          <div key={e.id} className={cn("flex gap-3 px-1 py-3", i !== entries.length - 1 && "border-b border-input/50")}>
            {/* Icon */}
            <div className="flex flex-col items-center pt-0.5">
              <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted", meta.color ?? "text-muted-foreground")}>
                {meta.icon}
              </div>
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-snug">{meta.label}</p>
              {e.detail && (
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{e.detail}</p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground/60">{timeAgo(e.created_at)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Create mode ───────────────────────────────────── */
type CreateProps = {
  mode: "create";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (payload: ApiUserCreate) => Promise<void>;
};

/* ── Edit mode ─────────────────────────────────────── */
type EditProps = {
  mode: "edit";
  user: AdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSelf: boolean;
  onSave: (userId: string, patch: {
    name?: string;
    email?: string;
    username?: string;
    role?: string;
    role_ids?: string[];
    warehouse_ids?: string[];
    default_warehouse_id?: string;
    is_active?: boolean;
    password?: string;
  }) => Promise<void>;
  /** Omit to hide the Remove action — deactivating is the safe alternative. */
  onDelete?: (userId: string) => Promise<void>;
};

type Props = CreateProps | EditProps;

export function UserDrawer(props: Props) {
  const isCreate = props.mode === "create";
  const [tab, setTab] = React.useState<"info" | "activity">("info");

  const [name, setName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [roleIds, setRoleIds] = React.useState<string[]>([]);
  const [availableRoles, setAvailableRoles] = React.useState<AuthRoleRecord[]>([]);
  // none ticked = unrestricted; otherwise the warehouses the user may work in, one of them the default
  const [warehouseIds, setWarehouseIds] = React.useState<string[]>([]);
  const [defaultWarehouseId, setDefaultWarehouseId] = React.useState("");
  const [availableWarehouses, setAvailableWarehouses] = React.useState<Warehouse[]>([]);
  const [isActive, setIsActive] = React.useState(true);
  const [showPassword, setShowPassword] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const passwordTooShort = password.length > 0 && password.length < 6;

  React.useEffect(() => {
    if (!props.open) return;
    void fetchAuthRoles()
      .then((roles) => {
        setAvailableRoles(roles);
        if (isCreate && roleIds.length === 0) {
          const staff = roles.find((r) => r.slug === "staff");
          if (staff) setRoleIds([staff.id]);
        }
      })
      .catch(() => setAvailableRoles([]));
    void listWarehouses()
      .then((rows) => setAvailableWarehouses(rows.filter((w) => w.active)))
      .catch(() => setAvailableWarehouses([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  /* seed edit fields when user changes */
  React.useEffect(() => {
    if (!isCreate && props.mode === "edit") {
      setName(props.user.name);
      setUsername(props.user.username);
      setEmail(props.user.email);
      setPassword("");
      setShowPassword(false);
      setRoleIds(props.user.role_ids?.length ? [...props.user.role_ids] : []);
      setWarehouseIds(props.user.warehouse_ids ? [...props.user.warehouse_ids] : []);
      setDefaultWarehouseId(props.user.default_warehouse_id ?? "");
      setIsActive(props.user.is_active);
      setTab("info");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreate ? null : (props as EditProps).user?.id]);

  /* reset create fields on open */
  React.useEffect(() => {
    if (isCreate && props.open) {
      setName(""); setUsername(""); setEmail(""); setPassword(""); setShowPassword(false); setTab("info");
      const staff = availableRoles.find((r) => r.slug === "staff");
      setRoleIds(staff ? [staff.id] : []);
      setWarehouseIds([]);
      setDefaultWarehouseId("");
    }
  }, [isCreate, props.open, availableRoles]);

  const editUser = isCreate ? null : (props as EditProps).user;
  const isSelf   = isCreate ? false : (props as EditProps).isSelf;
  const originalRoleIds = editUser?.role_ids ?? [];
  const originalWarehouseIds = editUser?.warehouse_ids ?? [];
  const warehousesChanged =
    !sameIds(warehouseIds, originalWarehouseIds) ||
    (warehouseIds.length > 0 && defaultWarehouseId !== (editUser?.default_warehouse_id ?? ""));

  const isDirty = isCreate
    ? name.trim().length > 0 && email.trim().length > 0 && username.trim().length >= 3 && password.length >= 6 && roleIds.length > 0
    : editUser
      ? (
          name !== editUser.name ||
          username !== editUser.username ||
          email.trim().toLowerCase() !== editUser.email ||
          (password.length > 0 && password.length >= 6) ||
          !sameIds(roleIds, originalRoleIds) ||
          warehousesChanged ||
          isActive !== editUser.is_active
        )
      : false;

  function toggleRole(id: string) {
    setRoleIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }

  function toggleWarehouse(id: string) {
    setWarehouseIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        setDefaultWarehouseId((d) => (d === id ? (next[0] ?? "") : d));
        return next;
      }
      setDefaultWarehouseId((d) => d || id);
      return [...prev, id];
    });
  }

  async function handleCreate() {
    setSaving(true);
    try {
      await (props as CreateProps).onAdd({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        username: username.trim().toLowerCase(),
        role_ids: roleIds,
        ...(warehouseIds.length ? { warehouse_ids: warehouseIds, default_warehouse_id: defaultWarehouseId || warehouseIds[0] } : {}),
        password,
      });
      toast.success(`${name} added`);
      props.onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!editUser) return;
    setSaving(true);
    try {
      const patch: {
        name?: string;
        email?: string;
        username?: string;
        role_ids?: string[];
        warehouse_ids?: string[];
        default_warehouse_id?: string;
        is_active?: boolean;
        password?: string;
      } = {};
      if (name !== editUser.name) patch.name = name.trim();
      if (email.trim().toLowerCase() !== editUser.email) patch.email = email.trim().toLowerCase();
      if (username !== editUser.username) patch.username = username.trim().toLowerCase();
      if (!sameIds(roleIds, originalRoleIds)) patch.role_ids = roleIds;
      if (warehousesChanged) {
        patch.warehouse_ids = warehouseIds;
        if (warehouseIds.length) patch.default_warehouse_id = defaultWarehouseId || warehouseIds[0];
      }
      if (isActive !== editUser.is_active) patch.is_active = isActive;
      if (password.length >= 6) patch.password = password;
      await (props as EditProps).onSave(editUser.id, patch);
      toast.success(
        patch.password
          ? `Password updated — ${editUser.username} must sign in again`
          : "Changes saved",
      );
      props.onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const onDelete = (props as EditProps).onDelete;
    if (!editUser || !onDelete) return;
    if (!window.confirm(`Remove ${editUser.name} from the team?`)) return;
    setDeleting(true);
    try {
      await onDelete(editUser.id);
      toast.success(`${editUser.name} removed`);
      props.onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <DialogPrimitive.Root open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-input bg-card shadow-xl focus:outline-none"
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between border-b border-input px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold uppercase">
                {isCreate ? <UserPlus className="h-4 w-4 text-muted-foreground" /> : editUser!.name.slice(0, 2)}
              </div>
              <div>
                <DialogPrimitive.Title className="text-sm font-semibold leading-tight">
                  {isCreate ? "Add team member" : editUser!.name}
                </DialogPrimitive.Title>
                {!isCreate && <p className="text-xs text-muted-foreground">@{editUser!.username}</p>}
              </div>
            </div>
            <DialogPrimitive.Close className="rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          {/* ── Tabs (edit mode only) ── */}
          {!isCreate && (
            <div className="flex border-b border-input">
              {(["info", "activity"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "flex-1 py-2.5 text-xs font-medium capitalize transition-colors",
                    tab === t
                      ? "border-b-2 border-primary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t === "info" ? "Info" : "Activity"}
                </button>
              ))}
            </div>
          )}

          {/* ── Body ── */}
          <div className="flex-1 overflow-y-auto px-5 py-5">

            {/* ── ACTIVITY TAB ── */}
            {!isCreate && tab === "activity" && editUser && (
              <ActivityTab userId={editUser.id} />
            )}

            {/* ── INFO TAB / CREATE ── */}
            {(isCreate || tab === "info") && (
              <div className="space-y-5">
                {/* Edit: status badges */}
                {!isCreate && editUser && (
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={roleVariant(editUser.role)} className="capitalize">{editUser.role}</Badge>
                    <Badge variant={editUser.is_active ? "success" : "muted"}>
                      {editUser.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {isSelf && <Badge variant="outline">You</Badge>}
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ud-name" className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" /> Full name
                    </Label>
                    <Input
                      id="ud-name"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (isCreate && (!username || username === deriveUsername(name))) {
                          setUsername(deriveUsername(e.target.value));
                        }
                      }}
                      placeholder="Jane Smith"
                      disabled={saving}
                      minLength={1}
                      maxLength={255}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ud-username" className="flex items-center gap-1.5">
                      <AtSign className="h-3.5 w-3.5" /> Username
                    </Label>
                    <Input
                      id="ud-username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                      placeholder="jane.smith"
                      disabled={saving}
                      minLength={3}
                      maxLength={64}
                    />
                    <p className="text-[11px] text-muted-foreground">Used for login. Letters, numbers, . _ - only.</p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ud-email" className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" /> Email
                    </Label>
                    <Input
                      id="ud-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="jane@company.com"
                      disabled={saving}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ud-pw" className="flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5" />
                      {isCreate ? "Temporary password" : "New password"}
                    </Label>
                    <div className="relative">
                      <Input
                        id="ud-pw"
                        type={showPassword ? "text" : "password"}
                        // Without this the browser autofills the signed-in admin's own
                        // credentials here, silently resetting the member's password.
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={isCreate ? "Min 6 characters" : "Leave blank to keep current"}
                        disabled={saving}
                        minLength={isCreate ? 6 : undefined}
                        className="pr-16"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    {passwordTooShort ? (
                      <p className="text-[11px] font-medium text-destructive">
                        Password must be at least 6 characters — it will not be saved as typed.
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        {isCreate
                          ? "User can change this after first login."
                          : "Min 6 characters. Leave blank to keep unchanged. Changing it signs the user out everywhere."}
                      </p>
                    )}
                  </div>

                  {(isCreate || !isSelf) && (
                    <div className="flex flex-col gap-1.5">
                      <Label className="flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5" /> Roles
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Select one or more roles. Permissions are the union of all assigned roles.
                      </p>
                      <div className="space-y-1.5">
                        {availableRoles.map((r) => {
                          const checked = roleIds.includes(r.id);
                          return (
                            <label
                              key={r.id}
                              className={cn(
                                "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 transition-colors",
                                checked
                                  ? "border-primary bg-primary/5"
                                  : "border-input hover:border-muted-foreground/40",
                              )}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 h-3.5 w-3.5 accent-primary"
                                checked={checked}
                                disabled={saving}
                                onChange={() => toggleRole(r.id)}
                              />
                              <span className="min-w-0">
                                <span className="block text-xs font-medium text-foreground">{r.name}</span>
                                <span className="block text-[10px] text-muted-foreground">
                                  {r.description || r.slug}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <Label className="flex items-center gap-1.5">
                      <WarehouseIcon className="h-3.5 w-3.5" /> Warehouse access
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {warehouseIds.length === 0
                        ? "None ticked — this user can use every warehouse. Tick the ones they may work in to limit them."
                        : "Sales and purchases start in the default warehouse. The user can switch only between the ticked ones."}
                    </p>
                    <div className="space-y-1.5">
                      {availableWarehouses.map((w) => {
                        const checked = warehouseIds.includes(w.id);
                        const isDefault = checked && defaultWarehouseId === w.id;
                        return (
                          <label
                            key={w.id}
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
                              checked
                                ? "border-primary bg-primary/5"
                                : "border-input hover:border-muted-foreground/40",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 accent-primary"
                              checked={checked}
                              disabled={saving}
                              onChange={() => toggleWarehouse(w.id)}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium text-foreground">{w.name}</span>
                              <span className="block text-[10px] text-muted-foreground">{w.code}</span>
                            </span>
                            {checked && warehouseIds.length > 1 ? (
                              isDefault ? (
                                <Badge variant="default">Default</Badge>
                              ) : (
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setDefaultWarehouseId(w.id);
                                  }}
                                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                                >
                                  Make default
                                </button>
                              )
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {!isCreate && !isSelf && (
                    <div className="flex items-center justify-between rounded-lg border border-input px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">Active</p>
                        <p className="text-xs text-muted-foreground">Inactive users cannot log in</p>
                      </div>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setIsActive((v) => !v)}
                        className={cn(
                          "relative h-6 w-11 rounded-full transition-colors focus:outline-none",
                          isActive ? "bg-primary" : "bg-muted-foreground/30"
                        )}
                      >
                        <span className={cn(
                          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                          isActive && "translate-x-5"
                        )} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Footer — hidden on activity tab ── */}
          {(isCreate || tab === "info") && (
            <div className="border-t border-input px-5 py-4 flex items-center gap-2">
              {!isCreate && !isSelf && (props as EditProps).onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 mr-auto"
                  disabled={deleting || saving}
                  onClick={() => void handleDelete()}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Remove
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => props.onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!isDirty || saving || passwordTooShort}
                onClick={() => void (isCreate ? handleCreate() : handleSave())}
              >
                {isCreate
                  ? <><UserPlus className="mr-1.5 h-3.5 w-3.5" />{saving ? "Adding…" : "Add member"}</>
                  : <><Save className="mr-1.5 h-3.5 w-3.5" />{saving ? "Saving…" : "Save"}</>
                }
              </Button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
