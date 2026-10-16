"use client";

import { useCallback } from "react";
import type { WidgetSlotConfig } from "@/lib/dashboard/types";
import { workspaceLayout } from "@/lib/dashboard/layouts";
import {
  workspaceActivities,
  workspaceAiBriefing,
  workspaceKpis,
  workspaceNotifications,
  workspaceQuickActions,
} from "@/lib/mock-data/dashboard/workspace";
import { DashboardLayoutEngine } from "./layout/dashboard-layout-engine";
import { MobileDashboard } from "./layout/mobile-dashboard";
import { WelcomeArea } from "./welcome-area";
import {
  ActivityWidget,
  AiWidget,
  AlertWidget,
  KpiWidget,
  QuickActionsWidget,
  WidgetChrome,
} from "./widgets";

/** Workspace dashboard — `/home` · tpl.workspace.home */
export function WorkspaceDashboard() {
  const renderSlot = useCallback((slot: WidgetSlotConfig) => {
    switch (slot.widgetId) {
      case "workspace.kpi-row":
        return (
          <WidgetChrome title={slot.title} widgetId={slot.widgetId}>
            <KpiWidget items={workspaceKpis} />
          </WidgetChrome>
        );
      case "workspace.quick-actions":
        return (
          <WidgetChrome title={slot.title} widgetId={slot.widgetId}>
            <QuickActionsWidget actions={workspaceQuickActions} />
          </WidgetChrome>
        );
      case "workspace.notifications":
        return (
          <WidgetChrome title={slot.title} widgetId={slot.widgetId}>
            <AlertWidget items={workspaceNotifications} viewAllHref="/notifications" />
          </WidgetChrome>
        );
      case "workspace.ai-brief":
        return (
          <WidgetChrome title={slot.title} widgetId={slot.widgetId}>
            <AiWidget briefing={workspaceAiBriefing} />
          </WidgetChrome>
        );
      case "workspace.activities":
        return (
          <WidgetChrome title={slot.title} widgetId={slot.widgetId}>
            <ActivityWidget items={workspaceActivities} viewAllHref="/inbox/approvals" />
          </WidgetChrome>
        );
      default:
        return null;
    }
  }, []);

  return (
    <>
      <WelcomeArea />
      <div className="hidden lg:block">
        <DashboardLayoutEngine
          layout={workspaceLayout}
          title="Workspace Home"
          subtitle="Cross-module summary · mock data"
          welcome={null}
          renderSlot={renderSlot}
          storageKey="workspace-home"
        />
      </div>
      <MobileDashboard
        kpis={workspaceKpis}
        activities={workspaceActivities}
        aiBriefing={workspaceAiBriefing}
        title="Workspace Home"
      />
      <div className="hidden lg:block">
        <p className="mt-2 text-[10px] text-muted-foreground">
          Prototype · WS-CONTENT-DASH · platform widget engine · mock data only
        </p>
      </div>
    </>
  );
}
