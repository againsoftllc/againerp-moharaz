"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchCrmDashboard, type ApiCrmDashboard } from "@/lib/api/crm";
import { cn, formatMoney } from "@/lib/utils";

function money(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? formatMoney(n) : value;
}

function Kpi({ label, value, tone, href }: { label: string; value: string; tone?: "good" | "warn" | "danger"; href?: string }) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "danger"
          ? "text-red-600 dark:text-red-400"
          : "";
  const body = (
    <div className="border border-border bg-background px-4 py-3 hover:bg-muted/30">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", toneClass)}>{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function dealStageVariant(stage: string) {
  if (stage === "won") return "success" as const;
  if (stage === "lost") return "muted" as const;
  return "outline" as const;
}

function ticketPriorityVariant(priority: string) {
  if (priority === "urgent" || priority === "high") return "warning" as const;
  return "outline" as const;
}

export default function CrmDashboardPage() {
  const [data, setData] = useState<ApiCrmDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCrmDashboard();
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "crm-dashboard-api" });
  }, [error]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-sm font-semibold">CRM overview</h1>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {!data ? (
        <p className="text-sm text-muted-foreground">{loading ? "Loading…" : "No data."}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label="Open leads" value={String(data.open_leads_count)} href="/crm/leads" />
            <Kpi label="Pipeline value" value={money(data.pipeline_value)} tone="good" href="/crm/deals" />
            <Kpi label="Won this month" value={money(data.won_this_month)} tone="good" href="/crm/deals" />
            <Kpi label="Active projects" value={String(data.active_projects_count)} href="/crm/projects" />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label="Open tasks" value={String(data.open_tasks_count)} href="/crm/tasks" />
            <Kpi
              label="Overdue tasks"
              value={String(data.overdue_tasks_count)}
              tone={data.overdue_tasks_count > 0 ? "danger" : "good"}
              href="/crm/tasks"
            />
            <Kpi label="Open tickets" value={String(data.open_tickets_count)} href="/crm/tickets" />
            <Kpi label="Open deals" value={String(data.open_deals_count)} href="/crm/deals" />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-semibold">Recent leads</span>
                <Link href="/crm/leads" className="text-[11px] text-primary hover:underline">
                  View all
                </Link>
              </div>
              <div className="divide-y divide-border/60">
                {data.recent_leads.length === 0 && <p className="px-3 py-4 text-xs text-muted-foreground">Nothing yet.</p>}
                {data.recent_leads.map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{lead.name}</p>
                      <p className="text-muted-foreground">{lead.company_name ?? lead.email ?? "—"}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {lead.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-semibold">Recent deals</span>
                <Link href="/crm/deals" className="text-[11px] text-primary hover:underline">
                  View all
                </Link>
              </div>
              <div className="divide-y divide-border/60">
                {data.recent_deals.length === 0 && <p className="px-3 py-4 text-xs text-muted-foreground">Nothing yet.</p>}
                {data.recent_deals.map((deal) => (
                  <div key={deal.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{deal.title}</p>
                      <p className="text-muted-foreground">{money(deal.value)}</p>
                    </div>
                    <Badge variant={dealStageVariant(deal.stage)} className="capitalize">
                      {deal.stage}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-semibold">Open tasks</span>
                <Link href="/crm/tasks" className="text-[11px] text-primary hover:underline">
                  View all
                </Link>
              </div>
              <div className="divide-y divide-border/60">
                {data.recent_tasks.length === 0 && <p className="px-3 py-4 text-xs text-muted-foreground">Nothing yet.</p>}
                {data.recent_tasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{task.title}</p>
                      <p className="text-muted-foreground">{task.project_name ?? "Standalone"} {task.due_date ? `— due ${task.due_date}` : ""}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {task.priority}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-semibold">Recent tickets</span>
                <Link href="/crm/tickets" className="text-[11px] text-primary hover:underline">
                  View all
                </Link>
              </div>
              <div className="divide-y divide-border/60">
                {data.recent_tickets.length === 0 && <p className="px-3 py-4 text-xs text-muted-foreground">Nothing yet.</p>}
                {data.recent_tickets.map((ticket) => (
                  <div key={ticket.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{ticket.ticket_number} — {ticket.subject}</p>
                      <p className="capitalize text-muted-foreground">{ticket.status.replace(/_/g, " ")}</p>
                    </div>
                    <Badge variant={ticketPriorityVariant(ticket.priority)} className="capitalize">
                      {ticket.priority}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
