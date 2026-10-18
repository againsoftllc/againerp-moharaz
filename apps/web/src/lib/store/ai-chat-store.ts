"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * One Aladin chat, wherever it is opened: the /ai page, the AI drawer (the AI icon in the top bar) and the product-upload drawer all read
 * and write the SAME active conversation (the conversations themselves live on the server, so a command given in one place is in the
 * same history in the others). The id survives a reload within the tab.
 */
type AiChatState = {
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
};

export const useAiChatStore = create<AiChatState>()(
  persist(
    (set) => ({
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
