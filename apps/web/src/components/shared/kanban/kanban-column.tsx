"use client";

import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type KanbanColumnProps = {
  id: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  isOver?: boolean;
};

export function KanbanColumn({ id, title, subtitle, children, className }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-w-[220px] max-w-[260px] flex-1 flex-col rounded-lg border border-input bg-muted/20 transition-colors",
        isOver && "border-primary/50 bg-primary/5 ring-2 ring-primary/20",
        className,
      )}
    >
      <header className="shrink-0 border-b border-border/60 px-3 py-2">
        <h3 className="text-xs font-semibold">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">{subtitle}</p> : null}
      </header>
      <div className="flex max-h-[min(560px,60vh)] flex-1 flex-col gap-2 overflow-y-auto p-2">{children}</div>
    </div>
  );
}
