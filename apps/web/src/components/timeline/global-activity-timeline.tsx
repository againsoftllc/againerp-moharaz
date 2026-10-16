"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Pin, RefreshCw, Search, Sparkles } from "lucide-react";
import { TimelineAiSummaryPanel } from "@/components/timeline/timeline-ai-summary-panel";
import { TimelineCard } from "@/components/timeline/timeline-card";
import { TimelineDetailSheet } from "@/components/timeline/timeline-detail-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GLOBAL_TIMELINE_ACTIVITIES,
  GLOBAL_TIMELINE_AI_SUMMARY,
  GLOBAL_TIMELINE_AS_OF,
  TIMELINE_DATE_RANGES,
  TIMELINE_FILTER_DEPARTMENTS,
  TIMELINE_FILTER_MODULES,
  TIMELINE_FILTER_PRIORITIES,
  TIMELINE_FILTER_TYPES,
  TIMELINE_FILTER_USERS,
  filterTimelineActivities,
  getTimelineActivityById,
  groupTimelineActivities,
} from "@/lib/mock-data/global-activity-timeline";
import type { TimelineGroupBy, TimelineViewMode } from "@/lib/timeline/types";
import { TIMELINE_VIEW_MODES } from "@/lib/timeline/types";
import { cn } from "@/lib/utils";

/** CMP-TML-LAYOUT-001 — Global Activity Timeline */
function GlobalActivityTimelineContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const viewMode = (searchParams.get("view") as TimelineViewMode) || "feed";
  const activityId = searchParams.get("activity");

  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState("7d");
  const [user, setUser] = useState("all");
  const [department, setDepartment] = useState("all");
  const [module, setModule] = useState("all");
  const [activityType, setActivityType] = useState("all");
  const [priority, setPriority] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<TimelineGroupBy>("date");

  const filtered = useMemo(
    () =>
      filterTimelineActivities(GLOBAL_TIMELINE_ACTIVITIES, {
        search,
        module,
        user,
        department,
        activityType,
        priority,
        unreadOnly,
        pinnedOnly,
      }),
    [search, module, user, department, activityType, priority, unreadOnly, pinnedOnly],
  );

  const grouped = useMemo(() => groupTimelineActivities(filtered, groupBy), [filtered, groupBy]);

  const stats = useMemo(() => {
    const unread = GLOBAL_TIMELINE_ACTIVITIES.filter((a) => a.unread).length;
    const pinned = GLOBAL_TIMELINE_ACTIVITIES.filter((a) => a.pinned).length;
    const modules = new Set(GLOBAL_TIMELINE_ACTIVITIES.map((a) => a.module)).size;
    return { total: filtered.length, unread, pinned, modules };
  }, [filtered]);

  const activity = activityId ? getTimelineActivityById(activityId) : null;

  const setViewMode = (mode: TimelineViewMode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", mode);
    router.push(`/hr/activity?${params.toString()}`);
  };

  const openActivity = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("activity", id);
      router.push(`/hr/activity?${params.toString()}`);
    },
    [router, searchParams],
  );

  const closeActivity = useCallback(
    (open: boolean) => {
      if (open) return;
      const params = new URLSearchParams(searchParams.toString());
      params.delete("activity");
      const query = params.toString();
      router.push(query ? `/hr/activity?${query}` : "/hr/activity");
    },
    [router, searchParams],
  );

  const selectClass =
    "h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
      {/* ZONE B — Stream */}
      <div className="min-w-0 flex-1 space-y-4">
        {/* ZONE A — Header */}
        <section aria-label="Timeline header" className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="page-title">Activity Timeline</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Global activity feed · As of {GLOBAL_TIMELINE_AS_OF}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled>
                <Download className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">Export</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setViewMode("ai")}
              >
                <Sparkles className="h-3.5 w-3.5 text-violet-500" aria-hidden />
                <span className="hidden sm:inline">AI Summary</span>
              </Button>
            </div>
          </div>

          {/* View toggle */}
          <div
            role="tablist"
            aria-label="Timeline views"
            className="flex flex-wrap gap-1 rounded-lg border border-input bg-muted/30 p-1"
          >
            {TIMELINE_VIEW_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={viewMode === mode.id}
                onClick={() => setViewMode(mode.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  viewMode === mode.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                placeholder="Search activities…"
                className="h-8 pl-8 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search timeline"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select aria-label="Date range" className={selectClass} value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                {TIMELINE_DATE_RANGES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <select aria-label="User" className={selectClass} value={user} onChange={(e) => setUser(e.target.value)}>
                {TIMELINE_FILTER_USERS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
              <select aria-label="Department" className={selectClass} value={department} onChange={(e) => setDepartment(e.target.value)}>
                {TIMELINE_FILTER_DEPARTMENTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
              <select aria-label="Module" className={selectClass} value={module} onChange={(e) => setModule(e.target.value)}>
                {TIMELINE_FILTER_MODULES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select aria-label="Activity type" className={selectClass} value={activityType} onChange={(e) => setActivityType(e.target.value)}>
                {TIMELINE_FILTER_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <select aria-label="Priority" className={selectClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
                {TIMELINE_FILTER_PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={unreadOnly ? "default" : "outline"}
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => setUnreadOnly(!unreadOnly)}
              >
                Unread ({stats.unread})
              </Button>
              <Button
                type="button"
                variant={pinnedOnly ? "default" : "outline"}
                size="sm"
                className="h-7 gap-1 text-[11px]"
                onClick={() => setPinnedOnly(!pinnedOnly)}
              >
                <Pin className="h-3 w-3" aria-hidden />
                Pinned ({stats.pinned})
              </Button>
            </div>
          </div>
        </section>

        {/* View content */}
        {viewMode === "ai" ? (
          <TimelineAiSummaryPanel summary={GLOBAL_TIMELINE_AI_SUMMARY} />
        ) : viewMode === "grouped" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["date", "module", "user", "department", "type"] as const).map((g) => (
                <Button
                  key={g}
                  type="button"
                  variant={groupBy === g ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-[11px] capitalize"
                  onClick={() => setGroupBy(g)}
                >
                  Group by {g}
                </Button>
              ))}
            </div>
            {grouped.map((group) => (
              <section key={group.key}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label} ({group.items.length})
                </h2>
                <div className="space-y-2">
                  {group.items.map((item) => (
                    <TimelineCard key={item.id} activity={item} onClick={() => openActivity(item.id)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : viewMode === "audit" ? (
          <div className="space-y-2">
            {filtered.map((item) => (
              <TimelineCard key={item.id} activity={item} audit onClick={() => openActivity(item.id)} />
            ))}
          </div>
        ) : (
          <div className="space-y-2" role="feed">
            {filtered.length === 0 ? (
              <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
                No activities match your filters.
              </div>
            ) : (
              filtered.map((item) => (
                <TimelineCard key={item.id} activity={item} onClick={() => openActivity(item.id)} />
              ))
            )}
          </div>
        )}
      </div>

      {/* ZONE C — Context panel (desktop) */}
      <aside className="hidden w-64 shrink-0 space-y-4 lg:block">
        <div className="rounded-lg border border-input bg-card p-4">
          <h2 className="text-sm font-semibold">Statistics</h2>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Showing</dt>
              <dd className="font-medium tabular-nums">{stats.total}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Unread</dt>
              <dd className="font-medium tabular-nums">{stats.unread}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Pinned</dt>
              <dd className="font-medium tabular-nums">{stats.pinned}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Modules</dt>
              <dd className="font-medium tabular-nums">{stats.modules}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900 dark:bg-violet-950/20">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" aria-hidden />
            <h2 className="text-sm font-semibold">AI Insights</h2>
          </div>
          <p className="mt-2 line-clamp-4 text-xs text-muted-foreground">
            {GLOBAL_TIMELINE_AI_SUMMARY.dailySummary}
          </p>
          <Button type="button" variant="ghost" className="mt-2 h-auto p-0 text-xs text-primary hover:bg-transparent hover:underline" onClick={() => setViewMode("ai")}>
            View full AI summary →
          </Button>
        </div>
      </aside>

      {/* ZONE D — Detail drawer */}
      <TimelineDetailSheet open={!!activityId && !!activity} onOpenChange={closeActivity} activity={activity ?? null} />
    </div>
  );
}

export function GlobalActivityTimeline() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading timeline…</div>}>
      <GlobalActivityTimelineContent />
    </Suspense>
  );
}
