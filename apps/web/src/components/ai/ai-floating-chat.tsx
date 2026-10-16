"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Eraser, Globe, Loader2, Minus, X } from "lucide-react";
import { AiDocumentDrawer, parseDocLink, type AiDocumentRef } from "@/components/ai/ai-document-drawer";
import { AiRobotAvatar } from "@/components/ai/ai-robot-avatar";
import { MarkdownLite } from "@/components/ai/markdown-lite";
import { Button } from "@/components/ui/button";
import { getStoredAuthToken } from "@/lib/store/admin-auth-store";
import { useAppStore } from "@/lib/store/app-store";
import { useModuleSettingsStore } from "@/lib/store/module-settings-store";
import { cn } from "@/lib/utils";

type ChatMsg = {
  id: string;
  // Older saved histories may still hold roles from the retired Center commerce flow
  // (preview/approval/question/success) — they render as plain assistant text.
  role: "user" | "assistant" | "status" | string;
  content: string;
};

const STORAGE_KEY = "againerp-ai-float-v3";
const HISTORY_KEY = "againerp-ai-chat-history-v1";
const CONVERSATION_ID_KEY = "againerp-ai-conversation-id-v1";
const FAB_SIZE = 52;
/** Above nested sheets (z-260) and Radix overlays — always top layer. */
const ALADIN_Z = 400;

/** Friendlier status line while a tool runs than the raw tool name. */
const TOOL_HINTS: Record<string, string> = {
  import_product_from_url: "Reading the product page…",
  add_product_seo: "Preparing SEO fields…",
};

type Persisted = {
  fabX: number;
  fabY: number;
  winW: number;
  winH: number;
};

const DEFAULTS: Persisted = {
  fabX: -1,
  fabY: -1,
  winW: 400,
  winH: 520,
};

function loadPos(): Persisted {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Persisted>) };
  } catch {
    return DEFAULTS;
  }
}

function savePos(p: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function loadHistory(): ChatMsg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ChatMsg[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: ChatMsg[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
  } catch {
    /* ignore */
  }
}

function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}

function loadConversationId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(CONVERSATION_ID_KEY);
  } catch {
    return null;
  }
}

function saveConversationId(id: string | null) {
  try {
    if (id) localStorage.setItem(CONVERSATION_ID_KEY, id);
    else localStorage.removeItem(CONVERSATION_ID_KEY);
  } catch {
    /* ignore */
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function defaultFab(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 24, y: 24 };
  return {
    x: Math.max(8, window.innerWidth - FAB_SIZE - 12),
    y: Math.max(8, window.innerHeight - FAB_SIZE - 20),
  };
}

/** Open chat anchored to FAB — prefer expanding left + up from the icon. */
function winFromFab(fabX: number, fabY: number, w: number, h: number) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let x = fabX + FAB_SIZE - w;
  let y = fabY + FAB_SIZE - h;
  x = clamp(x, 8, Math.max(8, vw - w - 8));
  y = clamp(y, 8, Math.max(8, vh - h - 8));
  return { x, y };
}

function LiveDot({ live }: { live: boolean }) {
  return (
    <span
      className={cn(
        "absolute -top-0.5 -right-0.5 z-10 h-2.5 w-2.5 rounded-none border-2 border-background shadow-sm",
        live ? "bg-emerald-500" : "bg-destructive",
      )}
      title={live ? "Live" : "Offline"}
    />
  );
}

export function AiFloatingChat() {
  const open = useAppStore((s) => s.aiDrawerOpen);
  const setOpen = useAppStore((s) => s.setAiDrawerOpen);
  const centerBound = useModuleSettingsStore((s) => s.centerBound);
  const centerAiEnabled = useModuleSettingsStore((s) => s.centerAiEnabled);

  const [pos, setPos] = React.useState<Persisted>(DEFAULTS);
  const [winPos, setWinPos] = React.useState({ x: 40, y: 80 });
  const [hydrated, setHydrated] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [statusHint, setStatusHint] = React.useState<string | null>(null);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  // Opt-in, per session, never a standing default — resets to off on reload/remount
  // (master plan §16: "never a standing capability"), so it's never persisted.
  const [webSearchEnabled, setWebSearchEnabled] = React.useState(false);
  // Record opened from a doc:// link in a reply (e.g. the product Aladin just imported).
  const [docDrawer, setDocDrawer] = React.useState<AiDocumentRef | null>(null);

  const suppressClickRef = React.useRef(false);
  const dragRef = React.useRef<{
    kind: "fab" | "win" | "resize";
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    moved: boolean;
  } | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Mirrors the backend's ai_access_allowed(): unbound (no Center) stays live/permissive;
  // only a bound Center that has actively disabled AI shows offline.
  const liveOk = !centerBound || centerAiEnabled;

  React.useEffect(() => {
    const loaded = loadPos();
    const fab = defaultFab();
    setPos({
      ...loaded,
      fabX: loaded.fabX < 0 ? fab.x : clamp(loaded.fabX, 8, window.innerWidth - FAB_SIZE - 8),
      fabY: loaded.fabY < 0 ? fab.y : clamp(loaded.fabY, 8, window.innerHeight - FAB_SIZE - 8),
    });
    setMessages(loadHistory());
    setConversationId(loadConversationId());
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    savePos(pos);
  }, [pos, hydrated]);

  React.useEffect(() => {
    if (!hydrated) return;
    saveHistory(messages);
  }, [messages, hydrated]);

  React.useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    queueMicrotask(() => {
      const active = document.activeElement;
      if (active?.closest?.("[role='dialog']:not([aria-label='Aladin chat'])")) return;
      inputRef.current?.focus();
    });
  }, [open, messages, loading, statusHint]);

  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && dx * dx + dy * dy > 25) d.moved = true;
      if (!d.moved) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (d.kind === "fab") {
        const nextX = clamp(d.origX + dx, 8, vw - FAB_SIZE - 8);
        const nextY = clamp(d.origY + dy, 8, vh - FAB_SIZE - 8);
        setPos((p) => ({ ...p, fabX: nextX, fabY: nextY }));
        if (open) {
          setWinPos(winFromFab(nextX, nextY, pos.winW, pos.winH));
        }
      } else if (d.kind === "win") {
        setWinPos({
          x: clamp(d.origX + dx, 0, vw - 120),
          y: clamp(d.origY + dy, 0, vh - 80),
        });
      } else {
        setPos((p) => {
          const winW = clamp(d.origW + dx, 280, Math.min(720, vw - 16));
          const winH = clamp(d.origH + dy, 280, Math.min(860, vh - 16));
          return { ...p, winW, winH };
        });
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d?.kind === "fab" && d.moved) suppressClickRef.current = true;
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [open, pos.winW, pos.winH]);

  function startDrag(
    kind: "fab" | "win" | "resize",
    e: React.PointerEvent,
    orig: { x: number; y: number; w: number; h: number },
  ) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      origX: orig.x,
      origY: orig.y,
      origW: orig.w,
      origH: orig.h,
      moved: false,
    };
  }

  function toggleChat() {
    if (open) {
      setOpen(false);
      return;
    }
    setWinPos(winFromFab(pos.fabX, pos.fabY, pos.winW, pos.winH));
    setOpen(true);
  }

  /** Parses the /chat/stream SSE body, growing one assistant bubble as text_delta events
   * arrive. Returns the new conversation_id and whether a web search happened, so the
   * caller can persist/announce them the same way the non-streaming path already does. */
  async function streamChat(
    token: string,
    text: string,
    assistantMsgId: string,
  ): Promise<{ conversationId?: string; searchedWeb: boolean }> {
    const res = await fetch("/api/v1/ai/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: text,
        conversation_id: conversationId ?? undefined,
        enable_web_search: webSearchEnabled,
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { detail?: string };
      const err = new Error(errBody.detail || `AI request failed (${res.status})`) as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Streaming is not supported in this browser");
    const decoder = new TextDecoder();
    let buffer = "";
    let started = false;
    let newConversationId: string | undefined;
    let searchedWeb = false;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        let eventName = "message";
        let dataRaw = "";
        for (const line of chunk.split("\n")) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataRaw += line.slice(5).trim();
        }
        if (!dataRaw) continue;
        const data = JSON.parse(dataRaw) as Record<string, unknown>;

        if (eventName === "conversation") {
          newConversationId = data.conversation_id as string;
        } else if (eventName === "text_delta") {
          const delta = (data.text as string) ?? "";
          if (!started) {
            started = true;
            setMessages((m) => [...m, { id: assistantMsgId, role: "assistant", content: delta }]);
          } else {
            setMessages((m) =>
              m.map((msg) => (msg.id === assistantMsgId ? { ...msg, content: msg.content + delta } : msg)),
            );
          }
        } else if (eventName === "tool_start") {
          const toolName = String(data.tool_name ?? "");
          setStatusHint(TOOL_HINTS[toolName] ?? `Looking things up (${toolName})…`);
        } else if (eventName === "tool_result") {
          setStatusHint(null);
          if (data.module === "web_search") searchedWeb = true;
        } else if (eventName === "error") {
          throw new Error((data.detail as string) || "AI request failed");
        }
      }
    }

    if (!started) {
      setMessages((m) => [...m, { id: assistantMsgId, role: "assistant", content: "No response from model." }]);
    }
    return { conversationId: newConversationId, searchedWeb };
  }

  async function sendPrompt(prompt: string) {
    const text = prompt.trim();
    if (!text || loading) return;

    // Unbound (no Center configured — single-tenant local) stays permissive, matching
    // the backend's own ai_access_allowed(): Center can only actively turn AI *off*
    // once bound, never gate a deployment that was never connected to it.
    if (centerBound && !centerAiEnabled) {
      setError("AI Access is off for this client. Enable it in Center → AI Access.");
      return;
    }

    setError(null);
    setStatusHint(null);
    const userMsg: ChatMsg = { id: `u_${Date.now()}`, role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const token = getStoredAuthToken();
      if (!token) {
        setError("Sign in to the admin so Aladin can chat.");
        return;
      }
      // Aladin — this ERP's own Claude-powered orchestrator (app/services/ai/), not
      // Center's OpenAI passthrough. History lives server-side against conversationId,
      // so only the latest message goes out, not a client-rebuilt transcript.
      // Product URLs go through here too: the AI OS's import_product_from_url tool
      // previews the page, waits for the user's confirm, then creates the draft product
      // (auto-creating a missing brand/category) under the user's own catalog permission.
      const assistantMsgId = `a_${Date.now()}`;
      let result: { conversationId?: string; searchedWeb: boolean };
      try {
        result = await streamChat(token, text, assistantMsgId);
      } catch (err) {
        if ((err as { status?: number }).status === 404) {
          // Stale/foreign conversation_id — drop it so the next send starts a fresh thread.
          setConversationId(null);
          saveConversationId(null);
        }
        throw err;
      }
      if (result.conversationId) {
        setConversationId(result.conversationId);
        saveConversationId(result.conversationId);
      }
      if (result.searchedWeb) {
        setMessages((m) => [
          ...m,
          { id: `w_${Date.now()}`, role: "status", content: "🔎 Searched the web for this." },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed");
      setStatusHint(null);
    } finally {
      setLoading(false);
      setStatusHint(null);
    }
  }

  if (!hydrated) return null;

  const mood = loading ? "busy" : "idle";
  const busy = loading;

  function openDocLink(href: string, label: string) {
    const ref = parseDocLink(href);
    if (!ref) return;
    // The drawer sits below Aladin's z-layer — minimize the chat so the record is visible.
    setOpen(false);
    setDocDrawer({ ...ref, label });
  }

  const ui = (
    <>
      <div
        data-aladin-chat=""
        className="fixed"
        style={{
          left: pos.fabX,
          top: pos.fabY,
          width: FAB_SIZE,
          height: FAB_SIZE,
          zIndex: ALADIN_Z + 1,
          pointerEvents: "none",
        }}
      >
        <button
          type="button"
          data-aladin-chat=""
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            "bg-transparent p-0 shadow-none outline-none",
            "text-violet-600 dark:text-violet-300",
            "focus-visible:ring-2 focus-visible:ring-violet-500/50",
          )}
          style={{ pointerEvents: "auto" }}
          aria-label={open ? "Minimize Aladin" : "Open Aladin chat"}
          title="Drag to move · Click to open/close"
          onPointerDown={(e) =>
            startDrag("fab", e, { x: pos.fabX, y: pos.fabY, w: 0, h: 0 })
          }
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            toggleChat();
          }}
        >
          <span className={cn("relative inline-flex", !open && !busy && "ai-bot-fab-scale")}>
            <AiRobotAvatar mood={mood} className="h-12 w-12" showGlow={!busy} />
            <LiveDot live={liveOk} />
          </span>
        </button>
      </div>

      {open ? (
        <div
          data-aladin-chat=""
          className={cn(
            "fixed flex flex-col overflow-hidden rounded-none border border-border/50 shadow-2xl",
            "bg-background/45 backdrop-blur-2xl dark:bg-background/40",
          )}
          style={{
            left: winPos.x,
            top: winPos.y,
            width: pos.winW,
            height: pos.winH,
            zIndex: ALADIN_Z,
            pointerEvents: "auto",
          }}
          role="dialog"
          aria-label="Aladin chat"
          aria-modal="false"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            className="flex h-8 shrink-0 cursor-grab items-center gap-1.5 border-b border-border/40 bg-muted/15 px-2 active:cursor-grabbing"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest("button")) return;
              startDrag("win", e, {
                x: winPos.x,
                y: winPos.y,
                w: pos.winW,
                h: pos.winH,
              });
            }}
          >
            <span className="relative shrink-0">
              <AiRobotAvatar mood={mood} showGlow={!busy} className="h-6 w-6" />
              <LiveDot live={liveOk} />
            </span>
            <p className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-none tracking-tight text-foreground">
              Aladin
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-none"
              aria-label="Clear chat"
              title="Clear chat"
              disabled={messages.length === 0 && !error}
              onClick={() => {
                setMessages([]);
                clearHistory();
                setConversationId(null);
                saveConversationId(null);
                setError(null);
                setStatusHint(null);
              }}
            >
              <Eraser className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-none"
              aria-label="Minimize"
              onClick={() => setOpen(false)}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-none"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 py-2">
            {messages.length === 0 && !error ? (
              <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 text-center text-[11px] text-muted-foreground">
                <AiRobotAvatar mood="idle" className="h-11 w-11" />
                <p>Aladin is ready — paste any product page URL or ask anything.</p>
              </div>
            ) : null}
            {messages.map((m) => {
              if (m.role === "user") {
                return (
                  <div
                    key={m.id}
                    className="ml-auto w-fit max-w-[88%] rounded-none border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[11px] leading-snug whitespace-pre-wrap text-foreground"
                  >
                    {m.content}
                  </div>
                );
              }

              return (
                <div key={m.id} className="mr-auto flex max-w-[92%] items-start gap-1.5">
                  <AiRobotAvatar mood="idle" showGlow={false} className="mt-0.5 h-5 w-5 shrink-0" />
                  <div className="w-fit min-w-0 rounded-none border border-border/50 bg-muted/30 px-2.5 py-1 text-[11px] leading-snug text-foreground backdrop-blur-sm">
                    <MarkdownLite text={m.content} onOpenDocument={openDocLink} />
                  </div>
                </div>
              );
            })}
            {busy ? (
              <div className="mr-auto flex items-start gap-1.5">
                <AiRobotAvatar mood="busy" showGlow={false} className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="flex w-fit items-center gap-1.5 rounded-none border border-border/50 bg-muted/30 px-2.5 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {statusHint || "Working…"}
                </div>
              </div>
            ) : null}
            {error ? (
              <div className="w-fit rounded-none border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-[10px] text-destructive">
                {error}
              </div>
            ) : null}
          </div>

          <form
            className="flex shrink-0 items-center gap-1.5 border-t border-border/40 bg-muted/10 px-2 py-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void sendPrompt(input);
            }}
          >
            <button
              type="button"
              aria-label={webSearchEnabled ? "Web search on — click to turn off" : "Turn on web search for this chat"}
              title={webSearchEnabled ? "Web search on" : "Web search off"}
              onClick={() => setWebSearchEnabled((v) => !v)}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-none border",
                webSearchEnabled
                  ? "border-violet-500/60 bg-violet-500/15 text-violet-600 dark:text-violet-300"
                  : "border-border/50 bg-background/40 text-muted-foreground",
              )}
            >
              <Globe className="h-3.5 w-3.5" />
            </button>
            <div className="flex h-8 flex-1 items-center rounded-none border border-border/60 bg-background/35 px-2.5 focus-within:border-violet-500/45 focus-within:ring-1 focus-within:ring-violet-500/25 dark:bg-background/25">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendPrompt(input);
                  }
                }}
                placeholder="Product URL or message…"
                className="max-h-16 min-h-[18px] w-full resize-none bg-transparent py-0.5 text-[11px] leading-tight text-foreground outline-none placeholder:text-muted-foreground"
                disabled={busy}
              />
            </div>
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-border/50 bg-background/40 text-violet-600 disabled:opacity-40 dark:bg-background/25 dark:text-violet-300"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <AiRobotAvatar mood="calm" showGlow={false} className="h-5 w-5" />
              )}
            </button>
          </form>

          <div
            className="absolute right-0 bottom-0 h-5 w-5 cursor-se-resize"
            title="Resize"
            onPointerDown={(e) => {
              e.stopPropagation();
              startDrag("resize", e, {
                x: winPos.x,
                y: winPos.y,
                w: pos.winW,
                h: pos.winH,
              });
            }}
          >
            <span className="absolute right-1 bottom-1 h-2.5 w-2.5 rounded-none border-r-2 border-b-2 border-muted-foreground/50" />
          </div>
        </div>
      ) : null}

      {/* Record opened from a doc:// link in a reply — same drawer the AI page uses */}
      <AiDocumentDrawer doc={docDrawer} onClose={() => setDocDrawer(null)} />
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(ui, document.body);
}
