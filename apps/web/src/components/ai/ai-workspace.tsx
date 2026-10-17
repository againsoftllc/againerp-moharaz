"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import {
  ArrowUp,
  Check,
  Copy,
  Globe,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Volume2,
  PanelLeftClose,
  Paperclip,
  FileText,
  PanelLeftOpen,
  Pencil,
  Search,
  Settings,
  Sparkles,
  Square,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MarkdownLite } from "@/components/ai/markdown-lite";
import { AiPresetSettingsPanel } from "@/components/ai/ai-preset-settings-panel";
import { AiDocumentDrawer, parseDocLink, type AiDocumentRef } from "@/components/ai/ai-document-drawer";
import { AgainSystray } from "@/components/again/again-systray";
import { WorkspaceNavDrawerToggle } from "@/components/workspace/workspace-nav-drawer-toggle";
import {
  deleteAiConversation,
  fetchAiConversation,
  fetchAiConversations,
  renameAiConversation,
  streamAiChat,
  AiStreamError,
  fetchAiSettings,
  saveAiKey,
  removeAiKey,
  transcribeAudio,
  synthesizeSpeech,
  AiVoiceError,
  type AiConversationSummary,
  type AiSettings,
} from "@/lib/api/ai-chat";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { cn, formatDate } from "@/lib/utils";

/**
 * AI module — ChatGPT-style workspace: conversation history on the left, the active chat on
 * the right. Conversations live on the server (/api/v1/ai/conversations); replies stream over
 * SSE from /api/v1/ai/chat/stream and are persisted by the gateway once the stream completes.
 */

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  /** Set when the assistant's last tool call returned a preview awaiting the user's go-ahead. */
  pendingAction?: string;
  /** Files the user sent with this message (client-side only; history keeps a text note). */
  attachments?: ChatAttachment[];
};

const SUGGESTIONS = [
  "Which customers have overdue invoices right now?",
  "Summarise this month's sales vs last month",
  "Which products are low on stock?",
  "Show me the top 5 suppliers by purchase value",
];

function groupLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "Previous 7 days";
  if (diffDays < 30) return "Previous 30 days";
  return d.toLocaleDateString("en", { month: "long", year: "numeric" });
}

const GROUP_ORDER = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days"];

type ChatAttachment = { name: string; mime: string; size: number; previewUrl?: string };
type PendingFile = ChatAttachment & { file: File };
const ATTACH_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/csv,text/plain,text/markdown,application/json,.csv,.txt,.md,.json,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type ReplyLanguage = "auto" | "bn" | "en" | "banglish";
const LANG_KEY = "againai.reply_language";
const LANG_OPTIONS: { value: ReplyLanguage; label: string }[] = [
  { value: "auto", label: "Auto (match my language)" },
  { value: "bn", label: "বাংলা" },
  { value: "banglish", label: "Banglish" },
  { value: "en", label: "English" },
];

/** Minimal typing for the browser SpeechRecognition API (prefixed in Chrome/Safari). */
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
function speechCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Markdown → plain speech text (drop code fences, table pipes, emphasis, headings, links). */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*\|?[\s:|-]+\|\s*$/gm, "")
    .replace(/\|/g, ", ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

export function AiWorkspace({ initialConversationId }: { initialConversationId?: string | null }) {
  const user = useAdminAuth((s) => s.user);
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Rendered client-only (dynamic import, ssr: false), so reading the viewport here is safe.
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= 768));
  const [activeId, setActiveId] = useState<string | null>(initialConversationId ?? null);
  // Only the conversation the page was opened with is auto-loaded. Later `?c=` updates come
  // from our own history.replaceState after a send and must not re-open (and abort) the chat.
  const initialRef = useRef<string | null>(initialConversationId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [webSearch, setWebSearch] = useState(false);
  const [renameTarget, setRenameTarget] = useState<AiConversationSummary | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AiConversationSummary | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Aladin engine settings (admins only): the key is stored server-side; we only ever see a hint.
  const isAdmin =
    ["admin", "system_manager"].includes((user?.role ?? "").toLowerCase()) ||
    Boolean(user?.role_ids?.includes("role_system_manager"));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"engine" | "presets">("engine");
  // Document opened from a doc:// link in a reply — rendered as a drawer over the chat.
  const [docDrawer, setDocDrawer] = useState<AiDocumentRef | null>(null);
  const openDocLink = useCallback((href: string, label: string) => {
    const ref = parseDocLink(href);
    if (!ref) {
      toast.error("This link cannot be opened here.");
      return;
    }
    setDocDrawer({ ...ref, label });
  }, []);

  // ---- Attachments (images → vision, documents → extracted text) -------------------------
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFiles = useCallback((list: FileList | File[] | null | undefined) => {
    if (!list) return;
    const incoming = Array.from(list);
    setPendingFiles((cur) => {
      const next = [...cur];
      for (const file of incoming) {
        if (next.length >= MAX_ATTACHMENTS) {
          toast.error(`At most ${MAX_ATTACHMENTS} files per message`);
          break;
        }
        const isImage = file.type.startsWith("image/");
        if (file.size > (isImage ? MAX_IMAGE_BYTES : MAX_ATTACHMENT_BYTES)) {
          toast.error(`${file.name} is too large (max ${isImage ? "5" : "8"} MB)`);
          continue;
        }
        if (next.some((p) => p.name === file.name && p.size === file.size)) continue;
        next.push({ file, name: file.name || (isImage ? "image.png" : "file"), mime: file.type, size: file.size, previewUrl: isImage ? URL.createObjectURL(file) : undefined });
      }
      return next;
    });
  }, []);
  const removeFile = useCallback((idx: number) => {
    setPendingFiles((cur) => {
      const gone = cur[idx];
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return cur.filter((_, i) => i !== idx);
    });
  }, []);
  const onComposerPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    },
    [addFiles],
  );
  const [dragOver, setDragOver] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);

  const openSettings = useCallback(async () => {
    setSettingsOpen(true);
    setKeyDraft("");
    try {
      setAiSettings(await fetchAiSettings());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load Aladin settings");
    }
  }, []);

  const submitKey = useCallback(async () => {
    const key = keyDraft.trim();
    if (!key) return;
    setKeyBusy(true);
    try {
      setAiSettings(await saveAiKey(key));
      setKeyDraft("");
      toast.success("Aladin is connected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the key");
    } finally {
      setKeyBusy(false);
    }
  }, [keyDraft]);

  // ---- Language & voice -------------------------------------------------------------
  // Reply language is a per-browser preference; "auto" mirrors whatever the user types
  // (Bangla script / English / Banglish). Voice input uses the browser's speech recognition
  // (Chrome/Edge/Safari), voice output the browser's speech synthesis — nothing leaves the
  // page except the final text, exactly like typing.
  const [lang, setLang] = useState<ReplyLanguage>(() => {
    try {
      const v = localStorage.getItem(LANG_KEY);
      return v === "bn" || v === "en" || v === "banglish" ? v : "auto";
    } catch {
      return "auto";
    }
  });
  const changeLang = useCallback((v: ReplyLanguage) => {
    setLang(v);
    try {
      localStorage.setItem(LANG_KEY, v);
    } catch {
      /* private mode */
    }
  }, []);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported = typeof window !== "undefined" && (Boolean(speechCtor()) || "MediaRecorder" in window);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyMessage = useCallback((id: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    });
  }, []);

  // Server-side voice (Aladin engine) is preferred — it understands Bangla on every device.
  // `serverVoiceRef` flips to false the first time the server says no engine key (503), after
  // which the browser's own speech APIs are used for the rest of the session.
  const serverVoiceRef = useRef<boolean>(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [transcribing, setTranscribing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Only one voice at a time: every speak() takes a new sequence number; a request whose
  // number is no longer current (user pressed another Read aloud, Stop, or the mic) is
  // discarded even if its audio arrives later — so two replies can never play together.
  const speakSeqRef = useRef(0);

  const stopSpeaking = useCallback(() => {
    speakSeqRef.current += 1;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, []);

  const stopListening = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop(); // onstop → transcription
    } else {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  const [micHelpOpen, setMicHelpOpen] = useState(false);
  const [micState, setMicState] = useState<"unknown" | "prompt" | "granted" | "denied" | "insecure">("unknown");

  const beginRecognition = useCallback(() => {
    const Ctor = speechCtor();
    if (!Ctor) {
      toast.error("Voice input is not supported in this browser. Try Chrome or Edge.");
      return;
    }
    const rec = new Ctor();
    rec.lang = lang === "bn" ? "bn-BD" : "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    const base = input.trim() ? `${input.trim()} ` : "";
    rec.onresult = (ev) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < ev.results.length; i += 1) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setInput(base + finalText + interim);
      if (textareaRef.current) autoGrow(textareaRef.current);
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setMicState("denied");
        setMicHelpOpen(true);
      } else if (ev.error !== "aborted" && ev.error !== "no-speech") {
        toast.error(`Voice input failed (${ev.error})`);
      }
      stopListening();
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }, [input, lang, stopListening]);

  /**
   * Microphone approval flow. The browser owns the permission, so the page can only (1) ask
   * — getUserMedia triggers the browser's own Allow/Block prompt — and (2) when it has been
   * blocked, explain exactly where to re-enable it. Voice input also needs a secure context
   * (https or localhost).
   */
  const startListening = useCallback(async () => {
    stopSpeaking(); // never record while a reply is being read out — no echo, no overlap
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setMicState("insecure");
      setMicHelpOpen(true);
      return;
    }
    try {
      const perms = (navigator as Navigator & { permissions?: { query: (d: { name: string }) => Promise<{ state: string }> } }).permissions;
      if (perms?.query) {
        const status = await perms.query({ name: "microphone" });
        if (status.state === "denied") {
          setMicState("denied");
          setMicHelpOpen(true);
          return;
        }
        setMicState(status.state === "granted" ? "granted" : "prompt");
      }
    } catch {
      /* Firefox/Safari may not support querying "microphone" — fall through to the prompt */
    }
    try {
      // Explicit ask: this is what shows the browser's Allow / Block dialog the first time.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicState("granted");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setMicState("denied");
        setMicHelpOpen(true);
        return;
      }
      if (name === "NotFoundError") {
        toast.error("No microphone was found on this device.");
        return;
      }
      // Other failures: let recognition try anyway — it reports its own error.
    }
    if (serverVoiceRef.current && typeof MediaRecorder !== "undefined") {
      // Record locally, transcribe on the server (Aladin engine) when the user stops.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m));
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        const base = input.trim() ? `${input.trim()} ` : "";
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          recorderRef.current = null;
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          chunksRef.current = [];
          if (blob.size < 1500) return; // nothing said
          setTranscribing(true);
          setStatus("Transcribing…");
          transcribeAudio(blob, lang)
            .then((text) => {
              if (text) {
                setInput(base + text);
                setTimeout(() => textareaRef.current && autoGrow(textareaRef.current), 0);
              } else {
                toast.message("Didn't catch that — please try again.");
              }
            })
            .catch((err) => {
              if (err instanceof AiVoiceError && err.status === 503) {
                serverVoiceRef.current = false;
                toast.message("Voice engine not configured — using the browser's voice instead.");
              } else {
                toast.error(err instanceof Error ? err.message : "Transcription failed");
              }
            })
            .finally(() => {
              setTranscribing(false);
              setStatus(null);
            });
        };
        recorderRef.current = rec;
        streamRef.current = stream;
        setListening(true);
        rec.start(250);
        return;
      } catch {
        // MediaRecorder unavailable → browser recognition below
      }
    }
    beginRecognition();
  }, [beginRecognition, input, lang, stopSpeaking]);

  const speakInBrowser = useCallback((id: string, text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("Read-aloud is not supported in this browser.");
      return;
    }
    const synth = window.speechSynthesis;
    const plain = stripMarkdown(text);
    const utter = new SpeechSynthesisUtterance(plain);
    const isBangla = /[ঀ-৿]/.test(plain);
    utter.lang = isBangla ? "bn-BD" : "en-US";
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(isBangla ? "bn" : "en"));
    if (isBangla && !voice) {
      toast.message("This browser has no Bangla voice; configure the Aladin engine key for natural Bangla speech.");
    }
    if (voice) utter.voice = voice;
    utter.rate = 1;
    utter.onend = () => setSpeakingId((cur) => (cur === id ? null : cur));
    utter.onerror = () => setSpeakingId((cur) => (cur === id ? null : cur));
    setSpeakingId(id);
    synth.speak(utter);
  }, []);

  const speak = useCallback(
    async (id: string, text: string) => {
      if (speakingId === id) {
        stopSpeaking();
        return;
      }
      stopSpeaking();
      if (listening) stopListening();
      if (!serverVoiceRef.current) {
        speakInBrowser(id, text);
        return;
      }
      const seq = speakSeqRef.current;
      setSpeakingId(id);
      setStatus("Preparing voice…");
      try {
        const blob = await synthesizeSpeech(text, lang);
        if (speakSeqRef.current !== seq) return; // superseded while the audio was being made
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        const finish = () => {
          URL.revokeObjectURL(url);
          if (audioRef.current === audio) audioRef.current = null;
          setSpeakingId((cur) => (cur === id ? null : cur));
        };
        audio.onended = finish;
        audio.onerror = finish;
        await audio.play();
        if (speakSeqRef.current !== seq) {
          audio.pause();
          finish();
        }
      } catch (err) {
        if (speakSeqRef.current !== seq) return;
        setSpeakingId(null);
        if (err instanceof AiVoiceError && err.status === 503) {
          serverVoiceRef.current = false;
          speakInBrowser(id, text);
        } else {
          toast.error(err instanceof Error ? err.message : "Could not read aloud");
        }
      } finally {
        if (speakSeqRef.current === seq) setStatus(null);
      }
    },
    [speakingId, lang, listening, stopListening, stopSpeaking, speakInBrowser],
  );

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioRef.current) audioRef.current.pause();
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const clearKey = useCallback(async () => {
    setKeyBusy(true);
    try {
      setAiSettings(await removeAiKey());
      toast.success("Aladin key removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the key");
    } finally {
      setKeyBusy(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setConversations(await fetchAiConversations());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load chat history");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadHistory(), 0);
    return () => clearTimeout(t);
  }, [loadHistory]);

  const openConversation = useCallback(
    async (id: string | null, { push = true }: { push?: boolean } = {}) => {
      abortRef.current?.abort();
      setActiveId(id);
      setStatus(null);
      if (push) window.history.replaceState(null, "", id ? `/ai?c=${id}` : "/ai");
      if (!id) {
        setMessages([]);
        return;
      }
      setMessagesLoading(true);
      try {
        const res = await fetchAiConversation(id);
        setMessages(res.messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content })));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not open conversation");
        setActiveId(null);
        setMessages([]);
        // Drop a dead `?c=` so a reload doesn't re-open the same missing chat.
        window.history.replaceState(null, "", "/ai");
      } finally {
        setMessagesLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const id = initialRef.current;
    if (!id) return;
    const t = setTimeout(() => void openConversation(id, { push: false }), 0);
    return () => clearTimeout(t);
  }, [openConversation]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q ? conversations.filter((c) => `${c.title} ${c.preview}`.toLowerCase().includes(q)) : conversations;
    const map = new Map<string, AiConversationSummary[]>();
    for (const c of rows) {
      const label = groupLabel(c.updated_at || c.created_at);
      map.set(label, [...(map.get(label) ?? []), c]);
    }
    const keys = [...map.keys()].sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a);
      const ib = GROUP_ORDER.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return b.localeCompare(a);
    });
    return keys.map((k) => ({ label: k, items: map.get(k)! }));
  }, [conversations, search]);

  const send = useCallback(
    async (raw: string) => {
      const files = pendingFiles;
      const text = raw.trim() || (files.length ? "Please look at the attached file(s)." : "");
      if (!text || sending) return;
      setInput("");
      setPendingFiles([]);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      const userMsg: ChatMessage = {
        id: `u_${Date.now()}`,
        role: "user",
        content: text,
        attachments: files.length ? files.map(({ name, mime, size, previewUrl }) => ({ name, mime, size, previewUrl })) : undefined,
      };
      const assistantId = `a_${Date.now()}`;
      setMessages((m) => [...m.map((msg) => (msg.pendingAction ? { ...msg, pendingAction: undefined } : msg)), userMsg, { id: assistantId, role: "assistant", content: "", pending: true }]);
      setSending(true);
      setStatus("Thinking…");
      const controller = new AbortController();
      abortRef.current = controller;
      let convoId = activeId;
      try {
        const attachments = files.length
          ? await Promise.all(files.map(async (f) => ({ name: f.name, mime: f.mime, size: f.size, data: await readAsBase64(f.file) })))
          : undefined;
        await streamAiChat(
          { message: text, conversation_id: activeId ?? undefined, enable_web_search: webSearch, reply_language: lang, attachments },
          {
            onConversation: (id) => {
              convoId = id;
              if (!activeId) {
                setActiveId(id);
                window.history.replaceState(null, "", `/ai?c=${id}`);
              }
            },
            onText: (delta) => {
              setStatus(null);
              setMessages((m) => m.map((msg) => (msg.id === assistantId ? { ...msg, content: msg.content + delta, pending: false } : msg)));
            },
            onToolStart: (tool) => setStatus(`Looking things up (${tool.replace(/_/g, " ")})…`),
            onTextCorrection: (text) => {
              setMessages((m) => m.map((msg) => (msg.id === assistantId ? { ...msg, content: text, pending: false } : msg)));
            },
            onToolResult: (toolName, _error, output) => {
              setStatus("Thinking…");
              // A preview means the assistant is about to ask "Confirm?" — offer Accept / Deny
              // buttons on this reply instead of making the user type it.
              const st = output && typeof output === "object" ? (output as { status?: unknown }).status : undefined;
              setMessages((m) =>
                m.map((msg) => (msg.id === assistantId ? { ...msg, pendingAction: st === "preview" ? toolName : undefined } : msg)),
              );
            },
          },
          controller.signal,
        );
        setMessages((m) => m.map((msg) => (msg.id === assistantId && !msg.content ? { ...msg, content: "No response from the model.", pending: false } : { ...msg, pending: false })));
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        // The server rolled back a conversation it had just created (provider failure), or the
        // id we were holding no longer exists — stop pointing at it, or every later send 404s.
        const stale = err instanceof Error && /conversation not found/i.test(err.message);
        const discarded = (err instanceof AiStreamError && err.conversationDiscarded) || stale;
        if (discarded) {
          convoId = null;
          setActiveId(null);
          window.history.replaceState(null, "", "/ai");
        }
        const failure = stale
          ? "This chat no longer exists. A new chat has been started — please send your message again."
          : `⚠️ ${err instanceof Error ? err.message : "AI request failed"}`;
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? { ...msg, pending: false, content: msg.content || (aborted ? "Stopped." : failure) }
              : msg,
          ),
        );
        if (!aborted) toast.error(err instanceof Error ? err.message : "AI request failed");
      } finally {
        setSending(false);
        setStatus(null);
        abortRef.current = null;
        void loadHistory();
        if (convoId) window.history.replaceState(null, "", `/ai?c=${convoId}`);
      }
    },
    [activeId, sending, webSearch, lang, pendingFiles, loadHistory],
  );

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  async function confirmRename() {
    if (!renameTarget) return;
    const title = renameDraft.trim();
    if (!title) return;
    try {
      await renameAiConversation(renameTarget.id, title);
      setRenameTarget(null);
      void loadHistory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteAiConversation(deleteTarget.id);
      if (activeId === deleteTarget.id) void openConversation(null);
      setDeleteTarget(null);
      void loadHistory();
      toast.success("Chat deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const activeTitle = conversations.find((c) => c.id === activeId)?.title;
  const firstName = (user?.name || user?.email || "there").split(" ")[0];

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
          {/* Workspace module drawer — every module chrome mounts this; the AI page has no navbar of its own. */}
          <WorkspaceNavDrawerToggle tone="light" className="h-9 w-9 rounded-md" />
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={sidebarOpen ? "Close chat list" : "Open chat list"}
            title={sidebarOpen ? "Close chat list" : "Open chat list"}
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-semibold">Aladin</span>
            {activeTitle ? <span className="truncate text-sm text-muted-foreground">· {activeTitle}</span> : null}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <select
              value={lang}
              onChange={(e) => changeLang(e.target.value as ReplyLanguage)}
              className="h-8 max-w-[150px] rounded-full border border-border bg-background px-2 text-xs text-muted-foreground outline-none hover:bg-muted focus:border-primary"
              aria-label="Reply language"
              title="Language Aladin replies in"
            >
              {LANG_OPTIONS.map((o) => (
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
              onClick={() => setWebSearch((v) => !v)}
              aria-pressed={webSearch}
              title="Allow the assistant to search the web for this chat"
            >
              <Globe className="h-3.5 w-3.5" /> Web search {webSearch ? "on" : "off"}
            </button>
            {isAdmin ? (
              <button
                type="button"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => void openSettings()}
                aria-label="Aladin settings"
                title="Aladin settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            ) : null}
            {/* Notifications / theme / user menu, same systray as the module navbars (styled for a dark strip). */}
            <div className="ml-1 rounded-md bg-[#2b3a32] px-1">
              <AgainSystray />
            </div>
          </div>
      </header>
      <div className="flex min-h-0 flex-1">
      {/* ---------------- Sidebar: chat history ---------------- */}
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col border-r border-border bg-muted/30 transition-[width] duration-200",
          sidebarOpen ? "w-[260px]" : "w-0 overflow-hidden border-r-0",
        )}
        aria-label="Chat history"
      >
        <div className="flex items-center gap-1 px-2 pt-2">
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => void openConversation(null)}
              aria-label="New chat"
              title="New chat"
            >
              <SquarePen className="h-4 w-4" />
            </button>
          </div>
        </div>
        <button
          type="button"
          className="mx-2 mt-2 flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
          onClick={() => void openConversation(null)}
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          New chat
        </button>
        <label className="relative mx-2 mt-1 block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats"
            className="h-8 w-full rounded-md border border-transparent bg-transparent pl-8 pr-2 text-sm outline-none placeholder:text-muted-foreground focus:border-border focus:bg-background"
            aria-label="Search chats"
          />
        </label>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {historyLoading ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">Loading chats…</p>
          ) : grouped.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">{search ? "No chats match." : "No chats yet. Ask something to start one."}</p>
          ) : (
            grouped.map((g) => (
              <div key={g.label} className="mb-3">
                <p className="px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">{g.label}</p>
                {g.items.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "group relative flex items-center rounded-md text-sm",
                      activeId === c.id ? "bg-muted font-medium" : "hover:bg-muted/70",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate px-2 py-1.5 text-left"
                      title={c.title}
                      onClick={() => {
                        void openConversation(c.id);
                        if (window.innerWidth < 768) setSidebarOpen(false);
                      }}
                    >
                      {c.title || "New chat"}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "mr-1 rounded p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-foreground focus:opacity-100 group-hover:opacity-100",
                            activeId === c.id && "opacity-100",
                          )}
                          aria-label="Chat options"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-40">
                        <DropdownMenuItem
                          onClick={() => {
                            setRenameTarget(c);
                            setRenameDraft(c.title);
                          }}
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(c)}>
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ---------------- Main: chat ---------------- */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {messagesLoading ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">Loading conversation…</p>
          ) : messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6 text-center">
              <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted/40">
                <Sparkles className="h-6 w-6" />
              </span>
              <h1 className="text-2xl font-semibold">What can I help with, {firstName}?</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask about customers, orders, stock, purchases or finance. Aladin only answers from your ERP data and tells you when it can&apos;t find something.
              </p>
              <div className="mt-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="rounded-xl border border-border bg-background px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => void send(s)}
                  >
                    <MessageSquare className="mb-1 h-3.5 w-3.5" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl px-4 py-6">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="mb-6 flex justify-end">
                    <div className="max-w-[80%] rounded-2xl bg-muted px-4 py-2.5 text-[14px] leading-relaxed">
                      {m.attachments?.length ? (
                        <div className="mb-2 flex flex-wrap gap-2">
                          {m.attachments.map((a, idx) =>
                            a.previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={idx} src={a.previewUrl} alt={a.name} className="max-h-40 max-w-[220px] rounded-lg object-cover" />
                            ) : (
                              <span key={idx} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 py-1 text-xs">
                                <FileText className="h-3.5 w-3.5 text-muted-foreground" /> {a.name}
                                <span className="text-muted-foreground">· {formatBytes(a.size)}</span>
                              </span>
                            ),
                          )}
                        </div>
                      ) : null}
                      <span className="whitespace-pre-wrap">{m.content}</span>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="mb-6 flex gap-3">
                    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      {m.content ? (
                        <>
                          <MarkdownLite text={m.content} onOpenDocument={openDocLink} />
                          {m.pendingAction && !m.pending ? (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Button size="sm" className="h-8 rounded-full px-3" disabled={sending} onClick={() => void send("Yes, confirm.")}>
                                <Check className="mr-1 h-3.5 w-3.5" /> Accept
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 rounded-full px-3" disabled={sending} onClick={() => void send("No, cancel that.")}>
                                <X className="mr-1 h-3.5 w-3.5" /> Deny
                              </Button>
                              <span className="text-[11px] text-muted-foreground">Accept runs the action shown above.</span>
                            </div>
                          ) : null}
                          {!m.pending ? (
                            <div className="mt-1 flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => copyMessage(m.id, m.content)}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground",
                                  copiedId === m.id && "text-primary",
                                )}
                                aria-label={copiedId === m.id ? "Copied" : "Copy"}
                                title={copiedId === m.id ? "Copied" : "Copy"}
                              >
                                {copiedId === m.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                {copiedId === m.id ? "Copied" : "Copy"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void speak(m.id, m.content)}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground",
                                  speakingId === m.id && "text-primary",
                                )}
                                aria-label={speakingId === m.id ? "Stop reading" : "Read aloud"}
                                title={speakingId === m.id ? "Stop" : "Read aloud"}
                              >
                                {speakingId === m.id ? <Square className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                                {speakingId === m.id ? "Stop" : "Read aloud"}
                              </button>
                            </div>
                          ) : null}
                        </>
                      ) : m.pending ? (
                        <span className="inline-flex items-center gap-1 py-1 text-sm text-muted-foreground">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.2s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.1s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" />
                          {status ? <span className="ml-2">{status}</span> : null}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ),
              )}
              {status && !messages.some((m) => m.pending) ? <p className="text-xs text-muted-foreground">{status}</p> : null}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 px-4 pb-4 pt-2">
          <div className="mx-auto w-full max-w-3xl">
            <div
              className={cn(
                "rounded-2xl border border-border bg-background px-3 py-2 shadow-sm focus-within:border-foreground/30",
                dragOver && "border-primary bg-primary/5",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                if (!dragOver) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                addFiles(e.dataTransfer?.files);
              }}
            >
              {pendingFiles.length ? (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendingFiles.map((f, idx) => (
                    <div key={`${f.name}-${idx}`} className="group relative flex items-center gap-2 rounded-lg border border-border bg-muted/50 py-1 pl-1 pr-7 text-xs">
                      {f.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.previewUrl} alt={f.name} className="h-10 w-10 rounded-md object-cover" />
                      ) : (
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-background">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        </span>
                      )}
                      <span className="max-w-[160px]">
                        <span className="block truncate font-medium">{f.name}</span>
                        <span className="block text-[10px] text-muted-foreground">{formatBytes(f.size)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
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
                ref={fileInputRef}
                type="file"
                multiple
                accept={ATTACH_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 rounded-full"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach image or file"
                title="Attach image, PDF, Excel, CSV or text (or drag & drop / paste)"
                disabled={sending}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoGrow(e.target);
                }}
                onKeyDown={onComposerKey}
                onPaste={onComposerPaste}
                placeholder="Ask anything about your business…"
                rows={1}
                className="max-h-[200px] min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[14px] leading-6 outline-none placeholder:text-muted-foreground"
                aria-label="Message Aladin"
              />
              {speechSupported ? (
                <Button
                  type="button"
                  size="icon"
                  variant={listening ? "default" : "ghost"}
                  className={cn("h-8 w-8 shrink-0 rounded-full", listening && "animate-pulse bg-red-600 text-white hover:bg-red-600")}
                  onClick={() => {
                    if (listening) stopListening();
                    else void startListening();
                  }}
                  aria-label={listening ? "Stop voice input" : "Speak your question"}
                  title={listening ? "Listening… click to stop" : transcribing ? "Transcribing…" : `Speak (${lang === "bn" ? "বাংলা" : lang === "en" ? "English" : "Bangla / English"})`}
                  disabled={sending || transcribing}
                >
                  <Mic className="h-4 w-4" />
                </Button>
              ) : null}
              {sending ? (
                <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0 rounded-full" onClick={() => abortRef.current?.abort()} aria-label="Stop generating">
                  <Square className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button type="button" size="icon" className="h-8 w-8 shrink-0 rounded-full" disabled={!input.trim()} onClick={() => void send(input)} aria-label="Send">
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </div>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Aladin answers from your ERP data and can make mistakes. Enter to send, Shift+Enter for a new line.
            </p>
          </div>
        </div>
      </section>
      </div>

      {/* Rename dialog */}
      <Dialog.Root open={Boolean(renameTarget)} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(420px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-5 shadow-xl">
            <Dialog.Title className="text-base font-semibold">Rename chat</Dialog.Title>
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void confirmRename()}
              className="mt-3 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/40"
              aria-label="Chat title"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setRenameTarget(null)}>
                <X className="mr-1 h-3.5 w-3.5" /> Cancel
              </Button>
              <Button size="sm" onClick={() => void confirmRename()} disabled={!renameDraft.trim()}>
                <Check className="mr-1 h-3.5 w-3.5" /> Save
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete dialog */}
      <Dialog.Root open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(420px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-5 shadow-xl">
            <Dialog.Title className="text-base font-semibold">Delete chat?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              &ldquo;{deleteTarget?.title}&rdquo; and its messages will be permanently deleted.
              {deleteTarget ? ` Started ${formatDate(deleteTarget.created_at)}.` : ""}
            </Dialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={() => void confirmDelete()}>
                Delete
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Document opened from a reply (doc:// link) — same drawer the module page uses */}
      <AiDocumentDrawer doc={docDrawer} onClose={() => setDocDrawer(null)} />

      {/* Microphone permission help */}
      <Dialog.Root open={micHelpOpen} onOpenChange={setMicHelpOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(460px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-5 shadow-xl">
            <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
              <Mic className="h-4 w-4 text-primary" /> Allow microphone for Aladin
            </Dialog.Title>
            {micState === "insecure" ? (
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                Voice input only works on a secure (https) address. Open AgainERP over https and try again.
              </Dialog.Description>
            ) : (
              <>
                <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                  The browser has blocked microphone access for this site, so the approval prompt no longer appears.
                  Re-enable it once and voice input will work from then on:
                </Dialog.Description>
                <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
                  <li>
                    Click the <strong>lock / tune icon</strong> at the left of the address bar.
                  </li>
                  <li>
                    Set <strong>Microphone</strong> to <strong>Allow</strong> (Chrome/Edge: &ldquo;Site settings&rdquo; → Microphone; Safari: Settings for
                    this website → Microphone).
                  </li>
                  <li>Reload the page, then press the microphone button again.</li>
                </ol>
                <p className="mt-3 text-xs text-muted-foreground">
                  On macOS, also make sure the browser itself is allowed under System Settings → Privacy &amp; Security → Microphone.
                </p>
              </>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setMicHelpOpen(false)}>
                Close
              </Button>
              {micState !== "insecure" ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setMicHelpOpen(false);
                    void startListening();
                  }}
                >
                  Try again
                </Button>
              ) : null}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Aladin settings (admins) */}
      <Dialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content
            className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-xl ${
              settingsTab === "presets" ? "w-[min(980px,94vw)]" : "w-[min(460px,92vw)]"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
                <Sparkles className="h-4 w-4 text-primary" /> Aladin settings
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Close settings">
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>
            <div className="mt-3 flex gap-1 border-b border-border" role="tablist" aria-label="Aladin settings">
              {(
                [
                  ["engine", "Engine"],
                  ["presets", "Presets"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={settingsTab === id}
                  onClick={() => setSettingsTab(id)}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                    settingsTab === id ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {settingsTab === "presets" ? (
              <div className="mt-4" role="tabpanel">
                <Dialog.Description className="mb-4 text-sm text-muted-foreground">
                  Company rules Aladin follows when it writes each field. Only administrators can see this tab.
                </Dialog.Description>
                <AiPresetSettingsPanel />
              </div>
            ) : (
            <div role="tabpanel">
            <Dialog.Description className="mt-4 text-sm text-muted-foreground">
              Aladin needs an engine key to answer from your ERP data. The key is stored securely on the
              server and is never shown again.
            </Dialog.Description>
            <div className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              {aiSettings === null ? (
                <span className="text-muted-foreground">Checking status…</span>
              ) : aiSettings.configured ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Connected{aiSettings.key_hint ? ` · key ending in ${aiSettings.key_hint}` : ""}
                  <span className="text-muted-foreground">
                    · {aiSettings.source === "workspace" ? "set from this screen" : "set on the server"}
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> Not connected — Aladin can&rsquo;t reply yet.
                </span>
              )}
            </div>
            <label className="mt-4 block text-xs font-medium text-muted-foreground" htmlFor="againai-key">
              Aladin API key
            </label>
            <input
              id="againai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitKey();
                }
              }}
              placeholder={aiSettings?.configured ? "Paste a new key to replace the current one" : "Paste the key here"}
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              The key is verified before it is saved. Only administrators can see this screen.
            </p>
            <div className="mt-4 flex items-center justify-between gap-2">
              {aiSettings?.configured && aiSettings.source === "workspace" ? (
                <Button variant="ghost" size="sm" className="text-destructive" disabled={keyBusy} onClick={() => void clearKey()}>
                  Remove key
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSettingsOpen(false)}>
                  Close
                </Button>
                <Button size="sm" disabled={keyBusy || keyDraft.trim().length < 8} onClick={() => void submitKey()}>
                  {keyBusy ? "Verifying…" : "Save & verify"}
                </Button>
              </div>
            </div>
            </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
