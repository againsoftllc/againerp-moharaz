import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type Review,
  type ReviewStatus,
  type ReviewNote,
  type ReviewTimelineEvent,
} from "@/lib/mock-data/reviews";

type ReviewStore = {
  reviews: Review[];
  setReviews: (reviews: Review[]) => void;
  getById: (id: string) => Review | undefined;
  patchReview: (id: string, patch: Partial<Review>) => void;
  updateStatus: (id: string, status: ReviewStatus, actor?: string) => void;
  addNote: (id: string, note: Omit<ReviewNote, "id">) => void;
  addTimelineEntry: (id: string, entry: Omit<ReviewTimelineEvent, "id">) => void;
};

export const useReviewStore = create<ReviewStore>()(
  persist(
    (set, get) => ({
      reviews: [],

      setReviews: (reviews) => set({ reviews }),

      getById: (id) => get().reviews.find((r) => r.id === id),

      patchReview: (id, patch) =>
        set((s) => ({
          reviews: s.reviews.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

      updateStatus: (id, status, actor = "Admin") => {
        set((s) => ({
          reviews: s.reviews.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status,
                  moderatedBy: actor,
                  moderatedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }
              : r,
          ),
        }));
        get().addTimelineEntry(id, {
          type: status === "approved" ? "approved" : status === "rejected" ? "rejected" : "note",
          title: `Review ${status}`,
          actor,
          actorInitials: actor.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase(),
          at: new Date().toISOString(),
        });
      },

      addNote: (id, note) =>
        set((s) => ({
          reviews: s.reviews.map((r) =>
            r.id === id
              ? { ...r, notes: [{ id: `n_${Date.now()}`, ...note }, ...r.notes] }
              : r,
          ),
        })),

      addTimelineEntry: (id, entry) =>
        set((s) => ({
          reviews: s.reviews.map((r) =>
            r.id === id
              ? { ...r, timeline: [{ id: `tl_${Date.now()}`, ...entry }, ...r.timeline] }
              : r,
          ),
        })),
    }),
    { name: "againerp-reviews" },
  ),
);
