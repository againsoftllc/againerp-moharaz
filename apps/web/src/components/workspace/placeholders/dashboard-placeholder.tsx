"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { useAppStore } from "@/lib/store/app-store";
import { useWorkspaceScope } from "@/lib/workspace/use-workspace-scope";

/** WS-CONTENT-DASH placeholder — workspace home dashboard prototype. */
export function DashboardPlaceholder() {
  const user = useAdminAuth((s) => s.user);
  const { companyName, branchName } = useWorkspaceScope();
  const setAiDrawerOpen = useAppStore((s) => s.setAiDrawerOpen);
  const company = companyName !== "—" ? companyName : "Company";
  const branch = branchName || "Branch";
  const firstName = user?.name?.trim().split(/\s+/)[0] || "there";

  const kpis = [
    { label: "Revenue MTD", value: "৳ 12.4M", change: "+8.2%" },
    { label: "Open Orders", value: "284", change: "+12" },
    { label: "Low Stock SKUs", value: "18", change: "−3" },
    { label: "Pending Approvals", value: "7", change: "2 urgent" },
  ];

  return (
    <div className="space-y-4" data-layout="LAYOUT-DASHBOARD">
      <section className="rounded-lg border bg-gradient-to-r from-primary/5 via-background to-background p-4">
        <p className="text-xs text-muted-foreground">Welcome back</p>
        <h1 className="page-title">Good morning, {firstName}</h1>
        <p className="page-subtitle">
          {company} · {branch} · FY 2026
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border bg-card p-3 shadow-sm" data-widget="kpi">
            <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
            <p className="mt-0.5 text-xl font-semibold">{kpi.value}</p>
            <p className="text-xs text-muted-foreground">{kpi.change}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 lg:col-span-2">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            <h2 className="text-sm font-medium">AI Daily Brief</h2>
          </div>
          <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
            <li>Revenue is tracking 8% above last month — top category: Apparel.</li>
            <li>7 purchase orders await approval — 2 exceed threshold.</li>
            <li>18 SKUs below reorder point in Dhaka HQ warehouse.</li>
          </ul>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 h-auto px-0 text-xs text-primary hover:bg-transparent"
            onClick={() => setAiDrawerOpen(true)}
          >
            Open AI Assistant
          </Button>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 text-sm font-medium">Quick Actions</h2>
          <div className="flex flex-col gap-1.5">
            <Button asChild variant="outline" size="sm" className="justify-start">
              <Link href="/website/products?create=1">Create Product</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="justify-start">
              <Link href="/sales">Create Order</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="justify-start">
              <Link href="/hr/leave?create=1">Apply Leave</Link>
            </Button>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Prototype dashboard · mock KPIs · platform widget engine will replace static cards in Phase 01
        completion.
      </p>
    </div>
  );
}
