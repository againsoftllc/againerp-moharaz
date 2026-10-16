/** Moves Analysis row — demand vs quantity (Reporting). */

import type { MoveHistoryReferenceTone } from "@/lib/stock/stock-move-history";
import { formatMoveHistoryDate, referenceToneClass } from "@/lib/stock/stock-move-history";

export type { MoveHistoryReferenceTone };
export { formatMoveHistoryDate, referenceToneClass };

export type StockMoveAnalysisRow = {
  id: string;
  date: string;
  reference: string;
  reference_tone: MoveHistoryReferenceTone;
  product_name: string;
  location_from: string;
  location_to: string;
  demand: number;
  quantity: number;
  state: "done" | "draft" | "cancel";
};

/** Demo seed — Again moves analysis (5 lines). */
export const stockMoveAnalysisSeed: StockMoveAnalysisRow[] = [
  {
    id: "ma-1",
    date: "2026-07-06T05:07:00",
    reference: "SP/00001",
    reference_tone: "scrap",
    product_name: "Maono PD200X",
    location_from: "WH/Stock",
    location_to: "Inventory adjustm...",
    demand: 0,
    quantity: 1,
    state: "done",
  },
  {
    id: "ma-2",
    date: "2026-07-06T05:06:00",
    reference: "WH/IN/00002",
    reference_tone: "incoming",
    product_name: "Testing Product 1 2",
    location_from: "Vendors",
    location_to: "WH/Stock",
    demand: 5,
    quantity: 6,
    state: "done",
  },
  {
    id: "ma-3",
    date: "2026-07-06T05:05:00",
    reference: "Product Quantity Updated (againsoftware@gmail.com)",
    reference_tone: "adjustment",
    product_name: "Maono PD200X",
    location_from: "Inventory adjustm...",
    location_to: "WH/Stock",
    demand: 5,
    quantity: 5,
    state: "done",
  },
  {
    id: "ma-4",
    date: "2026-07-06T05:04:00",
    reference: "Product Quantity Updated (againsoftware@gmail.com)",
    reference_tone: "adjustment",
    product_name: "Testing Product 1 2",
    location_from: "Inventory adjustm...",
    location_to: "WH/Stock",
    demand: 10,
    quantity: 10,
    state: "done",
  },
  {
    id: "ma-5",
    date: "2026-07-06T04:58:00",
    reference: "WH/OUT/00001",
    reference_tone: "outgoing",
    product_name: "Maono PD200X",
    location_from: "WH/Stock",
    location_to: "Customers",
    demand: 3,
    quantity: 3,
    state: "done",
  },
];

export function moveAnalysisTotals(rows: StockMoveAnalysisRow[]) {
  return rows.reduce(
    (acc, row) => ({
      demand: acc.demand + row.demand,
      quantity: acc.quantity + row.quantity,
    }),
    { demand: 0, quantity: 0 },
  );
}
