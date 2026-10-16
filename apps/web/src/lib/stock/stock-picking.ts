/**
 * Again Inventory — stock.picking / stock.move / stock.picking.type field names.
 * Tables: inventory_stock_pickings, inventory_stock_moves, inventory_stock_picking_types.
 */

import { formatDateTime } from "@/lib/utils";

/** stock.picking.state */
export type StockPickingState =
  | "draft"
  | "waiting"
  | "confirmed"
  | "assigned"
  | "done"
  | "cancel";

/** stock.move.state */
export type StockMoveState =
  | "draft"
  | "waiting"
  | "confirmed"
  | "partially_available"
  | "assigned"
  | "done"
  | "cancel";

/** stock.picking.type.code */
export type StockPickingTypeCode = "incoming" | "outgoing" | "internal";

export type StockPickingType = {
  id: string;
  name: string;
  code: StockPickingTypeCode;
  sequence_code: string;
  warehouse_name?: string | null;
};

/** stock.move — Operations tab line */
export type StockMove = {
  id: string;
  picking_id?: string | null;
  name: string;
  product_id?: string | null;
  product_uom_qty: number;
  quantity: number;
  sequence: number;
  state: StockMoveState;
  show_details?: boolean;
};

/** stock.picking — Receipt / Delivery transfer */
export type StockPicking = {
  id: string;
  name: string;
  partner_id?: string | null;
  partner_name?: string | null;
  picking_type_id: string;
  picking_type_code: StockPickingTypeCode;
  picking_type_name: string;
  location_id?: string | null;
  location_dest_id?: string | null;
  scheduled_date: string;
  date_deadline?: string | null;
  origin?: string | null;
  state: StockPickingState;
  user_id?: string | null;
  user_name?: string | null;
  carrier_tracking_ref?: string | null;
  weight?: number | null;
  priority: "0" | "1";
  note?: string | null;
  move_ids: StockMove[];
  /** Display helpers (computed client-side or from API) */
  scheduled_label?: string;
  deadline_label?: string;
  is_late?: boolean;
  created_at?: string;
  updated_at?: string;
};

export const STOCK_PICKING_STATE_LABELS: Record<StockPickingState, string> = {
  draft: "Draft",
  waiting: "Waiting Another Operation",
  confirmed: "Waiting",
  assigned: "Ready",
  done: "Done",
  cancel: "Cancelled",
};

export const STOCK_PICKING_TYPE_SEED: StockPickingType[] = [
  {
    id: "spt_incoming",
    name: "Receipts",
    code: "incoming",
    sequence_code: "WH/IN",
    warehouse_name: "againsoft",
  },
  {
    id: "spt_outgoing",
    name: "Delivery Orders",
    code: "outgoing",
    sequence_code: "WH/OUT",
    warehouse_name: "againsoft",
  },
];

export function formatStockDatetime(iso: string): string {
  if (!iso) return "";
  return formatDateTime(iso);
}

export function pickingIsStarred(picking: StockPicking): boolean {
  return picking.priority === "1";
}

export function pickingWithLabels(picking: StockPicking): StockPicking {
  return {
    ...picking,
    scheduled_label: formatStockDatetime(picking.scheduled_date),
    deadline_label: picking.date_deadline ? formatStockDatetime(picking.date_deadline) : undefined,
  };
}

export function nextPickingName(
  existing: StockPicking[],
  sequenceCode: "WH/IN" | "WH/OUT",
): string {
  const prefix = `${sequenceCode}/`;
  const nums = existing
    .filter((p) => p.name.startsWith(prefix))
    .map((p) => {
      const m = p.name.match(/(\d+)$/);
      return m ? Number(m[1]) : 0;
    });
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(next).padStart(5, "0")}`;
}

export function createBlankStockPicking(typeCode: StockPickingTypeCode): StockPicking {
  const ptype = STOCK_PICKING_TYPE_SEED.find((t) => t.code === typeCode)!;
  const now = new Date().toISOString();
  return pickingWithLabels({
    id: `pck_${Date.now()}`,
    name: "New",
    partner_id: null,
    partner_name: "",
    picking_type_id: ptype.id,
    picking_type_code: typeCode,
    picking_type_name: `${ptype.warehouse_name}: ${ptype.name}`,
    location_id: typeCode === "incoming" ? "Partners/Vendors" : "WH/Stock",
    location_dest_id: typeCode === "incoming" ? "WH/Stock" : "Customers",
    scheduled_date: now,
    date_deadline: null,
    origin: "",
    state: "draft",
    user_id: null,
    user_name: "",
    carrier_tracking_ref: "",
    weight: 0,
    priority: "0",
    note: "",
    move_ids: [],
    is_late: true,
  });
}

const INCOMING_SEED: StockPicking[] = [
  {
    id: "pck_in_001",
    name: "WH/IN/00001",
    partner_id: null,
    partner_name: "Riyad",
    picking_type_id: "spt_incoming",
    picking_type_code: "incoming",
    picking_type_name: "againsoft: Receipts",
    location_id: "Partners/Vendors",
    location_dest_id: "WH/Stock",
    scheduled_date: "2026-07-04T05:56:00.000Z",
    date_deadline: "2026-07-04T05:56:00.000Z",
    origin: "P00001",
    state: "assigned",
    user_id: null,
    user_name: "",
    carrier_tracking_ref: "",
    weight: 2,
    priority: "0",
    note: "",
    is_late: true,
    move_ids: [
      {
        id: "mv_in_001_1",
        picking_id: "pck_in_001",
        name: "Testing Product 1",
        product_uom_qty: 1,
        quantity: 1,
        sequence: 10,
        state: "assigned",
      },
      {
        id: "mv_in_001_2",
        picking_id: "pck_in_001",
        name: "Testing Product 2",
        product_uom_qty: 5,
        quantity: 5,
        sequence: 20,
        state: "assigned",
        show_details: true,
      },
    ],
  },
  {
    id: "pck_in_002",
    name: "WH/IN/00002",
    partner_id: null,
    partner_name: "againsoft, Mossiur Rahman Riyad",
    picking_type_id: "spt_incoming",
    picking_type_code: "incoming",
    picking_type_name: "againsoft: Receipts",
    location_id: "Partners/Vendors",
    location_dest_id: "WH/Stock",
    scheduled_date: "2026-06-28T14:00:00.000Z",
    date_deadline: null,
    origin: "P00012",
    state: "done",
    user_id: null,
    user_name: "",
    carrier_tracking_ref: "",
    weight: 0,
    priority: "0",
    note: "",
    move_ids: [],
  },
  {
    id: "pck_in_003",
    name: "WH/IN/00003",
    partner_id: null,
    partner_name: "Riyad",
    picking_type_id: "spt_incoming",
    picking_type_code: "incoming",
    picking_type_name: "againsoft: Receipts",
    location_id: "Partners/Vendors",
    location_dest_id: "WH/Stock",
    scheduled_date: "2026-07-04T09:00:00.000Z",
    date_deadline: null,
    origin: "",
    state: "assigned",
    user_id: null,
    user_name: "",
    carrier_tracking_ref: "",
    weight: 0,
    priority: "0",
    note: "",
    is_late: true,
    move_ids: [],
  },
];

const OUTGOING_SEED: StockPicking[] = [
  {
    id: "pck_out_001",
    name: "WH/OUT/00001",
    partner_id: null,
    partner_name: "Riyad",
    picking_type_id: "spt_outgoing",
    picking_type_code: "outgoing",
    picking_type_name: "againsoft: Delivery Orders",
    location_id: "WH/Stock",
    location_dest_id: "Customers",
    scheduled_date: "2026-07-04T05:56:00.000Z",
    date_deadline: "2026-07-04T05:56:00.000Z",
    origin: "S00001",
    state: "assigned",
    user_id: null,
    user_name: "",
    carrier_tracking_ref: "",
    weight: 2,
    priority: "0",
    note: "",
    is_late: true,
    move_ids: [
      {
        id: "mv_out_001_1",
        picking_id: "pck_out_001",
        name: "Testing Product 1",
        product_uom_qty: 1,
        quantity: 1,
        sequence: 10,
        state: "assigned",
      },
      {
        id: "mv_out_001_2",
        picking_id: "pck_out_001",
        name: "Testing Product 2",
        product_uom_qty: 5,
        quantity: 5,
        sequence: 20,
        state: "assigned",
        show_details: true,
      },
    ],
  },
  {
    id: "pck_out_002",
    name: "WH/OUT/00002",
    partner_id: null,
    partner_name: "againsoft, Mossiur Rahman Riyad",
    picking_type_id: "spt_outgoing",
    picking_type_code: "outgoing",
    picking_type_name: "againsoft: Delivery Orders",
    location_id: "WH/Stock",
    location_dest_id: "Customers",
    scheduled_date: "2026-06-28T14:00:00.000Z",
    date_deadline: null,
    origin: "S00012",
    state: "done",
    user_id: null,
    user_name: "",
    carrier_tracking_ref: "",
    weight: 0,
    priority: "0",
    note: "",
    move_ids: [],
  },
  {
    id: "pck_out_003",
    name: "WH/OUT/00003",
    partner_id: null,
    partner_name: "Riyad",
    picking_type_id: "spt_outgoing",
    picking_type_code: "outgoing",
    picking_type_name: "againsoft: Delivery Orders",
    location_id: "WH/Stock",
    location_dest_id: "Customers",
    scheduled_date: "2026-07-04T09:00:00.000Z",
    date_deadline: null,
    origin: "",
    state: "assigned",
    user_id: null,
    user_name: "",
    carrier_tracking_ref: "",
    weight: 0,
    priority: "0",
    note: "",
    is_late: true,
    move_ids: [],
  },
];

export const stockPickingsIncomingSeed = INCOMING_SEED.map(pickingWithLabels);
export const stockPickingsOutgoingSeed = OUTGOING_SEED.map(pickingWithLabels);
export const stockPickingsSeed = [...stockPickingsIncomingSeed, ...stockPickingsOutgoingSeed];

/** UI ribbon stages: draft → assigned → done */
export type StockPickingRibbonStage = "draft" | "assigned" | "done";

export function pickingStateToRibbon(state: StockPickingState): StockPickingRibbonStage {
  if (state === "done") return "done";
  if (state === "draft") return "draft";
  return "assigned";
}

export function ribbonToPickingState(stage: StockPickingRibbonStage): StockPickingState {
  if (stage === "done") return "done";
  if (stage === "draft") return "draft";
  return "assigned";
}
