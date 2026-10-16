"use client";

import { useCallback } from "react";
import type { WidgetSlotConfig } from "@/lib/dashboard/types";
import { moduleLayout } from "@/lib/dashboard/layouts";
import {
  moduleActivities,
  moduleAiSuggestions,
  moduleCharts,
  moduleKpis,
  moduleReportShortcuts,
  moduleTableColumns,
  moduleTableRows,
  moduleTasks,
} from "@/lib/mock-data/dashboard/module";
import { DashboardLayoutEngine } from "./layout/dashboard-layout-engine";
import { MobileDashboard } from "./layout/mobile-dashboard";
import {
  ActivityWidget,
  AiWidget,
  ChartWidget,
  KpiWidget,
  QuickActionsWidget,
  TableWidget,
  TasksWidget,
  WidgetChrome,
} from "./widgets";

type Props = {
  moduleName?: string;
};

/** Module dashboard — tpl.module.standard */
export function ModuleDashboard({ moduleName = "Sales & CRM" }: Props) {
  const renderSlot = useCallback((slot: WidgetSlotConfig) => {
    switch (slot.widgetId) {
      case "module.kpi-row":
        return (
          <WidgetChrome title={slot.title} widgetId={slot.widgetId}>
            <KpiWidget items={moduleKpis} />
          </WidgetChrome>
        );
      case "module.chart-main":
        return (
          <WidgetChrome title={moduleCharts[0].title} widgetId={slot.widgetId}>
            <ChartWidget chart={moduleCharts[0]} />
          </WidgetChrome>
        );
      case "module.chart-funnel":
        return (
          <WidgetChrome title={moduleCharts[1].title} widgetId={slot.widgetId}>
            <ChartWidget chart={moduleCharts[1]} height={160} />
          </WidgetChrome>
        );
      case "module.reports":
        return (
          <WidgetChrome title={slot.title} widgetId={slot.widgetId}>
            <QuickActionsWidget actions={moduleReportShortcuts} />
            <div className="mt-3">
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">Top deals</p>
              <TableWidget columns={moduleTableColumns} rows={moduleTableRows} maxRows={4} />
            </div>
          </WidgetChrome>
        );
      case "module.activities":
        return (
          <WidgetChrome title={slot.title} widgetId={slot.widgetId}>
            <ActivityWidget items={moduleActivities} />
          </WidgetChrome>
        );
      case "module.tasks":
        return (
          <WidgetChrome title={slot.title} widgetId={slot.widgetId}>
            <TasksWidget tasks={moduleTasks} />
          </WidgetChrome>
        );
      case "module.ai":
        return (
          <WidgetChrome title={slot.title} widgetId={slot.widgetId}>
            <AiWidget briefing={moduleAiSuggestions} />
          </WidgetChrome>
        );
      default:
        return null;
    }
  }, []);

  return (
    <>
      <div className="hidden lg:block">
        <DashboardLayoutEngine
          layout={moduleLayout}
          title={`${moduleName} Dashboard`}
          subtitle="Module KPIs · charts · tasks · AI suggestions"
          renderSlot={renderSlot}
          storageKey="module-dashboard"
        />
      </div>
      <MobileDashboard
        kpis={moduleKpis}
        tasks={moduleTasks}
        activities={moduleActivities}
        aiBriefing={moduleAiSuggestions}
        title={`${moduleName} Dashboard`}
      />
    </>
  );
}
