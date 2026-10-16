import {
  fetchPlatformSettings,
  upsertPlatformSetting,
  type PlatformSetting,
} from "@/lib/api/platform-settings";
import {
  defaultDropshippingCurrencies,
  defaultDropshippingSettingsValues,
  DROPSHIPPING_SETTINGS_SECTIONS,
  type DropshippingCurrencyRate,
  type DropshippingSettingKey,
  type DropshippingSettingsValues,
} from "@/lib/mock-data/dropshipping-settings";

/** Keys persisted under platform_settings (dropship group + currency sync). */
export const DROPSHIP_PLATFORM_VALUE_KEYS: DropshippingSettingKey[] = (() => {
  const keys: DropshippingSettingKey[] = [];
  for (const section of DROPSHIPPING_SETTINGS_SECTIONS) {
    for (const field of section.fields) {
      keys.push(field.key);
    }
  }
  return keys;
})();

const BOOL_KEYS = new Set<string>(
  DROPSHIPPING_SETTINGS_SECTIONS.flatMap((s) =>
    s.fields.filter((f) => f.type === "boolean").map((f) => f.key),
  ),
);

const NUMBER_KEYS = new Set<string>(
  DROPSHIPPING_SETTINGS_SECTIONS.flatMap((s) =>
    s.fields
      .filter((f) => f.type === "number" || f.type === "inline_number")
      .map((f) => f.key),
  ),
);

function coerceBool(raw: string | null | undefined, fallback: boolean): boolean {
  if (raw == null || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

function coerceNumber(raw: string | null | undefined, fallback: number): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function serializeValue(key: string, value: boolean | string | number): string {
  if (BOOL_KEYS.has(key)) return value ? "true" : "false";
  if (NUMBER_KEYS.has(key)) return String(Number(value) || 0);
  return String(value ?? "");
}

export function parseDropshipCurrenciesJson(
  raw: string | null | undefined,
): DropshippingCurrencyRate[] | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const rows: DropshippingCurrencyRate[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const code = String(o.code ?? "").trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(code) || code === "BDT") continue;
      rows.push({
        id: String(o.id ?? `cur_${code.toLowerCase()}`),
        code,
        name: String(o.name ?? code),
        rateToBdt: Number(o.rateToBdt) || 0,
        active: o.active !== false,
      });
    }
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}

export function currenciesFromPlatformRates(
  cny: number | null,
  usd: number | null,
): DropshippingCurrencyRate[] {
  const base = defaultDropshippingCurrencies();
  return base.map((row) => {
    if (row.code === "CNY" && cny != null && cny > 0) return { ...row, rateToBdt: cny };
    if (row.code === "USD" && usd != null && usd > 0) return { ...row, rateToBdt: usd };
    return row;
  });
}

export type DropshippingSettingsBundle = {
  values: DropshippingSettingsValues;
  currencies: DropshippingCurrencyRate[];
};

export function settingsFromPlatformRows(rows: PlatformSetting[]): DropshippingSettingsBundle {
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<
    string,
    string | null
  >;
  const defaults = defaultDropshippingSettingsValues();
  const values: DropshippingSettingsValues = { ...defaults };

  for (const key of DROPSHIP_PLATFORM_VALUE_KEYS) {
    const raw = byKey[key];
    const fallback = defaults[key];
    if (BOOL_KEYS.has(key)) {
      values[key] = coerceBool(raw, Boolean(fallback));
    } else if (NUMBER_KEYS.has(key)) {
      values[key] = coerceNumber(raw, Number(fallback) || 0);
    } else if (raw != null && raw !== "") {
      values[key] = raw;
    }
  }

  const fromJson = parseDropshipCurrenciesJson(byKey.dropship_currencies_json);
  const cny = coerceNumber(byKey.dropship_cny_to_bdt, 18);
  const usd = coerceNumber(byKey.amazon_usd_to_bdt, 125);
  const currencies = fromJson ?? currenciesFromPlatformRates(cny, usd);

  return { values, currencies };
}

export async function loadDropshippingSettings(): Promise<DropshippingSettingsBundle> {
  const rows = await fetchPlatformSettings();
  return settingsFromPlatformRows(rows);
}

function rateFor(code: string, currencies: DropshippingCurrencyRate[]): number | null {
  const row = currencies.find((c) => c.code === code && c.active);
  if (!row || !(row.rateToBdt > 0)) return null;
  return row.rateToBdt;
}

/** Persist all form fields + currencies (syncs CNY/USD rate keys for import). */
export async function saveDropshippingSettings(
  values: DropshippingSettingsValues,
  currencies: DropshippingCurrencyRate[],
): Promise<void> {
  const writes: Array<Promise<unknown>> = [];

  for (const key of DROPSHIP_PLATFORM_VALUE_KEYS) {
    const v = values[key];
    if (v === undefined) continue;
    writes.push(upsertPlatformSetting(key, serializeValue(key, v)));
  }

  writes.push(
    upsertPlatformSetting("dropship_currencies_json", JSON.stringify(currencies)),
  );

  const cny = rateFor("CNY", currencies);
  const usd = rateFor("USD", currencies);
  if (cny != null) {
    writes.push(upsertPlatformSetting("dropship_cny_to_bdt", String(cny)));
  }
  if (usd != null) {
    writes.push(upsertPlatformSetting("amazon_usd_to_bdt", String(usd)));
  }

  await Promise.all(writes);
}
