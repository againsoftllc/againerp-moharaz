import type { JournalEntry } from "./accounting-journal";
import { journalTotals, MANUFACTURING_GL_ACCOUNTS } from "./accounting-journal";
import type { StockMovement } from "./inventory";

/** Pre-posted movements for demo WO wo_002 (partial issue + partial FG receipt). */
export const demoWorkOrderMovementsSeed: StockMovement[] = [
  {
    id: "mov_wo002_res",
    type: "reserve",
    sku: "RM-EAR-HOUSING",
    productName: "Earbud housing set (L/R)",
    warehouse: "Dhaka HQ",
    quantity: 400,
    referenceType: "work_order",
    referenceId: "wo_002",
    referenceLabel: "WO-2026-0201",
    event: "inventory.reserve.posted",
    postedAt: "2026-06-10T08:00:00Z",
  },
  {
    id: "mov_wo002_out_1",
    type: "stock_out",
    sku: "RM-EAR-HOUSING",
    productName: "Earbud housing set (L/R)",
    warehouse: "Dhaka HQ",
    quantity: 240,
    unitCost: 80,
    totalValue: 19200,
    referenceType: "work_order",
    referenceId: "wo_002",
    referenceLabel: "WO-2026-0201",
    event: "inventory.stock_out.posted",
    postedAt: "2026-06-11T10:00:00Z",
  },
  {
    id: "mov_wo002_out_2",
    type: "stock_out",
    sku: "RM-PCB-AUDIO",
    productName: "Audio PCB + BT module",
    warehouse: "Dhaka HQ",
    quantity: 240,
    unitCost: 120,
    totalValue: 28800,
    referenceType: "work_order",
    referenceId: "wo_002",
    referenceLabel: "WO-2026-0201",
    event: "inventory.stock_out.posted",
    postedAt: "2026-06-11T10:05:00Z",
  },
  {
    id: "mov_wo002_in_1",
    type: "stock_in",
    sku: "SKU-0002",
    productName: "Wireless Earbuds Pro",
    warehouse: "Dhaka HQ",
    quantity: 120,
    unitCost: 892,
    totalValue: 107040,
    referenceType: "work_order",
    referenceId: "wo_002",
    referenceLabel: "WO-2026-0201",
    event: "inventory.stock_in.posted",
    postedAt: "2026-06-12T11:00:00Z",
  },
];

const wipIssueLines = [
  {
    id: "jl_wo002_1",
    accountCode: MANUFACTURING_GL_ACCOUNTS.wip.code,
    accountName: MANUFACTURING_GL_ACCOUNTS.wip.name,
    debit: 48000,
    credit: 0,
    memo: "Material issue to WO-2026-0201",
  },
  {
    id: "jl_wo002_2",
    accountCode: MANUFACTURING_GL_ACCOUNTS.rawMaterials.code,
    accountName: MANUFACTURING_GL_ACCOUNTS.rawMaterials.name,
    debit: 0,
    credit: 48000,
    memo: "RM stock out — earbuds components",
  },
];

const fgReceiptLines = [
  {
    id: "jl_wo002_3",
    accountCode: MANUFACTURING_GL_ACCOUNTS.finishedGoods.code,
    accountName: MANUFACTURING_GL_ACCOUNTS.finishedGoods.name,
    debit: 107040,
    credit: 0,
    memo: "Partial FG receipt — 120 units",
  },
  {
    id: "jl_wo002_4",
    accountCode: MANUFACTURING_GL_ACCOUNTS.wip.code,
    accountName: MANUFACTURING_GL_ACCOUNTS.wip.name,
    debit: 0,
    credit: 107040,
    memo: "WIP relief — partial output",
  },
];

export const demoWorkOrderJournalSeed: JournalEntry[] = [
  {
    id: "je_wo002_1",
    number: "JE-2026-8841",
    date: "2026-06-11",
    description: "Material issue — WO-2026-0201",
    referenceType: "work_order",
    referenceId: "wo_002",
    referenceLabel: "WO-2026-0201",
    event: "accounting.manufacturing.material_issue.posted",
    status: "posted",
    lines: wipIssueLines,
    ...journalTotals(wipIssueLines),
  },
  {
    id: "je_wo002_2",
    number: "JE-2026-8842",
    date: "2026-06-12",
    description: "FG receipt — WO-2026-0201 (120 units)",
    referenceType: "work_order",
    referenceId: "wo_002",
    referenceLabel: "WO-2026-0201",
    event: "accounting.manufacturing.fg_receipt.posted",
    status: "posted",
    lines: fgReceiptLines,
    ...journalTotals(fgReceiptLines),
  },
];
