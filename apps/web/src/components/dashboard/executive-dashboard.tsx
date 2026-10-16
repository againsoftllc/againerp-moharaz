"use client";

import { useCallback } from "react";
import type { WidgetSlotConfig } from "@/lib/dashboard/types";
import { executiveLayout } from "@/lib/dashboard/layouts";
import {
  executiveAiSummary,
  executiveFinanceKpis,
  executiveHrKpis,
  executiveHrTable,
  executiveInventoryKpis,
  executiveInventoryTable,
  executiveMarketingChart,
  executiveMarketingKpis,
  executiveRevenueChart,
  executiveRevenueKpis,
  executiveSalesKpis,
} from "@/lib/mock-data/dashboard/executive";
import { DashboardLayoutEngine } from "./layout/dashboard-layout-engine";
import { MobileDashboard } from "./layout/mobile-dashboard";
import {
  AiWidget,
  ChartWidget,
  KpiWidget,
  TableWidget,
  WidgetChrome,
} from "./widgets";

const execKpiSections = [
  { id: "exec.revenue", title: "Revenue", kpis: executiveRevenueKpis },
  { id: "exec.sales", title: "Sales", kpis: executiveSalesKpis },
  { id: "exec.inventory", title: "Inventory", kpis: executiveInventoryKpis },
  { id: "exec.finance", title: "Finance", kpis: executiveFinanceKpis },
  { id: "exec.hr", title: "HR", kpis: executiveHrKpis },
] as const;

/** Executive dashboard — tpl.executive.standard */
export function ExecutiveDashboard() {
  const renderSlot = useCallback((slot: WidgetSlotConfig) => {
    const kpiSection = execKpiSections.find((s) => s.id === slot.widgetId);
    if (kpiSection) {
      return (
        <WidgetChrome title={kpiSection.title} widgetId={slot.widgetId}>
          <KpiWidget items={kpiSection.kpis} compact />
          {slot.widgetId === "exec.inventory" ? (
            <div className="mt-2">
              <TableWidget
                columns={executiveInventoryTable.columns}
                rows={executiveInventoryTable.rows}
                maxRows={3}
              />
            </div>
          ) : null}
          {slot.widgetId === "exec.hr" ? (
            <div className="mt-2">
              <TableWidget columns={executiveHrTable.columns} rows={executiveHrTable.rows} maxRows={3} />
            </div>
          ) : null}
        </WidgetChrome>
      );
    }

    switch (slot.widgetId) {
      case "exec.revenue-chart":
        return (
          <WidgetChrome title={executiveRevenueChart.title} widgetId={slot.widgetId}>
            <ChartWidget chart={executiveRevenueChart} />
          </WidgetChrome>
        );
      case "exec.marketing":
        return (
          <WidgetChrome title="Marketing" widgetId={slot.widgetId}>
            <KpiWidget items={executiveMarketingKpis} compact className="mb-2" />
            <ChartWidget chart={executiveMarketingChart} height={140} />
          </WidgetChrome>
        );
      case "exec.ai-summary":
        return (
          <WidgetChrome title={slot.title} widgetId={slot.widgetId}>
            <AiWidget briefing={executiveAiSummary} />
          </WidgetChrome>
        );
      default:
        return null;
    }
  }, []);

  const mobileKpis = [
    ...executiveRevenueKpis,
    ...executiveSalesKpis,
    ...executiveInventoryKpis.slice(0, 1),
    ...executiveFinanceKpis.slice(0, 1),
  ];

  return (
    <>
      <div className="hidden lg:block">
        <DashboardLayoutEngine
          layout={executiveLayout}
          title="Executive Dashboard"
          subtitle="Cross-module consolidated metrics · platform aggregation (mock)"
          renderSlot={renderSlot}
          storageKey="executive-dashboard"
        />
      </div>
      <MobileDashboard
        kpis={mobileKpis}
        aiBriefing={executiveAiSummary}
        title="Executive Dashboard"
      />
    </>
  );
}
