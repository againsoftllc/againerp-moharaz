"use client";

import { useMemo } from "react";
import { Bell, MessageSquare } from "lucide-react";
import {
  CUSTOMER_STATUS_LABELS,
  type Customer,
  type CustomerComment,
  type CustomerStatus,
  type CustomerTimelineEvent,
} from "@/lib/mock-data/customers";
import { cn, formatTimeAgo } from "@/lib/utils";

type Props = {
  customers: Customer[];
  loading?: boolean;
  listFilter?: "all" | CustomerStatus;
  searchQuery?: string;
  onOpenCustomer?: (customer: Customer) => void;
  className?: string;
};

type FeedItem =
  | {
      id: string;
      at: string;
      kind: "timeline";
      customer: Customer;
      event: CustomerTimelineEvent;
    }
  | {
      id: string;
      at: string;
      kind: "comment";
      customer: Customer;
      comment: CustomerComment;
    }
  | {
      id: string;
      at: string;
      kind: "activity";
      customer: Customer;
      title: string;
      assignee?: string;
      status: string;
    };

function matchesFilter(customer: Customer, listFilter: Props["listFilter"], searchQuery?: string) {
  if (listFilter && listFilter !== "all" && customer.status !== listFilter) return false;
  if (!searchQuery?.trim()) return true;
  const q = searchQuery.trim().toLowerCase();
  return (
    customer.name.toLowerCase().includes(q) ||
    customer.phone.toLowerCase().includes(q) ||
    customer.email.toLowerCase().includes(q) ||
    customer.customerId.toLowerCase().includes(q) ||
    customer.city.toLowerCase().includes(q)
  );
}

function timelineEmoji(type: CustomerTimelineEvent["type"]) {
  switch (type) {
    case "registered":
      return "🎉";
    case "order":
      return "🛒";
    case "return":
      return "↩️";
    case "wallet":
      return "💳";
    case "reward":
      return "⭐";
    case "support":
      return "🎧";
    case "marketing":
      return "📣";
    case "note":
      return "📝";
    case "activity":
      return "📋";
    case "status_change":
      return "🔄";
    case "ai":
      return "🤖";
    default:
      return "📌";
  }
}

function buildFeed(customers: Customer[]): FeedItem[] {
  const items: FeedItem[] = [];

  for (const customer of customers) {
    for (const event of customer.timeline ?? []) {
      items.push({
        id: `tl_${customer.id}_${event.id}`,
        at: event.at,
        kind: "timeline",
        customer,
        event,
      });
    }
    for (const comment of customer.comments ?? []) {
      items.push({
        id: `cm_${customer.id}_${comment.id}`,
        at: comment.at,
        kind: "comment",
        customer,
        comment,
      });
    }
    for (const activity of customer.activities ?? []) {
      items.push({
        id: `ac_${customer.id}_${activity.id}`,
        at: activity.dueDate ?? new Date(0).toISOString(),
        kind: "activity",
        customer,
        title: activity.title,
        assignee: activity.assignee,
        status: activity.status,
      });
    }
  }

  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function CustomerActivityFeed({
  customers,
  loading,
  listFilter = "all",
  searchQuery,
  onOpenCustomer,
  className,
}: Props) {
  const filtered = useMemo(
    () => customers.filter((c) => matchesFilter(c, listFilter, searchQuery)),
    [customers, listFilter, searchQuery],
  );

  const feed = useMemo(() => buildFeed(filtered), [filtered]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col bg-background", className)}>
      <div className="shrink-0 border-b border-border px-4 py-2">
        <p className="text-sm font-medium text-foreground">Recent activity</p>
        <p className="text-[11px] text-muted-foreground">
          {feed.length} event{feed.length === 1 ? "" : "s"} across {filtered.length} contact
          {filtered.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading activity…</p>
        ) : feed.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No timeline events yet. Open a customer to add notes or messages.
          </p>
        ) : (
          <div className="mx-auto max-w-3xl space-y-3">
            {feed.map((item) => (
              <article
                key={item.id}
                className="rounded-lg border border-border bg-card p-3 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm">
                    {item.kind === "timeline" ? (
                      timelineEmoji(item.event.type)
                    ) : item.kind === "comment" ? (
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Bell className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <button
                        type="button"
                        onClick={() => onOpenCustomer?.(item.customer)}
                        className="text-[13px] font-semibold text-[#714B67] hover:underline dark:text-[#c4a0bc]"
                      >
                        {item.customer.name}
                      </button>
                      <span className="text-[10px] text-muted-foreground">
                        {item.customer.customerId}
                      </span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[9px] font-medium capitalize",
                          item.customer.status === "active"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : item.customer.status === "vip"
                              ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {CUSTOMER_STATUS_LABELS[item.customer.status]}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatTimeAgo(item.at)}
                      </span>
                    </div>

                    {item.kind === "timeline" ? (
                      <>
                        <p className="mt-1 text-[13px] font-medium text-foreground">
                          {item.event.title}
                        </p>
                        {item.event.description ? (
                          <p className="mt-0.5 text-[12px] text-muted-foreground">
                            {item.event.description}
                          </p>
                        ) : null}
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {item.event.actor}
                        </p>
                      </>
                    ) : null}

                    {item.kind === "comment" ? (
                      <>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[12px] font-medium text-foreground">
                            {item.comment.author}
                          </span>
                          {item.comment.isInternal ? (
                            <span className="rounded bg-yellow-100 px-1 py-0.5 text-[9px] font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                              Internal
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-[12px] text-foreground">
                          {item.comment.body}
                        </p>
                      </>
                    ) : null}

                    {item.kind === "activity" ? (
                      <>
                        <p className="mt-1 text-[13px] font-medium text-foreground">{item.title}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {item.assignee ? `Assigned to ${item.assignee}` : "Unassigned"}
                          {" · "}
                          <span className="capitalize">{item.status}</span>
                        </p>
                      </>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
