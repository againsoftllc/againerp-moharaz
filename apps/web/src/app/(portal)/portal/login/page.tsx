"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { portalAcceptInvite, portalLogin } from "@/lib/api/portal";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const accepting = Boolean(inviteToken);
  const mismatch = accepting && confirm.length > 0 && password !== confirm;
  const blocked = accepting
    ? password.length < 8 || password !== confirm
    : !email.trim() || !password;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    setBusy(true);
    setError(null);
    try {
      if (accepting && inviteToken) {
        await portalAcceptInvite(inviteToken, password);
      } else {
        await portalLogin(email.trim(), password);
      }
      router.replace("/portal/catalog");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-[380px] border border-border bg-card p-6">
        <h1 className="text-center text-lg font-semibold">Supplier Portal</h1>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          {accepting ? "Set a password to activate your access" : "Sign in to manage your catalog"}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3" noValidate>
          {!accepting && (
            <div className="space-y-1.5">
              <label htmlFor="portal-email" className="text-xs font-medium">
                Email
              </label>
              <Input
                id="portal-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@supplier.com"
                className="rounded-none"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="portal-password" className="text-xs font-medium">
              {accepting ? "New password" : "Password"}
            </label>
            <Input
              id="portal-password"
              type="password"
              autoComplete={accepting ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={accepting ? "At least 8 characters" : "Enter password"}
              className="rounded-none"
            />
          </div>

          {accepting && (
            <div className="space-y-1.5">
              <label htmlFor="portal-confirm" className="text-xs font-medium">
                Confirm password
              </label>
              <Input
                id="portal-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="rounded-none"
              />
              {mismatch && (
                <p className="text-[11px] text-red-600 dark:text-red-400">
                  Passwords do not match.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full rounded-none" disabled={blocked || busy}>
            {busy ? "Please wait…" : accepting ? "Activate access" : "Sign in"}
          </Button>
        </form>

        <p className="mt-4 border-t border-border pt-3 text-center text-[11px] text-muted-foreground">
          Access is issued by your buyer. Contact them if you cannot sign in.
        </p>
      </div>
    </div>
  );
}

export default function PortalLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
