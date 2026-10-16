import type { ApiCustomerLedgerEntry, ApiCustomerLedgerSummary } from "@/lib/api/customer-ledger";
import type { ApiLedgerEntry, ApiLedgerSummary } from "@/lib/api/supplier-ledger";
import { formatCurrency } from "@/lib/utils";

/** Company-books journal — Odoo Partner Ledger / SAP FBL. */
export type PartnerJournal = "receivable" | "payable";

export type PartnerDocument =
  | "invoice"
  | "bill"
  | "receipt"
  | "payment"
  | "writeoff"
  | "refund"
  | "sales_return"
  | "purchase_return";

export type PartnerAgeing = {
  current: number;
  days30: number;
  days60: number;
  days90Plus: number;
};

export type PartnerLedgerLine = {
  id: string;
  journal: PartnerJournal;
  document: PartnerDocument;
  documentLabel: string;
  date: string;
  dateTime: string;
  dueDate: string | null;
  reference: string;
  sourceType: string | null;
  sourceId: string | null;
  status: string;
  matching: string;
  residual: number;
  debit: number;
  credit: number;
  balance: number;
  location: string | null;
  paymentMethod: string | null;
  notes: string | null;
};

export type PartnerLedgerTotals = {
  openingBalance: number;
  debitTotal: number;
  creditTotal: number;
  arBilled: number;
  arPaid: number;
  arOutstanding: number;
  arAdvance: number;
  apBilled: number;
  apPaid: number;
  apOutstanding: number;
  apAdvance: number;
  theyOwe: number;
  weOwe: number;
  net: number;
  openCount: number;
  overdue: number;
  arAgeing: PartnerAgeing;
  apAgeing: PartnerAgeing;
};

const ZERO_AGEING: PartnerAgeing = { current: 0, days30: 0, days60: 0, days90Plus: 0 };

function n(value: string | number | null | undefined): number {
  const x = Number(value ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function dayOf(entryDate: string | null | undefined, createdAt: string | null | undefined): string {
  return (entryDate || createdAt || "").slice(0, 10);
}

function dueDay(value: string | null | undefined): string | null {
  const d = (value ?? "").slice(0, 10);
  return d || null;
}

function matchingLabel(kind: "open-item" | "payment", status: string | null, residual: number): string {
  if (kind === "payment") return "—";
  const s = (status || "").trim().toLowerCase();
  if (s === "cancelled") return "Cancelled";
  if (residual > 0.004) return s === "partial" ? "Partial" : "Open";
  return "Paid";
}

function fromCustomer(entry: ApiCustomerLedgerEntry): Omit<PartnerLedgerLine, "balance"> {
  const invoice = entry.kind === "receivable";
  const isReturn = (entry.source_type || "").toLowerCase() === "sales_return";
  // A customer payment in the debit column is money we paid back (refund).
  const refund = !invoice && n(entry.debit) > 0.004;
  const writeOff = !invoice && entry.payment_method === "write_off";
  const residual = invoice ? n(entry.due) : 0;
  return {
    id: `ar:${entry.id}`,
    journal: "receivable",
    document: isReturn
      ? "sales_return"
      : invoice
        ? "invoice"
        : refund
          ? "refund"
          : writeOff
            ? "writeoff"
            : "receipt",
    documentLabel: isReturn
      ? "Sell Return"
      : invoice
        ? "Sell"
        : refund
          ? "Refund"
          : writeOff
            ? "Discount"
            : "Payment",
    date: dayOf(entry.entry_date, entry.created_at),
    dateTime: entry.created_at || entry.entry_date || "",
    dueDate: dueDay(entry.due_date),
    reference: entry.reference,
    sourceType: entry.source_type,
    sourceId: entry.source_id,
    status: entry.status?.trim() || "",
    matching: isReturn ? "—" : matchingLabel(invoice ? "open-item" : "payment", entry.status, residual),
    residual,
    debit: n(entry.debit),
    credit: n(entry.credit),
    location: entry.location ?? null,
    paymentMethod: entry.payment_method ?? null,
    notes: entry.notes ?? null,
  };
}

/**
 * Supplier role ledger stores billed as debit (we-owe). Flip to company books:
 * vendor bill = credit, vendor payment = debit (Odoo AP / SAP FBL1N).
 */
function fromSupplier(entry: ApiLedgerEntry): Omit<PartnerLedgerLine, "balance"> {
  const bill = entry.kind === "payable";
  const isReturn = (entry.source_type || "").toLowerCase() === "purchase_return";
  const writeOff = !bill && entry.payment_method === "write_off";
  const residual = bill ? n(entry.due) : 0;
  const billed = n(entry.debit);
  const paid = n(entry.credit);
  return {
    id: `ap:${entry.id}`,
    journal: "payable",
    document: isReturn ? "purchase_return" : bill ? "bill" : writeOff ? "writeoff" : "payment",
    documentLabel: isReturn ? "Purchase Return" : bill ? "Purchase" : writeOff ? "Discount" : "Payment",
    date: dayOf(entry.entry_date, entry.created_at),
    dateTime: entry.created_at || entry.entry_date || "",
    dueDate: dueDay(entry.due_date),
    reference: entry.reference,
    sourceType: entry.source_type,
    sourceId: entry.source_id,
    status: entry.status?.trim() || "",
    matching: matchingLabel(bill ? "open-item" : "payment", entry.status, residual),
    residual,
    debit: bill ? 0 : paid,
    credit: billed,
    location: entry.location ?? null,
    paymentMethod: entry.payment_method ?? null,
    notes: entry.notes ?? null,
  };
}

function parseAgeing(summary?: { current: string; days_30: string; days_60: string; days_90_plus: string }): PartnerAgeing {
  if (!summary) return { ...ZERO_AGEING };
  return {
    current: n(summary.current),
    days30: n(summary.days_30),
    days60: n(summary.days_60),
    days90Plus: n(summary.days_90_plus),
  };
}

/**
 * Running balance is accumulated oldest → newest, then the list is flipped so
 * the latest entry sits on top and its balance is where the account stands now.
 */
function attachRunningBalance(rows: Omit<PartnerLedgerLine, "balance">[]): PartnerLedgerLine[] {
  // An invoice and the payment posted with it can share a timestamp — the
  // document comes first, then the money against it.
  const rank = (row: Omit<PartnerLedgerLine, "balance">) =>
    row.document === "invoice" ||
    row.document === "bill" ||
    row.document === "sales_return" ||
    row.document === "purchase_return"
      ? 0
      : 1;
  const chronological = [...rows].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    const byTime = a.dateTime.localeCompare(b.dateTime);
    if (byTime !== 0) return byTime;
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return a.id.localeCompare(b.id);
  });
  let running = 0;
  const withBalance = chronological.map((row) => {
    running += row.debit - row.credit;
    return { ...row, balance: running };
  });
  return withBalance.reverse();
}

export type BalanceSide = "they_owe" | "we_owe" | "settled";

/** Positive balance: the partner owes us. Negative: we owe them (advance / credit). */
export function balanceSide(value: number): BalanceSide {
  if (value > 0.004) return "they_owe";
  if (value < -0.004) return "we_owe";
  return "settled";
}

export function emptyPartnerTotals(): PartnerLedgerTotals {
  return {
    openingBalance: 0,
    debitTotal: 0,
    creditTotal: 0,
    arBilled: 0,
    arPaid: 0,
    arOutstanding: 0,
    arAdvance: 0,
    apBilled: 0,
    apPaid: 0,
    apOutstanding: 0,
    apAdvance: 0,
    theyOwe: 0,
    weOwe: 0,
    net: 0,
    openCount: 0,
    overdue: 0,
    arAgeing: { ...ZERO_AGEING },
    apAgeing: { ...ZERO_AGEING },
  };
}

export function buildPartnerLedger(input: {
  customer?: { entries: ApiCustomerLedgerEntry[]; summary: ApiCustomerLedgerSummary } | null;
  supplier?: { entries: ApiLedgerEntry[]; summary: ApiLedgerSummary } | null;
}): { rows: PartnerLedgerLine[]; totals: PartnerLedgerTotals } {
  const draft: Omit<PartnerLedgerLine, "balance">[] = [];
  if (input.customer) {
    for (const entry of input.customer.entries) draft.push(fromCustomer(entry));
  }
  if (input.supplier) {
    for (const entry of input.supplier.entries) draft.push(fromSupplier(entry));
  }
  const rows = attachRunningBalance(draft);

  const ar = input.customer?.summary;
  const ap = input.supplier?.summary;
  const arOutstanding = n(ar?.outstanding);
  const arAdvance = n(ar?.advance);
  const apOutstanding = n(ap?.outstanding);
  const apAdvance = n(ap?.advance);
  const theyOwe = arOutstanding;
  const weOwe = apOutstanding;
  const net = theyOwe - weOwe + arAdvance - apAdvance;
  const newest = rows[0];
  const netFromLines = newest ? newest.balance : 0;
  const openingBalance = n(ar?.opening_balance) - n(ap?.opening_balance);

  return {
    rows,
    totals: {
      openingBalance,
      debitTotal: rows.reduce((sum, row) => sum + row.debit, 0),
      creditTotal: rows.reduce((sum, row) => sum + row.credit, 0),
      arBilled: n(ar?.billed_total),
      arPaid: n(ar?.paid_total),
      arOutstanding,
      arAdvance,
      apBilled: n(ap?.billed_total),
      apPaid: n(ap?.paid_total),
      apOutstanding,
      apAdvance,
      theyOwe,
      weOwe,
      net: rows.length ? netFromLines : net,
      openCount: (ar?.open_bill_count ?? 0) + (ap?.open_bill_count ?? 0),
      overdue: n(ar?.overdue) + n(ap?.overdue),
      arAgeing: parseAgeing(ar?.ageing),
      apAgeing: parseAgeing(ap?.ageing),
    },
  };
}

export function formatLedgerMoney(value: number): string {
  const x = Number.isFinite(value) ? value : 0;
  const formatted = formatCurrency(Math.abs(x));
  return x < 0 ? `−${formatted}` : formatted;
}

export function moneyOrDash(value: number): string {
  return value > 0.004 ? formatLedgerMoney(value) : "—";
}
