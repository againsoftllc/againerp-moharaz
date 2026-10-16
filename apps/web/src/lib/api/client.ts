import { getStoredAuthToken, useAdminAuth } from "@/lib/store/admin-auth-store";
import {
  type SubscriptionInactiveStatus,
  useSubscriptionStatus,
} from "@/lib/store/subscription-status-store";

const DEFAULT_API_URL = "http://127.0.0.1:8010";
const GET_CACHE_MS = 60_000;

type ApiCacheEntry = {
  value: unknown;
  savedAt: number;
};

const apiGetCache = new Map<string, ApiCacheEntry>();
const apiGetRequests = new Map<string, Promise<unknown>>();
let apiCacheGeneration = 0;

/** Drop same-session GET cache (call after raw fetch mutations that bypass apiFetch). */
export function invalidateApiGetCache() {
  apiCacheGeneration += 1;
  apiGetCache.clear();
}

/**
 * FastAPI base URL — no trailing slash.
 *
 * Browser: always same-origin (`""`) so requests go to `/api/v1/...` and the
 * Next.js runtime proxy (`API_PROXY_TARGET`) forwards to FastAPI. This works
 * for local Docker and Vercel without CORS or baked-in localhost URLs.
 *
 * Server (SSR / Route Handlers): `API_PROXY_TARGET` → `NEXT_PUBLIC_API_URL` → local default.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }

  const configured =
    process.env.API_PROXY_TARGET?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "");

  return configured || DEFAULT_API_URL;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function fetchApiUncached<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredAuthToken();
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let detail = res.statusText;
    const errText = (await res.text().catch(() => "")).trim();
    if (errText) {
      try {
        const body = JSON.parse(errText) as {
          detail?:
            | string
            | { msg?: string; loc?: (string | number)[] }[]
            | { code?: string; status?: string };
        };
        if (
          res.status === 402 &&
          body.detail &&
          typeof body.detail === "object" &&
          !Array.isArray(body.detail) &&
          body.detail.code === "subscription_inactive"
        ) {
          const inactiveStatus = (body.detail.status ?? "suspended") as SubscriptionInactiveStatus;
          useSubscriptionStatus.getState().setInactiveStatus(inactiveStatus);
          detail = "Subscription inactive";
        } else if (typeof body.detail === "string") {
          detail = body.detail;
        } else if (Array.isArray(body.detail)) {
          detail = body.detail
            .map((item) => {
              const field = item.loc
                ?.filter((part): part is string => typeof part === "string" && part !== "body")
                .join(".");
              const msg = item.msg ?? JSON.stringify(item);
              return field ? `${field}: ${msg}` : msg;
            })
            .join(" · ");
        }
      } catch {
        detail = errText;
      }
    }
    if (
      res.status >= 500 &&
      (detail === "Internal Server Error" || detail === "Bad Gateway") &&
      !errText.includes("detail")
    ) {
      detail =
        errText && errText !== "Internal Server Error" && errText !== "Bad Gateway"
          ? errText.slice(0, 400)
          : `Server error (${res.status}). Check the API terminal logs for details.`;
    }
    if (
      res.status === 401 &&
      typeof window !== "undefined" &&
      !path.includes("/auth/login") &&
      !window.location.pathname.startsWith("/login")
    ) {
      useAdminAuth.getState().clearSession();
      const next = encodeURIComponent(window.location.pathname);
      window.location.assign(`/login?next=${next}`);
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }

  // Empty body (e.g. logout 200) — res.json() throws SyntaxError: Unexpected end of JSON input
  const text = await res.text();
  if (!text.trim()) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("Invalid JSON response from API", res.status);
  }
}

/**
 * Same-session GET cache + request deduplication.
 *
 * Safe read requests are reused briefly when navigating inside a module.
 * Any mutation clears the cache; callers can force a fresh GET with
 * `{ cache: "no-store" }` (used by explicit Refresh actions).
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const cacheable = method === "GET" && init?.cache !== "no-store";

  if (!cacheable) {
    if (method !== "GET") {
      apiCacheGeneration += 1;
      apiGetCache.clear();
    }
    return fetchApiUncached<T>(path, init);
  }

  const token = getStoredAuthToken() ?? "anonymous";
  const key = `${token}:${getApiBaseUrl()}${path}`;
  const cached = apiGetCache.get(key);
  if (cached && Date.now() - cached.savedAt < GET_CACHE_MS) {
    return cached.value as T;
  }

  const pending = apiGetRequests.get(key);
  if (pending) return pending as Promise<T>;

  const generation = apiCacheGeneration;
  const request = fetchApiUncached<T>(path, init).then((value) => {
    if (generation === apiCacheGeneration) {
      apiGetCache.set(key, { value, savedAt: Date.now() });
    }
    return value;
  });
  apiGetRequests.set(key, request);

  try {
    return await request;
  } finally {
    if (apiGetRequests.get(key) === request) {
      apiGetRequests.delete(key);
    }
  }
}
