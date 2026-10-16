/**
 * Shared Center fleet client credentials for server routes
 * (entitlements, AI conversation, commerce).
 */

export type CenterBind = {
  centerUrl: string;
  clientId: string;
  apiKey: string;
};

function envCenterBaseUrl() {
  return (
    process.env.AGAINERP_CENTER_URL ||
    process.env.NEXT_PUBLIC_AGAINERP_CENTER_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
}

async function loadBindFile(): Promise<{
  center_url?: string;
  client_id?: string;
  api_key?: string;
} | null> {
  try {
    const { promises: fs } = await import("fs");
    const path = await import("path");
    const raw = await fs.readFile(path.join(process.cwd(), ".data", "center-bind.json"), "utf8");
    return JSON.parse(raw) as { center_url?: string; client_id?: string; api_key?: string };
  } catch {
    return null;
  }
}

/** Resolve API host (UI host → Railway API). */
export function resolveCenterApiBase(base: string): string {
  const cleaned = base.replace(/\/$/, "");
  if (cleaned.includes("center.againerp.com")) {
    return "https://center-api-production.up.railway.app";
  }
  return cleaned;
}

export async function resolveCenterBind(): Promise<CenterBind | null> {
  const bind = await loadBindFile();
  const clientId =
    bind?.client_id?.trim() ||
    process.env.AGAINERP_CLIENT_ID?.trim() ||
    "";
  const apiKey =
    bind?.api_key?.trim() ||
    process.env.AGAINERP_CLIENT_API_KEY?.trim() ||
    process.env.AGAINERP_CLIENT_AGENT_TOKEN?.trim() ||
    "";
  const base = (bind?.center_url || envCenterBaseUrl()).replace(/\/$/, "");
  if (!base || !clientId || !apiKey) return null;
  return {
    centerUrl: resolveCenterApiBase(base),
    clientId,
    apiKey,
  };
}

export function centerClientHeaders(bind: CenterBind): HeadersInit {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${bind.apiKey}`,
    "X-Client-Id": bind.clientId,
  };
}
