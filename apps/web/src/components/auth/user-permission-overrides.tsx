"use client";

import * as React from "react";
import { Check, Minus, Plus } from "lucide-react";
import { AgainFormGroupTitle } from "@/components/again/again-form-sheet";
import { fetchUserPermissions, type ApiUserPermissions } from "@/lib/api/auth-users";
import { cn } from "@/lib/utils";

/** "module:action" → true (allow) / false (deny). Missing = from the roles. */
export type OverrideMap = Record<string, boolean>;

export function overridesFromList(list: { module: string; action: string; allow: boolean }[] | undefined): OverrideMap {
  return Object.fromEntries((list ?? []).map((o) => [`${o.module}:${o.action}`, o.allow]));
}

export function overridesToList(map: OverrideMap) {
  return Object.entries(map).map(([key, allow]) => {
    const [module, action] = key.split(":");
    return { module, action, allow };
  });
}

const ACTION_SHORT: Record<string, string> = {
  read: "Read",
  create: "Create",
  write: "Write",
  delete: "Delete",
  publish: "Publish",
  export: "Export",
  approve: "Approve",
};

/**
 * User drawer → Access Rights → Own permissions (OnerERP user-wise permission): each cell starts from the roles; a click gives the
 * permission to this user only (+), the next takes it away (−), the next goes back to the roles. Modules the company does not
 * have are listed greyed: nobody gets them.
 */
export function UserPermissionOverrides({
  userId,
  value,
  onChange,
  disabled,
  isSelf,
}: {
  userId: string;
  value: OverrideMap;
  onChange: (next: OverrideMap) => void;
  disabled?: boolean;
  isSelf: boolean;
}) {
  const [data, setData] = React.useState<ApiUserPermissions | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetchUserPermissions(userId)
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load the permissions"));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function cycle(module: string, action: string) {
    const key = `${module}:${action}`;
    const next = { ...value };
    if (!(key in next)) next[key] = true;
    else if (next[key]) next[key] = false;
    else delete next[key];
    onChange(next);
  }

  const count = Object.keys(value).length;
  const locked = disabled || isSelf || data?.system_manager;
  const groups = React.useMemo(() => {
    const out = new Map<string, ApiUserPermissions["modules"]>();
    for (const row of data?.modules ?? []) {
      const list = out.get(row.group || "Other") ?? [];
      list.push(row);
      out.set(row.group || "Other", list);
    }
    return [...out.entries()];
  }, [data]);

  return (
    <div>
      <AgainFormGroupTitle>Own permissions{count ? ` · ${count} change${count === 1 ? "" : "s"}` : ""}</AgainFormGroupTitle>
      <p className="mb-1 text-[11px] text-muted-foreground">
        {data?.system_manager
          ? "System Manager has every permission; own permissions do not apply."
          : isSelf
            ? "You cannot change your own permissions."
            : "Starts from the roles (✓). Click a cell to give it to this user only (+), again to take it away (−), again to go back to the roles."}
      </p>
      {error ? <p className="py-2 text-[13px] text-destructive">{error}</p> : null}
      {!data && !error ? <p className="py-2 text-[13px] text-muted-foreground">Loading…</p> : null}
      {data ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[12px]">
            <thead>
              <tr className="border-b border-border/70 text-left text-[11px] text-muted-foreground">
                <th className="py-1.5 pr-2 font-semibold">Module</th>
                {data.actions.map((a) => (
                  <th key={a} className="w-[64px] py-1.5 text-center font-semibold">
                    {ACTION_SHORT[a] ?? a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(([group, rows]) => (
                <React.Fragment key={group}>
                  <tr>
                    <td colSpan={data.actions.length + 1} className="pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group}
                    </td>
                  </tr>
                  {rows.map((row) => (
                    <tr key={row.id} className={cn("border-b border-border/40", !row.enabled && "opacity-50")}>
                      <td className="py-1 pr-2 text-foreground" title={row.enabled ? undefined : "The company does not have this module"}>
                        {row.label}
                        {!row.enabled ? <span className="ml-1 text-[10px] text-muted-foreground">(not in plan)</span> : null}
                      </td>
                      {data.actions.map((action) => {
                        const key = `${row.id}:${action}`;
                        const override = key in value ? value[key] : undefined;
                        const fromRole = row.from_roles.includes(action);
                        const effective = row.enabled && (override === undefined ? fromRole || data.system_manager : override);
                        return (
                          <td key={action} className="py-0.5 text-center">
                            <button
                              type="button"
                              disabled={locked || !row.enabled}
                              onClick={() => cycle(row.id, action)}
                              title={
                                override === undefined
                                  ? fromRole
                                    ? "From the roles"
                                    : "Not given by the roles"
                                  : override
                                    ? "Given to this user only"
                                    : "Taken away from this user"
                              }
                              className={cn(
                                "inline-flex h-6 w-8 items-center justify-center border text-[11px] disabled:cursor-not-allowed",
                                override === true && "border-emerald-600/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                                override === false && "border-red-600/50 bg-red-500/15 text-red-700 dark:text-red-400",
                                override === undefined && "border-border/60 text-muted-foreground",
                              )}
                            >
                              {override === true ? (
                                <Plus className="h-3 w-3" />
                              ) : override === false ? (
                                <Minus className="h-3 w-3" />
                              ) : effective ? (
                                <Check className="h-3 w-3" />
                              ) : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
