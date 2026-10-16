"use client";

import { ChevronLeft, Clock, MessageSquare, Paperclip, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAppStore, type UtilityPanelTab } from "@/lib/store/app-store";

const activities = [
  { user: "Sadia", action: "updated price on SKU-0042", time: "5m ago" },
  { user: "Rahim", action: "published 3 products", time: "1h ago" },
  { user: "System", action: "low stock alert: Earbuds", time: "2h ago" },
];

const tabs: { id: UtilityPanelTab; label: string; icon: typeof Clock }[] = [
  { id: "activity", label: "Activity", icon: Clock },
  { id: "comments", label: "Comments", icon: MessageSquare },
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "files", label: "Files", icon: Paperclip },
];

function ActivityPlaceholder() {
  return (
    <div className="space-y-2 p-3">
      {activities.map((a, i) => (
        <div key={i} className="rounded-md border bg-background p-2 text-xs">
          <p className="font-medium">{a.user}</p>
          <p className="text-muted-foreground">{a.action}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{a.time}</p>
        </div>
      ))}
    </div>
  );
}

function UtilityPanelBody({
  tab,
  setTab,
}: {
  tab: UtilityPanelTab;
  setTab: (tab: UtilityPanelTab) => void;
}) {
  return (
    <>
      <div className="flex shrink-0 border-b px-3 py-2">
        <span className="text-xs font-medium">Utility Panel</span>
      </div>
      <div className="flex shrink-0 overflow-x-auto border-b text-[10px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex min-h-11 min-w-[3.25rem] shrink-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2",
              tab === t.id && "border-b-2 border-primary bg-accent/30",
            )}
            aria-selected={tab === t.id}
          >
            <t.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate leading-tight">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "activity" && <ActivityPlaceholder />}
        {(tab === "comments" || tab === "notes" || tab === "files") && (
          <div className="p-4 text-xs text-muted-foreground">No {tab} yet — prototype placeholder.</div>
        )}
      </div>
    </>
  );
}

/** WS-CONTEXT-* — Zone E utility drawer (320px overlay, anchored right). */
export function WorkspaceUtilityPanel() {
  const open = useAppStore((s) => s.utilityPanelOpen);
  const tab = useAppStore((s) => s.utilityPanelTab);
  const setTab = useAppStore((s) => s.setUtilityPanelTab);
  const setOpen = useAppStore((s) => s.setUtilityPanelOpen);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          title="Utility Panel"
          className={cn(
            "flex h-[100dvh] w-full max-w-full flex-row gap-0 p-0 sm:max-w-80",
            "[&>button:last-child]:hidden",
          )}
        >
          <div
            data-zone="E"
            data-component="WS-CONTEXT"
            className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/10"
          >
            <UtilityPanelBody tab={tab} setTab={setTab} />
          </div>

          <button
            type="button"
            aria-label="Close utility panel"
            title="Close"
            onClick={() => setOpen(false)}
            className="flex w-7 shrink-0 touch-manipulation flex-col items-center justify-center border-l border-border bg-muted/30 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted/80 sm:w-6"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </SheetContent>
    </Sheet>
  );
}
