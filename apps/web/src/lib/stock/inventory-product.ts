/** Inventory Products list row (Products menu). */

export type InventoryProductRow = {
  id: string;
  name: string;
  internal_reference: string;
  sales_price: number;
  cost: number;
  qty_on_hand: number;
  qty_forecast: number;
  category: string;
};

export const inventoryProductsSeed: InventoryProductRow[] = [
  {
    id: "ip-1",
    name: "Maono PD200X",
    internal_reference: "",
    sales_price: 1,
    cost: 0,
    qty_on_hand: 5,
    qty_forecast: 9,
    category: "Goods",
  },
  {
    id: "ip-2",
    name: "Testing Product 1",
    internal_reference: "",
    sales_price: 1,
    cost: 0,
    qty_on_hand: 10,
    qty_forecast: 5,
    category: "Goods",
  },
  {
    id: "ip-3",
    name: "Testing Product 1 2",
    internal_reference: "",
    sales_price: 1,
    cost: 0,
    qty_on_hand: 8,
    qty_forecast: 13,
    category: "Goods",
  },
];

export function inventoryProductTotals(rows: InventoryProductRow[]) {
  return rows.reduce(
    (acc, row) => ({
      qty_on_hand: acc.qty_on_hand + row.qty_on_hand,
      qty_forecast: acc.qty_forecast + row.qty_forecast,
    }),
    { qty_on_hand: 0, qty_forecast: 0 },
  );
}
