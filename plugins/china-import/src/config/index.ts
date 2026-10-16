import type { ChinaImportSettings } from "../types";

/** Feature flag — plugin is inert unless this is true. */
export const CHINA_IMPORT_FEATURE_FLAG = "NEXT_PUBLIC_CHINA_IMPORT_PLUGIN";

export const CHINA_IMPORT_PLUGIN_ID = "china-import";

export const CHINA_IMPORT_PLUGIN_NAME = "China Import (Elim)";

export const CHINA_IMPORT_PLUGIN_VERSION = "0.5.0";

export const DEFAULT_ELIM_BASE_URL = "https://openapi.elim.asia";

export const SETTINGS_STORAGE_KEY = "againerp.plugin.china-import.settings";

export const LOG_STORAGE_KEY = "againerp.plugin.china-import.logs";

export const MAX_LOG_ENTRIES = 200;

export const DEFAULT_SETTINGS: ChinaImportSettings = {
  baseUrl: DEFAULT_ELIM_BASE_URL,
  apiKey: "",
  timeoutMs: 30_000,
  retryCount: 1,
  environment: "sandbox",
  defaultPlatform: "taobao",
  defaultLang: "en",
  featureEnabled: false,
  activeProviderId: "elim",
  debugMode: false,
};

function readFeatureFlagEnv(): string | undefined {
  try {
    // Next.js inlines NEXT_PUBLIC_* at build time in the host app.
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env;
    return env?.NEXT_PUBLIC_CHINA_IMPORT_PLUGIN;
  } catch {
    return undefined;
  }
}

/**
 * Host feature flag check.
 * Enable with NEXT_PUBLIC_CHINA_IMPORT_PLUGIN=1 (or true / on / enabled).
 */
export function isChinaImportPluginEnabled(envValue: string | undefined = readFeatureFlagEnv()): boolean {
  if (!envValue) return false;
  const v = envValue.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "enabled";
}

export function resolveApiBaseUrl(settings: ChinaImportSettings): string {
  const raw = (settings.baseUrl || DEFAULT_ELIM_BASE_URL).replace(/\/+$/, "");
  return raw;
}

/**
 * Browser calls go through the host proxy to avoid Elim CORS.
 * Server / Node uses the configured Elim base URL directly.
 */
export function resolveRequestBaseUrl(settings: ChinaImportSettings): {
  requestBaseUrl: string;
  upstreamBaseUrl: string;
  useProxy: boolean;
} {
  const upstreamBaseUrl = resolveApiBaseUrl(settings);
  const useProxy = typeof window !== "undefined";
  return {
    requestBaseUrl: useProxy ? "/api/plugins/china-import" : upstreamBaseUrl,
    upstreamBaseUrl,
    useProxy,
  };
}
