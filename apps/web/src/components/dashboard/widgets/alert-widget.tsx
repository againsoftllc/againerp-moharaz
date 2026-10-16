"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AlertItem } from "@/lib/dashboard/types";

const severityStyles = {
  info: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30",
  warning: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30",
  danger: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
  success: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30",
};

const severityIcon = {
  info: Info,
  warning: AlertTriangle,
  danger: XCircle,
  success: CheckCircle2,
};

type Props = {
  items: AlertItem[];
  maxItems?: number;
  viewAllHref?: string;
};

/** DS-ALERT-* widget — warnings · approvals · risk flags. */
export function AlertWidget({ items, maxItems = 5, viewAllHref }: Props) {
  const visible = items.slice(0, maxItems);

  return (
    <ul data-component="DS-ALERT-WIDGET" className="space-y-2">
      {visible.map((item) => {
        const Icon = severityIcon[item.severity];
        const content = (
          <div className={cn("flex gap-2 rounded-md border px-2.5 py-2 text-xs", severityStyles[item.severity])}>
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium">{item.title}</p>
              <p className="text-muted-foreground">{item.message}</p>
            </div>
          </div>
        );

        return (
          <li key={item.id}>
            {item.href ? (
              <Link href={item.href} className="block transition-opacity hover:opacity-90">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
      {viewAllHref ? (
        <li>
          <Link href={viewAllHref} className="text-[11px] text-primary hover:underline">
            View all notifications
          </Link>
        </li>
      ) : null}
    </ul>
  );
}
