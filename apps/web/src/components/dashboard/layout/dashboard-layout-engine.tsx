"use client";

import { useCallback, useState } from "react";
import type { DashboardLayoutConfig, WidgetSlotConfig } from "@/lib/dashboard/types";
import { DashboardGrid } from "./dashboard-grid";
import { DashboardHeader } from "./dashboard-header";

type Props = {
  layout: DashboardLayoutConfig;
  title: string;
  subtitle?: string;
  welcome?: React.ReactNode;
  renderSlot: (slot: WidgetSlotConfig) => React.ReactNode;
  storageKey?: string;
  hideHeader?: boolean;
};

export function DashboardLayoutEngine({
  layout,
  title,
  subtitle,
  welcome,
  renderSlot,
  storageKey,
  hideHeader,
}: Props) {
  const [editMode, setEditMode] = useState(false);
  const [layoutSaved, setLayoutSaved] = useState(() => {
    if (typeof window === "undefined" || !storageKey) return false;
    try {
      return localStorage.getItem(`againerp-dash-layout:${storageKey}`) === "saved";
    } catch {
      return false;
    }
  });
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());

  const handleSaveLayout = useCallback(() => {
    if (storageKey) {
      try {
        localStorage.setItem(`againerp-dash-layout:${storageKey}`, "saved");
      } catch {
        /* ignore */
      }
    }
    setLayoutSaved(true);
    setEditMode(false);
  }, [storageKey]);

  const handleRemoveSlot = useCallback((slotId: string) => {
    setHiddenIds((prev) => new Set(prev).add(slotId));
  }, []);

  const wrappedRender = useCallback(
    (slot: WidgetSlotConfig) => {
      const node = renderSlot(slot);
      if (!editMode) return node;
      return (
        <div className="relative h-full">
          {node}
        </div>
      );
    },
    [editMode, renderSlot],
  );

  return (
    <div className="space-y-4" data-layout="LAYOUT-DASHBOARD">
      {welcome}
      {!hideHeader ? (
        <DashboardHeader
          title={title}
          subtitle={subtitle}
          editMode={editMode}
          layoutSaved={layoutSaved}
          onToggleEdit={() => setEditMode((v) => !v)}
          onSaveLayout={handleSaveLayout}
        />
      ) : null}
      <DashboardGrid
        slots={layout.slots}
        editMode={editMode}
        hiddenSlotIds={hiddenIds}
        renderSlot={(slot) => {
          if (editMode && hiddenIds.has(slot.id)) return null;
          const content = wrappedRender(slot);
          if (editMode) {
            return (
              <div className="group h-full">
                {content}
                <button
                  type="button"
                  className="absolute right-2 top-8 z-20 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => handleRemoveSlot(slot.id)}
                >
                  Remove widget
                </button>
              </div>
            );
          }
          return content;
        }}
      />
      {editMode ? (
        <p className="text-[10px] text-muted-foreground">
          Customize mode — drag handles and resize corners are visual placeholders. Save layout persists a
          prototype flag in localStorage.
        </p>
      ) : null}
    </div>
  );
}
