"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, MessageSquare, Send, X } from "lucide-react";
import { runEditorAiMock } from "@/lib/editor/editor-ai-mock";
import { type EditorAiContextId } from "@/lib/editor/editor-ai-prompts";
import { getEditorPrePrompt } from "@/lib/store/ai-prompts-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  html?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: EditorAiContextId;
  variables: Record<string, string | undefined>;
  currentContent: string;
  onInsert: (html: string) => void;
};

export function EditorAiChatDrawer({
  open,
  onOpenChange,
  context,
  variables,
  currentContent,
  onInsert,
}: Props) {
  const prePrompt = getEditorPrePrompt(context);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [finalHtml, setFinalHtml] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);

  const pushMessage = useCallback((message: Omit<ChatMessage, "id">) => {
    setMessages((prev) => [
      ...prev,
      { ...message, id: `${Date.now()}-${prev.length}` },
    ]);
  }, []);

  const runPrompt = useCallback(
    async (prompt: string) => {
      if (!prompt.trim() || loading) return;
      setLoading(true);
      pushMessage({ role: "user", content: prompt });

      try {
        const result = await runEditorAiMock({
          prompt,
          context,
          variables: { ...variables, current_content: currentContent },
          currentContent,
        });
        setFinalHtml(result);
        pushMessage({
          role: "assistant",
          content: "Here is a draft based on our discussion. Review it, ask for changes, or insert into the editor when ready.",
          html: result,
        });
      } finally {
        setLoading(false);
      }
    },
    [context, currentContent, loading, pushMessage, variables],
  );

  useEffect(() => {
    if (!open) {
      seeded.current = false;
      return;
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, loading]);

  useEffect(() => {
    if (!open || seeded.current) return;
    seeded.current = true;
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Tell me what you want in this field — tone, length, language, or specific points to cover. We can refine until you are happy, then insert into the editor.",
      },
    ]);
    setFinalHtml("");
    setDraft("");
  }, [open]);

  const handleSend = () => {
    const prompt = draft.trim();
    if (!prompt) return;
    setDraft("");
    void runPrompt(prompt);
  };

  const handleInsert = () => {
    if (!finalHtml) return;
    onInsert(finalHtml);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-[100] flex w-full max-w-md flex-col border-l border-input bg-background shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <div className="flex items-start justify-between gap-2 border-b border-input px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="h-4 w-4 text-primary" />
                AI chat
              </Dialog.Title>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Discuss your content, then insert the final draft into the editor
              </p>
            </div>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-xs leading-relaxed",
                  message.role === "user"
                    ? "ml-6 border-primary/20 bg-primary/5"
                    : "mr-6 border-input bg-muted/30",
                )}
              >
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {message.role === "user" ? "You" : "AI"}
                </p>
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.html && (
                  <div
                    className="prose prose-xs mt-2 max-w-none rounded-md border border-input bg-background p-2 dark:prose-invert [&_p]:my-1 [&_ul]:my-1"
                    dangerouslySetInnerHTML={{ __html: message.html }}
                  />
                )}
              </div>
            ))}

            {loading && (
              <div className="mr-6 flex items-center gap-2 rounded-lg border border-input bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking…
              </div>
            )}
          </div>

          <div className="border-t border-input p-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. Write a friendly description highlighting durability and fast shipping…"
              rows={3}
              className="min-h-[80px] resize-none text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 flex-1 gap-1 text-xs"
                disabled={!draft.trim() || loading}
                onClick={handleSend}
              >
                <Send className="h-3 w-3" />
                Send
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 flex-1 text-xs"
                disabled={!finalHtml || loading}
                onClick={handleInsert}
              >
                Insert into editor
              </Button>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Preset: {prePrompt.settingsPath}
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
