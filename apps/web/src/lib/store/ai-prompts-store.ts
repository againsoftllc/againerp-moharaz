import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  EDITOR_AI_PRE_PROMPTS,
  type EditorAiContextId,
  type EditorAiPrePrompt,
} from "@/lib/editor/editor-ai-prompts";

type AiPromptsState = {
  prompts: EditorAiPrePrompt[];
  updatePrompt: (
    context: EditorAiContextId,
    patch: Partial<Pick<EditorAiPrePrompt, "systemPrompt" | "userPromptTemplate" | "label">>,
  ) => void;
  resetPrompt: (context: EditorAiContextId) => void;
  resetAll: () => void;
};

const seed = () => EDITOR_AI_PRE_PROMPTS.map((p) => ({ ...p }));

export const useAiPromptsStore = create<AiPromptsState>()(
  persist(
    (set, get) => ({
      prompts: seed(),

      updatePrompt: (context, patch) => {
        set({
          prompts: get().prompts.map((p) =>
            p.context === context ? { ...p, ...patch } : p,
          ),
        });
      },

      resetPrompt: (context) => {
        const original = EDITOR_AI_PRE_PROMPTS.find((p) => p.context === context);
        if (!original) return;
        set({
          prompts: get().prompts.map((p) => (p.context === context ? { ...original } : p)),
        });
      },

      resetAll: () => set({ prompts: seed() }),
    }),
    { name: "againerp-ai-prompts", version: 1 },
  ),
);

export function getEditorPrePrompt(context: EditorAiContextId): EditorAiPrePrompt {
  const prompts = useAiPromptsStore.getState().prompts;
  return (
    prompts.find((item) => item.context === context) ??
    prompts.find((item) => item.context === "generic") ??
    EDITOR_AI_PRE_PROMPTS.find((item) => item.context === context) ??
    EDITOR_AI_PRE_PROMPTS.find((item) => item.context === "generic")!
  );
}
