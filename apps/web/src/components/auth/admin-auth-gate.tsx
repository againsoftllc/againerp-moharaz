"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchAdminMe } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { useSubscriptionStatus } from "@/lib/store/subscription-status-store";
import { SubscriptionStatusBanner } from "@/components/subscription-status-banner";

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

function SubscriptionBlockedScreen() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
      <SubscriptionStatusBanner />
      <div className="flex flex-1 items-center justify-center px-4">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Sign out and contact support if you believe this is a mistake.
        </p>
      </div>
    </div>
  );
}

export function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAdminAuth((s) => s.token);
  const hasHydrated = useAdminAuth((s) => s._hasHydrated);
  const setSession = useAdminAuth((s) => s.setSession);
  const setPermissions = useAdminAuth((s) => s.setPermissions);
  const clearSession = useAdminAuth((s) => s.clearSession);
  const inactiveStatus = useSubscriptionStatus((s) => s.inactiveStatus);
  const setInactiveStatus = useSubscriptionStatus((s) => s.setInactiveStatus);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!token) {
      router.replace("/login");
      setReady(true);
      return;
    }

    let cancelled = false;
    void fetchAdminMe()
      .then(({ user, permissions, enabledModules }) => {
        if (cancelled) return;
        setInactiveStatus(null);
        setSession({
          user,
          token,
          expiresAt: useAdminAuth.getState().expiresAt ?? new Date().toISOString(),
          permissions,
          enabledModules,
        });
        setPermissions(permissions);
        setReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 402) {
          // Subscription inactive — client.ts already set the banner state.
          // Keep the session so the user can still see who they are / sign out.
          setReady(true);
          return;
        }
        clearSession();
        router.replace("/login");
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, token, router, setSession, setPermissions, clearSession, setInactiveStatus]);

  if (!hasHydrated) {
    return <AuthBootScreen label="Loading…" />;
  }
  if (!token) {
    return <AuthBootScreen label="Redirecting to sign in…" />;
  }
  if (!ready) {
    return <AuthBootScreen label="Checking session…" />;
  }
  if (inactiveStatus) {
    return <SubscriptionBlockedScreen />;
  }
  return <>{children}</>;
}
