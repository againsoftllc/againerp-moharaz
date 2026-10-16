"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Briefcase,
  Building2,
  CalendarDays,
  Clock3,
  ExternalLink,
  Megaphone,
  Plus,
  Users,
  UserRoundSearch,
  Network,
} from "lucide-react";
import {
  loadHrmDashboard,
  type HrmDashboardData,
} from "@/lib/api/hrm-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useIsDark } from "@/lib/use-is-dark";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const KPI_TONES = [
  { bg: "#00a09d" },
  { bg: "#714B67" },
  { bg: "#F0AD4E" },
  { bg: "#0284c7" },
  { bg: "#7c3aed" },
  { bg: "#059669" },
] as const;

type NotifTab = "leaves" | "candidates" | "announcements";

const EMPTY_DASHBOARD: HrmDashboardData = {
  stats: {
    totalEmployees: 0,
    totalBranches: 0,
    monthAttendancePct: 0,
    pendingLeaves: 0,
    activeJobs: 0,
    totalDepartments: 0,
  },
  deptCounts: [],
  hiringTrend: [],
  leaveBreakdown: [],
  candidatePipeline: [],
  pendingLeaves: [],
  recentCandidates: [],
  announcements: [],
  recentMeetings: [],
  activities: [],
  onLeave: [],
  missingToday: [],
  upcomingHolidays: [],
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-none border border-border bg-background px-2.5 py-2 text-xs shadow-md">
      {label ? <p className="mb-1 font-semibold">{label}</p> : null}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-none"
            style={{ background: p.color ?? "var(--foreground)" }}
          />
          <span className="text-muted-foreground capitalize">{p.name}:</span>
          <span className="font-medium tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-h-0 flex-col rounded-none border border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <h2 className="text-[13px] font-semibold leading-none">{title}</h2>
        {action}
      </div>
      <div className="min-h-0 flex-1 p-3">{children}</div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: (typeof KPI_TONES)[number];
}) {
  const body = (
    <div className="group flex items-start gap-3 rounded-none border border-border bg-card p-3 transition-colors hover:bg-muted/30">
      <span
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-none text-white"
        style={{ backgroundColor: tone.bg }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
        {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</p> : null}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="px-1 py-4 text-center text-xs text-muted-foreground">{text}</p>;
}

export function HrmDashboard() {
  const canWrite = useAdminCanWrite();
  const isDark = useIsDark();
  const [notifTab, setNotifTab] = useState<NotifTab>("leaves");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HrmDashboardData>(EMPTY_DASHBOARD);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const next = await loadHrmDashboard();
        if (!cancelled) setData(next);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load dashboard");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    stats,
    deptCounts,
    hiringTrend,
    leaveBreakdown,
    candidatePipeline,
    pendingLeaves,
    recentCandidates,
    announcements,
    recentMeetings,
    activities,
    onLeave,
    missingToday,
    upcomingHolidays,
  } = data;

  const gridStroke = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const axisFill = isDark ? "#a1a1aa" : "#71717a";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4" data-page="hrm-dashboard">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="page-subtitle">AgainERP › HRM</p>
          <h1 className="page-title">Dashboard</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {loading ? "Loading live metrics…" : "Company overview — live metrics from HRM APIs"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-none">
            <Link href="/hrm/recruitment/career">
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              Career page
            </Link>
          </Button>
          {canWrite ? (
            <Button asChild size="sm" className="rounded-none">
              <Link href="/hrm/employees?create=1">
                <Plus className="mr-1 h-3.5 w-3.5" />
                New employee
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm" className="rounded-none">
            <Link href="/hrm/leave/applications">Leave</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="rounded-none">
            <Link href="/hrm/payroll/payslips">Payroll</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Total employees"
          value={loading ? "…" : stats.totalEmployees}
          href="/hrm/employees"
          icon={Users}
          tone={KPI_TONES[0]}
        />
        <KpiCard
          label="Total branch"
          value={loading ? "…" : stats.totalBranches}
          href="/hrm/branches"
          icon={Building2}
          tone={KPI_TONES[1]}
        />
        <KpiCard
          label="This month attendance"
          value={loading ? "…" : `${stats.monthAttendancePct}%`}
          hint="Present rate"
          href="/hrm/attendance/records"
          icon={Clock3}
          tone={KPI_TONES[2]}
        />
        <KpiCard
          label="Pending leaves"
          value={loading ? "…" : stats.pendingLeaves}
          href="/hrm/leave/applications"
          icon={CalendarDays}
          tone={KPI_TONES[3]}
        />
        <KpiCard
          label="Active jobs"
          value={loading ? "…" : stats.activeJobs}
          href="/hrm/recruitment/jobs"
          icon={Briefcase}
          tone={KPI_TONES[4]}
        />
        <KpiCard
          label="Total departments"
          value={loading ? "…" : stats.totalDepartments}
          href="/hrm/departments"
          icon={Network}
          tone={KPI_TONES[5]}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <Panel title="Department distribution">
          {deptCounts.length === 0 ? (
            <EmptyNote text={loading ? "Loading…" : "No department data"} />
          ) : (
            <>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={deptCounts}
                      dataKey="count"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={2}
                      stroke="var(--card)"
                    >
                      {deptCounts.map((_, i) => (
                        <Cell
                          key={deptCounts[i]!.name}
                          fill={
                            ["#00a09d", "#714B67", "#F0AD4E", "#0ea5e9", "#8b5cf6", "#10b981", "#94a3b8"][
                              i % 7
                            ]
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {deptCounts.slice(0, 5).map((d, i) => (
                  <span
                    key={d.name}
                    className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-none"
                      style={{
                        background: ["#00a09d", "#714B67", "#F0AD4E", "#0ea5e9", "#8b5cf6"][i % 5],
                      }}
                    />
                    {d.name} ({d.count})
                  </span>
                ))}
              </div>
            </>
          )}
        </Panel>

        <Panel title="Hiring trend (6 months)">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hiringTrend} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: axisFill, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: axisFill, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={24}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="joined"
                  name="Joined"
                  stroke="#00a09d"
                  fill="#00a09d33"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="left"
                  name="Left"
                  stroke="#714B67"
                  fill="#714B6733"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Leave type breakdown">
          {leaveBreakdown.length === 0 ? (
            <EmptyNote text={loading ? "Loading…" : "No leave applications"} />
          ) : (
            <>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={leaveBreakdown}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={72}
                      paddingAngle={2}
                      stroke="var(--card)"
                    >
                      {leaveBreakdown.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {leaveBreakdown.map((d) => (
                  <span
                    key={d.name}
                    className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
                  >
                    <span className="inline-block h-2 w-2 rounded-none" style={{ background: d.color }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </>
          )}
        </Panel>

        <Panel title="Candidate pipeline">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={candidatePipeline} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis
                  dataKey="stage"
                  tick={{ fill: axisFill, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: axisFill, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={24}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Candidates" fill="#00a09d" radius={0} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <Panel
          className="xl:col-span-1"
          title="Notification center"
          action={
            <div className="flex gap-1">
              {(
                [
                  ["leaves", "Leaves"],
                  ["candidates", "Candidates"],
                  ["announcements", "News"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setNotifTab(id)}
                  className={cn(
                    "rounded-none border px-1.5 py-0.5 text-[10px]",
                    notifTab === id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        >
          <div className="divide-y divide-border border border-border">
            {notifTab === "leaves" ? (
              pendingLeaves.length === 0 ? (
                <EmptyNote text={loading ? "Loading…" : "No pending leaves"} />
              ) : (
                pendingLeaves.map((leave) => (
                  <Link
                    key={leave.id}
                    href="/hrm/leave/applications"
                    className="flex items-start justify-between gap-2 px-2.5 py-2 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{leave.employeeName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {leave.leaveType} · {leave.fromDate} → {leave.toDate}
                      </p>
                    </div>
                    <Badge variant="secondary" className="rounded-none text-[10px] font-normal">
                      Pending
                    </Badge>
                  </Link>
                ))
              )
            ) : null}
            {notifTab === "candidates" ? (
              recentCandidates.length === 0 ? (
                <EmptyNote text={loading ? "Loading…" : "No recent candidates"} />
              ) : (
                recentCandidates.map((c) => (
                  <Link
                    key={c.id}
                    href="/hrm/recruitment/candidates"
                    className="flex items-start justify-between gap-2 px-2.5 py-2 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.job} · {c.appliedAt}
                      </p>
                    </div>
                    <Badge variant="outline" className="rounded-none text-[10px] font-normal">
                      {c.stage}
                    </Badge>
                  </Link>
                ))
              )
            ) : null}
            {notifTab === "announcements" ? (
              announcements.length === 0 ? (
                <EmptyNote text={loading ? "Loading…" : "No announcements"} />
              ) : (
                announcements.map((a) => (
                  <Link
                    key={a.id}
                    href="/hrm/announcements"
                    className="flex items-start gap-2 px-2.5 py-2 hover:bg-muted/40"
                  >
                    <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {a.department} · {a.startDate}
                      </p>
                    </div>
                  </Link>
                ))
              )
            ) : null}
          </div>
        </Panel>

        <Panel
          title="Recent meetings"
          action={
            <Button asChild variant="outline" size="sm" className="h-7 rounded-none text-xs">
              <Link href="/hrm/meetings">View all</Link>
            </Button>
          }
        >
          <div className="space-y-2">
            {recentMeetings.length === 0 ? (
              <EmptyNote text={loading ? "Loading…" : "No meetings"} />
            ) : (
              recentMeetings.map((m) => (
                <Link
                  key={m.id}
                  href="/hrm/meetings"
                  className="block rounded-none border border-border px-2.5 py-2 hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug">{m.title}</p>
                    <Badge variant="outline" className="shrink-0 rounded-none text-[10px] font-normal">
                      {m.type}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {m.when} · {m.room}
                  </p>
                </Link>
              ))
            )}
          </div>
        </Panel>

        <Panel title="Recent activities">
          {activities.length === 0 ? (
            <EmptyNote text={loading ? "Loading…" : "No recent activity"} />
          ) : (
            <ul className="space-y-2.5">
              {activities.map((a) => (
                <li key={a.id} className="flex gap-2 text-xs">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-none bg-[#00a09d]" />
                  <div className="min-w-0">
                    <p className="leading-snug text-foreground">{a.text}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{a.at}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Today's snapshot">
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">On leave</p>
              <div className="space-y-1">
                {onLeave.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {loading ? "Loading…" : "Nobody on leave"}
                  </p>
                ) : (
                  onLeave.map((e) => (
                    <Link
                      key={e.id}
                      href={`/hrm/employees?view=${e.id}`}
                      className="flex items-center gap-2 rounded-none border border-border px-2 py-1.5 text-xs hover:bg-muted/40"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={e.avatarUrl}
                        alt=""
                        className="h-6 w-6 rounded-none object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{e.name}</span>
                      <span className="text-muted-foreground">{e.department}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                Missing attendance
              </p>
              <div className="space-y-1">
                {missingToday.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {loading ? "Loading…" : "All present or on leave"}
                  </p>
                ) : (
                  missingToday.map((e) => (
                    <Link
                      key={e.id}
                      href={`/hrm/employees?view=${e.id}`}
                      className="flex items-center gap-2 rounded-none border border-border px-2 py-1.5 text-xs hover:bg-muted/40"
                    >
                      <UserRoundSearch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-medium">{e.name}</span>
                      <span className="text-muted-foreground">{e.department || e.workLocation}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                Upcoming holidays
              </p>
              <div className="space-y-1">
                {upcomingHolidays.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {loading ? "Loading…" : "No upcoming holidays"}
                  </p>
                ) : (
                  upcomingHolidays.map((h) => (
                    <Link
                      key={h.id}
                      href="/hrm/holidays"
                      className="flex items-center justify-between rounded-none border border-border px-2 py-1.5 text-xs hover:bg-muted/40"
                    >
                      <span className="font-medium">{h.name}</span>
                      <span className="tabular-nums text-muted-foreground">{h.date}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
