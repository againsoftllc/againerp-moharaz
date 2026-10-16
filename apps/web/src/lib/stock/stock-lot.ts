/** stock.lot — Lots / Serial Numbers list row. */

export type StockLotRow = {
  id: string;
  lot_name: string;
  product_name: string;
  qty_on_hand: number;
};

/** Demo seed — Again lots list (9 lines). */
export const stockLotsSeed: StockLotRow[] = [
  { id: "lot-1", lot_name: "0", product_name: "Testing Product 1 2", qty_on_hand: 0 },
  { id: "lot-2", lot_name: "0000001", product_name: "Maono PD200X", qty_on_hand: 1 },
  { id: "lot-3", lot_name: "0000002", product_name: "Maono PD200X", qty_on_hand: 0 },
  { id: "lot-4", lot_name: "1", product_name: "Testing Product 1 2", qty_on_hand: 1 },
  { id: "lot-5", lot_name: "2", product_name: "Testing Product 1 2", qty_on_hand: 0 },
  { id: "lot-6", lot_name: "6", product_name: "Testing Product 1 2", qty_on_hand: 1 },
  { id: "lot-7", lot_name: "0000003", product_name: "Testing Product 1 2", qty_on_hand: 0 },
  { id: "lot-8", lot_name: "0000004", product_name: "Testing Product 1 2", qty_on_hand: 0 },
  { id: "lot-9", lot_name: "0000005", product_name: "Testing Product 1 2", qty_on_hand: 0 },
];
