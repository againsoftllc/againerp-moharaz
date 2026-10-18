"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * One Aladin chat, wherever it is opened: the /ai page, the AI drawer (the AI icon in the top bar) and the product-upload drawer all read
 * and write the SAME active conversation (the conversations themselves live on the server, so a command given in one place is in the
 * same history in the others). The id survives a reload within the tab.
 */
/** "Fill this draft product from its source" - started from the Product Draft AI button, run in the AI drawer. Never persisted. */
export type AiProductTask = { id: string; product: { id: string; name: string }; onChanged?: () => void };

type AiChatState = {
  productTask: AiProductTask | null;
  startProductTask: (product: { id: string; name: string }, onChanged?: () => void) => void;
  clearProductTask: () => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
};

export const useAiChatStore = create<AiChatState>()(
  persist(
    (set) => ({
      productTask: null,
      startProductTask: (product, onChanged) =>
        set({ drawerOpen: true, productTask: { id: `${product.id}:${Date.now()}`, product, onChanged } }),
      clearProductTask: () => set({ productTask: null }),
      drawerOpen: false,
      setDrawerOpen: (open) => set({ drawerOpen: open }),
      toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
      activeConversationId: null,
      setActiveConversationId: (id) => set((s) => (s.activeConversationId === id ? s : { activeConversationId: id })),
    }),
    {
      name: "againerp-ai-chat-v1",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ activeConversationId: s.activeConversationId }),
    },
  ),
);
