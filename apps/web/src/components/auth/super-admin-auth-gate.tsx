"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchSuperAdminMe } from "@/lib/api/super-admin";
import { useSuperAdminAuth } from "@/lib/store/super-admin-auth-store";

function AuthBootScreen({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3 px-4">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function SuperAdminAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useSuperAdminAuth((s) => s.token);
  const hasHydrated = useSuperAdminAuth((s) => s._hasHydrated);
  const setSession = useSuperAdminAuth((s) => s.setSession);
  const clearSession = useSuperAdminAuth((s) => s.clearSession);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!token) {
      router.replace("/super-admin/login");
      setReady(true);
      return;
    }

    let cancelled = false;
    void fetchSuperAdminMe()
      .then((user) => {
        if (cancelled) return;
        setSession({
          user,
          token,
          expiresAt: useSuperAdminAuth.getState().expiresAt ?? new Date().toISOString(),
        });
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        clearSession();
        router.replace("/super-admin/login");
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, token, router, setSession, clearSession]);

  if (!hasHydrated) return <AuthBootScreen label="Loading…" />;
  if (!token) return <AuthBootScreen label="Redirecting to sign in…" />;
  if (!ready) return <AuthBootScreen label="Checking session…" />;
  return <>{children}</>;
}
