import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ActivityAiAction,
  ActivityApproval,
  ActivityAttachment,
  ActivityComment,
  ActivityEntityRef,
  ActivityEntry,
  ActivityFollower,
  ActivityNote,
  EntityActivityBundle,
} from "@/lib/activity/types";
import {
  filterByEntity,
} from "@/lib/mock-data/activities";
import { useNotificationStore } from "@/lib/store/notification-store";

type ActivityStore = {
  entries: ActivityEntry[];
  comments: ActivityComment[];
  notes: ActivityNote[];
  attachments: ActivityAttachment[];
  followers: ActivityFollower[];
  aiActions: ActivityAiAction[];
  approvals: ActivityApproval[];

  drawerOpen: boolean;
  drawerEntity: ActivityEntityRef | null;

  openDrawer: (entity: ActivityEntityRef) => void;
  closeDrawer: () => void;

  getBundle: (type: ActivityEntityRef["type"], id: string) => EntityActivityBundle;
  addComment: (
    type: ActivityEntityRef["type"],
    id: string,
    body: string,
    author?: string,
    authorId?: string,
    parentId?: string,
    mentions?: string[],
    entityLabel?: string,
  ) => void;
  addNote: (type: ActivityEntityRef["type"], id: string, body: string, author?: string) => void;
  toggleFollow: (type: ActivityEntityRef["type"], id: string, user: { userId: string; name: string; initials: string }) => void;
  logActivity: (entry: Omit<ActivityEntry, "id">) => void;
  /** Replaces any locally-held entries for (type, id) with real, server-fetched
   * ones — used when a drawer opens for an entity backed by a real activity
   * API, instead of the mock local-only log. */
  hydrateEntries: (type: ActivityEntityRef["type"], id: string, entries: ActivityEntry[]) => void;
};

const CURRENT_USER = { userId: "me", name: "You", initials: "YO" };

export const useActivityStore = create<ActivityStore>()(
  persist(
    (set, get) => ({
      entries: [],
      comments: [],
      notes: [],
      attachments: [],
      followers: [],
      aiActions: [],
      approvals: [],

      drawerOpen: false,
      drawerEntity: null,

      openDrawer: (entity) => set({ drawerOpen: true, drawerEntity: entity }),
      closeDrawer: () => set({ drawerOpen: false, drawerEntity: null }),

      getBundle: (type, id) => {
        const state = get();
        const entries = state.entries.filter((e) => e.entityType === type && e.entityId === id);

        return {
          entries: [...entries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
          comments: filterByEntity(state.comments, type, id).sort(
            (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
          ),
          notes: filterByEntity(state.notes, type, id).sort(
            (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
          ),
          attachments: filterByEntity(state.attachments, type, id),
          followers: filterByEntity(state.followers, type, id),
          aiActions: filterByEntity(state.aiActions, type, id).sort(
            (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
          ),
          approvals: filterByEntity(state.approvals, type, id).sort(
            (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
          ),
        };
      },

      addComment: (type, id, body, author = CURRENT_USER.name, authorId, parentId, mentions = [], entityLabel = id) =>
        set((s) => {
          const commentId = `cmt_${Date.now()}`;
          const nextComment: ActivityComment = {
            id: commentId,
            entityType: type,
            entityId: id,
            author,
            authorId,
            parentId,
            authorInitials: author.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase(),
            body,
            mentions,
            at: new Date().toISOString(),
          };

          if (mentions.length > 0 && authorId) {
            useNotificationStore.getState().notifyMentions({
              mentionedUserIds: mentions,
              actorUserId: authorId,
              actorName: author,
              entityType: type,
              entityId: id,
              entityLabel,
              commentId,
              commentPreview: body,
            });
          }

          return {
            comments: [nextComment, ...s.comments],
          };
        }),

      addNote: (type, id, body, author = CURRENT_USER.name) =>
        set((s) => ({
          notes: [
            {
              id: `note_${Date.now()}`,
              entityType: type,
              entityId: id,
              author,
              authorInitials: author.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase(),
              body,
              at: new Date().toISOString(),
            },
            ...s.notes,
          ],
        })),

      toggleFollow: (type, id, user) =>
        set((s) => {
          const exists = s.followers.some(
            (f) => f.entityType === type && f.entityId === id && f.userId === user.userId,
          );
          if (exists) {
            return {
              followers: s.followers.filter(
                (f) => !(f.entityType === type && f.entityId === id && f.userId === user.userId),
              ),
            };
          }
          return {
            followers: [
              ...s.followers,
              { entityType: type, entityId: id, ...user },
            ],
          };
        }),

      logActivity: (entry) =>
        set((s) => ({
          entries: [{ id: `act_${Date.now()}`, ...entry }, ...s.entries],
        })),

      hydrateEntries: (type, id, entries) =>
        set((s) => ({
          entries: [
            ...entries,
            ...s.entries.filter((e) => !(e.entityType === type && e.entityId === id)),
          ],
        })),
    }),
    {
      name: "againerp-activity",
      partialize: (s) => ({
        entries: s.entries,
        comments: s.comments,
        notes: s.notes,
        followers: s.followers,
      }),
    },
  ),
);
