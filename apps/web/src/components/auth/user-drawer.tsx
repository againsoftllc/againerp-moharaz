"use client";

import * as React from "react";
import {
  Activity,
  KeyRound,
  LogIn,
  Settings,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AgainDrawerButton,
  AgainDrawerCloseButton,
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
  AgainDrawerSwitch,
} from "@/components/again/again-drawer";
import { AgainFormField, AgainFormGroupTitle } from "@/components/again/again-form-sheet";
import { AgainFormNotebook, type AgainNotebookTab } from "@/components/again/again-form-sheet-layout";
import { PartnerStatButton } from "@/components/customers/partner-customer-sections";
import { UserSecurityTab } from "@/components/auth/user-security-tab";
import {
  UserPermissionOverrides,
  overridesFromList,
  overridesToList,
  type OverrideMap,
} from "@/components/auth/user-permission-overrides";
import { fetchPaymentAccounts, type ApiFinancePaymentAccount } from "@/lib/api/finance";
import { cn, formatDate } from "@/lib/utils";
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";
import type { AdminUser } from "@/lib/store/admin-auth-store";
import { fetchUserActivity, type ActivityEntry, type ApiUserCreate } from "@/lib/api/auth-users";
import { fetchAuthRoles, type AuthRoleRecord } from "@/lib/api/auth-roles";
import { listWarehouses } from "@/lib/api/inventory";
import type { Warehouse } from "@/lib/mock-data/inventory";

/** What the form holds. The password is typed fresh every time: it is never kept in a draft. */
type UserForm = {
  name: string;
  username: string;
  email: string;
  password: string;
  roleIds: string[];
  // none ticked = unrestricted; otherwise the warehouses the user may work in, one of them the default
  warehouseIds: string[];
  defaultWarehouseId: string;
  isActive: boolean;
  /** The member must choose their own password at the next sign-in. */
  mustChangePassword: boolean;
  /** none ticked = every cash / bank account */
  paymentAccountIds: string[];
  /** allow / deny on top of the roles, "module:action" → allow */
  overrides: OverrideMap;
};

type UserTab = "profile" | "access" | "security" | "activity";

const EMPTY_FORM: UserForm = {
  name: "",
  username: "",
  email: "",
  password: "",
  roleIds: [],
  warehouseIds: [],
  defaultWarehouseId: "",
  isActive: true,
  // a new member signs in with a temporary password and sets their own
  mustChangePassword: true,
  paymentAccountIds: [],
  overrides: {},
};

function userToForm(user: AdminUser): UserForm {
  return {
    name: user.name,
    username: user.username,
    email: user.email,
    password: "",
    roleIds: user.role_ids?.length ? [...user.role_ids] : [],
    warehouseIds: user.warehouse_ids ? [...user.warehouse_ids] : [],
    defaultWarehouseId: user.default_warehouse_id ?? "",
    isActive: user.is_active,
    mustChangePassword: Boolean(user.must_change_password),
    paymentAccountIds: user.payment_account_ids ? [...user.payment_account_ids] : [],
    overrides: overridesFromList(user.permission_overrides),
  };
}

function formSignature(form: UserForm) {
  return JSON.stringify({
    ...form,
    email: form.email.trim().toLowerCase(),
    roleIds: [...form.roleIds].sort(),
    warehouseIds: [...form.warehouseIds].sort(),
    paymentAccountIds: [...form.paymentAccountIds].sort(),
    overrides: Object.fromEntries(Object.entries(form.overrides).sort()),
  });
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
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

const ACTION_META: Record<string, { icon: React.ReactNode; label: string; color?: string }> = {
  login: { icon: <LogIn className="h-3.5 w-3.5" />, label: "Signed in", color: "text-blue-500" },
  logout: { icon: <LogIn className="h-3.5 w-3.5 rotate-180" />, label: "Signed out", color: "text-muted-foreground" },
  account_created: { icon: <UserCheck className="h-3.5 w-3.5" />, label: "Account created", color: "text-green-500" },
  created_account: { icon: <UserCheck className="h-3.5 w-3.5" />, label: "Created account", color: "text-green-500" },
  profile_updated: { icon: <Settings className="h-3.5 w-3.5" />, label: "Profile updated", color: "text-blue-400" },
  updated_profile: { icon: <Settings className="h-3.5 w-3.5" />, label: "Updated profile", color: "text-blue-400" },
  deactivated: { icon: <UserX className="h-3.5 w-3.5" />, label: "Account deactivated", color: "text-red-500" },
  deactivated_user: { icon: <UserX className="h-3.5 w-3.5" />, label: "Deactivated user", color: "text-red-500" },
  reactivated: { icon: <UserCheck className="h-3.5 w-3.5" />, label: "Account reactivated", color: "text-green-500" },
  reactivated_user: { icon: <UserCheck className="h-3.5 w-3.5" />, label: "Reactivated user", color: "text-green-500" },
  role_changed: { icon: <Shield className="h-3.5 w-3.5" />, label: "Role changed", color: "text-yellow-500" },
  changed_role: { icon: <Shield className="h-3.5 w-3.5" />, label: "Changed role", color: "text-yellow-500" },
  warehouse_changed: { icon: <WarehouseIcon className="h-3.5 w-3.5" />, label: "Warehouse access changed", color: "text-yellow-500" },
  changed_warehouse: { icon: <WarehouseIcon className="h-3.5 w-3.5" />, label: "Changed warehouse access", color: "text-yellow-500" },
  deleted_account: { icon: <UserX className="h-3.5 w-3.5" />, label: "Removed user", color: "text-red-500" },
  password_changed: { icon: <KeyRound className="h-3.5 w-3.5" />, label: "Password changed", color: "text-muted-foreground" },
  login_failed: { icon: <KeyRound className="h-3.5 w-3.5" />, label: "Wrong password", color: "text-amber-500" },
  login_locked: { icon: <UserX className="h-3.5 w-3.5" />, label: "Locked after wrong passwords", color: "text-red-500" },
  unlocked: { icon: <UserCheck className="h-3.5 w-3.5" />, label: "Sign-in lock lifted", color: "text-green-500" },
  unlocked_user: { icon: <UserCheck className="h-3.5 w-3.5" />, label: "Lifted a sign-in lock", color: "text-green-500" },
  sessions_ended: { icon: <LogIn className="h-3.5 w-3.5 rotate-180" />, label: "Signed out of other devices", color: "text-muted-foreground" },
  ended_sessions: { icon: <LogIn className="h-3.5 w-3.5 rotate-180" />, label: "Signed a member out everywhere", color: "text-muted-foreground" },
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
    return <p className="py-10 text-center text-[13px] text-muted-foreground">Loading…</p>;
  }

  if (entries.length === 0) {
    return (
      <div className="flex min-h-35 flex-col items-center justify-center gap-1 border border-dashed border-border/80 px-4 py-8 text-center">
        <Activity className="h-6 w-6 text-muted-foreground/40" />
        <p className="text-[13px] font-medium text-foreground">No activity yet</p>
        <p className="text-[11px] text-muted-foreground">Sign-ins, role changes and password resets show up here.</p>
      </div>
    );
  }

  return (
    <ul>
      {entries.map((e) => {
        const meta = ACTION_META[e.action] ?? {
          icon: <Activity className="h-3.5 w-3.5" />,
          label: e.action,
          color: "text-muted-foreground",
        };
        return (
          <li key={e.id} className="flex gap-3 border-b border-border/60 py-2 last:border-b-0">
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center bg-muted",
                meta.color ?? "text-muted-foreground",
              )}
            >
              {meta.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-snug text-foreground">{meta.label}</p>
              {e.detail ? <p className="text-[11px] leading-relaxed text-muted-foreground">{e.detail}</p> : null}
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground" title={new Date(e.created_at).toLocaleString()}>
              {timeAgo(e.created_at)}
            </span>
          </li>
        );
      })}
    </ul>
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
  onSave: (
    userId: string,
    patch: {
      name?: string;
      email?: string;
      username?: string;
      role?: string;
      role_ids?: string[];
      warehouse_ids?: string[];
      default_warehouse_id?: string;
      is_active?: boolean;
      password?: string;
      must_change_password?: boolean;
      permission_overrides?: { module: string; action: string; allow: boolean }[];
      payment_account_ids?: string[];
    },
  ) => Promise<void>;
  /** Omit to hide the Remove action — deactivating is the safe alternative. */
  onDelete?: (userId: string) => Promise<void>;
};

type Props = CreateProps | EditProps;

const FIELD_INPUT = "h-8 w-full min-w-0 bg-transparent px-1 text-[13px] outline-none disabled:opacity-60";

/**
 * A team member as the common drawer (docs/common/drawercommon.md) and an Odoo form (formcommon.md): control bar with Save / Discard
 * and the Active | Inactive switch, a title band, then Profile · Access Rights · Activity tabs. Closing with unsaved changes keeps a
 * draft (never the password).
 */
export function UserDrawer(props: Props) {
  const isCreate = props.mode === "create";
  const editUser = isCreate ? null : (props as EditProps).user;
  const isSelf = isCreate ? false : (props as EditProps).isSelf;
  const onDelete = isCreate ? undefined : (props as EditProps).onDelete;
  const { open, onOpenChange } = props;

  const [tab, setTab] = React.useState<UserTab>("profile");
  const [form, setForm] = React.useState<UserForm>(EMPTY_FORM);
  const [baseline, setBaseline] = React.useState<UserForm>(EMPTY_FORM);
  const [availableRoles, setAvailableRoles] = React.useState<AuthRoleRecord[]>([]);
  const [availableWarehouses, setAvailableWarehouses] = React.useState<Warehouse[]>([]);
  const [availableAccounts, setAvailableAccounts] = React.useState<ApiFinancePaymentAccount[]>([]);
  const [showPassword, setShowPassword] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pendingScroll = React.useRef<number | null>(null);

  const patch = React.useCallback(<K extends keyof UserForm>(key: K, value: UserForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  React.useEffect(() => {
    if (!open) return;
    void fetchAuthRoles()
      .then((roles) => {
        setAvailableRoles(roles);
        // a new member starts as Staff
        if (isCreate) {
          const staff = roles.find((r) => r.slug === "staff");
          if (staff) {
            setForm((f) => (f.roleIds.length ? f : { ...f, roleIds: [staff.id] }));
            setBaseline((b) => (b.roleIds.length ? b : { ...b, roleIds: [staff.id] }));
          }
        }
      })
      .catch(() => setAvailableRoles([]));
    void listWarehouses()
      .then((rows) => setAvailableWarehouses(rows.filter((w) => w.active)))
      .catch(() => setAvailableWarehouses([]));
    void fetchPaymentAccounts()
      .then((res) => setAvailableAccounts(res.data.filter((a) => a.is_active)))
      .catch(() => setAvailableAccounts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A fresh form whenever the drawer opens for another member (or for "new"). Declared before useDrawerDraft so a kept draft is
  // put back after this reset.
  const recordId = editUser?.id ?? null;
  const [formReady, setFormReady] = React.useState(false);
  React.useEffect(() => {
    if (!open) {
      setFormReady(false);
      return;
    }
    const fresh = editUser ? userToForm(editUser) : EMPTY_FORM;
    setForm(fresh);
    setBaseline(fresh);
    setTab("profile");
    setShowPassword(false);
    setFormReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recordId]);

  const dirty = formReady && formSignature(form) !== formSignature(baseline);
  const passwordTooShort = form.password.length > 0 && form.password.length < 6;
  const canCreate =
    form.name.trim().length > 0 &&
    form.email.trim().length > 0 &&
    form.username.trim().length >= 3 &&
    form.password.length >= 6 &&
    form.roleIds.length > 0;
  const canSave = isCreate ? canCreate : dirty && !passwordTooShort;

  const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<{ form: Omit<UserForm, "password">; tab: UserTab; scrollTop: number }>({
    key: isCreate ? "user:new" : editUser ? `user:${editUser.id}` : null,
    ready: open && formReady,
    dirty,
    getValues: () => {
      const { password: _password, ...rest } = form;
      void _password;
      return { form: rest, tab, scrollTop: scrollRef.current?.scrollTop ?? 0 };
    },
    restore: (v) => {
      setForm((f) => ({ ...f, ...v.form, password: "" }));
      setTab(v.tab);
      pendingScroll.current = v.scrollTop;
    },
    onDiscard: () => setForm(baseline),
    label: "user",
  });

  // put the scroll position back after a draft is restored
  React.useEffect(() => {
    if (pendingScroll.current == null) return;
    const top = pendingScroll.current;
    pendingScroll.current = null;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top }));
  }, [form]);

  // every dismissal (outside click, Esc, X) goes through here
  const handleOpenChange = (next: boolean) => {
    if (!next) saveDraftIfDirty();
    onOpenChange(next);
  };

  const discard = () => {
    clearDraft();
    setForm(baseline);
    setShowPassword(false);
  };

  const cancelCreate = () => {
    clearDraft();
    onOpenChange(false);
  };

  function toggleRole(id: string) {
    setForm((f) => {
      if (f.roleIds.includes(id)) {
        if (f.roleIds.length === 1) return f;
        return { ...f, roleIds: f.roleIds.filter((x) => x !== id) };
      }
      return { ...f, roleIds: [...f.roleIds, id] };
    });
  }

  function toggleWarehouse(id: string) {
    setForm((f) => {
      if (f.warehouseIds.includes(id)) {
        const next = f.warehouseIds.filter((x) => x !== id);
        return { ...f, warehouseIds: next, defaultWarehouseId: f.defaultWarehouseId === id ? (next[0] ?? "") : f.defaultWarehouseId };
      }
      return { ...f, warehouseIds: [...f.warehouseIds, id], defaultWarehouseId: f.defaultWarehouseId || id };
    });
  }

  async function handleCreate() {
    setSaving(true);
    try {
      await (props as CreateProps).onAdd({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        username: form.username.trim().toLowerCase(),
        role_ids: form.roleIds,
        ...(form.warehouseIds.length
          ? { warehouse_ids: form.warehouseIds, default_warehouse_id: form.defaultWarehouseId || form.warehouseIds[0] }
          : {}),
        password: form.password,
        must_change_password: form.mustChangePassword,
        ...(form.paymentAccountIds.length ? { payment_account_ids: form.paymentAccountIds } : {}),
      });
      toast.success(`${form.name} added`);
      clearDraft();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!editUser) return;
    const warehousesChanged =
      !sameIds(form.warehouseIds, baseline.warehouseIds) ||
      (form.warehouseIds.length > 0 && form.defaultWarehouseId !== baseline.defaultWarehouseId);
    setSaving(true);
    try {
      const changes: Parameters<EditProps["onSave"]>[1] = {};
      if (form.name !== baseline.name) changes.name = form.name.trim();
      if (form.email.trim().toLowerCase() !== baseline.email.trim().toLowerCase()) changes.email = form.email.trim().toLowerCase();
      if (form.username !== baseline.username) changes.username = form.username.trim().toLowerCase();
      if (!sameIds(form.roleIds, baseline.roleIds)) changes.role_ids = form.roleIds;
      if (warehousesChanged) {
        changes.warehouse_ids = form.warehouseIds;
        if (form.warehouseIds.length) changes.default_warehouse_id = form.defaultWarehouseId || form.warehouseIds[0];
      }
      if (form.isActive !== baseline.isActive) changes.is_active = form.isActive;
      if (form.password.length >= 6) changes.password = form.password;
      if (form.mustChangePassword !== baseline.mustChangePassword) changes.must_change_password = form.mustChangePassword;
      if (!sameIds(form.paymentAccountIds, baseline.paymentAccountIds)) changes.payment_account_ids = form.paymentAccountIds;
      if (JSON.stringify(Object.entries(form.overrides).sort()) !== JSON.stringify(Object.entries(baseline.overrides).sort())) {
        changes.permission_overrides = overridesToList(form.overrides);
      }
      await (props as EditProps).onSave(editUser.id, changes);
      toast.success(changes.password ? `Password updated — ${editUser.username} must sign in again` : "Changes saved");
      clearDraft();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editUser || !onDelete) return;
    if (!window.confirm(`Remove ${editUser.name} from the team?`)) return;
    setDeleting(true);
    try {
      await onDelete(editUser.id);
      toast.success(`${editUser.name} removed`);
      clearDraft();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setDeleting(false);
    }
  }

  const tabs: AgainNotebookTab<UserTab>[] = [
    { id: "profile", label: "Profile" },
    { id: "access", label: "Access Rights" },
    ...(isCreate ? [] : [{ id: "security" as const, label: "Security" }, { id: "activity" as const, label: "Activity" }]),
  ];

  const selectedRoles = availableRoles.filter((r) => form.roleIds.includes(r.id));
  const roleNames = selectedRoles.length
    ? selectedRoles.map((r) => r.name)
    : (editUser?.roles?.map((r) => r.name) ?? []);
  const warehouseScope =
    form.warehouseIds.length === 0
      ? "All"
      : form.warehouseIds.length === 1
        ? (availableWarehouses.find((w) => w.id === form.warehouseIds[0])?.name ?? "1")
        : String(form.warehouseIds.length);
  const title = isCreate ? "New user" : (form.name.trim() || editUser?.name || "User");

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={handleOpenChange}
      title={isCreate ? "New user" : title}
      resizable
      defaultWidth={640}
      minWidth={420}
      widthStorageKey="again-user-drawer-width"
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar
          trailing={
            <>
              {!isCreate && !isSelf && onDelete ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-none text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Remove user"
                  title="Remove user"
                  disabled={deleting || saving}
                  onClick={() => void handleDelete()}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              <AgainDrawerCloseButton onClick={() => handleOpenChange(false)} />
            </>
          }
        >
          <AgainDrawerButton
            variant="primary"
            disabled={saving || !canSave}
            aria-busy={saving}
            onClick={() => void (isCreate ? handleCreate() : handleSave())}
          >
            {saving ? (isCreate ? "Creating…" : "Saving…") : isCreate ? "Create" : "Save"}
          </AgainDrawerButton>
          <AgainDrawerButton disabled={saving || (!isCreate && !dirty)} onClick={isCreate ? cancelCreate : discard}>
            {isCreate ? "Cancel" : "Discard"}
          </AgainDrawerButton>
          {!isCreate && !isSelf ? (
            <AgainDrawerSwitch
              label="Account status"
              value={form.isActive ? "active" : "inactive"}
              onChange={(next) => patch("isActive", next === "active")}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
          ) : null}
          {dirty ? (
            <span className="ml-1 text-[11px] text-amber-700 dark:text-amber-400">Unsaved changes · closing keeps a draft</span>
          ) : null}
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={cn(AGAIN_DRAWER_FIELD_SHEET_CLASS, "pt-0")} scrollRef={scrollRef}>
          {/* title band */}
          <div className="@container flex flex-wrap items-center gap-3 pb-3 pt-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-none border border-border/80 bg-[#00a09d] text-[20px] font-bold uppercase text-white">
              {isCreate ? "+" : (form.name.trim() || editUser?.name || "?").slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="min-w-0 max-w-full truncate text-[20px] font-bold leading-tight tracking-tight text-foreground">{title}</h2>
              <p className="truncate text-[13px] text-muted-foreground">
                {form.username ? `@${form.username}` : "Set a username on the Profile tab"}
                {form.email ? ` · ${form.email}` : ""}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {roleNames.map((name) => (
                  <span key={name} className="inline-flex items-center border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                    {name}
                  </span>
                ))}
                {!isCreate ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 border px-1.5 py-0.5 text-[11px] font-medium",
                      form.isActive
                        ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5", form.isActive ? "bg-emerald-500" : "bg-muted-foreground")} />
                    {form.isActive ? "Active" : "Inactive"}
                  </span>
                ) : null}
                {isSelf ? (
                  <span className="inline-flex items-center border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    You
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-stretch gap-1.5">
              <PartnerStatButton value={form.roleIds.length} label={form.roleIds.length === 1 ? "Role" : "Roles"} onClick={() => setTab("access")} tone="purple" />
              <PartnerStatButton value={warehouseScope} label="Warehouses" onClick={() => setTab("access")} tone="brand" />
            </div>
          </div>

          <AgainFormNotebook tabs={tabs} active={tab} onChange={setTab} className="bg-card" contentClassName="p-3 sm:p-4">
            {tab === "profile" ? (
              <div className="again-odoo-form @container space-y-5">
                <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                  <AgainFormGroupTitle className="@xl:col-span-2">Account</AgainFormGroupTitle>
                  <AgainFormField label="Full name" required>
                    <input
                      id="ud-name"
                      value={form.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setForm((f) => ({
                          ...f,
                          name,
                          // while creating, the username follows the name until the user types their own
                          username: isCreate && (!f.username || f.username === deriveUsername(f.name)) ? deriveUsername(name) : f.username,
                        }));
                      }}
                      placeholder="Jane Smith"
                      disabled={saving}
                      maxLength={255}
                      className={FIELD_INPUT}
                    />
                  </AgainFormField>
                  <AgainFormField label="Username" required hint="Letters, numbers, . _ -">
                    <input
                      id="ud-username"
                      value={form.username}
                      onChange={(e) => patch("username", e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                      placeholder="jane.smith"
                      disabled={saving}
                      maxLength={64}
                      className={FIELD_INPUT}
                    />
                  </AgainFormField>
                  <AgainFormField label="Email" required className="@xl:col-span-2">
                    <input
                      id="ud-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => patch("email", e.target.value)}
                      placeholder="jane@company.com"
                      disabled={saving}
                      className={FIELD_INPUT}
                    />
                  </AgainFormField>
                </div>

                <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                  <AgainFormGroupTitle className="@xl:col-span-2">Sign-in</AgainFormGroupTitle>
                  <AgainFormField
                    label={isCreate ? "Temporary password" : "New password"}
                    required={isCreate}
                    className="@xl:col-span-2"
                    hint={
                      passwordTooShort
                        ? "Password must be at least 6 characters — it will not be saved as typed."
                        : isCreate
                          ? "Min 6 characters. The user can change it after the first sign-in."
                          : "Min 6 characters. Leave blank to keep the current one. Changing it signs the user out everywhere."
                    }
                  >
                    <div className="flex items-center gap-1 border border-input">
                      <input
                        id="ud-pw"
                        type={showPassword ? "text" : "password"}
                        // Without this the browser autofills the signed-in admin's own credentials here, silently
                        // resetting the member's password.
                        autoComplete="new-password"
                        value={form.password}
                        onChange={(e) => patch("password", e.target.value)}
                        placeholder={isCreate ? "Min 6 characters" : "Leave blank to keep current"}
                        disabled={saving}
                        className={FIELD_INPUT}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="shrink-0 px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </AgainFormField>
                  {!isSelf ? (
                    <label className="flex cursor-pointer items-start gap-2 py-1.5 @xl:col-span-2">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 accent-[#00a09d]"
                        checked={form.mustChangePassword}
                        disabled={saving}
                        onChange={(e) => patch("mustChangePassword", e.target.checked)}
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-foreground">Ask for a new password at the next sign-in</span>
                        <span className="block text-[11px] text-muted-foreground">
                          Until they choose one, the member can only set a new password or sign out.
                        </span>
                      </span>
                    </label>
                  ) : null}
                </div>
              </div>
            ) : null}

            {tab === "access" ? (
              <div className="again-odoo-form @container space-y-5">
                <div>
                  <AgainFormGroupTitle>Roles</AgainFormGroupTitle>
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    {isSelf
                      ? "You cannot change your own roles."
                      : "Tick one or more. Permissions are the union of every role the user holds."}
                  </p>
                  <ul>
                    {availableRoles.length === 0 ? (
                      <li className="py-3 text-[13px] text-muted-foreground">Loading roles…</li>
                    ) : null}
                    {availableRoles.map((r) => (
                      <li key={r.id} className="border-b border-border/60 last:border-b-0">
                        <label className={cn("flex items-start gap-2 py-1.5", isSelf ? "cursor-not-allowed opacity-70" : "cursor-pointer")}>
                          <input
                            type="checkbox"
                            className="mt-0.5 h-3.5 w-3.5 accent-[#00a09d]"
                            checked={form.roleIds.includes(r.id)}
                            disabled={saving || isSelf}
                            onChange={() => toggleRole(r.id)}
                          />
                          <span className="min-w-0">
                            <span className="block text-[13px] font-medium text-foreground">{r.name}</span>
                            <span className="block text-[11px] text-muted-foreground">{r.description || r.slug}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <AgainFormGroupTitle>Warehouse access</AgainFormGroupTitle>
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    {form.warehouseIds.length === 0
                      ? "None ticked — this user can use every warehouse. Tick the ones they may work in to limit them."
                      : "Sales and purchases start in the default warehouse. The user can switch only between the ticked ones."}
                  </p>
                  <ul>
                    {availableWarehouses.map((w) => {
                      const checked = form.warehouseIds.includes(w.id);
                      const isDefault = checked && form.defaultWarehouseId === w.id;
                      return (
                        <li key={w.id} className="border-b border-border/60 last:border-b-0">
                          <label className="flex cursor-pointer items-center gap-2 py-1.5">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 accent-[#00a09d]"
                              checked={checked}
                              disabled={saving}
                              onChange={() => toggleWarehouse(w.id)}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium text-foreground">{w.name}</span>
                              <span className="block text-[11px] text-muted-foreground">{w.code}</span>
                            </span>
                            {checked && form.warehouseIds.length > 1 ? (
                              isDefault ? (
                                <span className="inline-flex items-center border border-[#00a09d]/40 bg-[#00a09d]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#00a09d]">
                                  Default
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    patch("defaultWarehouseId", w.id);
                                  }}
                                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                                >
                                  Make default
                                </button>
                              )
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div>
                  <AgainFormGroupTitle>Cash / bank accounts</AgainFormGroupTitle>
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    {form.paymentAccountIds.length === 0
                      ? "None ticked — this user can see and use every cash and bank account. Tick the ones they may use to limit them."
                      : "Collections, payments, vouchers, transfers and expenses can only go through the ticked accounts; the others are hidden."}
                  </p>
                  <ul>
                    {availableAccounts.map((a) => (
                      <li key={a.id} className="border-b border-border/60 last:border-b-0">
                        <label className="flex cursor-pointer items-center gap-2 py-1.5">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-[#00a09d]"
                            checked={form.paymentAccountIds.includes(a.id)}
                            disabled={saving || isSelf}
                            onChange={() =>
                              setForm((f) => ({
                                ...f,
                                paymentAccountIds: f.paymentAccountIds.includes(a.id)
                                  ? f.paymentAccountIds.filter((x) => x !== a.id)
                                  : [...f.paymentAccountIds, a.id],
                              }))
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-foreground">{a.name}</span>
                            <span className="block text-[11px] capitalize text-muted-foreground">{a.kind.replace("_", " ")}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>

                {!isCreate && editUser ? (
                  <UserPermissionOverrides
                    userId={editUser.id}
                    value={form.overrides}
                    onChange={(next) => patch("overrides", next)}
                    disabled={saving}
                    isSelf={isSelf}
                  />
                ) : null}

                {!isCreate && isSelf ? (
                  <p className="text-[11px] text-muted-foreground">
                    You are signed in as this user, so the account status stays Active.
                  </p>
                ) : null}
              </div>
            ) : null}

            {tab === "security" && editUser ? <UserSecurityTab user={editUser} isSelf={isSelf} /> : null}
            {tab === "activity" && editUser ? <ActivityTab userId={editUser.id} /> : null}
          </AgainFormNotebook>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}
