"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SuperAdminApiError, loginSuperAdmin } from "@/lib/api/super-admin";
import { useSuperAdminAuth } from "@/lib/store/super-admin-auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SuperAdminLoginForm() {
  const router = useRouter();
  const { token, setSession } = useSuperAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (token) router.replace("/super-admin/companies");
  }, [mounted, token, router]);

  const doLogin = async (loginEmail: string, loginPassword: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await loginSuperAdmin(loginEmail.trim(), loginPassword);
      setSession({ user: res.user, token: res.token, expiresAt: res.expires_at });
      router.replace("/super-admin/companies");
    } catch (err) {
      if (err instanceof SuperAdminApiError) {
        setError(err.message);
      } else {
        setError("Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await doLogin(email, password);
  };

  const handleDevLogin = async () => {
    setEmail("superadmin@againerp.local");
    setPassword("changeme123");
    await doLogin("superadmin@againerp.local", "changeme123");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <label htmlFor="sa-email" className="text-sm font-medium text-foreground">
          Email or username
        </label>
        <Input
          id="sa-email"
          type="text"
          autoComplete="username"
          placeholder="superadmin@againerp.local"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="sa-password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <Input
          id="sa-password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
      {process.env.NODE_ENV !== "production" ? (
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          disabled={loading}
          onClick={handleDevLogin}
        >
          Dev quick login (superadmin@againerp.local)
        </Button>
      ) : null}
    </form>
  );
}
