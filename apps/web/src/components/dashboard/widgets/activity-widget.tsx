"use client";

import Link from "next/link";
import type { ActivityItem } from "@/lib/dashboard/types";

type Props = {
  items: ActivityItem[];
  maxItems?: number;
  viewAllHref?: string;
};

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** DS-ACTIVITY-FEED — timeline stream. */
export function ActivityWidget({ items, maxItems = 5, viewAllHref }: Props) {
  const visible = items.slice(0, maxItems);

  return (
    <ul data-component="DS-ACTIVITY-FEED" className="space-y-2">
      {visible.map((item) => (
        <li key={item.id} className="flex gap-2 rounded-md border border-border/50 bg-background/50 p-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium"
            aria-hidden
          >
            {initials(item.user)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs">
              <span className="font-medium">{item.user}</span>{" "}
              <span className="text-muted-foreground">{item.action}</span>
            </p>
            <p className="text-[10px] text-muted-foreground">{item.time}</p>
          </div>
        </li>
      ))}
      {viewAllHref && items.length > maxItems ? (
        <li>
          <Link href={viewAllHref} className="text-[11px] text-primary hover:underline">
            View all activity
          </Link>
        </li>
      ) : null}
    </ul>
  );
}
