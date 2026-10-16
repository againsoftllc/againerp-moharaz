import type { ChinaImportSettings } from "../../types";
import { resolveRequestBaseUrl } from "../../config";
import { sleep } from "../../utils";
import { assertApiKey, buildElimAuthHeaders, ElimAuthError } from "./auth";
import { logApiError, logResponse } from "./logger";

export class ElimHttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ElimHttpError";
    this.status = status;
    this.body = body;
  }
}

export type ElimRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  formData?: FormData;
  /** Skip auth assertion (e.g. public health probes). */
  skipAuth?: boolean;
  signal?: AbortSignal;
};

export type ElimRequestResult<T> = {
  data: T;
  status: number;
  latencyMs: number;
  headers: Headers;
};

function buildUrl(baseUrl: string, path: string, query?: ElimRequestOptions["query"]): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const joined = `${baseUrl.replace(/\/+$/, "")}${normalizedPath}`;
  const url =
    typeof window !== "undefined" && joined.startsWith("/")
      ? new URL(joined, window.location.origin)
      : new URL(joined);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return typeof window !== "undefined" && joined.startsWith("/")
    ? `${url.pathname}${url.search}`
    : url.toString();
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Reusable Elim HTTP client with timeout, retries, and request/response logging.
 * Does not import any ERP modules.
 */
export class ElimClient {
  constructor(private readonly settings: ChinaImportSettings) {}

  getSettings(): ChinaImportSettings {
    return this.settings;
  }

  async request<T = unknown>(options: ElimRequestOptions): Promise<ElimRequestResult<T>> {
    if (!options.skipAuth) {
      assertApiKey(this.settings);
    }

    const method = options.method ?? (options.body || options.formData ? "POST" : "GET");
    const { requestBaseUrl, upstreamBaseUrl, useProxy } = resolveRequestBaseUrl(this.settings);
    const url = buildUrl(requestBaseUrl, options.path, options.query);
    const retries = Math.max(0, this.settings.retryCount);
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const started = performance.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.settings.timeoutMs);

      if (options.signal) {
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }

      try {
        const headers = buildElimAuthHeaders(this.settings);
        if (useProxy) {
          headers["x-elim-base-url"] = upstreamBaseUrl;
        }
        let body: BodyInit | undefined;
        if (options.formData) {
          body = options.formData;
        } else if (options.body !== undefined) {
          headers["Content-Type"] = "application/json";
          body = JSON.stringify(options.body);
        }

        const res = await fetch(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        });

        const latencyMs = Math.round(performance.now() - started);
        const data = await parseBody(res);

        logResponse(method, options.path, res.status, latencyMs, data);

        if (!res.ok) {
          const message =
            typeof data === "object" && data && "message" in data
              ? String((data as { message: unknown }).message)
              : res.statusText || `HTTP ${res.status}`;
          throw new ElimHttpError(message, res.status, data);
        }

        return {
          data: data as T,
          status: res.status,
          latencyMs,
          headers: res.headers,
        };
      } catch (error) {
        const latencyMs = Math.round(performance.now() - started);
        lastError = error;

        if (error instanceof ElimAuthError) {
          logApiError(method, options.path, error.message, latencyMs);
          throw error;
        }

        if (error instanceof ElimHttpError) {
          const retryable = error.status >= 500 || error.status === 429;
          if (!retryable || attempt >= retries) {
            logApiError(method, options.path, error.message, latencyMs, error.body);
            throw error;
          }
        } else {
          const message =
            error instanceof Error
              ? error.name === "AbortError"
                ? `Request timed out after ${this.settings.timeoutMs}ms`
                : error.message
              : "Network error";
          if (attempt >= retries) {
            logApiError(method, options.path, message, latencyMs);
            throw new Error(message);
          }
        }

        await sleep(250 * (attempt + 1));
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Request failed");
  }
}

export function createElimClient(settings: ChinaImportSettings): ElimClient {
  return new ElimClient(settings);
}
