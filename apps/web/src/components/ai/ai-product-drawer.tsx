"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Send, Sparkles, X } from "lucide-react";
import { AiDocumentDrawer, parseDocLink, type AiDocumentRef } from "@/components/ai/ai-document-drawer";
import { MarkdownLite } from "@/components/ai/markdown-lite";
import { Button } from "@/components/ui/button";
import { streamAiChat } from "@/lib/api/ai-chat";
import { cn } from "@/lib/utils";

type Msg = { id: string; role: "user" | "assistant"; content: string; pending?: boolean; approval?: boolean };

const WIDTH_KEY = "againerp-ai-product-drawer-w";
const MIN_W = 340;

function loadWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    return n >= MIN_W ? n : 460;
  } catch {
    return 460;
  }
}

/**
 * Right-side chat drawer for one product (Product Draft's AI button). Only the chat part of the AI workspace:
 * opening it sends the "fill this product from its source" task, approvals show up here as Accept / Deny, and the
 * conversation is a normal Aladin conversation, so it is in the AI chat history. Drag its left edge to resize.
 */
class DrawerBoundary extends React.Component<{ children: React.ReactNode; onClose: () => void }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <aside className="fixed inset-y-0 right-0 z-[400] w-[420px] max-w-[100vw] border-l border-border bg-background p-4 text-sm shadow-2xl">
        <p className="font-semibold">The chat drawer hit an error</p>
        <p className="mt-2 break-words text-xs text-muted-foreground">{this.state.error}</p>
        <Button className="mt-3" size="sm" onClick={this.props.onClose}>Close</Button>
      </aside>
    );
  }
}

export function AiProductDrawer(props: Parameters<typeof AiProductDrawerInner>[0]) {
  return (
    <DrawerBoundary key={props.product?.id ?? "none"} onClose={props.onClose}>
      <AiProductDrawerInner {...props} />
    </DrawerBoundary>
  );
}

function AiProductDrawerInner({
  product,
  onClose,
  onChanged,
}: {
  product: { id: string; name: string } | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [width, setWidth] = React.useState(460);
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const convoRef = React.useRef<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const startedFor = React.useRef<string | null>(null);
  const [docDrawer, setDocDrawer] = React.useState<AiDocumentRef | null>(null);
  const openDoc = React.useCallback((href: string, label: string) => {
    const ref = parseDocLink(href);
    if (ref) setDocDrawer({ ...ref, label });
  }, []);

  React.useEffect(() => {
    setWidth(loadWidth());
  }, []);
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const send = React.useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || sending) return;
      const aid = `a_${Date.now()}`;
      setInput("");
      setMessages((m) => [
        ...m.map((x) => (x.approval ? { ...x, approval: false } : x)),
        { id: `u_${Date.now()}`, role: "user", content: t },
        { id: aid, role: "assistant", content: "", pending: true },
      ]);
      setSending(true);
      setStatus("Thinking…");
      const ctl = new AbortController();
      abortRef.current = ctl;
      let filled = false;
      try {
        await streamAiChat(
          { message: t, conversation_id: convoRef.current ?? undefined, reply_language: "auto" },
          {
            onConversation: (id) => {
              convoRef.current = id;
            },
            onText: (d) => {
              setStatus(null);
              setMessages((m) => m.map((x) => (x.id === aid ? { ...x, content: x.content + d, pending: false } : x)));
            },
            onTextCorrection: (full) => setMessages((m) => m.map((x) => (x.id === aid ? { ...x, content: full, pending: false } : x))),
            onToolStart: (tool) =>
              setStatus(tool === "fill_product_from_source" ? "Reading the source page, importing images, writing content…" : `Working (${tool.replace(/_/g, " ")})…`),
            onToolResult: (_tool, _e, output) => {
              setStatus("Thinking…");
              const st = output && typeof output === "object" ? (output as { status?: unknown }).status : undefined;
              setMessages((m) => m.map((x) => (x.id === aid ? { ...x, approval: st === "preview" } : x)));
              if (st === "filled") filled = true;
            },
          },
          ctl.signal,
        );
        setMessages((m) => m.map((x) => (x.id === aid && !x.content ? { ...x, content: "No response from the model.", pending: false } : { ...x, pending: false })));
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        setMessages((m) =>
          m.map((x) =>
            x.id === aid ? { ...x, pending: false, content: x.content || (aborted ? "Stopped." : `⚠️ ${err instanceof Error ? err.message : "AI request failed"}`) } : x,
          ),
        );
      } finally {
        setSending(false);
        setStatus(null);
        abortRef.current = null;
        if (filled) window.setTimeout(() => onChanged?.(), 300);
      }
    },
    [sending, onChanged],
  );

  // opening the drawer for a product starts the work right away
  React.useEffect(() => {
    if (!product) {
      startedFor.current = null;
      abortRef.current?.abort();
      setMessages([]);
      convoRef.current = null;
      return;
    }
    if (startedFor.current === product.id) return;
    startedFor.current = product.id;
    setMessages([]);
    convoRef.current = null;
    void send(`Fill the draft product "${product.name}" (product id ${product.id}) from its source link, following the product upload rules.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const next = (ev: PointerEvent) => Math.min(window.innerWidth - 80, Math.max(MIN_W, startW + (startX - ev.clientX)));
    const move = (ev: PointerEvent) => setWidth(next(ev));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        localStorage.setItem(WIDTH_KEY, String(next(ev)));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (!product || typeof document === "undefined") return null;
  return createPortal(
    <aside
      style={{ width }}
      className="fixed inset-y-0 right-0 z-[400] flex max-w-[100vw] flex-col border-l border-border bg-background text-foreground shadow-2xl"
    >
      <div onPointerDown={startResize} className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-primary/30" title="Drag to resize" />
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Aladin · {product.name}</p>
          <p className="text-[11px] text-muted-foreground">Saved in your AI chat history</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="mb-4 flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-sm">{m.content}</div>
            </div>
          ) : (
            <div key={m.id} className="mb-4 text-sm">
              {m.content ? <MarkdownLite text={m.content} onOpenDocument={openDoc} /> : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {m.approval && !sending ? (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" className="h-8 rounded-full px-3" onClick={() => void send("Yes, confirm.")}>
                    <Check className="mr-1 h-3.5 w-3.5" /> Accept
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 rounded-full px-3" onClick={() => void send("No, cancel that.")}>
                    <X className="mr-1 h-3.5 w-3.5" /> Deny
                  </Button>
                </div>
              ) : null}
            </div>
          ),
        )}
        {status ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {status}
          </p>
        ) : null}
        <div ref={endRef} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={1}
          placeholder="Ask Aladin about this product…"
          className={cn("max-h-32 min-h-[38px] flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none")}
        />
        {sending ? (
          <Button type="button" size="icon" variant="outline" className="h-9 w-9" onClick={() => abortRef.current?.abort()} aria-label="Stop">
            <X className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" size="icon" className="h-9 w-9" disabled={!input.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        )}
      </form>
      <AiDocumentDrawer doc={docDrawer} onClose={() => setDocDrawer(null)} />
    </aside>,
    document.body,
  );
}
