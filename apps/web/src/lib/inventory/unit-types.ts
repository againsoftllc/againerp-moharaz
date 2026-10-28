import { toast } from "sonner";
import { fetchUnitTypes, saveUnitTypes } from "@/lib/api/product-masters";

/**
 * Unit types are a company master on the server (`/inventory/unit-types`, INV-08). This module keeps a localStorage copy so
 * the product form can read the list synchronously: `syncUnitTypes()` refreshes it from the server, and every change below
 * is sent back to the server.
 */
export type UnitTypeOption = {
  value: string;
  label: string;
  /** decimals a quantity in this unit may carry (OnerERP FractionalLength) */
  fractionLength?: number;
};

export const UNIT_TYPE_OPTIONS: UnitTypeOption[] = [
  { value: "ea", label: "Each" },
  { value: "pcs", label: "Piece" },
  { value: "box", label: "Box" },
  { value: "set", label: "Set" },
  { value: "pair", label: "Pair" },
  { value: "dozen", label: "Dozen" },
  { value: "kg", label: "Kilogram" },
  { value: "g", label: "Gram" },
  { value: "l", label: "Liter" },
  { value: "m", label: "Meter" },
];

export const DEFAULT_UNIT_TYPE = "ea";

const STORAGE = "againerp:inventory-unit-types";

type Stored = {
  units: UnitTypeOption[];
  defaultValue: string;
  /** the list came from the server: use it as it is (no built-ins merged back in) */
  server?: boolean;
};

function slugifyCode(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
  return slug || "uom";
}

function dedupeUnits(items: UnitTypeOption[]): UnitTypeOption[] {
  const seen = new Set<string>();
  const out: UnitTypeOption[] = [];
  for (const raw of items) {
    const value = raw.value.trim().toLowerCase();
    const label = raw.label.trim();
    if (!value || !label) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label, ...(raw.fractionLength != null ? { fractionLength: raw.fractionLength } : {}) });
  }
  return out;
}

function emptyStore(): Stored {
  return { units: [...UNIT_TYPE_OPTIONS], defaultValue: DEFAULT_UNIT_TYPE };
}

function readStore(): Stored {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<Stored>;
    const units = Array.isArray(parsed.units)
      ? dedupeUnits(
          parsed.units.filter(
            (u): u is UnitTypeOption =>
              !!u && typeof u.value === "string" && typeof u.label === "string",
          ),
        )
      : [];
    const fallback = emptyStore();
    const merged = parsed.server && units.length ? units : dedupeUnits([...fallback.units, ...units]);
    const defaultValue =
      typeof parsed.defaultValue === "string" &&
      merged.some((u) => u.value === parsed.defaultValue.trim().toLowerCase())
        ? parsed.defaultValue.trim().toLowerCase()
        : DEFAULT_UNIT_TYPE;
    return { units: merged, defaultValue, server: Boolean(parsed.server) };
  } catch {
    return emptyStore();
  }
}

function writeStore(next: Stored) {
  if (typeof window === "undefined") return;
  const units = dedupeUnits(next.units);
  const defaultValue = units.some((u) => u.value === next.defaultValue)
    ? next.defaultValue
    : (units[0]?.value ?? DEFAULT_UNIT_TYPE);
  localStorage.setItem(STORAGE, JSON.stringify({ units, defaultValue, server: readStore().server }));
  pushUnitTypes();
}

/** Send the cached list to the server; a refusal (e.g. a unit still used by products) is shown and the cache reloaded. */
function pushUnitTypes() {
  const store = readStore();
  void saveUnitTypes(
    store.units.map((u) => ({ code: u.value, name: u.label, fraction_length: u.fractionLength ?? 0, is_default: u.value === store.defaultValue })),
  ).catch((err) => {
    toast.error(err instanceof Error ? err.message : "Could not save unit types");
    void syncUnitTypes();
  });
}

let syncing: Promise<UnitTypeOption[]> | null = null;

/** Load the company's unit types into the local copy. Units only this browser had (before the server master) are sent up once. */
export function syncUnitTypes(): Promise<UnitTypeOption[]> {
  if (typeof window === "undefined") return Promise.resolve(UNIT_TYPE_OPTIONS);
  syncing ??= (async () => {
    try {
      let rows = await fetchUnitTypes();
      const local = readStore();
      if (!local.server) {
        const known = new Set(rows.map((u) => u.code));
        const builtIn = new Set(UNIT_TYPE_OPTIONS.map((u) => u.value));
        const extra = local.units.filter((u) => !known.has(u.value) && !builtIn.has(u.value));
        if (extra.length) {
          rows = await saveUnitTypes([
            ...rows.map(({ code, name, fraction_length, is_default }) => ({ code, name, fraction_length, is_default })),
            ...extra.map((u) => ({ code: u.value, name: u.label, fraction_length: 0, is_default: false })),
          ]).catch(() => rows);
        }
      }
      localStorage.setItem(
        STORAGE,
        JSON.stringify({
          units: rows.map((u) => ({ value: u.code, label: u.name, fractionLength: u.fraction_length })),
          defaultValue: rows.find((u) => u.is_default)?.code ?? DEFAULT_UNIT_TYPE,
          server: true,
        }),
      );
    } catch {
      /* offline or no access: keep the local copy */
    } finally {
      syncing = null;
    }
    return readUnitTypes();
  })();
  return syncing;
}

export function readUnitTypes(): UnitTypeOption[] {
  return readStore().units;
}

export function readDefaultUnitType(): string {
  return readStore().defaultValue;
}

export function buildUnitTypeOptions(current?: string | null): UnitTypeOption[] {
  const units = readUnitTypes();
  const value = current?.trim().toLowerCase();
  if (!value || units.some((u) => u.value === value)) return units;
  return [...units, { value, label: current!.trim() }];
}

export function unitTypeLabel(value: string, options?: UnitTypeOption[]): string {
  const list = options ?? readUnitTypes();
  const key = value.trim().toLowerCase();
  return list.find((u) => u.value === key)?.label ?? value;
}

export function addUnitType(label: string, asDefault = false): UnitTypeOption[] {
  const name = label.trim();
  if (!name) return readUnitTypes();
  const store = readStore();
  const existing = store.units.find((u) => u.label.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (asDefault) writeStore({ ...store, defaultValue: existing.value });
    return readUnitTypes();
  }
  let code = slugifyCode(name);
  const used = new Set(store.units.map((u) => u.value));
  if (used.has(code)) {
    let n = 2;
    while (used.has(`${code}${n}`.slice(0, 20))) n += 1;
    code = `${code}${n}`.slice(0, 20);
  }
  const next = [...store.units, { value: code, label: name }];
  writeStore({ units: next, defaultValue: asDefault ? code : store.defaultValue });
  return readUnitTypes();
}

export function setDefaultUnitType(value: string): string {
  const store = readStore();
  const key = value.trim().toLowerCase();
  if (!store.units.some((u) => u.value === key)) return store.defaultValue;
  writeStore({ ...store, defaultValue: key });
  return key;
}

export function findAddedUnit(label: string): UnitTypeOption | undefined {
  const name = label.trim().toLowerCase();
  return readUnitTypes().find((u) => u.label.toLowerCase() === name);
}

export function renameUnitType(value: string, label: string): UnitTypeOption[] {
  const key = value.trim().toLowerCase();
  const nextLabel = label.trim();
  if (!nextLabel) return readUnitTypes();
  const store = readStore();
  if (!store.units.some((u) => u.value === key)) return store.units;
  const clash = store.units.find(
    (u) => u.value !== key && u.label.toLowerCase() === nextLabel.toLowerCase(),
  );
  if (clash) return store.units;
  writeStore({
    ...store,
    units: store.units.map((u) => (u.value === key ? { ...u, label: nextLabel } : u)),
  });
  return readUnitTypes();
}

export function removeUnitType(value: string): UnitTypeOption[] {
  const key = value.trim().toLowerCase();
  const store = readStore();
  const next = store.units.filter((u) => u.value !== key);
  if (next.length === 0) return store.units;
  writeStore({
    units: next,
    defaultValue:
      store.defaultValue === key ? (next[0]?.value ?? DEFAULT_UNIT_TYPE) : store.defaultValue,
  });
  return readUnitTypes();
}
