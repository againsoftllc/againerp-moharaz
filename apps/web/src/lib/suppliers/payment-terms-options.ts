const PAYMENT_TERMS_STORAGE = "againerp:payment-terms";
const CUSTOM_PAYMENT_TERMS_STORAGE = "againerp:custom-payment-terms";

export const DEFAULT_PAYMENT_TERMS = [
  "Due on receipt",
  "Net 7",
  "Net 15",
  "Net 30",
  "Net 45",
  "Net 60",
  "COD",
  "50% advance",
] as const;

function dedupe(items: string[]): string[] {
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

export function readCustomPaymentTerms(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_PAYMENT_TERMS_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      .map((c) => c.trim());
  } catch {
    return [];
  }
}

export function readPaymentTerms(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_PAYMENT_TERMS];
  try {
    const raw = localStorage.getItem(PAYMENT_TERMS_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return dedupe(parsed.filter((c): c is string => typeof c === "string"));
      }
    }
  } catch {
    /* fall through */
  }
  return dedupe([...DEFAULT_PAYMENT_TERMS, ...readCustomPaymentTerms()]);
}

export function writePaymentTerms(terms: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PAYMENT_TERMS_STORAGE, JSON.stringify(dedupe(terms)));
}

export function isBuiltInPaymentTerm(name: string): boolean {
  const key = name.trim().toLowerCase();
  return DEFAULT_PAYMENT_TERMS.some((c) => c.toLowerCase() === key);
}

export function buildPaymentTermOptions(current?: string | null): string[] {
  return dedupe([...readPaymentTerms(), ...(current ? [current] : [])]);
}

export function addCustomPaymentTerm(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return readPaymentTerms();
  const existing = readPaymentTerms();
  if (existing.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return existing;
  }
  const next = [...existing, trimmed];
  writePaymentTerms(next);
  return next;
}

export function removeCustomPaymentTerm(name: string): string[] {
  const key = name.trim().toLowerCase();
  const next = readPaymentTerms().filter((c) => c.toLowerCase() !== key);
  writePaymentTerms(next);
  return next;
}

export function renameCustomPaymentTerm(from: string, to: string): string[] {
  const nextName = to.trim();
  if (!nextName) return readPaymentTerms();
  const fromKey = from.trim().toLowerCase();
  const existing = readPaymentTerms();
  const next = existing.map((c) => (c.toLowerCase() === fromKey ? nextName : c));
  writePaymentTerms(next);
  return readPaymentTerms();
}
