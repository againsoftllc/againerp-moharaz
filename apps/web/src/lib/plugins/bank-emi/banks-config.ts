import { DEFAULT_EMI_SETTINGS } from "@/lib/mock-data/emi-banks";
import type { EmiBank } from "./types";

export const EMI_BANKS_CONFIG_KEY = "banks_json";

export const EMI_TENURE_OPTIONS = [3, 6, 9, 12, 18, 24] as const;

export function serializeBanks(banks: EmiBank[]): string {
  return JSON.stringify(banks);
}

export function parseBanksFromConfig(
  config?: Record<string, string | boolean | number> | null,
): EmiBank[] {
  const raw = config?.[EMI_BANKS_CONFIG_KEY];
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as EmiBank[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(normalizeBank);
      }
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_EMI_SETTINGS.banks.map((b) => ({ ...b, plans: b.plans.map((p) => ({ ...p })) }));
}

function normalizeBank(bank: EmiBank): EmiBank {
  return {
    id: bank.id || `bank_${Date.now()}`,
    name: bank.name || "New Bank",
    nameBn: bank.nameBn,
    initial: (bank.initial || bank.name?.[0] || "B").toUpperCase().slice(0, 1),
    brandColor: bank.brandColor || "#6366f1",
    plans: (bank.plans ?? []).map((p) => ({
      months: Number(p.months) || 3,
      chargePercent: Number(p.chargePercent) || 0,
      active: p.active !== false,
    })),
  };
}

export function createEmptyBank(): EmiBank {
  const id = `bank_${Date.now().toString(36)}`;
  return {
    id,
    name: "New Bank",
    initial: "N",
    brandColor: "#6366f1",
    plans: EMI_TENURE_OPTIONS.slice(0, 4).map((months) => ({
      months,
      chargePercent: 5,
      active: true,
    })),
  };
}

export function slugifyBankId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32) || `bank_${Date.now().toString(36)}`;
}
