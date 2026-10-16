"use client";

import * as React from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store/app-store";
import { useModuleSettingsStore } from "@/lib/store/module-settings-store";

const actions = [
  "Generate product description",
  "Generate SEO meta",
  "Generate FAQ",
  "Generate tags",
  "Translate to Bengali",
  "Rewrite for clarity",
  "Analyze listing quality",
] as const;

const actionPrompts: Record<(typeof actions)[number], string> = {
  "Generate product description":
    "Write a concise premium product description for a wireless earbud listing (noise cancellation, battery life, water resistance). 2–3 sentences.",
  "Generate SEO meta":
    "Write an SEO title (≤60 chars) and meta description (≤155 chars) for wireless earbuds aimed at Bangladesh shoppers.",
  "Generate FAQ":
    "Write 4 short FAQ Q&A pairs for wireless earbuds (battery, warranty, waterproofing, pairing).",
  "Generate tags":
    "Suggest 8–12 catalog tags/keywords for wireless earbuds (comma-separated).",
  "Translate to Bengali":
    "Translate this product blurb to natural Bengali: Premium wireless earbuds with ANC, 32-hour battery, IPX5.",
  "Rewrite for clarity":
    "Rewrite for clarity and conversion: Our earbuds have ANC and long battery and are good for gym and travel.",
  "Analyze listing quality":
    "Score this listing briefly (title, benefits, SEO, trust) and give 3 concrete improvements: Wireless Earbuds Pro — ANC, 32h battery, IPX5.",
};

export function AiAssistantDrawer() {
  const open = useAppStore((s) => s.aiDrawerOpen);
  const setOpen = (v: boolean) => useAppStore.setState({ aiDrawerOpen: v });
  const centerBound = useModuleSettingsStore((s) => s.centerBound);
  const centerAiEnabled = useModuleSettingsStore((s) => s.centerAiEnabled);
  const [lastAction, setLastAction] = React.useState<string | null>(null);
  const [response, setResponse] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function runAction(action: (typeof actions)[number]) {
    setLastAction(action);
    setError(null);
    setResponse(null);

    if (!centerBound) {
      setError("Connect this ERP to AgainERP Center (Workspace → Modules) to use live AI.");
      return;
    }
    if (!centerAiEnabled) {
      setError("AI Access is off for this client. Enable it in Center → AI Access.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/center/ai/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "admin_assistant",
          prompt: actionPrompts[action],
        }),
      });
      const body = (await res.json()) as { explanation?: string; detail?: string };
      if (!res.ok) {
        throw new Error(body.detail || `AI request failed (${res.status})`);
      }
      setResponse(body.explanation?.trim() || "No response from model.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full max-w-md rounded-none sm:max-w-lg">
        <div className="flex items-center gap-2 pr-8">
          <Sparkles className="h-5 w-5 text-violet-500" />
          <div>
            <h2 className="text-lg font-semibold">AI Assistant</h2>
            <p className="text-xs text-muted-foreground">
              {centerAiEnabled
                ? "Live · Center-proxied OpenAI"
                : centerBound
                  ? "AI Access disabled in Center"
                  : "Prototype · connect Center for live AI"}
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {actions.map((action) => (
            <Button
              key={action}
              variant="outline"
              className="w-full justify-start rounded-none"
              disabled={loading}
              onClick={() => void runAction(action)}
            >
              <Wand2 className="h-4 w-4" />
              {action}
            </Button>
          ))}
        </div>
        {loading && (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating…
          </div>
        )}
        {error && (
          <div className="mt-6 rounded-none border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}
        {lastAction && response && !loading && (
          <div className="mt-6 rounded-none border bg-muted/40 p-4 text-sm">
            <p className="mb-1 font-medium">{lastAction}</p>
            <p className="whitespace-pre-wrap text-muted-foreground">{response}</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
