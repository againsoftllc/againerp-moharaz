/** Moves History row — stock.move.line history list (Reporting). */

import { formatDateTime } from "@/lib/utils";

export type MoveHistoryReferenceTone = "incoming" | "outgoing" | "scrap" | "adjustment";

export type StockMoveHistoryRow = {
  id: string;
  date: string;
  reference: string;
  reference_tone: MoveHistoryReferenceTone;
  product_name: string;
  lot_serial: string;
  location_from: string;
  location_to: string;
  quantity: number;
  state: "done" | "draft" | "cancel";
};

export const MOVE_HISTORY_STATE_LABELS: Record<StockMoveHistoryRow["state"], string> = {
  done: "Done",
  draft: "Draft",
  cancel: "Cancelled",
};

/** Demo seed — Again moves history (12 lines). */
export const stockMoveHistorySeed: StockMoveHistoryRow[] = [
  {
    id: "mh-1",
    date: "2026-07-06T05:07:00",
    reference: "SP/00001",
    reference_tone: "scrap",
    product_name: "Maono PD200X",
    lot_serial: "0000002",
    location_from: "WH/Stock",
    location_to: "Inventory adjustm...",
    quantity: 1,
    state: "done",
  },
  {
    id: "mh-2",
    date: "2026-07-06T05:06:00",
    reference: "WH/IN/00002",
    reference_tone: "incoming",
    product_name: "Testing Product",
    lot_serial: "2",
    location_from: "Vendors",
    location_to: "WH/Stock",
    quantity: 1,
    state: "done",
  },
  {
    id: "mh-3",
    date: "2026-07-06T05:05:00",
    reference: "Product Quantity Updated (againsoftware@gmail.com)",
    reference_tone: "adjustment",
    product_name: "Maono PD200X",
    lot_serial: "",
    location_from: "Inventory adjustm...",
    location_to: "WH/Stock",
    quantity: 5,
    state: "done",
  },
  {
    id: "mh-4",
    date: "2026-07-06T05:04:00",
    reference: "Product Quantity Updated (againsoftware@gmail.com)",
    reference_tone: "adjustment",
    product_name: "Testing Product",
    lot_serial: "",
    location_from: "Inventory adjustm...",
    location_to: "WH/Stock",
    quantity: 10,
    state: "done",
  },
  {
    id: "mh-5",
    date: "2026-07-06T04:58:00",
    reference: "WH/IN/00001",
    reference_tone: "incoming",
    product_name: "Maono PD200X",
    lot_serial: "0000001",
    location_from: "Vendors",
    location_to: "WH/Stock",
    quantity: 5,
    state: "done",
  },
  {
    id: "mh-6",
    date: "2026-07-06T04:55:00",
    reference: "WH/OUT/00001",
    reference_tone: "outgoing",
    product_name: "Testing Product",
    lot_serial: "2",
    location_from: "WH/Stock",
    location_to: "Customers",
    quantity: 1,
    state: "done",
  },
  {
    id: "mh-7",
    date: "2026-07-06T04:50:00",
    reference: "WH/IN/00002",
    reference_tone: "incoming",
    product_name: "Demo Wireless Kit",
    lot_serial: "",
    location_from: "Vendors",
    location_to: "WH/Stock",
    quantity: 6,
    state: "done",
  },
  {
    id: "mh-8",
    date: "2026-07-06T04:45:00",
    reference: "Product Quantity Updated (againsoftware@gmail.com)",
    reference_tone: "adjustment",
    product_name: "Demo Wireless Kit",
    lot_serial: "",
    location_from: "WH/Stock",
    location_to: "Inventory adjustm...",
    quantity: 2,
    state: "done",
  },
  {
    id: "mh-9",
    date: "2026-07-06T04:40:00",
    reference: "WH/OUT/00002",
    reference_tone: "outgoing",
    product_name: "Maono PD200X",
    lot_serial: "0000002",
    location_from: "WH/Stock",
    location_to: "Customers",
    quantity: 1,
    state: "done",
  },
  {
    id: "mh-10",
    date: "2026-07-06T04:35:00",
    reference: "WH/IN/00001",
    reference_tone: "incoming",
    product_name: "Testing Product",
    lot_serial: "1",
    location_from: "Vendors",
    location_to: "WH/Stock",
    quantity: 4,
    state: "done",
  },
  {
    id: "mh-11",
    date: "2026-07-06T04:30:00",
    reference: "SP/00001",
    reference_tone: "scrap",
    product_name: "Testing Product",
    lot_serial: "1",
    location_from: "WH/Stock",
    location_to: "Scrap",
    quantity: 1,
    state: "done",
  },
  {
    id: "mh-12",
    date: "2026-07-06T04:25:00",
    reference: "WH/OUT/00003",
    reference_tone: "outgoing",
    product_name: "Demo Wireless Kit",
    lot_serial: "",
    location_from: "WH/Stock",
    location_to: "Customers",
    quantity: 3,
    state: "done",
  },
];

export function referenceToneClass(tone: MoveHistoryReferenceTone): string {
  switch (tone) {
    case "scrap":
      return "text-red-600 dark:text-red-400";
    case "incoming":
      return "text-emerald-600 dark:text-emerald-400";
    case "outgoing":
      return "text-sky-600 dark:text-sky-400";
    case "adjustment":
      return "text-amber-600 dark:text-amber-400";
    default:
      return "text-[#00a09d]";
  }
}

export function formatMoveHistoryDate(iso: string): string {
  return formatDateTime(iso);
}
