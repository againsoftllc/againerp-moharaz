"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { registerCompany } from "@/lib/api/auth";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CompanyRegisterForm() {
  const router = useRouter();
  const setSession = useAdminAuth((s) => s.setSession);
  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await registerCompany({
        company_name: companyName.trim(),
        owner_name: ownerName.trim(),
        email: email.trim(),
        username: username.trim(),
        password,
      });
      setSession({
        user: res.user,
        token: res.token,
        expiresAt: res.expires_at,
        permissions: res.permissions ?? {},
        enabledModules: res.enabled_modules ?? null,
      });
      router.replace("/workspace/setup");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Registration failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <label htmlFor="r-company" className="text-sm font-medium text-foreground">
          Company name
        </label>
        <Input
          id="r-company"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Acme Trading Ltd"
          required
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="r-owner" className="text-sm font-medium text-foreground">
          Your name
        </label>
        <Input
          id="r-owner"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          placeholder="Jane Doe"
          required
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="r-email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <Input
          id="r-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="r-username" className="text-sm font-medium text-foreground">
          Username
        </label>
        <Input
          id="r-username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="r-password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <Input
          id="r-password"
          type="password"
          autoComplete="new-password"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Creating your account…" : "Start free trial"}
      </Button>
    </form>
  );
}
