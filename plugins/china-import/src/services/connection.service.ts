import type {
  ChinaImportSettings,
  ChinaImportSettingsInput,
  ConnectionTestResult,
  QuotaInfo,
} from "../types";
import type { ProviderConfig, ProviderId } from "../core/types";
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from "../config";
import { bootstrapProviderEngine, providerManager } from "../core";
import { createElimClient, ElimHttpError } from "../providers/elim";

function readStoredSettings(): ChinaImportSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as ChinaImportSettingsInput;
    return normalizeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeStoredSettings(settings: ChinaImportSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

const IMPLEMENTED_PROVIDERS: ProviderId[] = ["elim", "mock"];

export function normalizeSettings(input: ChinaImportSettingsInput = {}): ChinaImportSettings {
  const activeProviderId = IMPLEMENTED_PROVIDERS.includes(input.activeProviderId as ProviderId)
    ? (input.activeProviderId as ProviderId)
    : DEFAULT_SETTINGS.activeProviderId;

  return {
    baseUrl: String(input.baseUrl ?? DEFAULT_SETTINGS.baseUrl).trim() || DEFAULT_SETTINGS.baseUrl,
    apiKey: String(input.apiKey ?? DEFAULT_SETTINGS.apiKey),
    timeoutMs: clampNumber(input.timeoutMs, 3_000, 120_000, DEFAULT_SETTINGS.timeoutMs),
    retryCount: clampNumber(input.retryCount, 0, 5, DEFAULT_SETTINGS.retryCount),
    environment: input.environment === "production" ? "production" : "sandbox",
    defaultPlatform: input.defaultPlatform === "alibaba" ? "alibaba" : "taobao",
    defaultLang:
      input.defaultLang === "vi" || input.defaultLang === "zh" || input.defaultLang === "en"
        ? input.defaultLang
        : DEFAULT_SETTINGS.defaultLang,
    featureEnabled: Boolean(input.featureEnabled ?? DEFAULT_SETTINGS.featureEnabled),
    activeProviderId,
    debugMode: Boolean(input.debugMode ?? DEFAULT_SETTINGS.debugMode),
  };
}

/** Map plugin settings → provider-agnostic config. */
export function toProviderConfig(settings: ChinaImportSettings): ProviderConfig {
  return {
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    timeoutMs: settings.timeoutMs,
    retryCount: settings.retryCount,
    environment: settings.environment,
    options: {
      platform: settings.defaultPlatform,
      lang: settings.defaultLang,
    },
  };
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Settings + connection service.
 * Standalone — localStorage only; never writes ERP product/inventory rows.
 */
export class ConnectionService {
  getSettings(): ChinaImportSettings {
    return readStoredSettings();
  }

  saveSettings(input: ChinaImportSettingsInput): ChinaImportSettings {
    const next = normalizeSettings({ ...readStoredSettings(), ...input });
    writeStoredSettings(next);
    return next;
  }

  resetSettings(): ChinaImportSettings {
    writeStoredSettings({ ...DEFAULT_SETTINGS });
    return { ...DEFAULT_SETTINGS };
  }

  createClient(settings?: ChinaImportSettings) {
    return createElimClient(settings ?? this.getSettings());
  }

  /** Active BaseProvider via ProviderManager (never Elim-coupled at call site). */
  async getProvider(settings?: ChinaImportSettings) {
    bootstrapProviderEngine();
    const cfg = settings ?? this.getSettings();
    return providerManager.activate(cfg.activeProviderId, toProviderConfig(cfg));
  }

  /**
   * Test active provider connectivity through the provider engine.
   */
  async testConnection(settings?: ChinaImportSettings): Promise<ConnectionTestResult> {
    const cfg = settings ?? this.getSettings();
    const checkedAt = new Date().toISOString();

    if (cfg.activeProviderId !== "mock" && !cfg.apiKey.trim()) {
      return {
        ok: false,
        latencyMs: 0,
        apiVersion: null,
        quota: null,
        message: "API key is missing",
        checkedAt,
      };
    }

    try {
      bootstrapProviderEngine();
      const health = await providerManager.healthCheck(
        cfg.activeProviderId,
        toProviderConfig(cfg),
      );

      return {
        ok: health.ok,
        latencyMs: health.latencyMs,
        apiVersion: health.apiVersion,
        quota: health.quota as QuotaInfo | null,
        message: health.message,
        checkedAt: health.checkedAt || checkedAt,
        raw: health.raw,
      };
    } catch (error) {
      const message =
        error instanceof ElimHttpError
          ? `Failed (${error.status}): ${error.message}`
          : error instanceof Error
            ? error.message
            : "Connection failed";

      return {
        ok: false,
        latencyMs: 0,
        apiVersion: null,
        quota: null,
        message,
        checkedAt,
        raw: error instanceof ElimHttpError ? error.body : undefined,
      };
    }
  }
}

export const connectionService = new ConnectionService();
