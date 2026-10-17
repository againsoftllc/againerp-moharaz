import { apiFetch } from "@/lib/api/client";
import { getStoredAuthToken } from "@/lib/store/admin-auth-store";

/** AI module — conversation history + streaming chat against /api/v1/ai. */

export type AiConversationSummary = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  preview: string;
};

export type AiConversationMessage = {
  id: string;
  role: "user" | "assistant" | string;
  content: string;
  created_at: string;
};

const BASE = "/api/v1/ai";

export async function fetchAiConversations(q?: string): Promise<AiConversationSummary[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ data: AiConversationSummary[] }>(`${BASE}/conversations${qs}`);
  return res.data;
}

export async function fetchAiConversation(id: string): Promise<{ data: AiConversationSummary; messages: AiConversationMessage[] }> {
  return apiFetch(`${BASE}/conversations/${id}`);
}

export async function renameAiConversation(id: string, title: string): Promise<AiConversationSummary> {
  const res = await apiFetch<{ data: AiConversationSummary }>(`${BASE}/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
  return res.data;
}

export async function deleteAiConversation(id: string): Promise<void> {
  await apiFetch(`${BASE}/conversations/${id}`, { method: "DELETE" });
}

/** Provider failure reported mid-stream. `conversationDiscarded` means the server rolled back a
 * conversation it had just created for this request — the id from the `conversation` event is gone. */
export class AiStreamError extends Error {
  readonly conversationDiscarded: boolean;
  constructor(message: string, conversationDiscarded: boolean) {
    super(message);
    this.name = "AiStreamError";
    this.conversationDiscarded = conversationDiscarded;
  }
}

export type StreamEvents = {
  onConversation?: (id: string) => void;
  onText?: (delta: string) => void;
  onToolStart?: (toolName: string) => void;
  onToolResult?: (toolName: string, error?: string | null, output?: unknown) => void;
  /** Server-side fix-up: replace the whole reply with corrected text (e.g. an image URL a
   * small model mangled while writing markdown) — the streamed deltas already sent are wrong. */
  onTextCorrection?: (text: string) => void;
  onDone?: (stats: Record<string, unknown>) => void;
};

/**
 * POST /ai/chat/stream and feed the Server-Sent Events to the callbacks. Resolves when the
 * stream ends; rejects on HTTP errors or an `error` event. `signal` aborts mid-stream (Stop).
 */
export async function streamAiChat(
  payload: {
    message: string;
    conversation_id?: string;
    enable_web_search?: boolean;
    reply_language?: "auto" | "bn" | "en" | "banglish";
    /** A narrow chat (few tools, short prompt) — the product drawer sends "product_fill". */
    scope?: "product_fill";
    /** Images (vision) and documents (PDF/Excel/CSV/text), base64 without the data: prefix. */
    attachments?: { name: string; mime: string; data: string; size?: number }[];
  },
  events: StreamEvents,
  signal?: AbortSignal,
): Promise<void> {
  const token = getStoredAuthToken();
  const res = await fetch(`${BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
    const detail = typeof body.detail === "string" ? body.detail : `AI request failed (${res.status})`;
    throw new Error(detail);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Streaming is not supported in this browser");
  const decoder = new TextDecoder();
  let buffer = "";
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
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(dataRaw) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (eventName === "conversation") events.onConversation?.(String(data.conversation_id));
      else if (eventName === "text_delta") events.onText?.(String(data.text ?? ""));
      else if (eventName === "tool_start") events.onToolStart?.(String(data.tool_name ?? ""));
      else if (eventName === "tool_result") events.onToolResult?.(String(data.tool_name ?? ""), (data.error as string | null) ?? null, data.output);
      else if (eventName === "text_correction") events.onTextCorrection?.(String(data.text ?? ""));
      else if (eventName === "done") events.onDone?.(data);
      else if (eventName === "error") throw new AiStreamError(String(data.detail ?? "AI request failed"), Boolean(data.conversation_discarded));
    }
  }
}

/** Aladin engine settings — administrators only (workspace:write). The key itself is never returned. */
export type AiSettings = {
  configured: boolean;
  source: "workspace" | "env" | "";
  key_hint: string;
  model: string;
  provider_label: string;
  updated_at: string | null;
};

export async function fetchAiSettings(): Promise<AiSettings> {
  return apiFetch<AiSettings>(`${BASE}/settings`);
}

export async function saveAiKey(apiKey: string): Promise<AiSettings> {
  return apiFetch<AiSettings>(`${BASE}/settings/key`, { method: "PUT", body: JSON.stringify({ api_key: apiKey }) });
}

export async function removeAiKey(): Promise<AiSettings> {
  return apiFetch<AiSettings>(`${BASE}/settings/key`, { method: "DELETE" });
}

/**
 * Server-side voice (Aladin engine). Both reject with status 503 when no engine key is
 * configured — callers fall back to the browser's own speech APIs in that case.
 */
export class AiVoiceError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AiVoiceError";
    this.status = status;
  }
}

async function voiceError(res: Response): Promise<AiVoiceError> {
  const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
  const detail = typeof body.detail === "string" ? body.detail : `Voice request failed (${res.status})`;
  return new AiVoiceError(detail, res.status);
}

export async function transcribeAudio(blob: Blob, language?: "auto" | "bn" | "en" | "banglish"): Promise<string> {
  const token = getStoredAuthToken();
  const form = new FormData();
  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : blob.type.includes("wav") ? "wav" : "webm";
  form.append("audio", blob, `speech.${ext}`);
  if (language && language !== "auto") form.append("language", language);
  const res = await fetch(`${BASE}/voice/transcribe`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
  if (!res.ok) throw await voiceError(res);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

export async function synthesizeSpeech(text: string, language?: "auto" | "bn" | "en" | "banglish"): Promise<Blob> {
  const token = getStoredAuthToken();
  const res = await fetch(`${BASE}/voice/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ text, language }),
  });
  if (!res.ok) throw await voiceError(res);
  return res.blob();
}
