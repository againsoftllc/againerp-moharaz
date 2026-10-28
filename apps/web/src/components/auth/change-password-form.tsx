"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeMyPassword } from "@/lib/api/auth";
import { useAdminAuth } from "@/lib/store/admin-auth-store";

/** Same rule as services/core/auth_security.check_new_password. */
export function newPasswordProblem(password: string, confirm: string): string | null {
  if (password.length < 8) return "At least 8 characters";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "Use at least one letter and one digit";
  if (confirm && confirm !== password) return "The two new passwords do not match";
  return null;
}

/**
 * Current password + new password twice. On success the signed-in member's stored user is replaced (so a forced change lifts
 * the lock screen) and every other session of theirs has ended on the server.
 */
export function ChangePasswordForm({ onDone, submitLabel = "Change password" }: { onDone?: () => void; submitLabel?: string }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const problem = next ? newPasswordProblem(next, confirm) : null;
  const ready = current.length > 0 && next.length > 0 && confirm === next && !problem;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      const user = await changeMyPassword(current, next);
      const state = useAdminAuth.getState();
      if (state.token) {
        state.setSession({
          user,
          token: state.token,
          expiresAt: state.expiresAt ?? new Date().toISOString(),
          permissions: state.permissions,
          enabledModules: state.enabledModules,
        });
      }
      toast.success("Password changed. Your other devices were signed out.");
      setCurrent("");
      setNext("");
      setConfirm("");
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the password");
    } finally {
      setSaving(false);
    }
  }

  const type = show ? "text" : "password";
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground">Current password</span>
        <Input type={type} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="rounded-none" />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground">New password</span>
        <Input type={type} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className="rounded-none" />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground">New password again</span>
        <Input type={type} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="rounded-none" />
      </label>
      <p className={problem ? "text-[11px] text-amber-600 dark:text-amber-400" : "text-[11px] text-muted-foreground"}>
        {problem ?? "At least 8 characters with a letter and a digit, different from the current one."}
      </p>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" className="rounded-none" disabled={!ready || saving}>
          {saving ? "Saving…" : submitLabel}
        </Button>
        <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setShow((v) => !v)}>
          {show ? "Hide passwords" : "Show passwords"}
        </button>
      </div>
    </form>
  );
}
