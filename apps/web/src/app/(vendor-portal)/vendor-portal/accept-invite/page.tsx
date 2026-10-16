"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { vendorPortalAcceptInvite } from "@/lib/api/vendor-portal";

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const blocked = !token || password.length < 8 || password !== confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked || !token) return;
    setBusy(true);
    setError(null);
    try {
      await vendorPortalAcceptInvite(token, password);
      router.replace("/vendor-portal/catalog");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not activate your access");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-[380px] border border-border bg-card p-6">
        <h1 className="text-center text-lg font-semibold">Vendor Portal</h1>
        <p className="mt-1 text-center text-xs text-muted-foreground">Set a password to activate your access</p>

        {!token ? (
          <p className="mt-4 border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-center text-[11px] text-red-600 dark:text-red-400">
            This invite link is missing or invalid. Ask your buyer to resend it.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-3" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="vp-invite-password" className="text-xs font-medium">
                New password
              </label>
              <Input
                id="vp-invite-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="rounded-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="vp-invite-confirm" className="text-xs font-medium">
                Confirm password
              </label>
              <Input
                id="vp-invite-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="rounded-none"
              />
              {mismatch && (
                <p className="text-[11px] text-red-600 dark:text-red-400">Passwords do not match.</p>
              )}
            </div>

            {error && (
              <p className="border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full rounded-none" disabled={blocked || busy}>
              {busy ? "Please wait…" : "Activate access"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function VendorPortalAcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteContent />
    </Suspense>
  );
}
