import type { PartnerAddress } from "@/lib/sales/sales-partner-address";
import type { LineDataCol } from "@/components/sales/sales-order-line-table-layout";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/utils";
import type { InvoiceLayout, PackingLayout } from "@/lib/api/workspace-company";
import type {
  InvoiceDocumentData,
  InvoicePreviewCompany,
} from "@/components/workspace/invoice-layout-preview";

export const SALES_PRINT_STORAGE_KEY = "againerp:sales-print";

/** @deprecated use SALES_PRINT_STORAGE_KEY */
export const SALES_PRINT_SESSION_KEY = SALES_PRINT_STORAGE_KEY;

export type SalesPrintLine = {
  name: string;
  sku?: string;
  imageUrl: string;
  variant: string;
  description: string;
  leadTime: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  discountAmount?: number;
  serialNumbers?: string[];
};

export type SalesPrintExpense = { title: string; amount: number };

export type SalesPrintPayload = {
  documentLabel: "Order" | "Quotation" | "Invoice" | "Packing Slip" | "Delivery Note";
  documentNumber: string;
  orderDate: string;
  customerName: string;
  customerContact: string;
  customerCompany?: string;
  customerPhone: string;
  customerEmail: string;
  invoiceAddress: PartnerAddress;
  /** Visible order-line columns in display order (matches drawer table). */
  columns: LineDataCol[];
  /** When true, product column includes line description text. */
  showDescription: boolean;
  lines: SalesPrintLine[];
  /** Sum of line amounts net of line discounts (the drawer's "Sub total"). */
  untaxedAmount: number;
  /** Order-level discount, resolved to money (on top of the line discounts). */
  orderDiscountAmount?: number;
  shippingAmount?: number;
  additionalExpenses?: SalesPrintExpense[];
  /** Credited/draft returns netted off the total. */
  returnedAmount?: number;
  taxAmount: number;
  /** Single tax rate when every taxed line shares one; null when mixed / none. */
  taxRate?: number | null;
  /** = untaxed − order discount + tax + shipping + expenses − returned, like the drawer. */
  total: number;
  paidAmount?: number;
  previousDueAmount?: number;
  taxSummaryLabel: string;
  invoicePrint?: {
    company: InvoicePreviewCompany;
    layout: InvoiceLayout;
    packing?: PackingLayout;
    kind?: "invoice" | "packing";
    document: InvoiceDocumentData;
  };
};

const DEFAULT_PRINT_COLUMNS: LineDataCol[] = [
  "product",
  "quantity",
  "unitPrice",
  "taxes",
  "amount",
];

export const DEFAULT_PRINT_COMPANY = {
  name: "AgainERP",
  street: "32/B, Malibagh Chowdhury Para",
  city: "Dhaka - 1219, Bangladesh",
  phone: "+8801332-812759",
  email: "info@againerp.com",
  termsUrl: "/terms-and-conditions",
  logoSrc: "/uploads/media/header-monarch-it-logo.png",
} as const;

export function formatPrintDate(iso: string): string {
  return formatDate(iso);
}

export function formatPrintMoney(value: number): string {
  return formatCurrency(value);
}

export function formatPrintQuantity(qty: number): string {
  return `${formatQuantity(qty)} Units`;
}

function distinctTaxRates(lines: SalesPrintLine[]): number[] {
  return [...new Set(lines.map((l) => Math.round(l.taxRate * 100) / 100))].filter((r) => r > 0);
}

function resolveTaxSummaryLabel(lines: SalesPrintLine[]): string {
  const rates = distinctTaxRates(lines);
  if (rates.length === 1) return `VAT at ${rates[0].toFixed(0)}%`;
  if (rates.length > 1) return "Taxes";
  return "Tax";
}

/** Order-level totals block — same arithmetic as the drawer's totals box. */
export function salesPrintTotals(payload: SalesPrintPayload) {
  const orderDiscount = Math.max(0, payload.orderDiscountAmount ?? 0);
  const shipping = Math.max(0, payload.shippingAmount ?? 0);
  const expenses = (payload.additionalExpenses ?? []).map((e) => ({
    title: e.title || "Additional expense",
    amount: e.amount || 0,
  }));
  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const returned = Math.max(0, payload.returnedAmount ?? 0);
  const paid = payload.paidAmount ?? 0;
  const due = Math.max(0, payload.total - paid);
  const refundDue = Math.max(0, paid - payload.total);
  const previousDue = Math.max(0, payload.previousDueAmount ?? 0);
  return { orderDiscount, shipping, expenses, expensesTotal, returned, paid, due, refundDue, previousDue };
}

export function buildSalesPrintPayload(input: {
  orderNumber: string;
  orderDate: string;
  customerName: string;
  customerCompany?: string;
  customerPhone?: string;
  customerEmail?: string;
  invoiceAddress: PartnerAddress;
  columns: LineDataCol[];
  showDescription: boolean;
  lines: Array<{
    name: string;
    sku?: string;
    imageUrl?: string;
    variant: string;
    description: string;
    leadTime: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    tax: number;
    discountAmount?: number;
    serialNumbers?: string[];
  }>;
  kind: "order" | "quotation";
  orderDiscountAmount?: number;
  shippingAmount?: number;
  additionalExpenses?: SalesPrintExpense[];
  returnedAmount?: number;
  paidAmount?: number;
  previousDueAmount?: number;
}): SalesPrintPayload {
  const printLines: SalesPrintLine[] = input.lines.map((line) => {
    const taxAmount = line.tax || 0;
    return {
      name: line.name,
      sku: line.sku,
      imageUrl: line.imageUrl ?? "",
      variant: line.variant,
      description: line.description,
      leadTime: line.leadTime,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      taxAmount,
      discountAmount: line.discountAmount || 0,
      serialNumbers: line.serialNumbers?.length ? line.serialNumbers : undefined,
    };
  });

  const untaxedAmount = printLines.reduce(
    (s, l) => s + Math.max(0, l.quantity * l.unitPrice - (l.discountAmount || 0)),
    0,
  );
  const taxAmount = printLines.reduce((s, l) => s + l.taxAmount, 0);
  const orderDiscountAmount = Math.max(0, input.orderDiscountAmount ?? 0);
  const shippingAmount = Math.max(0, input.shippingAmount ?? 0);
  const additionalExpenses = (input.additionalExpenses ?? []).map((e) => ({
    title: e.title,
    amount: Math.max(0, e.amount || 0),
  }));
  const expensesAmount = additionalExpenses.reduce((s, e) => s + e.amount, 0);
  const returnedAmount = Math.max(0, input.returnedAmount ?? 0);
  const rates = distinctTaxRates(printLines);

  return {
    documentLabel: input.kind === "quotation" ? "Quotation" : "Order",
    documentNumber: input.orderNumber === "New" ? "Draft" : input.orderNumber,
    orderDate: input.orderDate,
    customerName: input.customerName,
    customerContact: input.customerName,
    customerCompany: input.customerCompany?.trim() || undefined,
    customerPhone: input.customerPhone?.trim() ?? "",
    customerEmail: input.customerEmail?.trim() ?? "",
    invoiceAddress: input.invoiceAddress,
    columns: input.columns.length ? input.columns : DEFAULT_PRINT_COLUMNS,
    showDescription: input.showDescription,
    lines: printLines,
    untaxedAmount,
    orderDiscountAmount,
    shippingAmount,
    additionalExpenses,
    returnedAmount,
    taxAmount,
    taxRate: rates.length === 1 ? rates[0] : null,
    total: Math.max(
      0,
      untaxedAmount + taxAmount - orderDiscountAmount + shippingAmount + expensesAmount - returnedAmount,
    ),
    paidAmount: input.paidAmount,
    previousDueAmount: input.previousDueAmount,
    taxSummaryLabel: resolveTaxSummaryLabel(printLines),
  };
}

export function storeSalesPrintPayload(payload: SalesPrintPayload): string {
  if (typeof window === "undefined") return "";
  const printKey = `${SALES_PRINT_STORAGE_KEY}:${Date.now()}`;
  const serialized = JSON.stringify(payload);
  // localStorage is shared across tabs; sessionStorage is not (window.open gets empty storage).
  localStorage.setItem(printKey, serialized);
  localStorage.setItem(SALES_PRINT_STORAGE_KEY, printKey);
  try {
    sessionStorage.setItem(SALES_PRINT_STORAGE_KEY, serialized);
  } catch {
    /* ignore quota / private mode */
  }
  return printKey;
}

export function readSalesPrintPayload(printKey?: string | null): SalesPrintPayload | null {
  if (typeof window === "undefined") return null;

  const pointerKey = printKey || localStorage.getItem(SALES_PRINT_STORAGE_KEY);
  const candidates: string[] = [];

  if (pointerKey) {
    if (pointerKey.startsWith("{")) {
      candidates.push(pointerKey);
    } else {
      const blob = localStorage.getItem(pointerKey);
      if (blob) candidates.push(blob);
    }
  }

  try {
    const fromSession = sessionStorage.getItem(SALES_PRINT_STORAGE_KEY);
    if (fromSession) candidates.push(fromSession);
  } catch {
    /* ignore private mode */
  }

  for (const raw of candidates) {
    try {
      const parsed = normalizePrintPayload(JSON.parse(raw) as SalesPrintPayload);
      if (parsed?.lines && parsed.documentNumber != null) return parsed;
    } catch {
      /* try next source */
    }
  }
  return null;
}

function normalizePrintPayload(raw: SalesPrintPayload): SalesPrintPayload {
  const columns =
    raw.columns?.length ? raw.columns : DEFAULT_PRINT_COLUMNS;
  const lines: SalesPrintLine[] = (raw.lines ?? []).map((line) => {
    const legacy = line as SalesPrintLine & { description?: string; name?: string };
    if (legacy.name != null) return { ...legacy, imageUrl: legacy.imageUrl ?? "" };
    return {
      name: legacy.description ?? "Product",
      imageUrl: "",
      variant: "",
      description: "",
      leadTime: "",
      quantity: legacy.quantity,
      unitPrice: legacy.unitPrice,
      taxRate: legacy.taxRate,
      taxAmount: legacy.taxAmount,
    };
  });
  return {
    ...raw,
    columns,
    showDescription: raw.showDescription ?? false,
    customerPhone: raw.customerPhone ?? "",
    customerEmail: raw.customerEmail ?? "",
    lines,
  };
}

/** Print tab URL. Kept short (/print) — the page reads the latest stored
 * payload, so the key is not needed in the address. */
export function salesPrintPath(_printKey?: string): string {
  return "/print";
}
