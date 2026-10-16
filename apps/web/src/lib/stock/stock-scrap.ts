/**
 * Again Inventory — stock.scrap field names.
 * Table: inventory_stock_scraps.
 */

import { formatDateTime } from "@/lib/utils";

export type StockScrapState = "draft" | "done" | "cancel";

export type StockScrap = {
  id: string;
  company_id?: string;
  name: string;
  date: string;
  product_id?: string | null;
  product_name: string;
  scrap_qty: number;
  location_id?: string | null;
  state: StockScrapState;
  date_label?: string | null;
  created_at?: string;
  updated_at?: string;
};

export const STOCK_SCRAP_STATE_LABELS: Record<StockScrapState, string> = {
  draft: "Draft",
  done: "Done",
  cancel: "Cancelled",
};

export function formatScrapDatetime(iso: string): string {
  if (!iso) return "";
  return formatDateTime(iso);
}

export function scrapWithLabels(scrap: StockScrap): StockScrap {
  return {
    ...scrap,
    date_label: scrap.date_label ?? formatScrapDatetime(scrap.date),
  };
}

const SEED: StockScrap[] = [
  {
    id: "scr_001",
    name: "SP/00001",
    date: "2026-07-06T05:07:00.000Z",
    product_name: "Maono PD200X",
    scrap_qty: 1,
    location_id: "WH/Stock",
    state: "done",
  },
];

export const stockScrapsSeed = SEED.map(scrapWithLabels);
