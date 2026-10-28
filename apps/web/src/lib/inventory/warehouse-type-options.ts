import { toast } from "sonner";
import { fetchWarehouseTypes, saveWarehouseTypes } from "@/lib/api/product-masters";
import { WAREHOUSE_TYPE_PRESETS } from "@/lib/inventory/warehouse-constants";

/**
 * Warehouse types are a company list on the server (`/inventory/warehouse-types`, INV-08). localStorage keeps a copy for the
 * synchronous reads below; `syncWarehouseTypes()` refreshes it and every change is sent back to the server.
 */

const TYPES_STORAGE = "againerp:inventory-warehouse-types";

function dedupeTypes(items: string[]): string[] {
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

export function readWarehouseTypes(): string[] {
  if (typeof window === "undefined") return [...WAREHOUSE_TYPE_PRESETS];
  try {
    const raw = localStorage.getItem(TYPES_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        // Empty list is a real saved state (user deleted every option).
        return dedupeTypes(parsed.filter((c): c is string => typeof c === "string"));
      }
    }
  } catch {
    /* fall through */
  }
  return [...WAREHOUSE_TYPE_PRESETS];
}

export function writeWarehouseTypes(types: string[]) {
  if (typeof window === "undefined") return;
  const clean = dedupeTypes(types);
  localStorage.setItem(TYPES_STORAGE, JSON.stringify(clean));
  void saveWarehouseTypes(clean).catch((err) => {
    toast.error(err instanceof Error ? err.message : "Could not save warehouse types");
    void syncWarehouseTypes();
  });
}

const SYNCED = "againerp:inventory-warehouse-types:server";
let syncing: Promise<string[]> | null = null;

/** Load the company's warehouse types into the local copy. Types only this browser had are sent up once. */
export function syncWarehouseTypes(): Promise<string[]> {
  if (typeof window === "undefined") return Promise.resolve([...WAREHOUSE_TYPE_PRESETS]);
  syncing ??= (async () => {
    try {
      let names = await fetchWarehouseTypes();
      if (!localStorage.getItem(SYNCED)) {
        const extra = readWarehouseTypes().filter((t) => !names.some((n) => n.toLowerCase() === t.toLowerCase()));
        if (extra.length) names = await saveWarehouseTypes([...names, ...extra]).catch(() => names);
      }
      localStorage.setItem(TYPES_STORAGE, JSON.stringify(dedupeTypes(names)));
      localStorage.setItem(SYNCED, "1");
    } catch {
      /* offline or no access: keep the local copy */
    } finally {
      syncing = null;
    }
    return readWarehouseTypes();
  })();
  return syncing;
}

/** Saved types, optionally ensuring the current value is listed. */
export function buildWarehouseTypeOptions(current?: string | null): string[] {
  return dedupeTypes([...readWarehouseTypes(), ...(current ? [current] : [])]);
}

export function addWarehouseType(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return readWarehouseTypes();
  const existing = readWarehouseTypes();
  if (existing.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return existing;
  }
  const next = [...existing, trimmed];
  writeWarehouseTypes(next);
  return next;
}

export function removeWarehouseType(name: string): string[] {
  const key = name.trim().toLowerCase();
  const next = readWarehouseTypes().filter((c) => c.toLowerCase() !== key);
  writeWarehouseTypes(next);
  return next;
}

export function renameWarehouseType(from: string, to: string): string[] {
  const nextName = to.trim();
  if (!nextName) return readWarehouseTypes();
  const fromKey = from.trim().toLowerCase();
  const existing = readWarehouseTypes();
  writeWarehouseTypes(existing.map((c) => (c.toLowerCase() === fromKey ? nextName : c)));
  return readWarehouseTypes();
}
