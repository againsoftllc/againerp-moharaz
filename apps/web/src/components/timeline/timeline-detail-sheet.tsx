"use client";

import type { TimelineActivity } from "@/lib/timeline/types";
import { TimelineDetailContent } from "@/components/timeline/timeline-detail-content";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: TimelineActivity | null;
};

export function TimelineDetailSheet({ open, onOpenChange, activity }: Props) {
  if (!activity) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl [&>button.absolute]:hidden"
        aria-describedby={undefined}
      >
        <p className="sr-only">Activity details · {activity.title}</p>
        <TimelineDetailContent activity={activity} onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
