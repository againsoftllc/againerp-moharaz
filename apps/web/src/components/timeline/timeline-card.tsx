"use client";

import Link from "next/link";
import { Pin, PinOff } from "lucide-react";
import type { TimelineActivity } from "@/lib/timeline/types";
import {
  TimelineActivityIcon,
  TimelineModuleChip,
  TimelinePriorityBadge,
  TimelineSourceChip,
  activityTypeLabel,
  timelinePriorityBorder,
} from "@/components/timeline/timeline-utils";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  activity: TimelineActivity;
  onClick?: () => void;
  compact?: boolean;
  audit?: boolean;
};

/** CMP-TML-CARD-001 — Timeline event card */
export function TimelineCard({ activity, onClick, compact, audit }: Props) {
  const content = (
    <>
      <div className="flex items-start gap-3">
        <TimelineActivityIcon type={activity.activityType} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {activity.unread ? (
                <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label="Unread" />
              ) : null}
              {activity.pinned ? <Pin className="h-3 w-3 shrink-0 text-amber-500" aria-label="Pinned" /> : null}
              <h3 className={cn("font-semibold", compact ? "text-xs" : "text-sm")}>{activity.title}</h3>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] text-muted-foreground">{activity.relativeTime}</p>
              {!compact ? <p className="text-[10px] text-muted-foreground">{activity.timestamp}</p> : null}
            </div>
          </div>

          {!compact ? <p className="mt-1 text-xs text-muted-foreground">{activity.description}</p> : null}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium">{activity.user}</span>
            <span className="text-[10px] text-muted-foreground">· {activity.department}</span>
            <TimelineModuleChip module={activity.module} />
            <TimelineSourceChip source={activity.source} />
            <TimelinePriorityBadge priority={activity.priority} />
            {activity.immutable ? (
              <Badge variant="outline" className="text-[9px]">
                Immutable
              </Badge>
            ) : null}
            <Badge variant="outline" className="text-[9px] capitalize">
              {activityTypeLabel(activity.activityType)}
            </Badge>
          </div>

          {activity.relatedRecords.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {activity.relatedRecords.map((rec) => (
                <Link
                  key={rec.id}
                  href={rec.href}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded border border-input bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium hover:bg-muted"
                >
                  {rec.label} →
                </Link>
              ))}
            </div>
          ) : null}

          {audit && activity.fieldChanges && activity.fieldChanges.length > 0 ? (
            <div className="mt-2 overflow-x-auto rounded border border-input">
              <table className="w-full min-w-[280px] text-[10px]">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                    <th className="px-2 py-1 font-medium">Field</th>
                    <th className="px-2 py-1 font-medium">Before</th>
                    <th className="px-2 py-1 font-medium">After</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.fieldChanges.map((fc) => (
                    <tr key={fc.field} className="border-b border-border/40">
                      <td className="px-2 py-1">{fc.label}</td>
                      <td className="px-2 py-1 text-muted-foreground line-through">{fc.before}</td>
                      <td className="px-2 py-1 font-medium text-emerald-700 dark:text-emerald-400">{fc.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {audit && activity.auditMeta ? (
            <p className="mt-2 font-mono text-[9px] text-muted-foreground">
              {activity.auditMeta.correlationId ? `corr: ${activity.auditMeta.correlationId}` : ""}
              {activity.auditMeta.ipAddress ? ` · IP: ${activity.auditMeta.ipAddress}` : ""}
              {activity.auditMeta.tier ? ` · tier: ${activity.auditMeta.tier}` : ""}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );

  const className = cn(
    "rounded-lg border border-input bg-card p-3 transition-colors",
    timelinePriorityBorder(activity.priority, activity.highlighted),
    activity.unread && "bg-blue-50/30 dark:bg-blue-950/10",
    onClick && "cursor-pointer hover:border-primary/30 hover:bg-accent/20",
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(className, "w-full text-left")}>
        {content}
      </button>
    );
  }

  return <article className={className}>{content}</article>;
}

export function TimelinePinnedMarker({ pinned }: { pinned?: boolean }) {
  if (!pinned) return <PinOff className="h-3 w-3 text-muted-foreground/40" aria-hidden />;
  return <Pin className="h-3 w-3 text-amber-500" aria-hidden />;
}
