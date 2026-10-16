"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store/app-store";
import type { ActivityItem, AiBriefing, KpiData, TaskItem } from "@/lib/dashboard/types";
import { KpiWidget } from "../widgets/kpi-widget";
import { ActivityWidget } from "../widgets/activity-widget";
import { AiWidget } from "../widgets/ai-widget";
import { TasksWidget } from "../widgets/quick-actions-widget";

type Props = {
  kpis: KpiData[];
  tasks?: TaskItem[];
  activities?: ActivityItem[];
  aiBriefing?: AiBriefing;
  title?: string;
};

/** Mobile-first stacked dashboard — KPI · Tasks · Activities · AI. */
export function MobileDashboard({ kpis, tasks, activities, aiBriefing, title = "Dashboard" }: Props) {
  const setAiDrawerOpen = useAppStore((s) => s.setAiDrawerOpen);

  return (
    <div className="space-y-4 lg:hidden" data-layout="LAYOUT-DASHBOARD-MOBILE">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-xs text-muted-foreground">Mobile priority stack</p>
      </div>
      <section aria-label="Key metrics">
        <KpiWidget items={kpis.slice(0, 4)} compact />
      </section>
      {tasks && tasks.length > 0 ? (
        <section className="rounded-lg border bg-card p-3" aria-label="Tasks">
          <h3 className="mb-2 text-xs font-medium">Tasks</h3>
          <TasksWidget tasks={tasks} maxItems={3} />
        </section>
      ) : null}
      {activities && activities.length > 0 ? (
        <section className="rounded-lg border bg-card p-3" aria-label="Recent activity">
          <h3 className="mb-2 text-xs font-medium">Recent Activities</h3>
          <ActivityWidget items={activities} maxItems={3} />
        </section>
      ) : null}
      {aiBriefing ? (
        <section className="rounded-lg border bg-card p-3" aria-label="AI assistant">
          <AiWidget briefing={aiBriefing} />
          <Button
            type="button"
            size="sm"
            className="mt-3 w-full min-h-11 gap-2"
            onClick={() => setAiDrawerOpen(true)}
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Open AI Assistant
          </Button>
        </section>
      ) : null}
    </div>
  );
}
