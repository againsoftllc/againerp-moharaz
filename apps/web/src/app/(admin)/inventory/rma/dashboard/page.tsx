"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Factory,
  PackageCheck,
  Repeat,
  Truck,
  Wrench,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import {
  fetchRmaDashboard,
  fetchRmaQueues,
  fetchRmaTickets,
  SUPPLIER_PENDING_LABEL,
  type RmaQueues,
  RMA_STATUS_LABEL,
  RMA_STATUS_TONE,
  type RmaDashboard,
  type RmaTicket,
} from "@/lib/api/rma";
import { RMA_STAGES, stageOfStatus, type RmaStageId } from "@/lib/rma/stages";
import { useUserScopedState } from "@/lib/hooks/use-user-scoped-state";
import { cn, formatCurrency } from "@/lib/utils";
import {
  Change,
  DashboardHeader,
  Kpi,
  Panel,
  ShareBars,
  compact,
  periodLabel,
  periodRange,
  type PeriodId,
} from "@/components/dashboard/period-dashboard";

const STAGE_ICON: Record<RmaStageId, React.ReactNode> = {
  complain: <ClipboardList className="h-4 w-4" />,
  claim: <Factory className="h-4 w-4" />,
  replacement: <PackageCheck className="h-4 w-4" />,
  delivery: <Truck className="h-4 w-4" />,
};

const STAGE_COLOR: Record<RmaStageId | "closed", string> = {
  complain: "#f59e0b",
  claim: "#6366f1",
  replacement: "#0ea5e9",
  delivery: "#10b981",
  closed: "#94a3b8",
};

const DONE = new Set(["closed", "rejected", "cancelled"]);
const fmt = (v: number) => v.toLocaleString("en-US");
const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : "");

function shiftIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000) + 1;
}

export default function RmaDashboardPage() {
  const [period, setPeriod] = useUserScopedState<PeriodId>("rma-dashboard:period", "30d");
  const range = useMemo(() => periodRange(period), [period]);
  const [tickets, setTickets] = useState<RmaTicket[] | null>(null);
  const [summary, setSummary] = useState<RmaDashboard | null>(null);
  const [queues, setQueues] = useState<RmaQueues | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, dash] = await Promise.all([fetchRmaTickets(), fetchRmaDashboard()]);
      setTickets(list.data);
      setSummary(dash);
      void fetchRmaQueues().then(setQueues).catch(() => setQueues(null));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load the RMA summary", { id: "rma-dashboard-api" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = tickets ?? [];
  const inRange = (value: string | null | undefined, from?: string, to?: string) => {
    const d = day(value);
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };
  const prevRange = useMemo(() => {
    if (!range.from || !range.to) return null;
    const len = daysBetween(range.from, range.to);
    return { from: shiftIso(range.from, -len), to: shiftIso(range.from, -1) };
  }, [range.from, range.to]);

  const received = rows.filter((t) => inRange(t.created_at, range.from, range.to));
  const receivedPrev = prevRange ? rows.filter((t) => inRange(t.created_at, prevRange.from, prevRange.to)) : null;
  const completed = rows.filter((t) => inRange(t.closed_at, range.from, range.to));
  const completedPrev = prevRange ? rows.filter((t) => inRange(t.closed_at, prevRange.from, prevRange.to)) : null;

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { complain: 0, claim: 0, replacement: 0, delivery: 0, closed: 0 };
    for (const t of rows) {
      const stage = stageOfStatus(t.status);
      if (stage) counts[stage] += 1;
      else if (DONE.has(t.status)) counts.closed += 1;
    }
    return counts;
  }, [rows]);

  const byMonth = period === "year" || period === "all";
  const series = useMemo(() => {
    const keyOf = (value: string) => (byMonth ? value.slice(0, 7) : value.slice(0, 10));
    const map = new Map<string, { label: string; received: number; completed: number }>();
    const bump = (value: string | null | undefined, field: "received" | "completed") => {
      if (!value) return;
      const key = keyOf(day(value));
      const entry = map.get(key) ?? { label: key.slice(byMonth ? 0 : 5), received: 0, completed: 0 };
      entry[field] += 1;
      map.set(key, entry);
    };
    received.forEach((t) => bump(t.created_at, "received"));
    completed.forEach((t) => bump(t.closed_at, "completed"));
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
  }, [received, completed, byMonth]);

  const stageRows = [
    ...RMA_STAGES.map((s) => ({ key: s.id, label: s.label, color: STAGE_COLOR[s.id], n: stageCounts[s.id] })),
    { key: "closed", label: "Closed / rejected", color: STAGE_COLOR.closed, n: stageCounts.closed },
  ];

  const recent = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
  const label = periodLabel(period);
  const stageCard = (id: RmaStageId) => RMA_STAGES.find((s) => s.id === id)!;
  const pending = summary?.pending_approval_count ?? 0;
  const awaiting = summary?.awaiting_return_count ?? 0;
  const unbilled = Number(summary?.unbilled_total ?? 0);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="-mb-2 flex items-center gap-3 text-xs">
        <Link href="/inventory/rma" className="text-[#00a09d] hover:underline">
          ← RMA list
        </Link>
      </div>
      <DashboardHeader title="RMA / Service Dashboard" period={period} onPeriod={setPeriod} onRefresh={() => void load()} loading={loading} />

      {/* where every claim is right now */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["complain", "claim", "replacement", "delivery"] as const).map((id) => (
          <Kpi
            key={id}
            icon={STAGE_ICON[id]}
            label={stageCard(id).label}
            tone={id === "complain" && stageCounts[id] > 0 ? "warn" : "default"}
            value={fmt(stageCounts[id])}
            foot={<span className="text-muted-foreground">open right now</span>}
            href={`/inventory/rma?stage=${id}`}
            loading={loading}
          />
        ))}
      </div>

      {/* what needs someone's attention today: overdue, waiting on a supplier, coming back again */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Overdue"
          tone={(queues?.counts.overdue ?? 0) > 0 ? "bad" : "good"}
          value={fmt(queues?.counts.overdue ?? summary?.overdue_count ?? 0)}
          foot={<span className="text-muted-foreground">past the promised delivery date</span>}
          href="/inventory/rma?queue=overdue"
          loading={loading}
        />
        <Kpi
          icon={<Factory className="h-4 w-4" />}
          label="Waiting on a supplier"
          tone={(queues?.counts.supplier_late ?? 0) > 0 ? "bad" : (queues?.counts.supplier_pending ?? 0) > 0 ? "warn" : "good"}
          value={fmt(queues?.counts.supplier_pending ?? summary?.supplier_pending_count ?? 0)}
          foot={
            <span className={cn((queues?.counts.supplier_late ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
              {fmt(queues?.counts.supplier_late ?? 0)} late
            </span>
          }
          href="/inventory/rma?queue=supplier_pending"
          loading={loading}
        />
        <Kpi
          icon={<Repeat className="h-4 w-4" />}
          label="Repeat RMAs"
          tone={(queues?.counts.repeat ?? 0) > 0 ? "warn" : "good"}
          value={fmt(queues?.counts.repeat ?? summary?.repeat_count ?? 0)}
          foot={<span className="text-muted-foreground">open, with earlier claims</span>}
          href="/inventory/rma?queue=repeat"
          loading={loading}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Overdue" action={<Link href="/inventory/rma?queue=overdue" className="text-[11px] text-[#00a09d] hover:underline">See all</Link>}>
          {!queues || queues.overdue.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Nothing is past its promised date.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {queues.overdue.slice(0, 6).map((r) => (
                <li key={r.rma_id}>
                  <Link href={`/inventory/rma/${r.rma_id}`} className="flex items-center gap-3 py-1.5 text-xs hover:bg-muted/40">
                    <span className="font-mono font-medium">{r.rma_number}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {r.customer_name} · {r.product_name}
                    </span>
                    <span className="shrink-0 border border-red-500/40 bg-red-500/10 px-1 text-[10px] font-medium text-red-600 dark:text-red-400">{r.days_overdue}d late</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Supplier pending" action={<Link href="/inventory/rma?queue=supplier_pending" className="text-[11px] text-[#00a09d] hover:underline">See all</Link>}>
          {!queues || queues.supplier_pending.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No unit is waiting on a supplier.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {queues.supplier_pending.slice(0, 6).map((r) => (
                <li key={`${r.rma_id}:${r.state}`}>
                  <Link href={`/inventory/rma/${r.rma_id}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-xs hover:bg-muted/40">
                    <span className="font-mono font-medium">{r.rma_number}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {r.supplier_name || "Supplier not set"} · {SUPPLIER_PENDING_LABEL[r.state]}
                    </span>
                    <span className={cn("shrink-0 text-[11px]", r.is_late ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                      {r.days_waiting}d{r.is_late ? " · late" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* trend + stage share */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel
          title={`Claims received / completed · ${byMonth ? "by month" : "by day"}`}
          className="lg:col-span-2"
          action={
            <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#f59e0b]" />Received</span>
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#10b981]" />Completed</span>
            </span>
          }
        >
          {loading ? (
            <div className="fb-shimmer h-[240px] w-full rounded" />
          ) : series.length === 0 ? (
            <div className="flex h-[240px] flex-col items-center justify-center gap-1 text-center">
              <Wrench className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">No claims {label.toLowerCase()}</p>
              <p className="text-xs text-muted-foreground">Received and completed claims show here.</p>
            </div>
          ) : (
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} minTickGap={16} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} allowDecimals={false} tickFormatter={(v) => compact(Number(v))} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(value, name) => [fmt(Number(value)), name === "received" ? "Received" : "Completed"]}
                  />
                  <Bar dataKey="received" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="completed" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Claims by stage">
          {loading ? (
            <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="fb-shimmer h-6 rounded" />)}</div>
          ) : (
            <ShareBars rows={stageRows} empty="No claims yet." />
          )}
        </Panel>
      </div>

      {/* in the period + needs attention */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title={`In the period · ${label.toLowerCase()}`} className="lg:col-span-1">
          <div className="grid grid-cols-2 gap-2">
            <Kpi
              icon={<ClipboardList className="h-4 w-4" />}
              label="Complaints received"
              value={fmt(received.length)}
              foot={<Change now={received.length} before={receivedPrev?.length} label={range.compare} invert />}
              loading={loading}
            />
            <Kpi
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Completed"
              tone="good"
              value={fmt(completed.length)}
              foot={<Change now={completed.length} before={completedPrev?.length} label={range.compare} />}
              loading={loading}
            />
          </div>
        </Panel>

        <Panel title="Needs attention · right now" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Kpi
              icon={<ClipboardList className="h-4 w-4" />}
              label="Pending approval"
              tone={pending ? "warn" : "good"}
              value={fmt(pending)}
              foot={<span className="text-muted-foreground">waiting for a decision</span>}
              href="/inventory/rma?stage=complain"
              loading={loading}
            />
            <Kpi
              icon={<Truck className="h-4 w-4" />}
              label="Awaiting return"
              tone={awaiting ? "warn" : "good"}
              value={fmt(awaiting)}
              foot={<span className="text-muted-foreground">approved, unit not here yet</span>}
              href="/inventory/rma?stage=complain"
              loading={loading}
            />
            <Kpi
              icon={<Wrench className="h-4 w-4" />}
              label="Unbilled charges"
              tone={unbilled > 0 ? "warn" : "good"}
              value={formatCurrency(unbilled)}
              foot={<span className="text-muted-foreground">repair / service not billed</span>}
              loading={loading}
            />
          </div>
        </Panel>
      </div>

      {/* latest claims */}
      <Panel title="Latest claims" action={<Link href="/inventory/rma?stage=complain" className="text-xs text-[#00a09d] hover:underline">View all</Link>}>
        {loading ? (
          <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="fb-shimmer h-7 rounded" />)}</div>
        ) : recent.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No claims yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">RMA</th>
                  <th className="py-1.5 pr-2 font-medium">Customer</th>
                  <th className="py-1.5 pr-2 font-medium">Product</th>
                  <th className="py-1.5 pr-2 font-medium">Received</th>
                  <th className="py-1.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-1.5 pr-2 font-mono">
                      <Link href={`/inventory/rma?claim=${t.id}`} className="text-primary hover:underline">{t.rma_number}</Link>
                    </td>
                    <td className="py-1.5 pr-2">{t.customer_name || "—"}</td>
                    <td className="max-w-[280px] py-1.5 pr-2">
                      <span className="block truncate" title={t.product_name}>{t.product_name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{t.sku}{t.serial_number ? ` · ${t.serial_number}` : ""}</span>
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">{day(t.created_at)}</td>
                    <td className="py-1.5 text-right">
                      <Badge variant="outline" className={cn(RMA_STATUS_TONE[t.status] ?? "")}>
                        {RMA_STATUS_LABEL[t.status] ?? t.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
