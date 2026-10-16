"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  MessageSquare,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import type { TimelineActivity } from "@/lib/timeline/types";
import {
  TimelineActivityIcon,
  TimelineModuleChip,
  TimelinePriorityBadge,
  TimelineSourceChip,
  activityTypeLabel,
} from "@/components/timeline/timeline-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = {
  activity: TimelineActivity;
  onClose: () => void;
};

/** CMP-TML-DETAIL-001 — Activity detail drawer content */
export function TimelineDetailContent({ activity, onClose }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border/60 px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <TimelineActivityIcon type={activity.activityType} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{activity.title}</h2>
                <TimelineModuleChip module={activity.module} />
                <TimelinePriorityBadge priority={activity.priority} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{activity.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {activity.user} · {activity.department} · {activity.timestamp}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <TimelineSourceChip source={activity.source} />
                <Badge variant="outline" className="text-[9px] capitalize">
                  {activityTypeLabel(activity.activityType)}
                </Badge>
                {activity.immutable ? (
                  <Badge variant="outline" className="text-[9px]">
                    Immutable record
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Change history */}
        {activity.fieldChanges && activity.fieldChanges.length > 0 ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Change History</h3>
            <div className="overflow-x-auto rounded-lg border border-input">
              <table className="w-full min-w-[320px] text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Field</th>
                    <th className="px-3 py-2 font-medium">Before</th>
                    <th className="px-3 py-2 font-medium">After</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.fieldChanges.map((fc) => (
                    <tr key={fc.field} className="border-b border-border/40">
                      <td className="px-3 py-2 font-medium">{fc.label}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {fc.masked ? "••••" : fc.before}
                      </td>
                      <td className="px-3 py-2 font-medium text-emerald-700 dark:text-emerald-400">
                        {fc.masked ? "••••" : fc.after}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {/* Approval references */}
        {activity.approvalRef ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Approval References</h3>
            <Link
              href={activity.approvalRef.href}
              className="flex items-center gap-2 rounded-lg border border-input px-3 py-2 hover:bg-muted/50"
            >
              <CheckCircle2 className="h-4 w-4 text-amber-600" aria-hidden />
              <div>
                <p className="font-mono text-xs font-medium">{activity.approvalRef.requestId}</p>
                <p className="text-[11px] capitalize text-muted-foreground">{activity.approvalRef.status}</p>
              </div>
              <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            </Link>
          </section>
        ) : null}

        {/* Attachments */}
        {activity.attachments && activity.attachments.length > 0 ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Attachments</h3>
            <ul className="space-y-2">
              {activity.attachments.map((att) => (
                <li
                  key={att.id}
                  className="flex items-center justify-between rounded-lg border border-input px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <div>
                      <p className="text-sm font-medium">{att.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {att.type} · {att.size}
                      </p>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled>
                    <Download className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Comments */}
        {activity.comments && activity.comments.length > 0 ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Comments</h3>
            <ul className="space-y-2">
              {activity.comments.map((c) => (
                <li key={c.id} className="rounded-lg border border-input px-3 py-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    <span className="text-xs font-medium">{c.author}</span>
                    <span className="text-[10px] text-muted-foreground">{c.at}</span>
                  </div>
                  <p className="mt-1 text-sm">{c.body}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Related records */}
        {activity.relatedRecords.length > 0 ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Related Records</h3>
            <div className="flex flex-wrap gap-2">
              {activity.relatedRecords.map((rec) => (
                <Link
                  key={rec.id}
                  href={rec.href}
                  className="rounded-md border border-input px-2.5 py-1.5 text-xs hover:bg-muted/50"
                >
                  <span className="text-[10px] text-muted-foreground">{rec.type}</span>
                  <p className="font-medium">{rec.label}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* Audit metadata */}
        {activity.auditMeta ? (
          <section className="rounded-lg border border-dashed border-input bg-muted/20 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audit data</h3>
            <dl className="mt-2 space-y-1 font-mono text-[10px] text-muted-foreground">
              {activity.auditMeta.correlationId ? (
                <div>
                  <dt className="inline">Correlation: </dt>
                  <dd className="inline">{activity.auditMeta.correlationId}</dd>
                </div>
              ) : null}
              {activity.auditMeta.ipAddress ? (
                <div>
                  <dt className="inline">IP: </dt>
                  <dd className="inline">{activity.auditMeta.ipAddress}</dd>
                </div>
              ) : null}
              {activity.auditMeta.tier ? (
                <div>
                  <dt className="inline">Audit tier: </dt>
                  <dd className="inline">{activity.auditMeta.tier}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}
      </div>
    </div>
  );
}
