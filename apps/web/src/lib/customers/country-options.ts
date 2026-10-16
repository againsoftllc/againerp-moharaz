const COUNTRIES_STORAGE = "againerp:countries";
const CUSTOM_COUNTRIES_STORAGE = "againerp:customer-custom-countries";

export const DEFAULT_COUNTRIES = [
  "Bangladesh",
  "India",
  "China",
  "Pakistan",
  "Nepal",
  "Sri Lanka",
  "United Arab Emirates",
  "Saudi Arabia",
  "Singapore",
  "Malaysia",
  "Thailand",
  "Indonesia",
  "United Kingdom",
  "United States",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "Japan",
  "South Korea",
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

export function readCustomCountries(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_COUNTRIES_STORAGE);
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

export function readCountries(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_COUNTRIES];
  try {
    const raw = localStorage.getItem(COUNTRIES_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return dedupe(parsed.filter((c): c is string => typeof c === "string"));
      }
    }
  } catch {
    /* fall through */
  }
  return dedupe([...DEFAULT_COUNTRIES, ...readCustomCountries()]);
}

export function writeCountries(countries: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(COUNTRIES_STORAGE, JSON.stringify(dedupe(countries)));
}

export function isBuiltInCountry(name: string): boolean {
  const key = name.trim().toLowerCase();
  return DEFAULT_COUNTRIES.some((c) => c.toLowerCase() === key);
}

export function buildCountryOptions(current?: string | null): string[] {
  return dedupe([...readCountries(), ...(current ? [current] : [])]);
}

export function addCustomCountry(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return readCountries();
  const existing = readCountries();
  if (existing.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return existing;
  }
  const next = [...existing, trimmed];
  writeCountries(next);
  return next;
}

export function removeCustomCountry(name: string): string[] {
  const key = name.trim().toLowerCase();
  const next = readCountries().filter((c) => c.toLowerCase() !== key);
  writeCountries(next);
  return next;
}

export function renameCustomCountry(from: string, to: string): string[] {
  const nextName = to.trim();
  if (!nextName) return readCountries();
  const fromKey = from.trim().toLowerCase();
  const existing = readCountries();
  const next = existing.map((c) => (c.toLowerCase() === fromKey ? nextName : c));
  writeCountries(next);
  return readCountries();
}
