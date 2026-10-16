const WARRANTIES_STORAGE = "againerp:product-warranties:v2";

/** Master list starts empty — users add their own warranties. */
export const DEFAULT_WARRANTIES: string[] = [];

function dedupeWarranties(items: string[]): string[] {
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

export function readWarranties(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WARRANTIES_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return dedupeWarranties(parsed.filter((c): c is string => typeof c === "string"));
  } catch {
    return [];
  }
}

export function writeWarranties(warranties: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WARRANTIES_STORAGE, JSON.stringify(dedupeWarranties(warranties)));
}

/** Saved warranties, optionally ensuring the product's current value is listed. */
export function buildWarrantyOptions(current?: string | null): string[] {
  const extra = current?.trim() || "";
  return dedupeWarranties([...readWarranties(), ...(extra ? [extra] : [])]);
}

export function addCustomWarranty(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return readWarranties();
  const existing = readWarranties();
  if (existing.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return existing;
  }
  const next = [...existing, trimmed];
  writeWarranties(next);
  return next;
}

export function removeCustomWarranty(name: string): string[] {
  const key = name.trim().toLowerCase();
  const next = readWarranties().filter((c) => c.toLowerCase() !== key);
  writeWarranties(next);
  return next;
}

export function renameCustomWarranty(from: string, to: string): string[] {
  const nextName = to.trim();
  if (!nextName) return readWarranties();
  const fromKey = from.trim().toLowerCase();
  const existing = readWarranties();
  const next = existing.map((c) => (c.toLowerCase() === fromKey ? nextName : c));
  writeWarranties(next);
  return readWarranties();
}
