"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUp, Check, FileText, Globe, Loader2, Mic, Paperclip, Settings, Sparkles, Square, X } from "lucide-react";
import { toast } from "sonner";
import { AgainDrawerLayout, AgainDrawerPanel } from "@/components/again/again-drawer";
import { AiDocumentDrawer, parseDocLink, type AiDocumentRef } from "@/components/ai/ai-document-drawer";
import { MarkdownLite } from "@/components/ai/markdown-lite";
import { Button } from "@/components/ui/button";
import { AiVoiceError, streamAiChat, transcribeAudio } from "@/lib/api/ai-chat";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { cn } from "@/lib/utils";

type Msg = { id: string; role: "user" | "assistant"; content: string; pending?: boolean; approval?: boolean };
type PendingFile = { name: string; mime: string; size: number; file: File; previewUrl?: string };

// the same reply-language choice the /ai workspace stores
const LANG_KEY = "againai.reply_language";
type Lang = "auto" | "bn" | "en" | "banglish";
const LANGS: { value: Lang; label: string }[] = [
  { value: "auto", label: "Auto (match my language)" },
  { value: "bn", label: "বাংলা" },
  { value: "banglish", label: "Banglish" },
  { value: "en", label: "English" },
];
const ATTACH_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/csv,text/plain,text/markdown,application/json,.csv,.txt,.md,.json,.xlsx,.xls";
const MAX_FILES = 5;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      resolve(s.includes(",") ? s.slice(s.indexOf(",") + 1) : s);
    };
    r.onerror = () => reject(r.error ?? new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

/**
 * Right-side chat drawer for one product (Product Draft's AI button) - the chat part of the AI workspace in a
 * standard resizable Again drawer (drag its left edge). Opening it sends the "fill this product from its source" task;
 * approvals show up as Accept / Deny; the conversation is a normal Aladin conversation (AI chat history).
 */
export function AiProductDrawer({
  product,
  onClose,
  onChanged,
}: {
  product: { id: string; name: string } | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [files, setFiles] = React.useState<PendingFile[]>([]);
  const [sending, setSending] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const convoRef = React.useRef<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const startedFor = React.useRef<string | null>(null);
  const [docDrawer, setDocDrawer] = React.useState<AiDocumentRef | null>(null);
  const openDoc = React.useCallback((href: string, label: string) => {
    const ref = parseDocLink(href);
    if (ref) setDocDrawer({ ...ref, label });
  }, []);

  const user = useAdminAuth((s) => s.user);
  const isAdmin = ["admin", "system_manager"].includes((user?.role ?? "").toLowerCase()) || Boolean(user?.role_ids?.includes("role_system_manager"));
  const [lang, setLang] = React.useState<Lang>("auto");
  const [webSearch, setWebSearch] = React.useState(false);
  const langRef = React.useRef<Lang>("auto");
  const webRef = React.useRef(false);
  React.useEffect(() => {
    try {
      const v = localStorage.getItem(LANG_KEY);
      if (v === "bn" || v === "en" || v === "banglish") {
        setLang(v);
        langRef.current = v;
      }
    } catch {
      /* ignore */
    }
  }, []);
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const addFiles = (list: FileList | null | undefined) => {
    if (!list?.length) return;
    const next: PendingFile[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`${f.name} is larger than 8 MB`);
        continue;
      }
      next.push({ name: f.name, mime: f.type || "application/octet-stream", size: f.size, file: f, previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined });
    }
    setFiles((cur) => [...cur, ...next].slice(0, MAX_FILES));
  };

  // voice: record, then transcribe on the server (the same endpoint the /ai page uses)
  const [listening, setListening] = React.useState(false);
  const [transcribing, setTranscribing] = React.useState(false);
  const recRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const inputRef = React.useRef("");
  inputRef.current = input;
  const toggleMic = async () => {
    if (recRef.current && recRef.current.state !== "inactive") {
      recRef.current.stop();
      setListening(false);
      return;
    }
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Voice input is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      const base = inputRef.current.trim() ? `${inputRef.current.trim()} ` : "";
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recRef.current = null;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 1500) return;
        setTranscribing(true);
        transcribeAudio(blob, langRef.current)
          .then((text) => (text ? setInput(base + text) : toast.message("Didn't catch that - please try again.")))
          .catch((err) => toast.error(err instanceof AiVoiceError && err.status === 503 ? "Voice engine is not configured." : err instanceof Error ? err.message : "Transcription failed"))
          .finally(() => setTranscribing(false));
      };
      recRef.current = rec;
      setListening(true);
      rec.start(250);
    } catch {
      toast.error("Microphone is blocked or not available.");
    }
  };

  const send = React.useCallback(
    async (text: string, attached: PendingFile[] = []) => {
      const t = text.trim() || (attached.length ? "Please look at the attached file(s)." : "");
      if (!t || sending) return;
      const aid = `a_${Date.now()}`;
      setInput("");
      setFiles([]);
      setMessages((m) => [
        ...m.map((x) => (x.approval ? { ...x, approval: false } : x)),
        { id: `u_${Date.now()}`, role: "user", content: attached.length ? `${t}\n\n📎 ${attached.map((f) => f.name).join(", ")}` : t },
        { id: aid, role: "assistant", content: "", pending: true },
      ]);
      setSending(true);
      setStatus("Thinking…");
      const ctl = new AbortController();
      abortRef.current = ctl;
      let filled = false;
      try {
        const attachments = attached.length
          ? await Promise.all(attached.map(async (f) => ({ name: f.name, mime: f.mime, size: f.size, data: await readAsBase64(f.file) })))
          : undefined;
        await streamAiChat(
          { message: t, conversation_id: convoRef.current ?? undefined, enable_web_search: webRef.current, reply_language: langRef.current, scope: "product_fill", attachments },
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

  return (
    <>
      <AgainDrawerPanel
        open={!!product}
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
        title="Aladin"
        resizable
        defaultWidth={520}
        minWidth={340}
        widthStorageKey="againerp-ai-product-drawer-w"
      >
        <AgainDrawerLayout>
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Aladin · {product?.name}</p>
              <p className="text-[11px] text-muted-foreground">Saved in your AI chat history</p>
            </div>
            {isAdmin ? (
              <Link href="/ai" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Aladin settings (API key, presets) - opens the AI page, use its gear icon" aria-label="Aladin settings">
                <Settings className="h-4 w-4" />
              </Link>
            ) : null}
            <button type="button" className="flex h-7 w-7 items-center justify-center rounded-none text-muted-foreground hover:text-foreground" onClick={onClose} aria-label="Close">
              <X className="h-3.5 w-3.5" />
            </button>
          </header>
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
            <select
              value={lang}
              onChange={(e) => {
                const v = e.target.value as Lang;
                setLang(v);
                langRef.current = v;
                try {
                  localStorage.setItem(LANG_KEY, v);
                } catch {
                  /* ignore */
                }
              }}
              className="h-8 max-w-[170px] rounded-full border border-border bg-background px-2 text-xs text-muted-foreground outline-none hover:bg-muted focus:border-primary"
              aria-label="Reply language"
              title="Language Aladin replies in"
            >
              {LANGS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs",
                webSearch ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
              )}
              onClick={() => {
                webRef.current = !webSearch;
                setWebSearch(!webSearch);
              }}
              aria-pressed={webSearch}
              title="Allow the assistant to search the web for this chat"
            >
              <Globe className="h-3.5 w-3.5" /> Web search {webSearch ? "on" : "off"}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="mb-4 flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-3 py-2 text-sm">{m.content}</div>
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
          {/* composer - the same box as the AI page */}
          <div className="px-4 pb-3 pt-2">
            <div
              className="rounded-3xl border border-border bg-background px-3 py-2 shadow-sm"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(e.dataTransfer?.files);
              }}
            >
              {files.length ? (
                <div className="mb-2 flex flex-wrap gap-2">
                  {files.map((f, idx) => (
                    <div key={`${f.name}-${idx}`} className="group relative flex items-center gap-2 rounded-lg border border-border bg-muted/50 py-1 pl-1 pr-7 text-xs">
                      {f.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.previewUrl} alt={f.name} className="h-10 w-10 rounded-md object-cover" />
                      ) : (
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-background">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        </span>
                      )}
                      <span className="block max-w-[140px] truncate font-medium">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setFiles((cur) => cur.filter((_, i) => i !== idx))}
                        className="absolute right-1 top-1 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Remove ${f.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={ATTACH_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 rounded-full" onClick={() => fileRef.current?.click()} aria-label="Attach image or file" title="Attach image, PDF, Excel, CSV or text" disabled={sending}>
                  <Paperclip className="h-4 w-4" />
                </Button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(input, files);
                    }
                  }}
                  rows={1}
                  placeholder="Ask anything about this product…"
                  className="max-h-[160px] min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[14px] leading-6 outline-none placeholder:text-muted-foreground"
                  aria-label="Message Aladin"
                />
                <Button
                  type="button"
                  size="icon"
                  variant={listening ? "default" : "ghost"}
                  className={cn("h-8 w-8 shrink-0 rounded-full", listening && "animate-pulse bg-red-600 text-white hover:bg-red-600")}
                  onClick={() => void toggleMic()}
                  aria-label={listening ? "Stop voice input" : "Speak your question"}
                  title={listening ? "Listening… click to stop" : transcribing ? "Transcribing…" : "Speak"}
                  disabled={sending || transcribing}
                >
                  <Mic className="h-4 w-4" />
                </Button>
                {sending ? (
                  <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0 rounded-full" onClick={() => abortRef.current?.abort()} aria-label="Stop generating">
                    <Square className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button type="button" size="icon" className="h-8 w-8 shrink-0 rounded-full" disabled={!input.trim() && !files.length} onClick={() => void send(input, files)} aria-label="Send">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </AgainDrawerLayout>
      </AgainDrawerPanel>
      <AiDocumentDrawer doc={docDrawer} onClose={() => setDocDrawer(null)} />
    </>
  );
}
