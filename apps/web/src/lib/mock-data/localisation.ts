import type { LocalisationResourceId } from "@/lib/localisation/resources";

export type LocalisationRow = Record<string, string | number | boolean>;

/** Empty defaults — create rows in admin; no hard-coded demo catalogue. */
export const LOCALISATION_MOCK_DATA: Record<LocalisationResourceId, LocalisationRow[]> = {
  "store-locations": [],
  languages: [],
  currencies: [],
  "stock-statuses": [],
  "order-statuses": [],
  countries: [],
  regions: [],
  zones: [],
  "geo-zones": [],
};

export function formatLocalisationCell(value: string | number | boolean | undefined): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
