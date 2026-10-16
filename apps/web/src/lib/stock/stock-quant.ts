/**
 * Again Inventory — stock.quant field names.
 * Tables: inventory_stock_quants.
 */

import { formatDate } from "@/lib/utils";

export type StockQuant = {
  id: string;
  company_id?: string;
  product_id?: string | null;
  product_name: string;
  product_categ_id?: string | null;
  product_categ_name?: string | null;
  lot_id?: string | null;
  lot_name?: string | null;
  location_id?: string | null;
  quantity: number;
  inventory_quantity?: number | null;
  inventory_diff_quantity?: number | null;
  inventory_date?: string | null;
  scheduled_date?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  accounting_date?: string | null;
  inventory_date_label?: string | null;
  scheduled_date_label?: string | null;
  accounting_date_label?: string | null;
  created_at?: string;
  updated_at?: string;
};

export function formatStockDateLabel(iso?: string | null): string {
  if (!iso) return "";
  return formatDate(iso);
}

export function quantWithLabels(quant: StockQuant): StockQuant {
  return {
    ...quant,
    inventory_date_label: quant.inventory_date_label ?? formatStockDateLabel(quant.inventory_date),
    scheduled_date_label: quant.scheduled_date_label ?? formatStockDateLabel(quant.scheduled_date),
    accounting_date_label: quant.accounting_date_label ?? formatStockDateLabel(quant.accounting_date),
  };
}

const SEED: StockQuant[] = [
  {
    id: "sq_001",
    product_name: "Maono PD200X",
    product_categ_name: "Goods",
    lot_name: "0000001",
    quantity: 1,
    inventory_date: "2026-07-04T09:00:00.000Z",
    scheduled_date: "2026-12-31T00:00:00.000Z",
  },
  {
    id: "sq_002",
    product_name: "Testing Product 1",
    product_categ_name: "Goods",
    lot_name: "6",
    quantity: 10,
    inventory_quantity: 0,
    inventory_diff_quantity: -10,
  },
  {
    id: "sq_003",
    product_name: "Testing Product 2",
    product_categ_name: "Goods",
    lot_name: "0000001",
    quantity: 0,
  },
  {
    id: "sq_004",
    product_name: "Testing Product 2",
    product_categ_name: "Goods",
    lot_name: "0000002",
    quantity: 0,
  },
  {
    id: "sq_005",
    product_name: "Testing Product 2",
    product_categ_name: "Goods",
    lot_name: "0000003",
    quantity: 0,
  },
  {
    id: "sq_006",
    product_name: "Testing Product 2",
    product_categ_name: "Goods",
    lot_name: "0000004",
    quantity: 0,
  },
  {
    id: "sq_007",
    product_name: "Testing Product 2",
    product_categ_name: "Goods",
    lot_name: "0000005",
    quantity: 0,
  },
  {
    id: "sq_008",
    product_name: "Testing Product 2",
    product_categ_name: "Goods",
    lot_name: "0000006",
    quantity: 0,
  },
  {
    id: "sq_009",
    product_name: "Testing Product 2",
    product_categ_name: "Goods",
    lot_name: "0000007",
    quantity: 0,
  },
  {
    id: "sq_010",
    product_name: "Testing Product 2",
    product_categ_name: "Goods",
    lot_name: "0000008",
    quantity: 0,
  },
  {
    id: "sq_011",
    product_name: "Testing Product 2",
    product_categ_name: "Goods",
    lot_name: "0000009",
    quantity: 0,
  },
];

export const stockQuantsSeed = SEED.map(quantWithLabels);
