/**
 * Again Inventory — stock.warehouse.orderpoint field names.
 * Table: inventory_orderpoints.
 */

import { formatDate } from "@/lib/utils";

export type OrderpointTrigger = "manual" | "auto";

export type StockOrderpoint = {
  id: string;
  company_id?: string;
  product_id?: string | null;
  product_name: string;
  qty_on_hand: number;
  qty_forecast: number;
  route_name: string;
  vendor_id?: string | null;
  vendor_name?: string | null;
  trigger: OrderpointTrigger;
  product_min_qty: number;
  product_max_qty: number;
  qty_multiple: number;
  qty_to_order: number;
  deadline?: string | null;
  snoozed: boolean;
  deadline_label?: string | null;
  created_at?: string;
  updated_at?: string;
};

export const ORDERPOINT_TRIGGER_LABELS: Record<OrderpointTrigger, string> = {
  manual: "Manual",
  auto: "Auto",
};

export function formatOrderpointDate(iso?: string | null): string {
  if (!iso) return "";
  return formatDate(iso);
}

export function orderpointWithLabels(row: StockOrderpoint): StockOrderpoint {
  return {
    ...row,
    deadline_label: row.deadline_label ?? formatOrderpointDate(row.deadline),
  };
}

const SEED: StockOrderpoint[] = [
  {
    id: "op_001",
    product_name: "Testing Product",
    qty_on_hand: 10,
    qty_forecast: 5,
    route_name: "Buy",
    vendor_name: "againsoft",
    trigger: "manual",
    product_min_qty: 0,
    product_max_qty: 0,
    qty_multiple: 1,
    qty_to_order: 0,
    snoozed: false,
  },
];

export const stockOrderpointsSeed = SEED.map(orderpointWithLabels);

export const REPLENISHMENT_VENDORS = ["againsoft", "Default Vendor", "Main Supplier"];
