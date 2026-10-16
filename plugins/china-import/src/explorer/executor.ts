import type { BaseProvider, ProviderConfig, ProviderId } from "../core/types";
import { ElimProvider } from "../providers/elim/provider";
import {
  ProviderApiError,
  ProviderHttpError,
  ProviderTimeoutError,
  ProviderValidationError,
} from "../core/BaseProvider";
import type { ExplorerEndpointDef, ExplorerEndpointId } from "./catalog";
import type { ProviderErrorInfo } from "../core/types";
import { createId, prettyJson } from "../utils";

export type ExplorerFieldValues = Record<string, string | number | boolean | File | null>;

export type ExplorerExecutionResult = {
  id: string;
  endpointId: ExplorerEndpointId;
  providerId: ProviderId;
  at: string;
  durationMs: number;
  status: number;
  ok: boolean;
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
  };
  response: unknown;
  error?: ProviderErrorInfo;
  curl: string;
};

const HISTORY_KEY = "againerp.plugin.china-import.explorer-history";
const MAX_HISTORY = 100;

function asString(value: string | number | boolean | File | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "object") return "";
  return String(value);
}

function asNumber(value: string | number | boolean | File | null | undefined): number | undefined {
  if (value === "" || value == null || typeof value === "object" || typeof value === "boolean") {
    return undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function classifyError(error: unknown): ProviderErrorInfo {
  if (error instanceof ProviderValidationError) {
    return { kind: "validation", message: error.message };
  }
  if (error instanceof ProviderTimeoutError) {
    return { kind: "timeout", message: error.message };
  }
  if (error instanceof ProviderHttpError) {
    return { kind: "http", message: error.message, status: error.status, details: error.body };
  }
  if (error instanceof ProviderApiError) {
    return { kind: "provider", message: error.message, code: error.code, details: error.details };
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("timed out") || error.name === "AbortError") {
      return { kind: "timeout", message: error.message };
    }
    return { kind: "unknown", message: error.message };
  }
  return { kind: "unknown", message: "Unknown error", details: error };
}

function buildCurl(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): string {
  const parts = [`curl -X ${method} '${url}'`];
  for (const [k, v] of Object.entries(headers)) {
    const safe = k.toLowerCase() === "x-api-key" && v ? `${v.slice(0, 4)}…` : v;
    parts.push(`  -H '${k}: ${safe}'`);
  }
  if (body !== undefined && body !== null && method !== "GET") {
    parts.push(`  -d '${prettyJson(body).replace(/'/g, "'\\''")}'`);
  }
  return parts.join(" \\\n");
}

function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] =
      k.toLowerCase().includes("key") || k.toLowerCase().includes("auth")
        ? v
          ? `${"*".repeat(Math.min(8, v.length))}${v.slice(-4)}`
          : ""
        : v;
  }
  return out;
}

/**
 * Execute a catalog endpoint against the active BaseProvider.
 * Never couples to Elim HTTP paths in the UI layer.
 */
export async function executeExplorerRequest(args: {
  endpoint: ExplorerEndpointDef;
  values: ExplorerFieldValues;
  provider: BaseProvider;
  providerId: ProviderId;
  config: ProviderConfig;
}): Promise<ExplorerExecutionResult> {
  const { endpoint, values, provider, providerId, config } = args;
  const started = performance.now();
  const at = new Date().toISOString();
  const headers = maskHeaders({
    Accept: "application/json",
    "x-api-key": config.apiKey || "",
    "x-provider-id": providerId,
  });
  const logicalUrl = `${config.baseUrl.replace(/\/+$/, "")}${endpoint.path}`;

  let body: unknown = undefined;
  let response: unknown;
  let status = 200;
  let error: ProviderErrorInfo | undefined;

  try {
    switch (endpoint.id) {
      case "auth.testConnection":
      case "utilities.ping": {
        body = {};
        response = await provider.testConnection();
        status = (response as { ok?: boolean }).ok ? 200 : 502;
        break;
      }
      case "auth.health": {
        response = await provider.health();
        status = (response as { ok?: boolean }).ok ? 200 : 502;
        break;
      }
      case "products.search": {
        body = {
          q: asString(values.q),
          page: asNumber(values.page) ?? 1,
          size: asNumber(values.size) ?? 20,
          sort: asString(values.sort) || undefined,
          minPrice: asNumber(values.minPrice),
          maxPrice: asNumber(values.maxPrice),
          extras: {
            platform: asString(values.platform) || "taobao",
            lang: asString(values.lang) || "en",
          },
        };
        if (!asString(values.q).trim()) {
          throw new ProviderValidationError("Keyword (q) is required");
        }
        response = await provider.searchProducts(body as never);
        break;
      }
      case "products.get": {
        const id = asString(values.id).trim();
        if (!id) throw new ProviderValidationError("Product ID is required");
        body = {
          id,
          extras: {
            platform: asString(values.platform) || "taobao",
            lang: asString(values.lang) || "en",
          },
        };
        response = await provider.getProduct(id, (body as { extras: Record<string, string> }).extras);
        break;
      }
      case "products.searchByImage": {
        const file = values.file instanceof File ? values.file : null;
        body = {
          imgUrl: asString(values.imgUrl) || undefined,
          imgId: asString(values.imgId) || undefined,
          file: file ? `[File:${file.name}]` : undefined,
          page: asNumber(values.page) ?? 1,
          size: asNumber(values.size) ?? 20,
          extras: { platform: asString(values.platform) || "taobao" },
        };
        response = await provider.searchByImage({
          imgUrl: asString(values.imgUrl) || undefined,
          imgId: asString(values.imgId) || undefined,
          file: file ?? undefined,
          page: asNumber(values.page) ?? 1,
          size: asNumber(values.size) ?? 20,
          extras: { platform: asString(values.platform) || "taobao" },
        });
        break;
      }
      case "categories.list": {
        body = {
          platform: asString(values.platform) || "taobao",
          parentId: asString(values.parentId) || undefined,
        };
        response = await provider.getCategories(body as Record<string, string>);
        break;
      }
      case "brands.list": {
        response = await provider.getBrands();
        break;
      }
      case "currencies.list": {
        response = await provider.getCurrencies();
        break;
      }
      case "images.upload": {
        const file = values.file instanceof File ? values.file : null;
        if (!file) throw new ProviderValidationError("Image file is required");
        body = { file: `[File:${file.name}]` };
        if (provider instanceof ElimProvider) {
          response = await provider.uploadImageFile(file);
        } else {
          response = { imageId: `mock-upload-${Date.now()}`, raw: { mock: true } };
        }
        break;
      }
      default:
        throw new ProviderValidationError(`Unknown endpoint: ${endpoint.id}`);
    }
  } catch (err) {
    error = classifyError(err);
    status = error.status ?? (error.kind === "validation" ? 400 : 500);
    response = { error };
  }

  const durationMs = Math.round(performance.now() - started);
  const result: ExplorerExecutionResult = {
    id: createId("expl"),
    endpointId: endpoint.id,
    providerId,
    at,
    durationMs,
    status,
    ok: !error && status < 400,
    request: {
      url: logicalUrl,
      method: endpoint.method,
      headers,
      body: body ?? null,
    },
    response,
    error,
    curl: buildCurl(endpoint.method, logicalUrl, headers, body ?? null),
  };

  pushHistory(result);
  return result;
}

export type ExplorerHistoryEntry = Pick<
  ExplorerExecutionResult,
  "id" | "endpointId" | "providerId" | "at" | "durationMs" | "status" | "ok"
> & {
  values: ExplorerFieldValues;
  snapshot: ExplorerExecutionResult;
};

function serializeValues(values: ExplorerFieldValues): ExplorerFieldValues {
  const out: ExplorerFieldValues = {};
  for (const [k, v] of Object.entries(values)) {
    out[k] = v instanceof File ? null : v;
  }
  return out;
}

let lastValuesByEndpoint: Partial<Record<ExplorerEndpointId, ExplorerFieldValues>> = {};

export function rememberExplorerValues(
  endpointId: ExplorerEndpointId,
  values: ExplorerFieldValues,
): void {
  lastValuesByEndpoint[endpointId] = serializeValues(values);
}

function pushHistory(result: ExplorerExecutionResult): void {
  if (typeof window === "undefined") return;
  const values = lastValuesByEndpoint[result.endpointId] ?? {};
  const entry: ExplorerHistoryEntry = {
    id: result.id,
    endpointId: result.endpointId,
    providerId: result.providerId,
    at: result.at,
    durationMs: result.durationMs,
    status: result.status,
    ok: result.ok,
    values,
    snapshot: result,
  };
  try {
    const prev = getExplorerHistory();
    const next = [entry, ...prev].slice(0, MAX_HISTORY);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function getExplorerHistory(): ExplorerHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ExplorerHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearExplorerHistory(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(HISTORY_KEY);
}
