"use client";

import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { useWorkspaceScope } from "@/lib/workspace/use-workspace-scope";

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Welcome strip — not a draggable widget per blueprint. */
export function WelcomeArea() {
  const user = useAdminAuth((s) => s.user);
  const { companyName, branchName } = useWorkspaceScope();
  const company = companyName !== "—" ? companyName : "Company";
  const branch = branchName || "Branch";
  const greeting = greetingForHour(new Date().getHours());
  const firstName = user?.name?.trim().split(/\s+/)[0] || "there";

  return (
    <section
      className="rounded-lg border bg-gradient-to-r from-primary/5 via-background to-background p-4"
      data-component="WS-CONTENT-WELCOME"
      aria-label="Welcome"
    >
      <p className="text-xs text-muted-foreground">Welcome back</p>
      <h2 className="page-title">{greeting}, {firstName}</h2>
      <p className="page-subtitle">
        {company} · {branch} · FY 2026
      </p>
    </section>
  );
}
