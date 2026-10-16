const CURRENCIES_STORAGE = "againerp:currencies";
const CUSTOM_CURRENCIES_STORAGE = "againerp:custom-currencies";

/** Odoo-style: symbol sits before or after the amount. */
export type CurrencySymbolPosition = "before" | "after";

export type CurrencyOption = {
  code: string;
  name: string;
  symbol?: string;
  /** `before` = left of value (`৳1,234`), `after` = right (`1,234 ৳`). */
  position?: CurrencySymbolPosition;
};

export const DEFAULT_CURRENCIES: CurrencyOption[] = [
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳", position: "before" },
  { code: "USD", name: "US Dollar", symbol: "$", position: "before" },
  { code: "EUR", name: "Euro", symbol: "€", position: "after" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", position: "before" },
  { code: "GBP", name: "British Pound", symbol: "£", position: "before" },
  { code: "INR", name: "Indian Rupee", symbol: "₹", position: "before" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", position: "after" },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼", position: "after" },
];

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

function optionalText(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

function normalizePosition(value: unknown): CurrencySymbolPosition | undefined {
  return value === "after" || value === "before" ? value : undefined;
}

function normalizeRow(row: CurrencyOption): CurrencyOption | null {
  const code = normalizeCode(row.code);
  if (!code) return null;
  return {
    code,
    name: row.name.trim() || code,
    symbol: optionalText(row.symbol),
    position: normalizePosition(row.position),
  };
}

function dedupe(items: CurrencyOption[]): CurrencyOption[] {
  const seen = new Map<string, CurrencyOption>();
  for (const row of items) {
    const next = normalizeRow(row);
    if (!next) continue;
    const existing = seen.get(next.code);
    if (!existing) {
      seen.set(next.code, next);
      continue;
    }
    seen.set(next.code, {
      ...existing,
      name: next.name || existing.name,
      symbol: next.symbol || existing.symbol,
      position: next.position ?? existing.position,
    });
  }
  return [...seen.values()];
}

function mergeDefaultCurrencies(rows: CurrencyOption[]): CurrencyOption[] {
  return dedupe([...DEFAULT_CURRENCIES, ...rows]).map((row) => ({
    ...row,
    position: row.position ?? "before",
  }));
}

export function parseCurrencyInput(raw: string): CurrencyOption | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const split = trimmed.match(/^([A-Za-z]{3})\s*[—–-]\s*(.+)$/);
  if (split) {
    const code = normalizeCode(split[1]);
    const name = split[2].trim();
    if (!code || !name) return null;
    return { code, name, position: "before" };
  }
  if (/^[A-Za-z]{3}$/.test(trimmed)) {
    const code = trimmed.toUpperCase();
    return { code, name: code, position: "before" };
  }
  const code = normalizeCode(trimmed) || trimmed.slice(0, 10).toUpperCase();
  if (!code) return null;
  return { code, name: trimmed, position: "before" };
}

function parseStored(raw: string): CurrencyOption[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out: CurrencyOption[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const rec = row as {
        code?: unknown;
        name?: unknown;
        symbol?: unknown;
        position?: unknown;
      };
      const code = typeof rec.code === "string" ? normalizeCode(rec.code) : "";
      const name = typeof rec.name === "string" ? rec.name.trim() : "";
      if (!code) continue;
      out.push({
        code,
        name: name || code,
        symbol: typeof rec.symbol === "string" ? optionalText(rec.symbol) : undefined,
        position: normalizePosition(rec.position),
      });
    }
    return out;
  } catch {
    return null;
  }
}

export function readCustomCurrencies(): CurrencyOption[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(CUSTOM_CURRENCIES_STORAGE);
  if (!raw) return [];
  return parseStored(raw) ?? [];
}

export function readCurrencies(): CurrencyOption[] {
  if (typeof window === "undefined") return [...DEFAULT_CURRENCIES];
  const raw = localStorage.getItem(CURRENCIES_STORAGE);
  if (raw) {
    const parsed = parseStored(raw);
    if (parsed) return mergeDefaultCurrencies(parsed);
  }
  return mergeDefaultCurrencies(readCustomCurrencies());
}

export function writeCurrencies(currencies: CurrencyOption[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CURRENCIES_STORAGE, JSON.stringify(dedupe(currencies)));
}

export function isBuiltInCurrency(code: string): boolean {
  const key = normalizeCode(code);
  return DEFAULT_CURRENCIES.some((c) => c.code === key);
}

export function buildCurrencyOptions(current?: string | null): CurrencyOption[] {
  const rows = [...readCurrencies()];
  if (current?.trim()) {
    const code = normalizeCode(current) || current.trim().toUpperCase();
    if (code && !rows.some((row) => row.code === code)) {
      rows.push({ code, name: current.trim(), position: "before" });
    }
  }
  return dedupe(rows);
}

export function addCustomCurrency(raw: string): CurrencyOption[] {
  const parsed = parseCurrencyInput(raw);
  if (!parsed) return readCurrencies();
  const existing = readCurrencies();
  if (existing.some((c) => c.code === parsed.code)) return existing;
  writeCurrencies([...existing, parsed]);
  return readCurrencies();
}

export function removeCustomCurrency(code: string): CurrencyOption[] {
  const key = normalizeCode(code);
  writeCurrencies(readCurrencies().filter((c) => c.code !== key));
  return readCurrencies();
}

export function renameCustomCurrency(fromCode: string, toName: string): CurrencyOption[] {
  return patchCurrency(fromCode, { name: toName });
}

export function patchCurrency(
  code: string,
  patch: Partial<Pick<CurrencyOption, "name" | "symbol" | "position">>,
): CurrencyOption[] {
  const key = normalizeCode(code);
  const next = readCurrencies().map((row) => {
    if (row.code !== key) return row;
    return {
      ...row,
      name: patch.name !== undefined ? patch.name.trim() || row.name : row.name,
      symbol: patch.symbol !== undefined ? optionalText(patch.symbol) : row.symbol,
      position: patch.position ?? row.position,
    };
  });
  writeCurrencies(next);
  return readCurrencies();
}

export function findCurrency(code: string | null | undefined): CurrencyOption | undefined {
  const key = normalizeCode(code ?? "");
  if (!key) return undefined;
  return readCurrencies().find((row) => row.code === key);
}

/** Format an amount with the currency text symbol on the left or right of the value. */
export function amountWithSymbol(amount: number, currency: CurrencyOption): string {
  const n = Number.isFinite(amount) ? amount : 0;
  // Decimals only when there is a fractional part: ৳5,500 and ৳3,220.5, never ৳5,500.00.
  const formatted = new Intl.NumberFormat("en-BD", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(n);
  const symbol = (currency.symbol || currency.code).trim();
  if ((currency.position ?? "before") === "after") {
    return `${formatted} ${symbol}`;
  }
  return `${symbol}${formatted}`;
}
