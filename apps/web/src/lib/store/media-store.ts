import { create } from "zustand";
import { propagateMediaUpdate } from "@/lib/media/media-propagate";
import {
  applyMediaItemPatch,
  mediaLibraryItems,
  type MediaLibraryItem,
} from "@/lib/mock-data/media-library";

type MediaPatch = Partial<Pick<MediaLibraryItem, "name" | "title" | "alt">>;

type MediaState = {
  items: MediaLibraryItem[];
  getById: (id: string) => MediaLibraryItem | undefined;
  setItems: (items: MediaLibraryItem[]) => void;
  prependItems: (items: MediaLibraryItem[]) => void;
  patchMediaItem: (id: string, patch: MediaPatch) => void;
};

/* Kept in memory only. It used to be persisted to localStorage, which meant re-serialising the whole library
   (tens of thousands of files) on every change — the admin froze, and the copy outgrew the browser's quota. */
if (typeof window !== "undefined") {
  try {
    window.localStorage.removeItem("againerp-media");
  } catch {
    /* storage blocked */
  }
}

export const useMediaStore = create<MediaState>()(
    (set, get) => ({
      items: mediaLibraryItems,

      getById: (id) => get().items.find((item) => item.id === id),

      setItems: (items) => set({ items }),

      prependItems: (items) =>
        set((state) => ({
          items: [...items, ...state.items],
        })),

      patchMediaItem: (id, patch) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? applyMediaItemPatch(item, patch) : item,
          ),
        }));
        propagateMediaUpdate(id);
      },
    }),
);
