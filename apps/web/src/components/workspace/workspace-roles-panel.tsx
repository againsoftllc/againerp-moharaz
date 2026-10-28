"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AgainDrawerButton,
} from "@/components/again/again-drawer";
import { AgainFormGroupTitle } from "@/components/again/again-form-sheet";
import { AgainFormNotebook, type AgainNotebookTab } from "@/components/again/again-form-sheet-layout";
import { PartnerStatButton } from "@/components/customers/partner-customer-sections";
import {
  createAuthRole,
  deleteAuthRole,
  fetchAuthModules,
  fetchAuthRoleTemplates,
  fetchAuthRoles,
  putAuthRolePermissions,
  updateAuthRole,
  type AuthModuleInfo,
  type AuthRoleRecord,
  type AuthRoleTemplate,
  type RolePermissionFlags,
} from "@/lib/api/auth-roles";
import { fetchAuthUsers } from "@/lib/api/auth-users";
import type { AdminUser } from "@/lib/store/admin-auth-store";
import { useIsSystemManager } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

const ACTIONS = [
  { key: "can_read", label: "Read", hint: "Open and view records" },
  { key: "can_create", label: "Create", hint: "Add new records" },
  { key: "can_write", label: "Write", hint: "Edit existing records" },
  { key: "can_delete", label: "Delete", hint: "Remove records" },
  { key: "can_publish", label: "Publish", hint: "Make records live on the website / finalise" },
  { key: "can_export", label: "Export", hint: "Download lists as CSV / Excel" },
  { key: "can_approve", label: "Approve", hint: "Approve other people's documents" },
] as const;
type ActionKey = (typeof ACTIONS)[number]["key"];

const GROUP_ORDER = [
  "Sales & customers",
  "Inventory & purchasing",
  "Finance",
  "People",
  "After-sales",
  "Website & content",
  "Workspace",
  "RMA special permissions",
];

type Level = "none" | "read" | "standard" | "full" | "custom";
const LEVEL_FLAGS: Record<Exclude<Level, "custom">, ActionKey[]> = {
  none: [],
  read: ["can_read"],
  standard: ["can_read", "can_create", "can_write", "can_publish", "can_export"],
  full: ACTIONS.map((a) => a.key),
};
const LEVEL_LABEL: Record<Level, string> = {
  none: "No access",
  read: "Read only",
  standard: "Standard",
  full: "Full",
  custom: "Custom",
};

const flagsOf = (row: RolePermissionFlags) => ACTIONS.filter((a) => row[a.key]).map((a) => a.key);
const anyAccess = (row?: RolePermissionFlags) => Boolean(row && flagsOf(row).length);

function levelOf(row: RolePermissionFlags): Level {
  const on = flagsOf(row);
  for (const level of ["none", "read", "standard", "full"] as const) {
    const want = LEVEL_FLAGS[level];
    if (want.length === on.length && want.every((k) => on.includes(k))) return level;
  }
  return "custom";
}

function withLevel(row: RolePermissionFlags, level: Exclude<Level, "custom">): RolePermissionFlags {
  const next = { ...row };
  for (const a of ACTIONS) next[a.key] = LEVEL_FLAGS[level].includes(a.key);
  return next;
}

const clone = (role: AuthRoleRecord) => role.permissions.map((p) => ({ ...p }));

type Finding = { tone: "danger" | "warning" | "info"; title: string; detail: string };

/** What a reviewer would flag about a role's access, in plain words. */
function reviewAccess(rows: RolePermissionFlags[], labels: Record<string, string>): Finding[] {
  const by = new Map(rows.map((r) => [r.module, r]));
  const has = (module: string, key: ActionKey) => Boolean(by.get(module)?.[key]);
  const label = (module: string) => labels[module] ?? module;
  const out: Finding[] = [];

  if (!rows.some((r) => anyAccess(r))) {
    out.push({ tone: "warning", title: "No access at all", detail: "A user who holds only this role cannot open anything." });
    return out;
  }
  if (has("workspace", "can_write"))
    out.push({
      tone: "danger",
      title: "Can administer the workspace",
      detail: "Write on Workspace changes company setup, users, roles and settings — keep it to System Manager.",
    });
  if (has("plugins", "can_write"))
    out.push({ tone: "danger", title: "Can change plugin settings", detail: "Plugins hold API keys and integrations." });
  if (has("finance", "can_write"))
    out.push({ tone: "warning", title: "Can change finance records", detail: "Journals, payments, expenses and cheques. Give this to accounts staff only." });
  if (has("hrm", "can_write"))
    out.push({ tone: "warning", title: "Can change HR records", detail: "Employees, payroll and attendance contain personal and salary data." });
  else if (has("hrm", "can_read"))
    out.push({ tone: "info", title: "Can read HR records", detail: "Salaries and personal details are visible to this role." });
  else if (has("finance", "can_read"))
    out.push({ tone: "info", title: "Can read finance", detail: "Ledgers, balances and reports are visible to this role." });
  for (const module of ["finance", "hrm", "inventory", "sales", "purchase", "customers"]) {
    if (has(module, "can_delete"))
      out.push({ tone: "warning", title: `Can delete ${label(module)} records`, detail: "Prefer cancelling or reversing; delete cannot be undone." });
  }
  if (has("purchase", "can_write") && has("finance", "can_write"))
    out.push({
      tone: "warning",
      title: "Raises purchases and posts payments",
      detail: "One person can order and pay. Split purchasing and finance between roles, or cap it under Approval Limits.",
    });
  if (has("sales", "can_write") && has("inventory", "can_write") && has("finance", "can_write"))
    out.push({
      tone: "warning",
      title: "Sells, moves stock and posts to finance",
      detail: "Sale, delivery and booking in one role leaves nothing to cross-check.",
    });
  for (const module of ["rma_override", "rma_serial_change", "rma_stock_adjust"]) {
    if (has(module, "can_write"))
      out.push({ tone: "warning", title: `Can ${label(module).toLowerCase()}`, detail: "Changes protected warranty data or stock outside the normal flow." });
  }
  for (const module of ["finance", "sales", "purchase", "inventory", "rma"]) {
    if (has(module, "can_approve"))
      out.push({
        tone: "info",
        title: `Approves ${label(module)} documents`,
        detail: "Amount ceilings per role are under Users & Roles › Approval Limits.",
      });
  }
  for (const module of ["finance", "hrm", "customers"]) {
    if (has(module, "can_export"))
      out.push({ tone: "info", title: `Can export ${label(module)} in bulk`, detail: "Lists download as a file that leaves the system." });
  }
  return out;
}

const TONE_ICON = { danger: ShieldAlert, warning: AlertTriangle, info: Info } as const;
const TONE_CLASS = {
  danger: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-sky-600 dark:text-sky-400",
} as const;

type RoleTab = "access" | "users" | "review";

/**
 * Roles & permissions as Odoo's access-rights form: pick a role on the left, then its title band, stat boxes and an Access Rights /
 * Users / Access Review notebook. Rows are grouped by area (Sales & customers, Inventory & purchasing, Finance …) and each has a
 * level (No access · Read only · Standard · Full) plus the seven boxes for the exact grant.
 */
export function WorkspaceRolesPanel() {
  const canManage = useIsSystemManager();
  const [roles, setRoles] = useState<AuthRoleRecord[]>([]);
  const [modules, setModules] = useState<AuthModuleInfo[]>([]);
  const [templates, setTemplates] = useState<AuthRoleTemplate[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RolePermissionFlags[]>([]);
  const [nameDraft, setNameDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [tab, setTab] = useState<RoleTab>("access");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [roleRows, moduleRows, templateRows, userRows] = await Promise.all([
        fetchAuthRoles(),
        fetchAuthModules(),
        fetchAuthRoleTemplates().catch(() => [] as AuthRoleTemplate[]),
        fetchAuthUsers().catch(() => [] as AdminUser[]),
      ]);
      setRoles(roleRows);
      setModules(moduleRows);
      setTemplates(templateRows);
      setUsers(userRows);
      setSelectedId((prev) => prev ?? roleRows[0]?.id ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => roles.find((r) => r.id === selectedId) ?? null, [roles, selectedId]);

  useEffect(() => {
    if (selected) {
      setDraft(clone(selected));
      setNameDraft(selected.name);
      setDescDraft(selected.description ?? "");
    } else setDraft([]);
  }, [selected]);

  const isSystemManager = selected?.slug === "system_manager";
  const nameEditable = Boolean(selected && !selected.is_system);
  const permsDirty = Boolean(selected) && JSON.stringify(draft) !== JSON.stringify(clone(selected!));
  const textDirty =
    nameEditable && Boolean(selected) && (nameDraft.trim() !== selected!.name || descDraft.trim() !== (selected!.description ?? ""));
  const dirty = !isSystemManager && (permsDirty || textDirty);

  const labels = useMemo(() => Object.fromEntries(modules.map((m) => [m.id, m.label])), [modules]);
  const groups = useMemo(() => {
    const map = new Map<string, AuthModuleInfo[]>();
    for (const m of modules) map.set(m.group || "Other", [...(map.get(m.group || "Other") ?? []), m]);
    const known = GROUP_ORDER.filter((g) => map.has(g));
    const extra = [...map.keys()].filter((g) => !GROUP_ORDER.includes(g));
    return [...known, ...extra].map((g) => ({ name: g, items: map.get(g)! }));
  }, [modules]);
  const rowOf = useCallback((module: string) => draft.find((r) => r.module === module), [draft]);

  const roleUsers = useMemo(
    () => (selected ? users.filter((u) => u.role_ids?.includes(selected.id) || u.roles?.some((r) => r.id === selected.id)) : []),
    [users, selected],
  );
  const findings = useMemo(() => reviewAccess(draft, labels), [draft, labels]);
  const modulesWithAccess = draft.filter((r) => anyAccess(r) && !r.module.startsWith("rma_")).length;
  const canEditCount = draft.filter((r) => r.can_write && !r.module.startsWith("rma_")).length;
  const canApproveCount = draft.filter((r) => r.can_approve).length;

  const patchRow = (module: string, fn: (row: RolePermissionFlags) => RolePermissionFlags) => {
    if (isSystemManager) return;
    setDraft((prev) => prev.map((r) => (r.module === module ? fn(r) : r)));
  };

  const toggle = (module: string, key: ActionKey) =>
    patchRow(module, (row) => {
      const next = { ...row, [key]: !row[key] };
      if (key !== "can_read" && next[key]) next.can_read = true;
      if (key === "can_read" && !next.can_read) return withLevel(next, "none");
      return next;
    });

  const discard = () => {
    if (!selected) return;
    setDraft(clone(selected));
    setNameDraft(selected.name);
    setDescDraft(selected.description ?? "");
  };

  const handleSave = async () => {
    if (!selected || isSystemManager) return;
    setSaving(true);
    try {
      let updated = selected;
      if (textDirty) {
        if (!nameDraft.trim()) throw new Error("Role name is required");
        updated = await updateAuthRole(selected.id, { name: nameDraft.trim(), description: descDraft.trim() });
      }
      if (permsDirty) updated = await putAuthRolePermissions(selected.id, draft);
      setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast.success("Role saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await createAuthRole({ name, template: newTemplate || undefined });
      setRoles((prev) => [...prev, created]);
      setSelectedId(created.id);
      setTab("access");
      setNewOpen(false);
      setNewName("");
      setNewTemplate("");
      toast.success(`Role “${created.name}” created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create role");
    } finally {
      setCreating(false);
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
      <div className="border border-border bg-card p-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">System Manager access required</p>
        <p className="mt-1">Only a System Manager can create roles or change permissions.</p>
        <Button variant="outline" size="sm" asChild className="mt-4 rounded-none">
          <Link href="/workspace/modules">Back to workspace</Link>
        </Button>
      </div>
    );
  }

  const tabs: AgainNotebookTab<RoleTab>[] = [
    { id: "access", label: "Access Rights" },
    { id: "users", label: "Users", badge: roleUsers.length, badgeTone: "neutral" },
    { id: "review", label: "Access Review", badge: findings.filter((f) => f.tone !== "info").length, badgeTone: "warning" },
  ];

  const privileged = groups.find((g) => g.name === "RMA special permissions");
  const mainGroups = groups.filter((g) => g.name !== "RMA special permissions");

  return (
    <div className="flex min-h-112 min-w-0 flex-1 flex-col">
      {/* control bar */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-background px-2 py-1">
        <span className="px-1 text-[13px] font-semibold">Roles</span>
        <AgainDrawerButton variant="primary" onClick={() => setNewOpen(true)}>
          New
        </AgainDrawerButton>
        {selected && !isSystemManager ? (
          <>
            <AgainDrawerButton variant="primary" disabled={!dirty || saving} aria-busy={saving} onClick={() => void handleSave()}>
              {saving ? "Saving…" : "Save"}
            </AgainDrawerButton>
            <AgainDrawerButton disabled={!dirty || saving} onClick={discard}>
              Discard
            </AgainDrawerButton>
          </>
        ) : null}
        {dirty ? <span className="ml-1 text-[11px] text-amber-700 dark:text-amber-400">Unsaved changes</span> : null}
        {selected && !selected.is_system ? (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-6 w-6 rounded-none text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete role"
            title={selected.user_count ? "Assigned to users — unassign first" : "Delete role"}
            onClick={() => void handleDelete()}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* role list */}
        <ul className="border-b border-border bg-card lg:border-b-0 lg:border-r">
          {loading ? <li className="px-3 py-3 text-[13px] text-muted-foreground">Loading…</li> : null}
          {roles.map((role) => (
            <li key={role.id}>
              <button
                type="button"
                onClick={() => setSelectedId(role.id)}
                className={cn(
                  "flex w-full items-center gap-2 border-l-2 px-3 py-2 text-left transition-colors",
                  selectedId === role.id ? "border-[#714B67] bg-[#714B67]/10" : "border-transparent hover:bg-muted/40",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{role.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {role.is_system ? "System role" : "Custom role"} · {role.user_count} user{role.user_count === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {/* record */}
        <div className={cn("min-h-0 min-w-0 overflow-y-auto", AGAIN_DRAWER_FIELD_SHEET_CLASS)}>
          {!selected ? (
            <p className="p-6 text-sm text-muted-foreground">Select a role, or click New to create one from a template.</p>
          ) : (
            <div className="mx-auto w-full max-w-5xl border border-border bg-card shadow-sm">
              <div className="again-odoo-form @container flex flex-wrap items-start gap-4 px-4 py-4 sm:px-6">
                <div className="min-w-0 flex-1 basis-72">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    disabled={!nameEditable}
                    aria-label="Role name"
                    className="w-full min-w-0 bg-transparent py-0.5 text-[20px] font-bold leading-tight tracking-tight text-foreground outline-none"
                  />
                  <textarea
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    disabled={!nameEditable}
                    rows={2}
                    placeholder="What this role is for"
                    aria-label="Role description"
                    className="mt-0.5 w-full min-w-0 resize-none bg-transparent py-0.5 text-[13px] text-muted-foreground outline-none"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <PartnerStatButton value={roleUsers.length} label="Users" tone="purple" onClick={() => setTab("users")} />
                    <PartnerStatButton value={isSystemManager ? "All" : modulesWithAccess} label="Modules" tone="brand" onClick={() => setTab("access")} />
                    <PartnerStatButton value={isSystemManager ? "All" : canEditCount} label="Can edit" onClick={() => setTab("access")} />
                    <PartnerStatButton value={isSystemManager ? "All" : canApproveCount} label="Can approve" onClick={() => setTab("access")} />
                  </div>
                </div>
              </div>

              <AgainFormNotebook tabs={tabs} active={tab} onChange={setTab}>
                {isSystemManager ? (
                  <p className="mb-3 border border-border bg-muted/40 px-3 py-2 text-[13px]">
                    System Manager has full access to every module, including administration. The matrix is fixed and cannot be edited.
                  </p>
                ) : null}

                {tab === "access" ? (
                  <div className="space-y-5">
                    {mainGroups.map((group) => (
                      <div key={group.name}>
                        <AgainFormGroupTitle>{group.name}</AgainFormGroupTitle>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] border-collapse text-[13px]">
                            <thead>
                              <tr className="text-left text-[11px] text-muted-foreground">
                                <th className="w-full py-1 pr-2 font-medium">Module</th>
                                <th className="px-2 py-1 font-medium">Level</th>
                                {ACTIONS.map((a) => (
                                  <th key={a.key} className="px-1.5 py-1 text-center font-medium" title={a.hint}>
                                    {a.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {group.items.map((m) => {
                                const row = rowOf(m.id);
                                if (!row) return null;
                                const level = levelOf(row);
                                return (
                                  <tr key={m.id} className="border-t border-border/60">
                                    <td className="py-1.5 pr-2">
                                      <span className="block font-medium">{m.label}</span>
                                      <span className="block text-[11px] text-muted-foreground">{m.hint}</span>
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <select
                                        value={level}
                                        disabled={isSystemManager}
                                        onChange={(e) => patchRow(m.id, (r) => withLevel(r, e.target.value as Exclude<Level, "custom">))}
                                        className={cn(
                                          "h-7 min-w-[7rem] border border-input bg-background px-1.5 text-[12px]",
                                          level === "none" && "text-muted-foreground",
                                        )}
                                        aria-label={`${m.label} access level`}
                                      >
                                        {level === "custom" ? (
                                          <option value="custom">{ACTIONS.filter((a) => row[a.key]).map((a) => a.label).join(" + ")}</option>
                                        ) : null}
                                        {(["none", "read", "standard", "full"] as const).map((l) => (
                                          <option key={l} value={l}>
                                            {LEVEL_LABEL[l]}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    {ACTIONS.map((a) => (
                                      <td key={a.key} className="px-1.5 py-1.5 text-center">
                                        <input
                                          type="checkbox"
                                          className="h-3.5 w-3.5 accent-[#00a09d]"
                                          checked={row[a.key]}
                                          disabled={isSystemManager}
                                          onChange={() => toggle(m.id, a.key)}
                                          aria-label={`${m.label} ${a.label}`}
                                        />
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}

                    {privileged ? (
                      <div>
                        <AgainFormGroupTitle>RMA special permissions</AgainFormGroupTitle>
                        <p className="mb-1 text-[11px] text-muted-foreground">
                          Actions inside warranty handling that are held back from everyone by default. Tick only for the people who
                          should do them.
                        </p>
                        <ul>
                          {privileged.items.map((m) => {
                            const row = rowOf(m.id);
                            if (!row) return null;
                            return (
                              <li key={m.id} className="border-t border-border/60">
                                <label className="flex cursor-pointer items-center gap-2 py-1.5 text-[13px]">
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 accent-[#00a09d]"
                                    checked={row.can_write}
                                    disabled={isSystemManager}
                                    onChange={() =>
                                      patchRow(m.id, (r) => (r.can_write ? withLevel(r, "none") : { ...withLevel(r, "none"), can_read: true, can_write: true }))
                                    }
                                  />
                                  {m.label}
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {tab === "users" ? (
                  roleUsers.length === 0 ? (
                    <p className="py-6 text-center text-[13px] text-muted-foreground">
                      No one holds this role yet. Assign it from{" "}
                      <Link href="/workspace/users" className="underline underline-offset-2 hover:text-foreground">
                        Users
                      </Link>
                      .
                    </p>
                  ) : (
                    <ul>
                      {roleUsers.map((u) => (
                        <li key={u.id} className="flex items-center gap-3 border-b border-border/60 py-2 last:border-b-0">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-[#00a09d] text-[10px] font-bold uppercase text-white">
                            {u.name.slice(0, 2)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">{u.name}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              @{u.username} · {u.email}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "border px-1.5 py-0.5 text-[11px]",
                              u.is_active ? "border-emerald-600/30 text-emerald-700 dark:text-emerald-400" : "border-border text-muted-foreground",
                            )}
                          >
                            {u.is_active ? "Active" : "Inactive"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}

                {tab === "review" ? (
                  isSystemManager ? (
                    <p className="text-[13px] text-muted-foreground">
                      System Manager is meant to be unrestricted. Keep it to the owner and one backup administrator.
                    </p>
                  ) : findings.length === 0 ? (
                    <p className="flex items-center gap-2 text-[13px]">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> Nothing unusual: read access only on what this role needs.
                    </p>
                  ) : (
                    <ul>
                      {findings.map((f) => {
                        const Icon = TONE_ICON[f.tone];
                        return (
                          <li key={f.title} className="flex items-start gap-2 border-b border-border/60 py-2 last:border-b-0">
                            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONE_CLASS[f.tone])} aria-hidden />
                            <span>
                              <span className="block text-[13px] font-medium">{f.title}</span>
                              <span className="block text-[11px] text-muted-foreground">{f.detail}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )
                ) : null}
              </AgainFormNotebook>
            </div>
          )}
        </div>
      </div>

      {/* new role: pick a job template */}
      <Sheet open={newOpen} onOpenChange={setNewOpen}>
        <SheetContent side="right" title="New role" resizable closeButton="inside" className="w-[420px] min-w-[300px] max-w-[720px] gap-0 rounded-none p-0">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 pr-10">
            <AgainDrawerButton variant="primary" disabled={!newName.trim() || creating} onClick={() => void handleCreate()}>
              {creating ? "Creating…" : "Create"}
            </AgainDrawerButton>
            <h2 className="text-sm font-semibold">New role</h2>
          </div>
          <div className="again-odoo-form space-y-4 overflow-y-auto p-3">
            <div>
              <label className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Role name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Showroom Sales" className="rounded-none" />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Start from</p>
              <ul className="border border-border">
                {[{ id: "", name: "Blank", description: "Read-only on the business modules, except Finance and HR. Tick what this role needs." } as const, ...templates].map((t) => (
                  <li key={t.id || "blank"} className="border-b border-border last:border-b-0">
                    <label className={cn("flex cursor-pointer items-start gap-2 px-2.5 py-2", newTemplate === t.id && "bg-[#714B67]/10")}>
                      <input
                        type="radio"
                        name="role-template"
                        className="mt-1 h-3.5 w-3.5 accent-[#714B67]"
                        checked={newTemplate === t.id}
                        onChange={() => {
                          setNewTemplate(t.id);
                          if (!newName.trim() && t.id) setNewName(t.name);
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium">{t.name}</span>
                        <span className="block text-[11px] leading-snug text-muted-foreground">{t.description}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-muted-foreground">You can change every box after creating the role.</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
