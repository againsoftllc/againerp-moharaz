"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { useActivityStore } from "@/lib/store/activity-store";
import { useNotificationStore } from "@/lib/store/notification-store";
import { formatTimeAgo } from "@/lib/utils";

export function NotificationCenter() {
  const user = useAdminAuth((s) => s.user);
  const openDrawer = useActivityStore((s) => s.openDrawer);
  const allNotifications = useNotificationStore((s) => s.notifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const notifications = useMemo(
    () => (user ? allNotifications.filter((n) => n.recipientUserId === user.id) : []),
    [allNotifications, user],
  );
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const preview = notifications.slice(0, 5);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 shrink-0"
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell className="h-4 w-4" aria-hidden />
          {unreadCount > 0 ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-medium text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {preview.length === 0 ? (
          <DropdownMenuItem disabled className="py-3 text-xs text-muted-foreground">
            No notifications yet
          </DropdownMenuItem>
        ) : (
          preview.map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="flex cursor-pointer flex-col items-start gap-0.5 py-2"
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
              <span className={`text-sm ${item.read ? "font-medium" : "font-semibold"}`}>
                {item.title}
              </span>
              <span className="line-clamp-2 text-[11px] text-muted-foreground">{item.body}</span>
              <span className="text-[10px] text-muted-foreground">
                {formatTimeAgo(item.at)}
                {item.meta ? ` · ${item.meta}` : ""}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/notifications" className="w-full cursor-pointer">
            View all notifications
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
