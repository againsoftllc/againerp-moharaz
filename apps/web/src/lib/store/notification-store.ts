"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ActivityEntityType } from "@/lib/activity/types";

export type AdminNotification = {
  id: string;
  type: "mention" | "system";
  title: string;
  body: string;
  meta?: string;
  recipientUserId: string;
  actorUserId?: string;
  actorName?: string;
  entityType?: ActivityEntityType;
  entityId?: string;
  entityLabel?: string;
  commentId?: string;
  read: boolean;
  at: string;
};

type MentionNotificationInput = {
  mentionedUserIds: string[];
  actorUserId: string;
  actorName: string;
  entityType: ActivityEntityType;
  entityId: string;
  entityLabel: string;
  commentId: string;
  commentPreview: string;
};

type NotificationStore = {
  notifications: AdminNotification[];
  notifyMentions: (input: MentionNotificationInput) => void;
  markRead: (id: string) => void;
  markAllRead: (userId: string) => void;
  unreadCountForUser: (userId: string) => number;
  notificationsForUser: (userId: string) => AdminNotification[];
};

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set, get) => ({
      notifications: [],

      notifyMentions: ({
        mentionedUserIds,
        actorUserId,
        actorName,
        entityType,
        entityId,
        entityLabel,
        commentId,
        commentPreview,
      }) => {
        const at = new Date().toISOString();
        const preview =
          commentPreview.length > 120 ? `${commentPreview.slice(0, 117)}…` : commentPreview;

        const next = mentionedUserIds
          .filter((userId) => userId && userId !== actorUserId)
          .map((recipientUserId) => ({
            id: `ntf_${Date.now()}_${recipientUserId}_${Math.random().toString(36).slice(2, 7)}`,
            type: "mention" as const,
            title: `${actorName} mentioned you`,
            body: preview,
            meta: entityLabel,
            recipientUserId,
            actorUserId,
            actorName,
            entityType,
            entityId,
            entityLabel,
            commentId,
            read: false,
            at,
          }));

        if (next.length === 0) return;
        set((s) => ({ notifications: [...next, ...s.notifications] }));
      },

      markRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),

      markAllRead: (userId) =>
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.recipientUserId === userId ? { ...n, read: true } : n,
          ),
        })),

      unreadCountForUser: (userId) =>
        get().notifications.filter((n) => n.recipientUserId === userId && !n.read).length,

      notificationsForUser: (userId) =>
        get()
          .notifications.filter((n) => n.recipientUserId === userId)
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    }),
    { name: "againerp-notifications" },
  ),
);
