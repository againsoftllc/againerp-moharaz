"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { vendorPortalLogin } from "@/lib/api/vendor-portal";

export default function VendorPortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const blocked = !email.trim() || !password;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    setBusy(true);
    setError(null);
    try {
      await vendorPortalLogin(email.trim(), password);
      router.replace("/vendor-portal/catalog");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-[380px] border border-border bg-card p-6">
        <h1 className="text-center text-lg font-semibold">Vendor Portal</h1>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Sign in to place orders and manage quotations
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="vp-email" className="text-xs font-medium">
              Email
            </label>
            <Input
              id="vp-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@vendor.com"
              className="rounded-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="vp-password" className="text-xs font-medium">
              Password
            </label>
            <Input
              id="vp-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="rounded-none"
            />
          </div>

          {error && (
            <p className="border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full rounded-none" disabled={blocked || busy}>
            {busy ? "Please wait…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-4 border-t border-border pt-3 text-center text-[11px] text-muted-foreground">
          Access is issued by your buyer. Contact them if you cannot sign in.
        </p>
      </div>
    </div>
  );
}
