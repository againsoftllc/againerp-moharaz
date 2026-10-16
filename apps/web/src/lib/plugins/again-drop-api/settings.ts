import { findPlugin, buildPluginDefaults } from "@/lib/settings/plugins/registry";
import type { PluginInstallState } from "@/lib/settings/plugins/types";
import { fetchElimStatus, searchElimProducts } from "@/lib/api/elim-import";

export const AGAIN_DROP_API_PLUGIN_ID = "again-drop-api";

/** Marker stored in plugin config when credentials come from apps/api/.env */
export const SERVER_KEY_MARKER = "__server_again_drop_key__";
/** Legacy marker — still accepted so existing installs keep working */
const LEGACY_SERVER_KEY_MARKER = "__server_elim_key__";

export type AgainDropApiConfig = {
  baseUrl: string;
  apiKey: string;
  environment: "sandbox" | "production";
  timeoutMs: number;
  retryCount: number;
  defaultPlatform: "taobao" | "alibaba";
  defaultLang: "en" | "vi" | "zh";
  useServerKey: boolean;
};

const DEFAULTS: AgainDropApiConfig = {
  baseUrl: "https://openapi.elim.asia",
  apiKey: "",
  environment: "sandbox",
  timeoutMs: 30_000,
  retryCount: 1,
  defaultPlatform: "taobao",
  defaultLang: "en",
  useServerKey: true,
};

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isServerKeyMarker(rawKey: string): boolean {
  return rawKey === "" || rawKey === SERVER_KEY_MARKER || rawKey === LEGACY_SERVER_KEY_MARKER;
}

/** User-facing copy must never show legacy provider names. */
function brandMessage(message: string): string {
  return message
    .replace(/\bELIM_API_KEY\b/g, "AgainDrop API key")
    .replace(/\bElim\b/gi, "AgainDrop API");
}

/** Read AgainDrop API connection config from plugin install state. */
export function parseAgainDropApiConfig(
  state?: PluginInstallState | null,
): AgainDropApiConfig {
  const plugin = findPlugin(AGAIN_DROP_API_PLUGIN_ID);
  const defaults = plugin ? buildPluginDefaults(plugin) : {};
  const config = { ...defaults, ...(state?.config ?? {}) };

  const platform = asString(config.default_platform, DEFAULTS.defaultPlatform);
  const lang = asString(config.default_lang, DEFAULTS.defaultLang);
  const environment = asString(config.environment, DEFAULTS.environment);
  const rawKey = typeof config.api_key === "string" ? config.api_key.trim() : "";
  const hasCustomKey = !isServerKeyMarker(rawKey);
  // A real custom key always wins so typing a new API key is not silently ignored
  // when the "use server key" toggle is still on from defaults.
  const useServerKey = hasCustomKey
    ? false
    : config.use_server_key === true ||
      config.use_server_key === "true" ||
      isServerKeyMarker(rawKey);

  return {
    baseUrl: asString(config.base_url, DEFAULTS.baseUrl).replace(/\/+$/, ""),
    apiKey: useServerKey ? SERVER_KEY_MARKER : rawKey,
    environment: environment === "production" ? "production" : "sandbox",
    timeoutMs: asNumber(config.timeout_ms, DEFAULTS.timeoutMs),
    retryCount: asNumber(config.retry_count, DEFAULTS.retryCount),
    defaultPlatform: platform === "alibaba" ? "alibaba" : "taobao",
    defaultLang: lang === "vi" || lang === "zh" ? lang : "en",
    useServerKey,
  };
}

export function isAgainDropApiConfigured(config: AgainDropApiConfig): boolean {
  if (config.useServerKey) return true;
  return Boolean(config.apiKey.trim() && !isServerKeyMarker(config.apiKey) && config.baseUrl.trim());
}

export function againDropApiConfigToStore(
  config: AgainDropApiConfig,
): Record<string, string | boolean | number> {
  return {
    base_url: config.baseUrl,
    api_key: config.useServerKey ? SERVER_KEY_MARKER : config.apiKey,
    use_server_key: config.useServerKey,
    environment: config.environment,
    timeout_ms: config.timeoutMs,
    retry_count: config.retryCount,
    default_platform: config.defaultPlatform,
    default_lang: config.defaultLang,
  };
}

/**
 * Prefer the already-running API server key (apps/api/.env).
 * Falls back to a browser → proxy call only when a custom plugin key is set.
 */
export async function testAgainDropApiConnection(
  config: AgainDropApiConfig,
): Promise<{ ok: boolean; message: string; latencyMs: number; status?: number; via: "server" | "proxy" }> {
  const started = Date.now();

  if (config.useServerKey || isServerKeyMarker(config.apiKey)) {
    try {
      const status = await fetchElimStatus();
      if (!status.configured) {
        return {
          ok: false,
          message: "Server AgainDrop API key is not configured in apps/api/.env",
          latencyMs: Date.now() - started,
          via: "server",
        };
      }
      const search = await searchElimProducts({
        q: "phone",
        platform: config.defaultPlatform,
        page: 1,
        size: 1,
      });
      const count = Array.isArray(search.items) ? search.items.length : 0;
      return {
        ok: Boolean(search.success ?? true),
        message: `Server AgainDrop API key OK · ${count} sample result(s)`,
        latencyMs: Date.now() - started,
        via: "server",
      };
    } catch (err) {
      return {
        ok: false,
        message: brandMessage(
          err instanceof Error ? err.message : "Server AgainDrop API connection failed",
        ),
        latencyMs: Date.now() - started,
        via: "server",
      };
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs || 30_000);

  try {
    const res = await fetch("/api/plugins/china-import/v1/products/search", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-api-key": config.apiKey.trim(),
        "x-elim-base-url": config.baseUrl || DEFAULTS.baseUrl,
      },
      body: JSON.stringify({
        q: "phone",
        platform: config.defaultPlatform,
        page: 1,
        size: 1,
        lang: config.defaultLang,
      }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    const body = (await res.json().catch(() => null)) as
      | { success?: boolean; message?: string; code?: number }
      | null;

    if (!res.ok) {
      return {
        ok: false,
        message: brandMessage(body?.message || `HTTP ${res.status}`),
        latencyMs,
        status: res.status,
        via: "proxy",
      };
    }

    return {
      ok: true,
      message: brandMessage(body?.message || "Connected to AgainDrop API"),
      latencyMs,
      status: res.status,
      via: "proxy",
    };
  } catch (err) {
    return {
      ok: false,
      message: brandMessage(err instanceof Error ? err.message : "Connection failed"),
      latencyMs: Date.now() - started,
      via: "proxy",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Sync plugin config to use the live server AgainDrop API credentials. */
export async function syncAgainDropApiFromServer(): Promise<AgainDropApiConfig> {
  const status = await fetchElimStatus();
  return {
    ...DEFAULTS,
    baseUrl: (status.base_url || DEFAULTS.baseUrl).replace(/\/+$/, ""),
    apiKey: SERVER_KEY_MARKER,
    useServerKey: true,
  };
}
