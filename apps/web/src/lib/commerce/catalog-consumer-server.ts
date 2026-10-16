import { getApiBaseUrl } from "@/lib/api/client";

/** FastAPI base for server-side catalog writes (create product from Center canonical). */
export function consumerApiBaseUrl(): string {
  return (
    process.env.AGAINERP_CONSUMER_API_URL?.trim().replace(/\/$/, "") ||
    getApiBaseUrl() ||
    "http://127.0.0.1:8010"
  );
}

function detailFromBody(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const record = body as {
    detail?: string | { message?: string; code?: string };
    error?: string;
    message?: string;
  };
  if (typeof record.detail === "string" && record.detail.trim()) return record.detail;
  if (record.detail && typeof record.detail === "object") {
    const msg = record.detail.message || record.detail.code;
    if (msg) return String(msg);
  }
  if (typeof record.error === "string" && record.error.trim()) return record.error;
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  return fallback;
}

export class ConsumerApiError extends Error {
  status: number;
  path: string;

  constructor(message: string, status: number, path: string) {
    super(message);
    this.name = "ConsumerApiError";
    this.status = status;
    this.path = path;
  }
}

export async function consumerAuthorizedFetch<T>(
  path: string,
  authorization: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${consumerApiBaseUrl()}${path}`;
  const timeoutMs = 45_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    const cause = aborted
      ? `timed out after ${timeoutMs}ms`
      : err instanceof Error
        ? err.message
        : "network error";
    throw new ConsumerApiError(`ERP API unreachable (${cause}) at ${url}`, 0, path);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    const detail = detailFromBody(body, res.statusText || `HTTP ${res.status}`);
    throw new ConsumerApiError(detail, res.status, path);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
