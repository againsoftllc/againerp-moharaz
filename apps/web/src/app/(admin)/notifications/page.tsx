"use client";

import { useMemo } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { useActivityStore } from "@/lib/store/activity-store";
import { useNotificationStore } from "@/lib/store/notification-store";
import { cn, formatTimeAgo } from "@/lib/utils";

export default function NotificationsPage() {
  const user = useAdminAuth((s) => s.user);
  const openDrawer = useActivityStore((s) => s.openDrawer);
  const allNotifications = useNotificationStore((s) => s.notifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const notifications = useMemo(
    () =>
      user
        ? [...allNotifications]
            .filter((n) => n.recipientUserId === user.id)
            .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        : [],
    [allNotifications, user],
  );
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  return (
    <div className="flex min-h-[calc(100vh-2.75rem-1.5rem)] flex-col lg:min-h-[calc(100vh-2.75rem-2rem)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
            Mentions, order alerts, and store activity for your account.
          </p>
        </div>
        {user && unreadCount > 0 ? (
          <Button variant="outline" size="sm" onClick={() => markAllRead(user.id)}>
            Mark all read
          </Button>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {notifications.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
            <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No notifications yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              When someone mentions you in a comment, it will show up here.
            </p>
          </div>
        ) : (
          notifications.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/30",
                item.read ? "border-border" : "border-primary/30 bg-primary/5",
              )}
              onClick={() => {
                markRead(item.id);
                if (item.entityType && item.entityId && item.entityLabel) {
                  openDrawer({
                    type: item.entityType,
                    id: item.entityId,
                    label: item.entityLabel,
                  });
                }
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className={cn("text-sm", item.read ? "font-medium" : "font-semibold")}>
                  {item.title}
                </p>
                {!item.read ? (
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {formatTimeAgo(item.at)}
                {item.meta ? ` · ${item.meta}` : ""}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
