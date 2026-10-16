export type JournalEntryStatus = "draft" | "posted";

export type JournalLine = {
  id: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo?: string;
};

export type JournalReferenceType =
  | "work_order"
  | "vendor_bill"
  | "purchase_receipt"
  | "manual";

export type JournalEntry = {
  id: string;
  number: string;
  date: string;
  description: string;
  referenceType: JournalReferenceType;
  referenceId: string;
  referenceLabel: string;
  event: string;
  status: JournalEntryStatus;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
};

/** Mock chart of accounts used by manufacturing integration. */
export const MANUFACTURING_GL_ACCOUNTS = {
  rawMaterials: { code: "1200", name: "Raw materials inventory" },
  wip: { code: "1310", name: "Work in process" },
  finishedGoods: { code: "1300", name: "Finished goods inventory" },
  manufacturingOverhead: { code: "5100", name: "Manufacturing overhead applied" },
} as const;

export function journalTotals(lines: JournalLine[]): { totalDebit: number; totalCredit: number } {
  const totalDebit = Math.round(lines.reduce((s, l) => s + l.debit, 0) * 100) / 100;
  const totalCredit = Math.round(lines.reduce((s, l) => s + l.credit, 0) * 100) / 100;
  return { totalDebit, totalCredit };
}

export function formatJournalAmount(amount: number): string {
  return `৳${amount.toLocaleString("en-BD", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
