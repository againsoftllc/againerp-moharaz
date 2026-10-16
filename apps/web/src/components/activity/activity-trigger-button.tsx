"use client";

import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActivityStore } from "@/lib/store/activity-store";
import type { ActivityEntityRef } from "@/lib/activity/types";
import { cn } from "@/lib/utils";

type Props = {
  entity: ActivityEntityRef;
  className?: string;
  size?: "sm" | "default";
  onClick?: (e: React.MouseEvent) => void;
};

export function ActivityTriggerButton({ entity, className, size = "sm", onClick }: Props) {
  const openDrawer = useActivityStore((s) => s.openDrawer);

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      title="Activity & Chatter"
      aria-label="Activity & Chatter"
      className={cn("h-7 w-7 p-0 text-muted-foreground hover:text-foreground", className)}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
        openDrawer(entity);
      }}
    >
      <ClipboardList className="h-4 w-4" />
    </Button>
  );
}
