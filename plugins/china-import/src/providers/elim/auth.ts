import type { ChinaImportSettings } from "../../types";

/** Build Elim request headers. Prefer x-api-key (server-to-server). */
export function buildElimAuthHeaders(settings: ChinaImportSettings): Record<string, string> {
  const key = settings.apiKey.trim();
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (key) {
    headers["x-api-key"] = key;
  }
  return headers;
}

export function assertApiKey(settings: ChinaImportSettings): void {
  if (!settings.apiKey.trim()) {
    throw new ElimAuthError("API key is required. Save settings first.");
  }
}

export class ElimAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ElimAuthError";
  }
}
