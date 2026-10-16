export type UnitTypeOption = {
  value: string;
  label: string;
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
    out.push({ value, label });
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
    const merged = dedupeUnits([...fallback.units, ...units]);
    const defaultValue =
      typeof parsed.defaultValue === "string" &&
      merged.some((u) => u.value === parsed.defaultValue.trim().toLowerCase())
        ? parsed.defaultValue.trim().toLowerCase()
        : DEFAULT_UNIT_TYPE;
    return { units: merged, defaultValue };
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
  localStorage.setItem(STORAGE, JSON.stringify({ units, defaultValue }));
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
