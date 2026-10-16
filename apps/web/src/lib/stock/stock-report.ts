/** Stock report row — product qty summary (Reporting › Stock). */

export type StockReportRow = {
  id: string;
  product_name: string;
  qty_on_hand: number;
  qty_free: number;
  unit_cost: number;
  total_value: number;
  incoming: number;
  outgoing: number;
};

/** Demo seed aligned with Again stock report (Maono + Testing Product). */
export const stockReportSeed: StockReportRow[] = [
  {
    id: "sr-1",
    product_name: "Maono PD200X",
    qty_on_hand: 5,
    qty_free: 4,
    unit_cost: 0,
    total_value: 0,
    incoming: 5,
    outgoing: 1,
  },
  {
    id: "sr-2",
    product_name: "Testing Product",
    qty_on_hand: 10,
    qty_free: 4,
    unit_cost: 0,
    total_value: 0,
    incoming: 1,
    outgoing: 6,
  },
  {
    id: "sr-3",
    product_name: "Demo Wireless Kit",
    qty_on_hand: 8,
    qty_free: 7,
    unit_cost: 0,
    total_value: 0,
    incoming: 6,
    outgoing: 1,
  },
];

export function stockReportTotals(rows: StockReportRow[]) {
  return rows.reduce(
    (acc, row) => ({
      qty_on_hand: acc.qty_on_hand + row.qty_on_hand,
      qty_free: acc.qty_free + row.qty_free,
      total_value: acc.total_value + row.total_value,
      incoming: acc.incoming + row.incoming,
      outgoing: acc.outgoing + row.outgoing,
    }),
    { qty_on_hand: 0, qty_free: 0, total_value: 0, incoming: 0, outgoing: 0 },
  );
}
