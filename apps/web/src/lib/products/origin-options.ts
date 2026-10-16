const ORIGINS_STORAGE = "againerp:product-origins";

export const DEFAULT_ORIGINS = [
  "China",
  "Bangladesh",
  "India",
  "USA",
  "Japan",
  "South Korea",
  "Taiwan",
  "Vietnam",
  "Thailand",
  "Germany",
  "Italy",
  "United Kingdom",
  "Malaysia",
  "Indonesia",
] as const;

function dedupeOrigins(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function readOrigins(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_ORIGINS];
  try {
    const raw = localStorage.getItem(ORIGINS_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        // Empty list is a real saved state (user deleted every option).
        return dedupeOrigins(
          parsed.filter((c): c is string => typeof c === "string"),
        );
      }
    }
  } catch {
    /* fall through */
  }
  return [...DEFAULT_ORIGINS];
}

export function writeOrigins(origins: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ORIGINS_STORAGE, JSON.stringify(dedupeOrigins(origins)));
}

/** Built-in + saved origins, optionally ensuring the current value is listed. */
export function buildOriginOptions(current?: string | null): string[] {
  return dedupeOrigins([...readOrigins(), ...(current ? [current] : [])]);
}

export function addCustomOrigin(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return readOrigins();
  const existing = readOrigins();
  if (existing.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return existing;
  }
  const next = [...existing, trimmed];
  writeOrigins(next);
  return next;
}

export function removeCustomOrigin(name: string): string[] {
  const key = name.trim().toLowerCase();
  const next = readOrigins().filter((c) => c.toLowerCase() !== key);
  writeOrigins(next);
  return next;
}

export function renameCustomOrigin(from: string, to: string): string[] {
  const nextName = to.trim();
  if (!nextName) return readOrigins();
  const fromKey = from.trim().toLowerCase();
  const existing = readOrigins();
  const next = existing.map((c) => (c.toLowerCase() === fromKey ? nextName : c));
  writeOrigins(next);
  return readOrigins();
}
