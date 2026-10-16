import type { ApiLogEntry, ApiLogLevel } from "../../types";
import { LOG_STORAGE_KEY, MAX_LOG_ENTRIES } from "../../config";
import { createId } from "../../utils";

type LogListener = (entries: ApiLogEntry[]) => void;

const listeners = new Set<LogListener>();

function readLogs(): ApiLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ApiLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLogs(entries: ApiLogEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_LOG_ENTRIES)));
  } catch {
    /* quota / private mode */
  }
  for (const listener of listeners) listener(entries);
}

export function getApiLogs(): ApiLogEntry[] {
  return readLogs();
}

export function clearApiLogs(): void {
  writeLogs([]);
}

export function subscribeApiLogs(listener: LogListener): () => void {
  listeners.add(listener);
  listener(readLogs());
  return () => listeners.delete(listener);
}

export function appendApiLog(
  partial: Omit<ApiLogEntry, "id" | "at"> & { at?: string; level?: ApiLogLevel },
): ApiLogEntry {
  const entry: ApiLogEntry = {
    id: createId("log"),
    at: partial.at ?? new Date().toISOString(),
    level: partial.level ?? "info",
    method: partial.method,
    path: partial.path,
    status: partial.status,
    latencyMs: partial.latencyMs,
    request: partial.request,
    response: partial.response,
    error: partial.error,
  };
  const next = [entry, ...readLogs()].slice(0, MAX_LOG_ENTRIES);
  writeLogs(next);
  return entry;
}

export function logRequest(method: string, path: string, request?: unknown): string {
  const id = createId("req");
  appendApiLog({
    level: "info",
    method,
    path,
    request: {
      requestId: id,
      body: request,
    },
  });
  return id;
}

export function logResponse(
  method: string,
  path: string,
  status: number,
  latencyMs: number,
  response?: unknown,
): void {
  appendApiLog({
    level: status >= 400 ? "error" : "info",
    method,
    path,
    status,
    latencyMs,
    response,
  });
}

export function logApiError(
  method: string,
  path: string,
  error: string,
  latencyMs?: number,
  response?: unknown,
): void {
  appendApiLog({
    level: "error",
    method,
    path,
    latencyMs,
    error,
    response,
  });
}
