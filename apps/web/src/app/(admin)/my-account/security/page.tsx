"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { SessionList } from "@/components/auth/session-list";
import { fetchMySessions, signOutOtherSessions, type ApiSession } from "@/lib/api/auth";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { formatDateTime } from "@/lib/utils";

/** User menu → Account security: change your own password and see / end your other signed-in devices. */
export default function AccountSecurityPage() {
  const user = useAdminAuth((s) => s.user);
  const [sessions, setSessions] = React.useState<ApiSession[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    fetchMySessions()
      .then(setSessions)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load your sessions"))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function signOutOthers() {
    setBusy(true);
    try {
      setSessions(await signOutOtherSessions());
      toast.success("Your other devices were signed out");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign the other devices out");
    } finally {
      setBusy(false);
    }
  }

  const others = sessions.filter((s) => !s.current).length;
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
        <div>
          <h1 className="text-xl font-semibold">Account security</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {user?.name ?? "You"}
            {user?.last_login_at ? ` · last signed in ${formatDateTime(user.last_login_at)}` : ""}
            {user?.password_changed_at ? ` · password changed ${formatDateTime(user.password_changed_at)}` : ""}
            {user?.password_expires_at ? ` · expires ${formatDateTime(user.password_expires_at)}` : ""}
          </p>
        </div>
        <section className="border border-border bg-card p-4">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Change password</h2>
          <div className="max-w-sm">
            <ChangePasswordForm onDone={load} />
          </div>
        </section>
        <section className="border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Signed-in devices</h2>
            <Button size="sm" variant="outline" className="rounded-none" onClick={() => void signOutOthers()} disabled={busy || others === 0}>
              Sign out other devices
            </Button>
          </div>
          <SessionList sessions={sessions} loading={loading} />
        </section>
      </div>
    </div>
  );
}
