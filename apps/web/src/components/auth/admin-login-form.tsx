"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { loginAdmin } from "@/lib/api/auth";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Only allow same-app relative paths — never redirect off-site. */
function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const { token, setSession } = useAdminAuth();
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
    if (token) router.replace(nextPath);
  }, [mounted, token, router, nextPath]);

  const doLogin = async (loginEmail: string, loginPassword: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await loginAdmin(loginEmail.trim(), loginPassword);
      setSession({
        user: res.user,
        token: res.token,
        expiresAt: res.expires_at,
        permissions: res.permissions ?? {},
        enabledModules: res.enabled_modules ?? null,
      });
      router.replace(nextPath);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof TypeError) {
        setError(
          "Cannot reach API — set API_PROXY_TARGET to your FastAPI URL (Docker: http://api:8010, Vercel: Railway HTTPS URL) and ensure the API is online",
        );
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
    setEmail("admin@againerp.local");
    setPassword("admin123");
    await doLogin("admin@againerp.local", "admin123");
  };

  return (
    <form method="post" action="/login" onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-foreground">
          Email or username
        </label>
        <Input
          id="email"
          type="text"
          autoComplete="username"
          placeholder="Enter username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <Input
          id="password"
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
          Dev quick login (admin@againerp.local)
        </Button>
      ) : null}
    </form>
  );
}
