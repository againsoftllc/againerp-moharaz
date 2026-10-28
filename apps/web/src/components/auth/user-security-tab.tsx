"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AgainFormGroupTitle } from "@/components/again/again-form-sheet";
import { SessionList } from "@/components/auth/session-list";
import type { ApiSession } from "@/lib/api/auth";
import { endUserSessions, fetchUserSessions, unlockAuthUser } from "@/lib/api/auth-users";
import type { AdminUser } from "@/lib/store/admin-auth-store";
import { formatDateTime } from "@/lib/utils";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 text-[13px] last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{children}</span>
    </div>
  );
}

/** User drawer → Security: sign-in status, the wrong-password lock and the member's signed-in devices. */
export function UserSecurityTab({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const [current, setCurrent] = React.useState<AdminUser>(user);
  const [sessions, setSessions] = React.useState<ApiSession[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setCurrent(user);
    setLoading(true);
    fetchUserSessions(user.id)
      .then(setSessions)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load the sessions"))
      .finally(() => setLoading(false));
  }, [user]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const locked = Boolean(current.locked_until);
  return (
    <div className="again-odoo-form @container space-y-5">
      <div>
        <AgainFormGroupTitle>Sign-in</AgainFormGroupTitle>
        <Row label="Last signed in">{current.last_login_at ? formatDateTime(current.last_login_at) : "Never"}</Row>
        <Row label="Password changed">{current.password_changed_at ? formatDateTime(current.password_changed_at) : "—"}</Row>
        <Row label="Password expires">{current.password_expires_at ? formatDateTime(current.password_expires_at) : "Never (expiry is off)"}</Row>
        <Row label="New password at next sign-in">
          {current.must_change_password ? "Asked" : current.password_change_due ? "Due (expired)" : "No"}
        </Row>
        <Row label="Wrong-password lock">
          {locked ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-red-600 dark:text-red-400">Locked until {formatDateTime(current.locked_until)}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 rounded-none px-2 text-[11px]"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setCurrent(await unlockAuthUser(user.id));
                    toast.success(`${user.name} can sign in again`);
                  })
                }
              >
                Unlock
              </Button>
            </span>
          ) : (
            "Not locked"
          )}
        </Row>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <AgainFormGroupTitle>Signed-in devices</AgainFormGroupTitle>
          <Button
            size="sm"
            variant="outline"
            className="h-6 rounded-none px-2 text-[11px]"
            disabled={busy || sessions.filter((s) => !s.current).length === 0}
            onClick={() =>
              void run(async () => {
                setSessions(await endUserSessions(user.id));
                toast.success(isSelf ? "Your other devices were signed out" : `${user.name} was signed out everywhere`);
              })
            }
          >
            {isSelf ? "Sign out other devices" : "Sign out everywhere"}
          </Button>
        </div>
        <SessionList sessions={sessions} loading={loading} />
      </div>
    </div>
  );
}
