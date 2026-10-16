/** Normalization helpers — coerce provider values into universal types. */

export function normalizePrice(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function normalizeCurrency(value: unknown, fallback = "CNY"): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().toUpperCase().slice(0, 3);
}

export function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(v)) return true;
    if (["false", "0", "no", "n", "off"].includes(v)) return false;
  }
  return null;
}

export function normalizeDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizeNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function normalizeWeight(value: unknown, unit?: string): number | null {
  const n = normalizeNumber(value);
  if (n == null) return null;
  const u = (unit ?? "").toLowerCase();
  if (u === "g" || u === "gram" || u === "grams") return n / 1000;
  if (u === "kg" || u === "kilogram") return n;
  return n;
}

export function normalizeDimensions(raw: unknown): {
  length?: number;
  width?: number;
  height?: number;
  unit?: string;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const length = normalizeNumber(o.length);
  const width = normalizeNumber(o.width);
  const height = normalizeNumber(o.height);
  if (length == null && width == null && height == null) return null;
  return {
    length: length ?? undefined,
    width: width ?? undefined,
    height: height ?? undefined,
    unit: typeof o.unit === "string" ? o.unit : "cm",
  };
}

export function normalizeUnit(value: unknown, fallback = "pcs"): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim();
}

export function normalizeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const url = value.trim();
  if (!/^https?:\/\//i.test(url) && !url.startsWith("//")) return null;
  return url.startsWith("//") ? `https:${url}` : url;
}

export function normalizeString(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function createUniversalId(provider: string, providerId: string): string {
  return `${provider}:${providerId}`;
}
