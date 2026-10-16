"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { QuickAction, TaskItem } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

type QuickProps = {
  actions: QuickAction[];
  vertical?: boolean;
};

/** Quick action button group — matches WS-HEADER-QUICK routes. */
export function QuickActionsWidget({ actions, vertical = true }: QuickProps) {
  return (
    <div
      data-component="DS-QUICK-ACTIONS"
      className={cn(vertical ? "flex flex-col gap-1.5" : "flex flex-wrap gap-2")}
    >
      {actions.map((action) => (
        <Button
          key={action.id}
          asChild
          variant="outline"
          size="sm"
          className={cn("min-h-11 justify-start", !vertical && "flex-1 sm:flex-none")}
        >
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ))}
    </div>
  );
}

const priorityClass = {
  low: "text-muted-foreground",
  medium: "text-amber-600 dark:text-amber-400",
  high: "text-red-600 dark:text-red-400",
};

type TaskProps = {
  tasks: TaskItem[];
  maxItems?: number;
};

export function TasksWidget({ tasks, maxItems = 4 }: TaskProps) {
  return (
    <ul className="space-y-2">
      {tasks.slice(0, maxItems).map((task) => (
        <li key={task.id} className="flex items-start justify-between gap-2 rounded-md border px-2.5 py-2 text-xs">
          <span className="font-medium">{task.title}</span>
          <span className={cn("shrink-0 capitalize", priorityClass[task.priority])}>{task.due}</span>
        </li>
      ))}
    </ul>
  );
}
