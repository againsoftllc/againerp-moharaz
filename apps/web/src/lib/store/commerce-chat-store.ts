"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { PendingQuestion } from "@/lib/commerce/commerce-workflow-types";

export type CommerceChatRole =
  | "user"
  | "assistant"
  | "status"
  | "preview"
  | "approval"
  | "question"
  | "success"
  | "report"
  | "failure";

export type CommerceChatMessage = {
  id: string;
  role: CommerceChatRole;
  content: string;
  canonical?: Record<string, unknown>;
  summary?: Record<string, unknown> | null;
  previewJobId?: string;
  createJobId?: string;
  runId?: string;
  sessionId?: string;
  productId?: string;
  productPageUrl?: string;
  runSummary?: import("@/components/commerce/commerce-execution-report").CommerceRunSummary;
  resolved?: boolean;
  pendingQuestion?: PendingQuestion | null;
  options?: Array<{ id: string; label: string; description?: string }>;
};

type CommerceChatState = {
  messages: CommerceChatMessage[];
  activeCreateJobId: string | null;
  activeSessionId: string | null;
  activeRunId: string | null;
  awaitingReply: boolean;

  setMessages: (messages: CommerceChatMessage[]) => void;
  appendMessage: (message: Omit<CommerceChatMessage, "id">) => void;
  patchMessage: (id: string, patch: Partial<CommerceChatMessage>) => void;
  setActiveWorkflow: (input: {
    createJobId?: string | null;
    sessionId?: string | null;
    runId?: string | null;
    awaitingReply?: boolean;
  }) => void;
  clearActiveWorkflow: () => void;
  resetConversation: () => void;
};

const WELCOME: CommerceChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    'Paste a Star Tech product link to preview an import — e.g. "Upload this product https://www.startech.com.bd/..."',
};

export function newCommerceMessageId() {
  return `cm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export const useCommerceChatStore = create<CommerceChatState>()(
  persist(
    (set, get) => ({
      messages: [WELCOME],
      activeCreateJobId: null,
      activeSessionId: null,
      activeRunId: null,
      awaitingReply: false,

      setMessages: (messages) => set({ messages }),

      appendMessage: (message) =>
        set({ messages: [...get().messages, { ...message, id: newCommerceMessageId() }] }),

      patchMessage: (id, patch) =>
        set({
          messages: get().messages.map((msg) => (msg.id === id ? { ...msg, ...patch } : msg)),
        }),

      setActiveWorkflow: ({ createJobId, sessionId, runId, awaitingReply }) =>
        set({
          activeCreateJobId: createJobId === undefined ? get().activeCreateJobId : createJobId,
          activeSessionId: sessionId === undefined ? get().activeSessionId : sessionId,
          activeRunId: runId === undefined ? get().activeRunId : runId,
          awaitingReply: awaitingReply === undefined ? get().awaitingReply : awaitingReply,
        }),

      clearActiveWorkflow: () =>
        set({ activeCreateJobId: null, activeSessionId: null, activeRunId: null, awaitingReply: false }),

      resetConversation: () =>
        set({
          messages: [WELCOME],
          activeCreateJobId: null,
          activeSessionId: null,
          activeRunId: null,
          awaitingReply: false,
        }),
    }),
    {
      name: "againerp-commerce-chat",
      version: 2,
      partialize: (state) => ({
        messages: state.messages,
        activeCreateJobId: state.activeCreateJobId,
        activeSessionId: state.activeSessionId,
        activeRunId: state.activeRunId,
        awaitingReply: state.awaitingReply,
      }),
    },
  ),
);
