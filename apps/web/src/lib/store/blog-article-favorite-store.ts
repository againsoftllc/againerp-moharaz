"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type BlogArticleFavoriteState = {
  starredIds: Record<string, boolean>;
  isStarred: (id: string) => boolean;
  toggle: (id: string) => void;
};

export const useBlogArticleFavoriteStore = create<BlogArticleFavoriteState>()(
  persist(
    (set, get) => ({
      starredIds: {},
      isStarred: (id) => Boolean(get().starredIds[id]),
      toggle: (id) =>
        set((state) => ({
          starredIds: {
            ...state.starredIds,
            [id]: !state.starredIds[id],
          },
        })),
    }),
    { name: "againerp-blog-article-favorites" },
  ),
);
