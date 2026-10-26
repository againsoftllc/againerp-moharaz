"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronLeft, Eye, Info, Lock, Minus, Percent, Plus, Printer, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PurchaseOrderPrintDocument } from "@/components/purchase/purchase-order-print-document";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FilterSelect } from "@/components/shared/filter-select";
import { InventoryProductQuickAdd } from "@/components/inventory/inventory-product-quick-add";
import { ProductSearchAdd } from "@/components/products/product-search-add";
import { SupplierFormDrawer } from "@/components/suppliers/supplier-form-drawer";
import { PO_STATUS_LABEL, PO_STATUS_TONE } from "@/components/suppliers/supplier-purchase-orders";
import { Badge } from "@/components/ui/badge";
import {
  AGAIN_DRAWER_CONTENT_CLASS,
  AgainDrawerButton,
  AgainDrawerCloseButton,
  AgainDrawerControlBar,
  AgainDrawerScrollBody,
  DrawerResizeHandle,
  useDrawerResize,
} from "@/components/again/again-drawer";
import {
  AGAIN_FORM_TITLE_CLASS,
  AgainFormField,
  AgainFormGroupTitle,
} from "@/components/again/again-form-sheet";
import { AgainFormNotebook } from "@/components/again/again-form-sheet-layout";
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";
import { SearchDropdown } from "@/components/again/again-search-dropdown";
import { LineNumericInput } from "@/components/sales/sales-order-line-row-cells";
import { cancelPurchaseOrder, confirmPurchaseOrder, createPurchaseOrder, fetchPurchaseOrders, updatePurchaseOrder, type ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import { createPurchaseReceipt, fetchPurchaseReceipts, postPurchaseReceipt, type ApiPurchaseReceipt } from "@/lib/api/purchase-receipts";
import {
  approvePurchaseReturn,
  createPurchaseReturn,
  creditPurchaseReturn,
  fetchPurchaseReturns,
  rejectPurchaseReturn,
  type ApiPurchaseReturn,
} from "@/lib/api/purchase-returns";
import { fetchSerials, type InventorySerial } from "@/lib/api/inventory-serials";
import { ReturnSerialsDrawer } from "@/components/suppliers/return-serials-drawer";
import { fetchStockTransfers, type ApiStockTransfer } from "@/lib/api/stock-transfers";
import { printPurchaseReturn } from "@/lib/purchase/purchase-return-print";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import {
  deleteSupplierPayment,
  fetchSupplierLedger,
  fetchSupplierPayments,
  type SupplierLedger,
  recordSupplierPayment,
} from "@/lib/api/supplier-ledger";
import {
  SerialsDrawer,
  trackingOf,
  remainingOf,
  type TrackingType,
} from "@/components/suppliers/receiving-shared";
import {
  PurchaseReceivingHistory,
  poReceiveSummary,
} from "@/components/purchase/purchase-receiving-history";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import { useWarehouseAccess } from "@/lib/auth/warehouse-access";
import { apiFetch } from "@/lib/api/client";
import { apiStockToStockItem, fetchStockLevels, type ApiStockLevel, type ApiStockListResponse } from "@/lib/api/inventory";
import {
  apiProductToProduct,
  type ApiProductListResponse,
} from "@/lib/api/catalog-products";
import {
  apiSupplierToSupplierDetail,
  type ApiSupplierResponse,
} from "@/lib/api/commerce-suppliers";
import type { Product } from "@/lib/mock-data/products";
import type { SupplierDetail } from "@/lib/mock-data/suppliers";
import { readPurchaseSettings, type PurchaseOrderPrefillLine } from "@/lib/purchase/purchase-paths";
import {
  purchaseLineReturnable,
  purchaseOrderIsReturnable,
  RETURN_REASON_LABELS,
  RETURN_STATUS_LABELS,
  type ReturnReason,
  type ReturnStatus,
} from "@/lib/mock-data/purchase-returns";
import {
  fallbackPurchasePrintCompany,
  purchasePrintHeading,
  purchasePrintPath,
  storePurchasePrintPayload,
  type PurchasePrintLine,
  type PurchasePrintPayload,
} from "@/lib/purchase/purchase-print";
import { fetchWorkspaceCompany, inheritInvoiceBrandMedia, mergeInvoiceLayout, mergePurchaseLayout } from "@/lib/api/workspace-company";
import { fetchPaymentAccounts, type ApiFinancePaymentAccount } from "@/lib/api/finance";
import { companyTaxesEnabled } from "@/lib/api/workspace-company";
import { workspaceCompanyToInvoicePreview } from "@/lib/sales/sales-invoice-print";
import { cn, formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

type LineKind = "product" | "section" | "note" | "service";
type DiscountType = "percent" | "fixed";

type LineDraft = {
  key: string;
  kind: LineKind;
  name: string;
  sku: string;
  productId?: string;
  quantity: string;
  unitCostBeforeDiscount: string;
  discountType: DiscountType;
  discountPercent: string;
  taxRate: string;
  profitMargin: string;
  sellingPrice: string;
};

type ReceiveLineState = {
  previouslyReceived: number;
  remaining: number;
  tracking: TrackingType;
  qty: string;
  serials: string[];
  batchNumber: string;
  batchExpiry: string;
};

// loaded when the eye on a line is first used: the product drawer brings its tabs and grids with it
const ProductDrawer = dynamic(
  () => import("@/components/products/product-drawer/product-drawer").then((module) => module.ProductDrawer),
  { ssr: false },
);

const LINK =
  "text-[13px] font-normal text-[#00a09d] hover:text-[#00c4bf] hover:underline";

const CELL_INPUT =
  "h-8 min-w-0 w-full overflow-hidden border-b border-border/50 bg-transparent text-right text-[13px] outline-none focus:border-[#00a09d]";

const PO_LINE_COLS = [
  "product",
  "quantity",
  "unitCost",
  "discount",
  "amount",
] as const;

// Only shown once a confirmed/partial-received PO can receive inline (see canReceiveInline) —
// added to / removed from the reorderable column set by usePoLineTableLayout when that flips.
const PO_RECEIVE_COLS = ["received", "serialBatch"] as const;

type PoLineCol = (typeof PO_LINE_COLS)[number] | (typeof PO_RECEIVE_COLS)[number];

const PO_LINE_LABELS: Record<PoLineCol, string> = {
  product: "Product",
  quantity: "Quantity",
  unitCost: "Unit Cost",
  discount: "Disc",
  amount: "Amount",
  received: "Received",
  serialBatch: "Serial / Batch",
};

// Same as the sales order lines (sales-order-line-table-layout.tsx): each column opens as wide as its content needs and no
// wider; the Product column has no fixed width - it takes whatever is left (see poColStyle), so the number columns stay
// together on the right instead of being spread across the table.
const PO_DEFAULT_WIDTHS: Record<PoLineCol, number> = {
  product: 300, // only the minimum counts (PO_MIN_WIDTHS): the column itself is flexible
  quantity: 84,
  unitCost: 96,
  discount: 96,
  amount: 108,
  received: 84,
  serialBatch: 172, // the batch / LOT inputs are 160 px wide
};

const PO_MIN_WIDTHS: Record<PoLineCol, number> = {
  product: 160,
  quantity: 64,
  unitCost: 52,
  discount: 56,
  amount: 52,
  received: 72,
  serialBatch: 96,
};

/** The fixed right column of the lines table: it holds the row's hover delete button, so no data column sits under it. */
const PO_LINE_ACTION_COL_WIDTH = 28;

/** Width style of a column's header, body cell and `<col>`: Product only has a minimum, the others a fixed width. */
function poColStyle(col: PoLineCol, width: number): React.CSSProperties {
  return col === "product" ? { minWidth: PO_MIN_WIDTHS.product } : { width, minWidth: width, maxWidth: width };
}

function usePoLineTableLayout(canReceiveInline: boolean) {
  const [order, setOrder] = useState<PoLineCol[]>([...PO_LINE_COLS]);
  const [widths, setWidths] = useState<Record<PoLineCol, number>>(PO_DEFAULT_WIDTHS);
  const [dragCol, setDragCol] = useState<PoLineCol | null>(null);

  useEffect(() => {
    setOrder((prev) => {
      if (canReceiveInline) {
        const missing = PO_RECEIVE_COLS.filter((c) => !prev.includes(c));
        return missing.length ? [...prev, ...missing] : prev;
      }
      const filtered = prev.filter((c) => !(PO_RECEIVE_COLS as readonly string[]).includes(c));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [canReceiveInline]);

  const moveColumn = useCallback((from: PoLineCol, to: PoLineCol) => {
    if (from === to) return;
    setOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(from);
      const toIdx = next.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      return next;
    });
  }, []);

  const startResize = useCallback((col: PoLineCol, startX: number) => {
    const startWidth = widths[col];
    const onMove = (event: MouseEvent) => {
      const delta = event.clientX - startX;
      setWidths((current) => ({
        ...current,
        [col]: Math.max(PO_MIN_WIDTHS[col], startWidth + delta),
      }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [widths]);

  return { order, widths, dragCol, setDragCol, moveColumn, startResize };
}

function PoLineHeaderCell({
  col,
  width,
  dragCol,
  onDragColChange,
  onMoveColumn,
  onResizeStart,
}: {
  col: PoLineCol;
  width: number;
  dragCol: PoLineCol | null;
  onDragColChange: (col: PoLineCol | null) => void;
  onMoveColumn: (from: PoLineCol, to: PoLineCol) => void;
  onResizeStart: (col: PoLineCol, clientX: number) => void;
}) {
  const label = PO_LINE_LABELS[col];
  const alignRight = col !== "product" && col !== "serialBatch";

  return (
    <th
      style={poColStyle(col, width)}
      className={cn(
        "group/col relative overflow-hidden py-2 pr-2.5 font-medium",
        alignRight && "text-right",
      )}
      draggable
      onDragStart={(event) => {
        onDragColChange(col);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => onDragColChange(null)}
      onDragOver={(event) => {
        if (!dragCol || dragCol === col) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        if (!dragCol || dragCol === col) return;
        event.preventDefault();
        onMoveColumn(dragCol, col);
        onDragColChange(null);
      }}
    >
      <span
        className={cn(
          "block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap",
          "cursor-grab active:cursor-grabbing",
          dragCol === col && "opacity-60",
        )}
        title={label}
      >
        {label}
      </span>
      {col !== "product" ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${label} column`}
          className="absolute inset-y-0 right-0 z-20 w-2.5 cursor-col-resize group/resize"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onResizeStart(col, event.clientX);
          }}
          onDragStart={(event) => event.preventDefault()}
        >
          <span
            className="pointer-events-none absolute inset-y-1 right-[4px] w-px bg-transparent group-hover/col:bg-border group-hover/resize:bg-[#00a09d]"
            aria-hidden
          />
        </div>
      ) : null}
    </th>
  );
}

type ItemOption = {
  id?: string;
  itemId?: string;
  sku: string;
  name: string;
  unitCost: number;
  sellingPrice: number;
  brand?: string;
  category?: string;
  model?: string;
  stock?: number;
  imageUrl?: string;
  barcode?: string | null;
  /** Serial / batch tracked product: a direct receive asks for its serials / batch. */
  tracking?: TrackingType;
};

type PurchaseStatusChoice = "" | "draft" | "ordered" | "pending" | "received";
type NotebookTab = "lines" | "payment" | "receiving" | "returns" | "others" | "info";

/** One earlier purchase of a product from the supplier (the Info tab shows the last three). */
type PoPurchaseHistoryRow = { date: string; poNumber: string; unitCost: number; quantity: number };

const PAYMENT_TERM_OPTIONS = [
  { value: "due", label: "Due on receipt" },
  { value: "net7", label: "Net 7" },
  { value: "net15", label: "Net 15" },
  { value: "net30", label: "Net 30" },
  { value: "net45", label: "Net 45" },
  { value: "net60", label: "Net 60" },
];

const PAYMENT_METHOD_OPTIONS = [
  "Cash",
  "Manual Payment (Bank)",
  "bKash",
  "Nagad",
  "COD",
  "Card",
] as const;

type PaymentEntry = {
  id: string;
  method: string;
  amount: number;
  status: "completed" | "pending" | "failed";
  /** "refund" = money received back from the supplier (a return due); it is posted to the books and cannot be deleted. */
  kind?: "payment" | "refund";
  at: string;
  note?: string;
  accountId?: string;
  accountName?: string;
};

type SupplierOption = {
  id: string;
  name: string;
  country?: string;
  phone?: string;
  email?: string;
  contactPerson?: string;
  balanceDue?: number;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toDatetimeLocalValue(iso: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(local: string): string {
  if (!local) return new Date().toISOString();
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function num(value: string) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function lineCalc(line: LineDraft) {
  const qty = num(line.quantity);
  const beforeDiscount = num(line.unitCostBeforeDiscount);
  const taxRate = Math.min(100, Math.max(0, num(line.taxRate)));
  const lineGross = round2(qty * beforeDiscount);
  const rawDisc = Math.max(0, num(line.discountPercent));
  const discountAmount =
    line.discountType === "fixed"
      ? round2(Math.min(lineGross, rawDisc))
      : round2(lineGross * (Math.min(100, rawDisc) / 100));
  const net = round2(Math.max(0, lineGross - discountAmount));
  const beforeTax = qty > 0 ? round2(net / qty) : beforeDiscount;
  const costIncTax = round2(beforeTax * (1 + taxRate / 100));
  const lineTotal = round2(qty * costIncTax);
  return { qty, beforeDiscount, taxRate, beforeTax, costIncTax, lineTotal, discountAmount };
}

function sellingFromMargin(costIncTax: number, marginPct: number) {
  return round2(costIncTax * (1 + marginPct / 100));
}

function marginFromSelling(costIncTax: number, selling: number) {
  if (costIncTax <= 0) return 0;
  return round2(((selling - costIncTax) / costIncTax) * 100);
}

function newLine(prefill?: PurchaseOrderPrefillLine, item?: ItemOption): LineDraft {
  const cost = prefill?.unitCost ?? item?.unitCost ?? 0;
  const selling = item?.sellingPrice ?? 0;
  return {
    key: Math.random().toString(36).slice(2),
    kind: "product",
    name: item?.name ?? "",
    sku: prefill?.sku ?? item?.sku ?? "",
    productId: item?.id,
    quantity: prefill ? String(prefill.qty) : "1",
    unitCostBeforeDiscount: cost ? String(cost) : "",
    discountType: "percent",
    discountPercent: "0",
    taxRate: "0",
    profitMargin: cost > 0 && selling > 0 ? String(marginFromSelling(cost, selling)) : "",
    sellingPrice: selling ? String(selling) : "",
  };
}

function newMetaLine(kind: "section" | "note"): LineDraft {
  return {
    ...newLine(),
    kind,
    name: "",
    sku: "",
    quantity: "0",
    unitCostBeforeDiscount: "",
    sellingPrice: "",
    profitMargin: "",
  };
}

function lineFromOrderLine(line: ApiPurchaseOrder["lines"][number]): LineDraft {
  const unitCost = Number(line.unit_cost) || 0;
  const discount = Number(line.discount_amount) || 0;
  const taxRate = Number(line.tax_rate) || 0;
  return {
    key: line.id,
    kind: "product",
    name: line.name,
    sku: line.sku,
    productId: line.item_id,
    quantity: String(line.quantity_ordered),
    unitCostBeforeDiscount: unitCost ? String(unitCost) : "",
    discountType: discount > 0 ? "fixed" : "percent",
    discountPercent: String(discount),
    taxRate: String(taxRate),
    profitMargin: "",
    sellingPrice: "",
  };
}

function parseStoredPoNotes(notes: string | null | undefined) {
  const rows = (notes ?? "").split("\n");
  let referenceNo = "";
  let paymentTerms = "net30";
  for (const row of rows) {
    if (row.startsWith("Ref: ")) referenceNo = row.slice(5).trim();
    if (row.startsWith("Payment terms: ")) {
      const label = row.slice("Payment terms: ".length).trim();
      const match = PAYMENT_TERM_OPTIONS.find((option) => option.label === label);
      if (match) paymentTerms = match.value;
    }
  }
  return { referenceNo, paymentTerms };
}

function newServiceLine(): LineDraft {
  const line = newLine();
  return {
    ...line,
    kind: "service",
    name: "",
    sku: `SVC-${line.key}`,
    quantity: "1",
  };
}

function formatSupplierAddress(input: {
  name: string;
  country?: string;
  phone?: string;
  addresses?: { line1?: string; city?: string; country?: string }[];
}) {
  const addr = input.addresses?.[0];
  const fromAddr = addr
    ? [addr.line1, addr.city, addr.country].filter(Boolean).join(", ")
    : "";
  if (fromAddr) return fromAddr;
  const fallback = [input.country, input.phone].filter(Boolean).join(" · ");
  return fallback || input.name;
}

function ProductCell({
  line,
  onView,
  onNameChange,
}: {
  line: LineDraft;
  onView: () => void;
  onNameChange?: (name: string) => void;
}) {
  if (line.kind === "service") {
    return (
      <input
        value={line.name}
        onChange={(event) => onNameChange?.(event.target.value)}
        placeholder="Service name"
        className="h-8 min-w-0 w-full border-b border-border/50 bg-transparent text-[13px] outline-none focus:border-[#00a09d]"
        autoFocus={!line.name}
      />
    );
  }
  const canView = Boolean(line.sku || line.name);
  return (
    <div className="flex min-w-0 items-center gap-0.5 border-b border-border/50">
      <p
        className="h-8 min-w-0 flex-1 overflow-hidden truncate text-[13px] leading-8"
        title={line.name || undefined}
      >
        {line.name || <span className="text-muted-foreground/50">&nbsp;</span>}
      </p>
      {canView ? (
        <button
          type="button"
          className="inline-flex h-7 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          aria-label="Edit product"
          title="Edit product"
          onClick={onView}
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

const LINE_HEAD_H = "h-10";
const LINE_ROW_H = "h-11";

function LineDeleteBtn({
  onRemove,
  visible,
  onHoverStart,
  onHoverEnd,
}: {
  onRemove: () => void;
  visible?: boolean;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 w-7 items-center justify-center bg-background text-muted-foreground shadow-sm transition-opacity hover:text-destructive",
        visible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
      onClick={onRemove}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      aria-label="Delete line"
      tabIndex={visible ? 0 : -1}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function DiscTypeToggle({
  value,
  onChange,
}: {
  value: DiscountType;
  onChange: (next: DiscountType) => void;
}) {
  return (
    <span className="inline-flex h-5 shrink-0 border border-border" role="group" aria-label="Discount type">
      <button
        type="button"
        className={cn(
          "inline-flex h-full w-5 items-center justify-center rounded-none text-[10px] font-medium",
          value === "fixed"
            ? "bg-[#00a09d] text-white"
            : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        title="Fixed amount (৳)"
        aria-label="Fixed amount"
        aria-pressed={value === "fixed"}
        onClick={() => onChange("fixed")}
      >
        <span className="leading-none">৳</span>
      </button>
      <button
        type="button"
        className={cn(
          "inline-flex h-full w-5 items-center justify-center rounded-none border-l border-border",
          value === "percent"
            ? "bg-[#00a09d] text-white"
            : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        title="Percent (%)"
        aria-label="Percent"
        aria-pressed={value === "percent"}
        onClick={() => onChange("percent")}
      >
        <Percent className="h-2.5 w-2.5" strokeWidth={2.25} />
      </button>
    </span>
  );
}

/** The header's field rows (Purchase Date … Purchase Status): a label column wide enough that "Business Location" stays on one line. */
const PO_HEADER_ROW_CLASS = "grid-cols-[9rem_minmax(0,1fr)]";

const PO_STAGE_LABELS = ["Draft", "Ordered", "Received"] as const;

/** Odoo's status bar for a purchase order: Draft > Ordered > Received, the current step filled; a cancelled order shows its
 * state instead. Hidden on narrow screens, like the sales order's. */
function PoStatusSteps({ status, choice }: { status: string | null; choice: PurchaseStatusChoice }) {
  if (status === "cancelled") {
    return (
      <span className="hidden h-6 items-center bg-muted px-2 text-[11px] font-medium capitalize text-muted-foreground lg:inline-flex">
        cancelled
      </span>
    );
  }
  // an existing order shows where it is; a new one shows where the chosen Purchase Status will put it
  const current = status
    ? status === "draft"
      ? 0
      : status === "confirmed"
        ? 1
        : 2
    : choice === "draft"
      ? 0
      : choice === "received"
        ? 2
        : choice
          ? 1
          : -1;
  return (
    <div className="hidden items-center text-[11px] lg:flex" aria-label="Order stage">
      {PO_STAGE_LABELS.map((label, i) => (
        <div key={label} className="flex items-center">
          {i > 0 ? <span className="px-1 text-muted-foreground">›</span> : null}
          <span className={cn("px-2 py-0.5", i === current ? "bg-[#00a09d] font-medium text-white" : "bg-muted text-muted-foreground")}>
            {i === 2 && status === "partial_received" ? "Partly Received" : label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** What the user types into a purchase order: the part kept as a draft and compared with the loaded record. */
type PoFormValues = {
  supplier: string;
  referenceNo: string;
  purchaseDate: string;
  purchaseStatus: PurchaseStatusChoice;
  warehouseId: string;
  expectedDate: string;
  buyerName: string;
  paymentTerms: string;
  lines: LineDraft[];
};

/** Line keys are random per load, so they stay out of the "anything to save?" comparison. */
function poFormSignature(form: PoFormValues): string {
  const lines = form.lines.map((line) => {
    const rest: Partial<LineDraft> = { ...line };
    delete rest.key;
    return rest;
  });
  return JSON.stringify({ ...form, lines });
}

export function PoFormDrawer({
  open,
  onOpenChange,
  supplierId,
  supplierName,
  suppliers,
  initialSupplierId,
  initialWarehouseId,
  initialLines,
  order,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixed supplier when raised from a supplier workspace. */
  supplierId?: string;
  supplierName?: string;
  suppliers?: SupplierOption[];
  initialSupplierId?: string;
  initialWarehouseId?: string;
  initialLines?: PurchaseOrderPrefillLine[];
  order?: ApiPurchaseOrder | null;
  onCreated?: (order?: ApiPurchaseOrder) => void;
}) {
  const { warehouses } = useInventoryWarehouses();
  const warehouseAccess = useWarehouseAccess();
  const canReceiveInline = Boolean(
    order && (order.status === "confirmed" || order.status === "partial_received"),
  );
  const [selectedSupplier, setSelectedSupplier] = useState(supplierId ?? initialSupplierId ?? "");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [viewingSupplier, setViewingSupplier] = useState(false);
  const [supplierDraftName, setSupplierDraftName] = useState("");
  const [extraSuppliers, setExtraSuppliers] = useState<SupplierOption[]>([]);
  const [supplierAddress, setSupplierAddress] = useState("");
  const [selectedSupplierDetail, setSelectedSupplierDetail] = useState<SupplierDetail | null>(null);
  const [referenceNo, setReferenceNo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayIso);
  const [purchaseStatus, setPurchaseStatus] = useState<PurchaseStatusChoice>("ordered");
  const [warehouseId, setWarehouseId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [viewProductId, setViewProductId] = useState<string | null>(null);
  /** The product whose own drawer is open over the order (the eye on a line); its Edit button hands over to the editor above. */
  const [productViewId, setProductViewId] = useState<string | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const supplierAnchorRef = useRef<HTMLDivElement | null>(null);
  const [linesTab, setLinesTab] = useState<NotebookTab>("lines");
  // this order's purchase returns (the Returns tab)
  const [poReturns, setPoReturns] = useState<ApiPurchaseReturn[] | null>(null);
  // the Returns tab's new return: the quantity of each order line going back, why, and a note
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState<ReturnReason>("defective");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnSaving, setReturnSaving] = useState(false);
  const [returnsTick, setReturnsTick] = useState(0);
  const [returnHelpOpen, setReturnHelpOpen] = useState(false);
  /** The location the goods go back from ("" = the one holding most of them), the serials ticked per line, the in-stock
   * serials of each serial product, and the line whose serial list is open. */
  const [returnWarehouseId, setReturnWarehouseId] = useState("");
  const [returnSerials, setReturnSerials] = useState<Record<string, string[]>>({});
  const [serialPool, setSerialPool] = useState<Record<string, InventorySerial[] | "failed">>({});
  /** Stock rows (one per location) of each product on the order - the Info tab and the Returns tab both read them. */
  const [stockBySku, setStockBySku] = useState<Record<string, ApiStockLevel[] | "failed">>({});
  /** The supplier's ledger (bills, return credits and payments) - the totals card reads the balance before this order from it. */
  const [supplierLedger, setSupplierLedger] = useState<{ supplierId: string; ledger: SupplierLedger } | null>(null);
  /** Stock transfers between locations - they tell where the received goods have been moved on to. */
  const [transfers, setTransfers] = useState<ApiStockTransfer[] | null>(null);
  const [serialPickId, setSerialPickId] = useState<string | null>(null);
  /** The return opened in the list (its lines and dates), and the one an action is running on. */
  const [openReturnId, setOpenReturnId] = useState<string | null>(null);
  const [returnBusyId, setReturnBusyId] = useState<string | null>(null);
  const canWrite = useAdminCanWrite();
  const [paymentTerms, setPaymentTerms] = useState("net30");
  const [paymentHistory, setPaymentHistory] = useState<PaymentEntry[]>([]);
  /** What the Payment tab registers: a payment to the supplier, or the return due coming back from it. */
  const [payDraftKind, setPayDraftKind] = useState<"payment" | "refund">("payment");
  const [payDraftMethod, setPayDraftMethod] = useState<string>("Cash");
  const [payDraftAmount, setPayDraftAmount] = useState(0);
  const [payDraftAt, setPayDraftAt] = useState(() => toDatetimeLocalValue(new Date().toISOString()));
  const [payDraftNote, setPayDraftNote] = useState("");
  const [payDraftAccountId, setPayDraftAccountId] = useState("");
  const [paymentAccounts, setPaymentAccounts] = useState<ApiFinancePaymentAccount[]>([]);
  const [paySaving, setPaySaving] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState<string | null>(null);
  const [poReceipts, setPoReceipts] = useState<ApiPurchaseReceipt[]>([]);
  const [receiveByLine, setReceiveByLine] = useState<Record<string, ReceiveLineState>>({});
  const [serialTarget, setSerialTarget] = useState<{ key: string; name: string } | null>(null);
  const [receivingSaving, setReceivingSaving] = useState(false);
  const [totalsMinimized, setTotalsMinimized] = useState(false);
  const [hoveredLineKey, setHoveredLineKey] = useState<string | null>(null);
  const [drawerPanel, setDrawerPanel] = useState<"order" | "preview">("order");
  const [previewPayload, setPreviewPayload] = useState<PurchasePrintPayload | null>(null);
  const [companyTaxEnabled, setCompanyTaxEnabled] = useState(true);
  // docs/common/drawercommon.md: the form as loaded (what "Discard" goes back to and what "unsaved" is measured against), and
  // the body's scroll position, so a drawer closed by accident comes back where the user was
  const baseFormRef = useRef<PoFormValues | null>(null);
  const [baseSignature, setBaseSignature] = useState<string | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<number | null>(null);
  const [restoredTick, setRestoredTick] = useState(0);
  // Direct purchase: with Purchase Status "Received" a new order (or a draft) is ordered AND received in one save, so the lines
  // ask for what receiving needs - the serial numbers of serial products, the batch of batch products. Everything ordered is
  // received; a partial receive is done later with the Receive button.
  const directReceive = purchaseStatus === "received" && (!order || order.status === "draft");
  const [directEntries, setDirectEntries] = useState<
    Record<string, { serials: string[]; batchNumber: string; batchExpiry: string }>
  >({});
  const { width: drawerWidth, handleProps: drawerResizeHandle } = useDrawerResize({
    defaultWidth: 780,
    defaultWidthRatio: 0.6, // a lot of information: 60 % of the screen until the user drags it
    minWidth: 480,
    maxWidthRatio: 0.9,
    storageKey: "againerp:po-drawer-width",
  });
  const {
    order: lineColOrder,
    widths: lineColWidths,
    dragCol,
    setDragCol,
    moveColumn,
    startResize,
  } = usePoLineTableLayout(canReceiveInline || directReceive);

  const loadItems = async () => {
    try {
      const catalog = await apiFetch<ApiProductListResponse>(
        "/api/v1/catalog/products?per_page=200",
      );
      const seen = new Set<string>();
      const options: ItemOption[] = [];
      for (const row of catalog.data) {
        const product = apiProductToProduct(row);
        if (!product.sku || seen.has(product.sku)) continue;
        seen.add(product.sku);
        options.push({
          id: product.id,
          itemId: product.itemId || undefined,
          sku: product.sku,
          name: product.name,
          unitCost: product.purchasePrice ?? 0,
          sellingPrice: product.price ?? 0,
          brand: product.brand || undefined,
          category: product.category || undefined,
          model: product.model || undefined,
          stock: product.stock,
          imageUrl: product.thumbnail || undefined,
          tracking: row.tracking_type ?? (row.track_serial ? "serial" : row.track_batch ? "batch" : "none"),
        });
      }
      if (options.length) {
        setItems(options.sort((a, b) => a.name.localeCompare(b.name)));
        return;
      }
    } catch {
      /* fall through to stock */
    }
    try {
      const res = await apiFetch<ApiStockListResponse>("/api/v1/inventory/stock?limit=1000");
      const seen = new Set<string>();
      const options: ItemOption[] = [];
      for (const row of res.data.map(apiStockToStockItem)) {
        if (seen.has(row.sku)) continue;
        seen.add(row.sku);
        options.push({
          id: row.productId,
          sku: row.sku,
          name: row.name,
          unitCost: row.unitCost ?? 0,
          sellingPrice: 0,
          stock: row.onHand,
          imageUrl: row.thumbnail,
        });
      }
      setItems(options.sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setItems([]);
    }
  };

  const applyForm = (f: PoFormValues) => {
    setSelectedSupplier(f.supplier);
    setReferenceNo(f.referenceNo);
    setPurchaseDate(f.purchaseDate);
    setPurchaseStatus(f.purchaseStatus);
    setWarehouseId(f.warehouseId);
    setExpectedDate(f.expectedDate);
    setBuyerName(f.buyerName);
    setPaymentTerms(f.paymentTerms);
    setLines(f.lines);
  };

  useEffect(() => {
    if (!open) return;
    setTotalsMinimized(false);
    void fetchWorkspaceCompany()
      .then((row) => setCompanyTaxEnabled(companyTaxesEnabled(row)))
      .catch(() => setCompanyTaxEnabled(true));
    void fetchPaymentAccounts()
      .then((res) => {
        setPaymentAccounts(res.data);
        setPayDraftAccountId((current) =>
          current || res.data.find((a) => a.is_default)?.id || res.data[0]?.id || "",
        );
      })
      .catch(() => setPaymentAccounts([]));
    const settings = readPurchaseSettings();
    const editing = Boolean(order);
    const stored = editing
      ? parseStoredPoNotes(order?.notes)
      : { referenceNo: "", paymentTerms: settings.defaultPaymentTerms || "net30" };
    const base: PoFormValues = {
      supplier: order?.supplier_id ?? supplierId ?? initialSupplierId ?? "",
      referenceNo: stored.referenceNo,
      purchaseDate: order?.order_date ?? todayIso(),
      purchaseStatus:
        order?.status === "completed" || order?.status === "partial_received"
          ? "received"
          : order?.status === "draft"
            ? "pending"
            : "ordered",
      warehouseId:
        order?.warehouse_id ?? initialWarehouseId ?? warehouseAccess.defaultId ?? settings.defaultWarehouseId ?? "",
      expectedDate: order?.expected_date ?? "",
      buyerName: order?.buyer_name ?? "",
      paymentTerms: stored.paymentTerms,
      lines: order?.lines?.length
        ? order.lines.map(lineFromOrderLine)
        : initialLines?.length
          ? initialLines.map((l) => newLine(l))
          : [],
    };
    applyForm(base);
    baseFormRef.current = base;
    setBaseSignature(poFormSignature(base));
    setSupplierQuery("");
    setSupplierOpen(false);
    setSupplierFormOpen(false);
    setSupplierDraftName("");
    setExtraSuppliers([]);
    setSupplierAddress("");
    setLinesTab("lines");
    setPaymentHistory([]);
    setPayDraftMethod("Cash");
    setPayDraftAmount(0);
    setPayDraftAt(toDatetimeLocalValue(new Date().toISOString()));
    setPayDraftNote("");
    setViewProductId(null);
    setProductViewId(null);
    setPoReceipts([]);
    setDirectEntries({});
    setPayDraftKind("payment");
    setReturnQty({});
    setReturnSerials({});
    setReturnWarehouseId("");
    setSerialPickId(null);
    setReturnNotes("");
    setSerialTarget(null);
    setDrawerPanel("order");
    setPreviewPayload(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on order?.id, not the
    // whole object: a fresh-but-same-PO object from a parent refetch (e.g. after posting a
    // receipt) must not wipe in-progress local state like poReceipts or paymentHistory.
  }, [open, supplierId, initialSupplierId, initialWarehouseId, initialLines, order?.id, warehouseAccess.defaultId]);

  const currentForm: PoFormValues = {
    supplier: selectedSupplier,
    referenceNo,
    purchaseDate,
    purchaseStatus,
    warehouseId,
    expectedDate,
    buyerName,
    paymentTerms,
    lines,
  };
  // typed but not saved: the form differs from what was loaded (a new order loads empty, so any product or supplier counts)
  const formDirty = open && baseSignature !== null && poFormSignature(currentForm) !== baseSignature;
  // one draft per order ("purchase-order:new" for a new one); a drawer opened with a prefill (a supplier's workspace, a reorder
  // link) or on a closed order keeps none
  const draftKey =
    supplierId ||
    initialSupplierId ||
    initialWarehouseId ||
    initialLines?.length ||
    order?.status === "completed" ||
    order?.status === "cancelled"
      ? null
      : order?.id
        ? `purchase-order:${order.id}`
        : "purchase-order:new";
  // declared after the "fresh form on open" effect above, so a restored draft is applied after the reset
  const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<{ form: PoFormValues; scrollTop: number }>({
    key: draftKey,
    ready: open,
    dirty: formDirty,
    getValues: () => ({ form: currentForm, scrollTop: bodyScrollRef.current?.scrollTop ?? 0 }),
    restore: (v) => {
      applyForm(v.form);
      pendingScrollRef.current = v.scrollTop;
      setRestoredTick((t) => t + 1);
    },
    onDiscard: () => {
      if (baseFormRef.current) applyForm(baseFormRef.current); // back to what was saved
    },
    label: "purchase order",
  });

  // a restored draft: go back to where the user was
  useEffect(() => {
    if (!open || pendingScrollRef.current == null) return;
    const top = pendingScrollRef.current;
    pendingScrollRef.current = null;
    const timer = window.setTimeout(() => bodyScrollRef.current?.scrollTo({ top }), 120);
    return () => window.clearTimeout(timer);
  }, [open, restoredTick]);

  // every dismissal (outside click, Esc, the X) goes through here and keeps a draft; explicit closes after a save call
  // `onOpenChange` directly
  const handleOpenChange = (next: boolean) => {
    if (!next) saveDraftIfDirty();
    onOpenChange(next);
  };

  // a click outside the supplier field and its list closes the list
  useEffect(() => {
    if (!open || !supplierOpen) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-again-search-dropdown]")) return; // the portaled list
      if (supplierAnchorRef.current?.contains(target)) return;
      setSupplierOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, supplierOpen]);

  const nestedOpen = Boolean(
    viewProductId || productViewId || quickAddOpen || supplierFormOpen || serialTarget || serialPickId,
  );

  useEffect(() => {
    // loaded whenever the order is open (not only on the Returns tab): the totals card nets the credited returns off the order
    if (!open || !order?.id) return;
    let cancelled = false;
    void fetchPurchaseReturns({ purchase_order_id: order.id })
      .then((res) => {
        if (!cancelled) setPoReturns(res.data);
      })
      .catch(() => {
        if (!cancelled) setPoReturns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, order?.id, returnsTick]);

  // The supplier's account (ledger): what is owed to / by the supplier overall, to show what stood before this order.
  useEffect(() => {
    if (!open || !selectedSupplier) return;
    let cancelled = false;
    void fetchSupplierLedger(selectedSupplier)
      .then((ledger) => {
        if (!cancelled) setSupplierLedger({ supplierId: selectedSupplier, ledger });
      })
      .catch(() => {
        if (!cancelled) setSupplierLedger(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, selectedSupplier, returnsTick, paymentHistory.length, poReceipts.length]);

  // the order's lines that can still go back (received and not returned yet), with what the user typed for each
  // Where the goods can go back from: the location each product was received at, and wherever a completed stock transfer
  // carried it on from there (a serial unit simply sits where it is now). The user only chooses when there is a choice.
  const returnableLines = (order?.lines ?? []).filter((l) => purchaseLineReturnable(l) > 0);
  const postedReceipts = poReceipts.filter((receipt) => receipt.status === "posted");
  const lineReach = (line: ApiPurchaseOrder["lines"][number]): Set<string> => {
    const reach = new Set(
      postedReceipts
        .filter((receipt) => receipt.lines.some((l) => l.purchase_order_line_id === line.id))
        .map((receipt) => receipt.warehouse_id),
    );
    if (reach.size === 0 && order) reach.add(order.warehouse_id);
    const moves = (transfers ?? []).filter(
      (t) =>
        (t.status === "completed" || t.status === "partial_received") &&
        t.lines.some((l) => l.item_id === line.item_id && l.received_qty > 0),
    );
    for (let pass = 0; pass < 8; pass += 1) {
      let changed = false;
      for (const t of moves) {
        if (reach.has(t.from_warehouse_id) && !reach.has(t.to_warehouse_id)) {
          reach.add(t.to_warehouse_id);
          changed = true;
        }
      }
      if (!changed) break;
    }
    return reach;
  };
  /** The in-stock serial units of a line that were received on this order, wherever they are now. */
  const unitsOf = (line: ApiPurchaseOrder["lines"][number]): InventorySerial[] => {
    const all = serialPool[line.item_id];
    if (line.tracking_type !== "serial" || !Array.isArray(all)) return [];
    const received = new Set(
      postedReceipts
        .flatMap((receipt) => receipt.lines)
        .filter((receiptLine) => receiptLine.purchase_order_line_id === line.id)
        .flatMap((receiptLine) => receiptLine.serial_numbers ?? [])
        .map((s) => s.toLowerCase()),
    );
    return all.filter((unit) => received.size === 0 || received.has(unit.serial_number.toLowerCase()));
  };
  /** Pieces of a product available at a location (null while the stock is loading). */
  const availableAt = (sku: string, warehouseId: string): number | null => {
    const rows = stockBySku[sku];
    return Array.isArray(rows) ? Math.max(0, rows.find((r) => r.warehouse_id === warehouseId)?.available ?? 0) : null;
  };
  const locationIds = new Set<string>();
  for (const l of returnableLines) {
    if (l.tracking_type === "serial") {
      for (const unit of unitsOf(l)) if (unit.warehouse_id) locationIds.add(unit.warehouse_id);
    } else {
      for (const warehouseId of lineReach(l)) {
        const available = availableAt(l.sku, warehouseId);
        if (available === null || available > 0) locationIds.add(warehouseId);
      }
    }
  }
  if (locationIds.size === 0 && order) locationIds.add(order.warehouse_id);
  const returnLocations = warehouses.filter((w) => locationIds.has(w.id));
  const locationScore = (warehouseId: string) =>
    returnableLines.reduce((sum, l) => {
      const here =
        l.tracking_type === "serial"
          ? unitsOf(l).filter((unit) => unit.warehouse_id === warehouseId).length
          : lineReach(l).has(warehouseId)
            ? (availableAt(l.sku, warehouseId) ?? 0)
            : 0;
      return sum + Math.min(here, purchaseLineReturnable(l));
    }, 0);
  let autoReturnWarehouse =
    returnLocations.find((w) => w.id === order?.warehouse_id)?.id ?? returnLocations[0]?.id ?? order?.warehouse_id ?? "";
  for (const w of returnLocations) {
    if (locationScore(w.id) > locationScore(autoReturnWarehouse)) autoReturnWarehouse = w.id;
  }
  const returnWarehouse =
    returnWarehouseId && locationIds.has(returnWarehouseId) ? returnWarehouseId : autoReturnWarehouse;
  const returnWarehouseName = warehouses.find((w) => w.id === returnWarehouse)?.name ?? "this location";

  const returnRows = (order?.lines ?? [])
    .map((line) => {
      const returnable = purchaseLineReturnable(line);
      const serialTracked = line.tracking_type === "serial";
      // pieces of this product available at the return location (0 where it never was received nor transferred to)
      const here =
        lineReach(line).has(returnWarehouse) || serialTracked
          ? availableAt(line.sku, returnWarehouse)
          : stockBySku[line.sku] === undefined
            ? null
            : 0;
      // serial units that can go back: every received unit still in stock, and the ones at the return location
      const poolAll = unitsOf(line);
      const pool = poolAll.filter((unit) => unit.warehouse_id === returnWarehouse);
      const picked = serialTracked
        ? (returnSerials[line.id] ?? []).filter((sn) => pool.some((s) => s.serial_number === sn))
        : [];
      const cap = serialTracked ? Math.min(returnable, pool.length) : Math.min(returnable, here ?? returnable);
      // a serial product goes back unit by unit: how many is how many serials are ticked
      const qty = serialTracked ? picked.length : Math.min(cap, Math.max(0, Math.round(returnQty[line.id] ?? 0)));
      return {
        line,
        returnable,
        qty,
        credit: qty * (Number(line.unit_cost) || 0),
        serialTracked,
        here,
        pool,
        poolAll,
        picked,
        cap,
      };
    })
    // every line that was received is listed, so "Returned" shows how much has gone back already
    .filter((row) => row.line.quantity_received > 0);
  const returnPicked = returnRows.filter((row) => row.qty > 0);
  const returnCredit = returnPicked.reduce((sum, row) => sum + row.credit, 0);

  /** Takes a return on to its end in the drawer: approve (when it was only requested), then credit - stock goes back to the
   * supplier and the payable is reduced. Returns the message to show. */
  const finishReturn = async (ret: ApiPurchaseReturn): Promise<string> => {
    let current = ret;
    if (current.status === "requested") current = await approvePurchaseReturn(current.id);
    if (current.status === "approved") current = await creditPurchaseReturn(current.id);
    return `${current.return_number} returned — stock and payable updated`;
  };

  const submitReturn = async () => {
    if (!order || returnSaving || returnPicked.length === 0) return;
    setReturnSaving(true);
    let created: ApiPurchaseReturn | null = null;
    try {
      created = await createPurchaseReturn({
        purchase_order_id: order.id,
        warehouse_id: returnWarehouse || undefined,
        reason: returnReason,
        return_date: todayIso(),
        notes: returnNotes.trim() || undefined,
        lines: returnPicked.map((row) => ({
          purchase_order_line_id: row.line.id,
          quantity_returned: row.qty,
          reason: returnReason,
          serial_numbers: row.serialTracked ? row.picked : undefined,
        })),
      });
      toast.success(await finishReturn(created));
      setReturnQty({});
      setReturnSerials({});
      setSerialPickId(null);
      setReturnNotes("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not finish the return";
      toast.error(
        created
          ? `${created.return_number} was created but not completed: ${message}. Open it in the list below to finish it.`
          : message,
      );
      if (created) {
        setReturnQty({});
        setReturnNotes("");
      }
    } finally {
      setReturnSaving(false);
      setReturnsTick((t) => t + 1);
      onCreated?.(); // the order's returnable quantities changed
    }
  };

  /** Opens the print page of one return. */
  const printReturn = async (returnId: string) => {
    try {
      await printPurchaseReturn(returnId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the return for printing");
    }
  };

  /** Approve & credit, credit, or reject a return from the list. */
  const runReturnAction = async (ret: ApiPurchaseReturn, action: "finish" | "reject") => {
    setReturnBusyId(ret.id);
    try {
      if (action === "reject") {
        await rejectPurchaseReturn(ret.id);
        toast.success(`${ret.return_number} rejected`);
      } else {
        toast.success(await finishReturn(ret));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setReturnBusyId(null);
      setReturnsTick((t) => t + 1);
      onCreated?.();
    }
  };

  useEffect(() => {
    if (!open || !order?.id) return;
    let cancelled = false;
    void fetchPurchaseReceipts({ purchase_order_id: order.id })
      .then((res) => {
        if (!cancelled) setPoReceipts(res.data);
      })
      .catch(() => {
        if (!cancelled) setPoReceipts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, order?.id]);

  useEffect(() => {
    if (!open || !order || (order.status !== "confirmed" && order.status !== "partial_received")) {
      setReceiveByLine({});
      return;
    }
    const next: Record<string, ReceiveLineState> = {};
    for (const l of order.lines) {
      next[l.id] = {
        previouslyReceived: l.quantity_received,
        remaining: remainingOf(l),
        tracking: trackingOf(l),
        qty: "0",
        serials: [],
        batchNumber: "",
        batchExpiry: "",
      };
    }
    setReceiveByLine(next);
    // Intentionally keyed on `order` (not `order?.id`): a parent refetch after posting a
    // receipt hands back a fresh order object with updated remaining/previously-received
    // totals, and this effect re-syncs those — clearing any already-submitted receive-now
    // quantities in the process.
  }, [open, order]);

  useEffect(() => {
    if (!open || !order?.id || !order.supplier_id) return;
    let cancelled = false;
    void fetchSupplierPayments(order.supplier_id, { reference: order.po_number })
      .then((rows) => {
        if (cancelled) return;
        setPaymentHistory(
          rows.map((row) => ({
            id: row.id,
            method: row.payment_method,
            amount: Number(row.amount),
            status: "completed",
            kind: row.direction === "inbound" ? ("refund" as const) : ("payment" as const),
            at: row.created_at,
            note: row.notes ?? undefined,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setPaymentHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, order?.id, order?.supplier_id, order?.po_number]);

  useEffect(() => {
    if (!open) return;
    void loadItems();
  }, [open]);

  useEffect(() => {
    if (!open || !selectedSupplier) {
      setSupplierAddress("");
      setSelectedSupplierDetail(null);
      return;
    }
    const listed = suppliers?.find((s) => s.id === selectedSupplier);
    setSupplierAddress(listed?.country || listed?.name || supplierName || "");
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<ApiSupplierResponse>(
          `/api/v1/commerce/suppliers/${selectedSupplier}`,
        );
        if (cancelled) return;
        const detail = apiSupplierToSupplierDetail(res.data);
        setSupplierAddress(formatSupplierAddress(detail));
        setSelectedSupplierDetail(detail);
      } catch {
        /* keep fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedSupplier, suppliers, supplierName]);

  const lockedSupplier = Boolean(supplierId);
  const supplierChoices = useMemo(() => {
    const merged = [...(suppliers ?? []), ...extraSuppliers];
    const seen = new Set<string>();
    return merged.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  }, [suppliers, extraSuppliers]);
  const selectedSupplierOption = supplierChoices.find((row) => row.id === selectedSupplier);
  const selectedSupplierLabel = selectedSupplierOption?.name || supplierName || "";
  const supplierResults = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return supplierChoices
      .filter(
        (row) =>
          !q ||
          row.name.toLowerCase().includes(q) ||
          (row.country || "").toLowerCase().includes(q) ||
          (qDigits && (row.phone || "").replace(/\D/g, "").includes(qDigits)) ||
          (row.email || "").toLowerCase().includes(q),
      )
      .slice(0, 12)
      .map((row) => ({
        id: row.id,
        primary: [row.name, row.contactPerson].filter(Boolean).join(" · "),
        // the phone, shown whole on the right like the sales order's customer list (email and due stay in the form)
        secondary: row.phone?.trim() || undefined,
      }));
  }, [supplierChoices, supplierQuery]);

  const openSupplierCreate = (name = supplierQuery.trim()) => {
    setSupplierOpen(false);
    setSupplierDraftName(name);
    setViewingSupplier(false);
    setSupplierFormOpen(true);
  };

  const openSupplierView = () => {
    if (!selectedSupplierDetail) return;
    setSupplierOpen(false);
    setViewingSupplier(true);
    setSupplierFormOpen(true);
  };

  const selectSupplier = (id: string) => {
    setSelectedSupplier(id);
    setSupplierOpen(false);
    setSupplierQuery("");
  };

  const clearSupplier = () => {
    setSelectedSupplier("");
    setSupplierQuery("");
    setSupplierOpen(true);
  };

  const selectableWarehouses = warehouseAccess.pickable(warehouses, warehouseId);
  const defaultWarehouseId =
    warehouseAccess.defaultId ?? (selectableWarehouses.find((w) => w.isDefault) ?? selectableWarehouses[0])?.id ?? "";
  const effectiveWarehouseId = warehouseId || defaultWarehouseId;

  const patchLine = (key: string, patch: Partial<LineDraft>, recalc?: "selling" | "margin" | "cost") => {
    setLines((rows) =>
      rows.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (!recalc) return next;
        const calc = lineCalc(next);
        if (recalc === "selling") {
          const margin = num(next.profitMargin);
          next.sellingPrice = calc.costIncTax > 0 ? String(sellingFromMargin(calc.costIncTax, margin)) : next.sellingPrice;
        } else if (recalc === "margin") {
          next.profitMargin =
            calc.costIncTax > 0 ? String(marginFromSelling(calc.costIncTax, num(next.sellingPrice))) : next.profitMargin;
        } else {
          const margin = num(next.profitMargin);
          if (margin) {
            next.sellingPrice = String(sellingFromMargin(calc.costIncTax, margin));
          } else if (num(next.sellingPrice) > 0 && calc.costIncTax > 0) {
            next.profitMargin = String(marginFromSelling(calc.costIncTax, num(next.sellingPrice)));
          }
        }
        return next;
      }),
    );
  };

  const addProducts = (picked: ItemOption[]) => {
    setLines((rows) => {
      const next = rows.map((row) => ({ ...row }));
      for (const product of picked) {
        if (!product.sku) continue;
        const existing = next.find((row) => row.kind === "product" && row.sku === product.sku);
        if (existing) {
          existing.quantity = String(Math.max(1, num(existing.quantity)) + 1);
          continue;
        }
        const emptyIndex = next.findIndex((row) => row.kind === "product" && !row.sku);
        const filled = newLine(undefined, product);
        if (emptyIndex >= 0) {
          filled.key = next[emptyIndex].key;
          next[emptyIndex] = filled;
        } else {
          next.push(filled);
        }
      }
      return next.length ? next : [newLine()];
    });
  };

  const addProductLine = () => {
    setLines((rows) => {
      const filled = rows.filter((row) => row.kind !== "product" || row.sku || row.name);
      return [...filled, newLine()];
    });
  };

  const openProductEdit = (line: LineDraft) => {
    if (!line.sku && !line.name) {
      toast.info("Select a product first");
      return;
    }
    // the catalog product by SKU first: on a saved order a line's productId is the inventory item's, not the catalog's
    const productId = items.find((item) => item.sku === line.sku)?.id || line.productId;
    if (!productId) {
      toast.info("Product details are not available");
      return;
    }
    setQuickAddOpen(false);
    setProductViewId(productId);
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    let discount = 0;
    for (const l of lines) {
      const calc = lineCalc(l);
      if (l.kind !== "product" && l.kind !== "service") continue;
      if (l.kind === "product" && !l.sku) continue;
      if (l.kind === "service" && !l.name.trim()) continue;
      if (calc.qty <= 0) continue;
      const net = calc.qty * calc.beforeTax;
      subtotal += net;
      tax += companyTaxEnabled ? net * (calc.taxRate / 100) : 0;
      discount += calc.discountAmount;
    }
    const taxAmount = companyTaxEnabled ? tax : 0;
    return { subtotal, tax: taxAmount, discount, total: subtotal + taxAmount };
  }, [companyTaxEnabled, lines]);

  // net paid: what went out to the supplier less what came back from it
  const amountPaid = round2(
    paymentHistory
      .filter((entry) => entry.status === "completed")
      .reduce((sum, entry) => sum + (entry.kind === "refund" ? -entry.amount : entry.amount), 0),
  );

  // Settlement of the order, the way the accounts hold it: the order total, less the returns already credited (those are
  // posted to the supplier's ledger as credit notes), is what is really owed; payments come off that. Paid more than that,
  // and the supplier owes the difference back (a return due).
  const returnedCredit = round2(
    (poReturns ?? [])
      .filter((ret) => ret.status === "credited")
      .reduce((sum, ret) => sum + (Number(ret.credit_amount) || 0), 0),
  );
  const returnPendingCredit = round2(
    (poReturns ?? [])
      .filter((ret) => ret.status === "requested" || ret.status === "approved")
      .reduce((sum, ret) => sum + (Number(ret.credit_amount) || 0), 0),
  );
  const netPurchase = Math.max(0, round2(totals.total - returnedCredit));
  const dueBalance = Math.max(0, round2(netPurchase - amountPaid));
  const returnDue = Math.max(0, round2(amountPaid - netPurchase));
  // The supplier's balance before this order: the whole ledger balance (positive = we owe the supplier, negative = they owe
  // us), less what this order's own receipts, return credits and payments account for in it.
  const ledgerForSupplier =
    supplierLedger && supplierLedger.supplierId === selectedSupplier ? supplierLedger.ledger : null;
  const previousBalance = (() => {
    if (!ledgerForSupplier) return null;
    const own = new Set<string>([
      ...poReceipts.map((receipt) => receipt.id),
      ...(poReturns ?? []).map((ret) => ret.id),
      ...paymentHistory.map((payment) => payment.id),
    ]);
    const closing =
      (Number(ledgerForSupplier.summary.outstanding) || 0) - (Number(ledgerForSupplier.summary.advance ?? 0) || 0);
    const ownNet = ledgerForSupplier.entries
      .filter((entry) => own.has(entry.id) || (entry.source_id ? own.has(entry.source_id) : false))
      .reduce((sum, entry) => sum + (Number(entry.debit) || 0) - (Number(entry.credit) || 0), 0);
    return round2(closing - ownNet);
  })();
  // what is owed to the supplier in all once this order is settled as it stands
  const balancePayable = previousBalance === null ? null : round2(previousBalance + dueBalance - returnDue);

  useEffect(() => {
    if (linesTab !== "payment") return;
    // Prefill what is left to settle when opening the Payment tab: the due, or the return due when that is what is open.
    setPayDraftAmount(returnDue > 0 ? returnDue : dueBalance);
    setPayDraftKind(returnDue > 0 ? "refund" : "payment");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on tab switch
  }, [linesTab]);

  // a return due is only there to register while the supplier owes money back
  const refundOpen = returnDue > 0;
  const payKind: "payment" | "refund" = refundOpen ? payDraftKind : "payment";

  const registerPayment = async () => {
    const refund = payKind === "refund";
    if (payDraftAmount <= 0) {
      toast.error(refund ? "Enter the amount received back" : "Enter a payment amount");
      return;
    }
    if (refund && payDraftAmount > returnDue + 0.005) {
      toast.error(`The supplier owes ${formatCurrency(returnDue)} on this order`);
      return;
    }
    if (!selectedSupplier) {
      toast.error("Select a supplier first");
      return;
    }
    const method = payDraftMethod || PAYMENT_METHOD_OPTIONS[0];
    const account = paymentAccounts.find((a) => a.id === payDraftAccountId);
    setPaySaving(true);
    try {
      const payment = await recordSupplierPayment(selectedSupplier, {
        amount: payDraftAmount,
        paymentDate: fromDatetimeLocalValue(payDraftAt).slice(0, 10),
        paymentMethod: method,
        paymentAccountId: account?.id,
        reference: order?.po_number,
        notes: payDraftNote.trim() || undefined,
        direction: refund ? "inbound" : undefined,
      });
      const entry: PaymentEntry = {
        id: payment.id,
        method,
        amount: payDraftAmount,
        status: "completed",
        kind: refund ? "refund" : "payment",
        at: fromDatetimeLocalValue(payDraftAt),
        note: payDraftNote.trim() || undefined,
        accountId: account?.id,
        accountName: account?.name,
      };
      setPaymentHistory((rows) => [entry, ...rows]);
      const remaining = refund
        ? Math.max(0, round2(returnDue - payDraftAmount))
        : Math.max(0, round2(dueBalance - payDraftAmount));
      setPayDraftAmount(remaining);
      setPayDraftNote("");
      setPayDraftAt(toDatetimeLocalValue(new Date().toISOString()));
      toast.success(refund ? "Return due received" : "Payment recorded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : refund ? "Failed to record the refund" : "Failed to record payment");
    } finally {
      setPaySaving(false);
    }
  };

  const deletePaymentEntry = async (entry: PaymentEntry) => {
    if (!selectedSupplier) return;
    setDeletingPaymentId(entry.id);
    try {
      await deleteSupplierPayment(selectedSupplier, entry.id);
      setPaymentHistory((rows) => rows.filter((row) => row.id !== entry.id));
      toast.success("Payment deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete payment");
    } finally {
      setDeletingPaymentId(null);
      setConfirmDeletePaymentId(null);
    }
  };

  const validLines = lines.filter((l) => {
    const calc = lineCalc(l);
    return (
      ((l.kind === "product" && Boolean(l.sku)) || (l.kind === "service" && Boolean(l.name.trim()))) &&
      calc.qty > 0 &&
      calc.beforeDiscount >= 0
    );
  });
  const productLines = validLines.filter((l) => l.kind === "product");

  const isEdit = Boolean(order?.id);
  const readOnly = order?.status === "completed" || order?.status === "cancelled";
  const formTitle = isEdit
    ? `Edit ${order?.po_number ?? "purchase order"}`
    : "Add purchase order";

  // What each line receives: for an existing confirmed order the quantities the user types; for a direct purchase everything
  // ordered, with the serials / batch typed here and the tracking known from the catalog.
  const receiveRows = useMemo<Record<string, ReceiveLineState>>(() => {
    if (!directReceive) return receiveByLine;
    const rows: Record<string, ReceiveLineState> = {};
    for (const line of lines) {
      if (line.kind !== "product" || !line.sku) continue;
      const ordered = num(line.quantity);
      const qty = ordered > 0 ? Math.max(1, Math.round(ordered)) : 0;
      const entry = directEntries[line.key];
      rows[line.key] = {
        previouslyReceived: 0,
        remaining: qty,
        tracking: items.find((item) => item.sku === line.sku)?.tracking ?? "none",
        qty: String(qty),
        serials: entry?.serials ?? [],
        batchNumber: entry?.batchNumber ?? "",
        batchExpiry: entry?.batchExpiry ?? "",
      };
    }
    return rows;
  }, [directReceive, receiveByLine, directEntries, lines, items]);

  // a direct purchase needs every serial product's serials (one per unit) and every batch product's batch number
  const directReceiveIncomplete =
    directReceive &&
    Object.values(receiveRows).some((r) => {
      const qty = Number.parseInt(r.qty, 10) || 0;
      if (qty <= 0) return false;
      if (r.tracking === "serial") return r.serials.filter(Boolean).length !== qty;
      if (r.tracking === "batch") return !r.batchNumber.trim();
      return false;
    });

  // Info tab: for the products on the order - the last three purchases from this supplier, and the stock in each location
  const [supplierHistory, setSupplierHistory] = useState<{
    supplierId: string;
    bySku: Record<string, PoPurchaseHistoryRow[]>;
    failed: boolean;
  } | null>(null);
  const infoLines = useMemo(() => lines.filter((l) => l.kind === "product" && l.sku), [lines]);
  const infoSkuKey = infoLines.map((l) => l.sku).join("|");
  const history =
    supplierHistory && supplierHistory.supplierId === selectedSupplier ? supplierHistory : null;

  // the supplier's earlier orders (not drafts or cancelled, not this one), newest first - the same orders the product's
  // purchase history in Inventory counts
  useEffect(() => {
    if (!open || linesTab !== "info" || !selectedSupplier) return;
    let cancelled = false;
    void fetchPurchaseOrders({ supplier_id: selectedSupplier, per_page: 300 })
      .then((res) => {
        if (cancelled) return;
        const bySku: Record<string, PoPurchaseHistoryRow[]> = {};
        const earlier = res.data
          .filter((o) => o.id !== order?.id && o.status !== "draft" && o.status !== "cancelled")
          .sort(
            (a, b) =>
              (b.order_date ?? "").localeCompare(a.order_date ?? "") ||
              (b.created_at ?? "").localeCompare(a.created_at ?? ""),
          );
        for (const o of earlier) {
          for (const l of o.lines) {
            const list = bySku[l.sku] ?? (bySku[l.sku] = []);
            if (list.length >= 3) continue;
            list.push({
              date: o.order_date ?? "",
              poNumber: o.po_number,
              unitCost: Number(l.unit_cost) || 0,
              quantity: l.quantity_ordered,
            });
          }
        }
        setSupplierHistory({ supplierId: selectedSupplier, bySku, failed: false });
      })
      .catch(() => {
        if (!cancelled) setSupplierHistory({ supplierId: selectedSupplier, bySku: {}, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [open, linesTab, selectedSupplier, order?.id]);

  // the stock rows (one per location) of each product on the order; fresh every time the Info or Returns tab opens
  useEffect(() => {
    if (!open || (linesTab !== "info" && linesTab !== "returns") || !infoSkuKey) return;
    let cancelled = false;
    for (const sku of infoSkuKey.split("|")) {
      void fetchStockLevels({ search: sku, limit: 200 })
        .then((rows) => {
          if (!cancelled) setStockBySku((prev) => ({ ...prev, [sku]: rows.filter((r) => r.sku === sku) }));
        })
        .catch(() => {
          if (!cancelled) setStockBySku((prev) => ({ ...prev, [sku]: "failed" }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open, linesTab, infoSkuKey, returnsTick]);

  // with more than one location, the stock transfers say where the received goods have been moved on to
  useEffect(() => {
    if (!open || linesTab !== "returns" || warehouses.length < 2) return;
    let cancelled = false;
    void fetchStockTransfers()
      .then((res) => {
        if (!cancelled) setTransfers(res.data);
      })
      .catch(() => {
        if (!cancelled) setTransfers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, linesTab, warehouses.length, returnsTick]);

  // the in-stock units of each serial product that can still go back (their locations are told by each unit)
  const returnSerialItemKey = [
    ...new Set(
      (order?.lines ?? [])
        .filter((l) => l.tracking_type === "serial" && purchaseLineReturnable(l) > 0)
        .map((l) => l.item_id),
    ),
  ].join("|");
  useEffect(() => {
    if (!open || linesTab !== "returns" || !returnSerialItemKey) return;
    let cancelled = false;
    for (const itemId of returnSerialItemKey.split("|")) {
      void fetchSerials({ status: "in_stock", item_id: itemId, limit: 500 })
        .then((res) => {
          if (!cancelled) setSerialPool((prev) => ({ ...prev, [itemId]: res.data }));
        })
        .catch(() => {
          if (!cancelled) setSerialPool((prev) => ({ ...prev, [itemId]: "failed" }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open, linesTab, returnSerialItemKey, returnsTick]);

  const patchReceive = (lineId: string, patch: Partial<ReceiveLineState>) => {
    if (directReceive) {
      setDirectEntries((rows) => ({
        ...rows,
        [lineId]: {
          serials: patch.serials ?? rows[lineId]?.serials ?? [],
          batchNumber: patch.batchNumber ?? rows[lineId]?.batchNumber ?? "",
          batchExpiry: patch.batchExpiry ?? rows[lineId]?.batchExpiry ?? "",
        },
      }));
      return;
    }
    setReceiveByLine((rows) =>
      rows[lineId] ? { ...rows, [lineId]: { ...rows[lineId], ...patch } } : rows,
    );
  };

  const receivePayloadLines = Object.entries(receiveByLine)
    .map(([lineId, r]) => ({ lineId, ...r, parsed: Number.parseInt(r.qty, 10) || 0 }))
    .filter((r) => r.parsed > 0);
  const receiveOverReceiving = receivePayloadLines.some(
    (r) => r.parsed > r.remaining && !order?.allow_over_receive,
  );
  const receiveSerialMissing = receivePayloadLines.some(
    (r) => r.tracking === "serial" && r.serials.filter(Boolean).length !== r.parsed,
  );
  const receiveBatchMissing = receivePayloadLines.some(
    (r) => r.tracking === "batch" && !r.batchNumber.trim(),
  );
  const receiveBlocked =
    !canReceiveInline ||
    receivingSaving ||
    receivePayloadLines.length === 0 ||
    receiveOverReceiving ||
    receiveSerialMissing ||
    receiveBatchMissing;

  const submitReceiving = async () => {
    if (!order || receiveBlocked) return;
    setReceivingSaving(true);
    try {
      const created = await createPurchaseReceipt({
        purchase_order_id: order.id,
        receipt_date: todayIso(),
        lines: receivePayloadLines.map((r) => ({
          purchase_order_line_id: r.lineId,
          quantity_received: r.parsed,
          serial_numbers: r.tracking === "serial" ? r.serials.filter(Boolean) : undefined,
          notes:
            r.tracking === "batch" && r.batchNumber.trim()
              ? `BATCH:${r.batchNumber.trim()}${r.batchExpiry ? `|exp=${r.batchExpiry}` : ""}`
              : undefined,
        })),
      });
      await postPurchaseReceipt(created.id);
      toast.success(`${created.receipt_number} posted — stock updated`);
      void fetchPurchaseReceipts({ purchase_order_id: order.id }).then((res) => setPoReceipts(res.data));
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Receiving failed");
    } finally {
      setReceivingSaving(false);
    }
  };

  const buildPrintPayload = useCallback(async (): Promise<PurchasePrintPayload | null> => {
    const printLines: PurchasePrintLine[] = [];
    for (const line of lines) {
      if (line.kind === "section" || line.kind === "note") {
        if (!line.name.trim()) continue;
        printLines.push({
          kind: line.kind,
          name: line.name.trim(),
          quantity: 0,
          unitCost: 0,
          discountLabel: "",
          taxRate: 0,
          amount: 0,
        });
        continue;
      }
      const calc = lineCalc(line);
      if (line.kind === "product" && !line.sku) continue;
      if (line.kind === "service" && !line.name.trim()) continue;
      if (calc.qty <= 0) continue;
      const discountLabel =
        calc.discountAmount <= 0
          ? ""
          : line.discountType === "percent"
            ? `${num(line.discountPercent)}%`
            : calc.discountAmount.toFixed(2);
      // the serial numbers of this line - received already (posted receipts) plus the ones typed on the line now (a direct
      // purchase, or a receive not posted yet): the document shows them in place of the SKU
      const serialNumbers =
        line.kind === "product"
          ? [
              ...new Set([
                ...poReceipts
                  .filter((receipt) => receipt.status === "posted")
                  .flatMap((receipt) => receipt.lines)
                  .filter((receiptLine) => receiptLine.purchase_order_line_id === line.key)
                  .flatMap((receiptLine) => receiptLine.serial_numbers ?? []),
                ...(receiveRows[line.key]?.serials ?? []).filter(Boolean),
              ]),
            ]
          : [];
      printLines.push({
        kind: line.kind,
        name: line.name.trim() || line.sku,
        sku: line.sku || undefined,
        serialNumbers: serialNumbers.length ? serialNumbers : undefined,
        quantity: calc.qty,
        unitCost: calc.beforeDiscount,
        discountLabel,
        taxRate: calc.taxRate,
        amount: calc.lineTotal,
      });
    }
    if (!printLines.some((line) => line.kind === "product" || line.kind === "service")) {
      toast.error("Add at least one product line before previewing");
      return null;
    }
    const warehouse = warehouses.find((w) => w.id === effectiveWarehouseId);
    let company = fallbackPurchasePrintCompany();
    let purchaseLayout = mergePurchaseLayout(null);
    try {
      const row = await fetchWorkspaceCompany();
      company = workspaceCompanyToInvoicePreview(row);
      const invoiceLayout = mergeInvoiceLayout(row.invoice_layout);
      const ownPurchase = mergePurchaseLayout(row.purchase_layout);
      const brand = inheritInvoiceBrandMedia(ownPurchase, invoiceLayout);
      purchaseLayout = {
        ...ownPurchase,
        logo_url: brand.logo_url,
        authorised_signature_url: brand.authorised_signature_url,
        show_logo: brand.show_logo,
        show_authorised_signature: brand.show_authorised_signature,
        show_tax: ownPurchase.show_tax && companyTaxesEnabled(row),
      };
    } catch {
      /* keep letterhead fallback */
    }
    const termLabel =
      PAYMENT_TERM_OPTIONS.find((option) => option.value === paymentTerms)?.label ?? paymentTerms;
    return {
      heading: purchasePrintHeading(order?.status, purchaseLayout.heading),
      documentNumber: order?.po_number || "Draft",
      orderDate: purchaseDate,
      expectedDate,
      buyerName: buyerName.trim(),
      referenceNo: referenceNo.trim(),
      paymentTerms: termLabel,
      warehouseName: warehouse ? `${warehouse.code} — ${warehouse.name}` : order?.warehouse_name || "",
      vendorName: selectedSupplierLabel || "Supplier",
      vendorAddress: supplierAddress,
      vendorPhone: selectedSupplierOption?.phone?.trim() || "",
      vendorEmail: selectedSupplierOption?.email?.trim() || "",
      lines: printLines,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      company,
      layout: purchaseLayout,
    };
  }, [
    buyerName,
    effectiveWarehouseId,
    expectedDate,
    lines,
    order?.po_number,
    order?.status,
    order?.warehouse_name,
    paymentTerms,
    purchaseDate,
    referenceNo,
    selectedSupplierLabel,
    selectedSupplierOption?.email,
    selectedSupplierOption?.phone,
    supplierAddress,
    totals.discount,
    totals.subtotal,
    totals.tax,
    totals.total,
    poReceipts,
    receiveRows,
    warehouses,
  ]);

  const openPrintPage = useCallback((payload: PurchasePrintPayload): boolean => {
    const printKey = storePurchasePrintPayload(payload);
    const opened = window.open(purchasePrintPath(printKey), "_blank", "noopener,noreferrer");
    return Boolean(opened);
  }, []);

  const handlePreview = () => {
    void buildPrintPayload().then((payload) => {
      if (!payload) return;
      setPreviewPayload(payload);
      setDrawerPanel("preview");
    });
  };

  const handlePrint = () => {
    void buildPrintPayload().then((payload) => {
      if (!payload) return;
      if (!openPrintPage(payload)) {
        setPreviewPayload(payload);
        setDrawerPanel("preview");
        toast.info("Pop-up blocked. Use Print in the preview panel.");
      }
    });
  };

  const blocked =
    readOnly ||
    !selectedSupplier ||
    !effectiveWarehouseId ||
    !purchaseDate ||
    !purchaseStatus ||
    productLines.length === 0;

  /** A direct purchase: receive everything on the just-confirmed order, with the serials / batch typed on the lines. Returns the
   * message to show: stock updated, or - when the catalog and the order disagree about what is tracked - what to do next. A
   * failure here does not undo the order (it exists and is confirmed), so it is reported and the drawer goes on editing it. */
  const receiveDirectly = async (confirmed: ApiPurchaseOrder): Promise<string> => {
    try {
      const used = new Set<string>();
      const receiptLines: {
        purchase_order_line_id: string;
        quantity_received: number;
        serial_numbers?: string[];
        notes?: string;
      }[] = [];
      for (const l of confirmed.lines) {
        const tracking = trackingOf(l);
        const draftLine = productLines.find((d) => d.sku === l.sku && !used.has(d.key));
        if (draftLine) used.add(draftLine.key);
        const r = draftLine ? receiveRows[draftLine.key] : undefined;
        const serials = (r?.serials ?? []).filter(Boolean);
        const batch = r?.batchNumber.trim() ?? "";
        if ((tracking === "serial" && serials.length !== l.quantity_ordered) || (tracking === "batch" && !batch)) {
          return `${confirmed.po_number} ordered — use Receive for serial/batch items`;
        }
        receiptLines.push({
          purchase_order_line_id: l.id,
          quantity_received: l.quantity_ordered,
          serial_numbers: tracking === "serial" ? serials : undefined,
          notes:
            tracking === "batch" && batch
              ? `BATCH:${batch}${r?.batchExpiry ? `|exp=${r.batchExpiry}` : ""}`
              : undefined,
        });
      }
      const receipt = await createPurchaseReceipt({
        purchase_order_id: confirmed.id,
        receipt_date: purchaseDate || undefined,
        lines: receiptLines,
      });
      await postPurchaseReceipt(receipt.id);
      return `${confirmed.po_number} received — stock updated`;
    } catch (err) {
      toast.error(
        `${confirmed.po_number} was ordered, but receiving failed: ${err instanceof Error ? err.message : "unknown error"}. Use Receive to try again.`,
      );
      return "";
    }
  };

  const submit = async (asDraft = false) => {
    if (blocked) return;
    if (!asDraft && directReceive && directReceiveIncomplete) {
      toast.error("Add the serial numbers / batch of the tracked products first");
      return;
    }
    setSaving(true);
    try {
      const extraLineNotes = lines
        .filter(
          (row) =>
            ((row.kind === "section" || row.kind === "note") && row.name.trim()) ||
            (row.kind === "service" && row.name.trim()),
        )
        .map((row) => {
          if (row.kind === "section") return `[${row.name.trim()}]`;
          if (row.kind === "service") {
            const calc = lineCalc(row);
            return `Service: ${row.name.trim()} × ${calc.qty} = ${formatCurrency(calc.lineTotal)}`;
          }
          return row.name.trim();
        });
      const termLabel =
        PAYMENT_TERM_OPTIONS.find((option) => option.value === paymentTerms)?.label ?? paymentTerms;
      const noteParts = [
        referenceNo.trim() ? `Ref: ${referenceNo.trim()}` : "",
        ...extraLineNotes,
        termLabel ? `Payment terms: ${termLabel}` : "",
      ].filter(Boolean);

      const payload = {
        supplier_id: selectedSupplier,
        warehouse_id: effectiveWarehouseId,
        order_date: purchaseDate || undefined,
        expected_date: expectedDate || undefined,
        buyer_name: buyerName.trim() || undefined,
        notes: noteParts.join("\n") || undefined,
        allow_over_receive: readPurchaseSettings().allowOverReceive,
        lines: productLines.map((l) => {
          const calc = lineCalc(l);
          return {
            sku: l.sku,
            quantity_ordered: Math.max(1, Math.round(calc.qty)),
            unit_cost: calc.beforeDiscount,
            tax_rate: calc.taxRate,
            discount_amount: calc.discountAmount,
          };
        }),
      };

      const shouldConfirm = !asDraft && purchaseStatus !== "draft";

      if (isEdit && order) {
        const saved = await updatePurchaseOrder(order.id, payload);
        if (order.status === "draft" && shouldConfirm) {
          const confirmed = await confirmPurchaseOrder(saved.id);
          if (purchaseStatus === "received") {
            const message = await receiveDirectly(confirmed);
            if (message) toast.success(message);
          } else {
            toast.success(`${saved.po_number} confirmed`);
          }
        } else {
          toast.success(`${saved.po_number} updated`);
        }
        clearDraft();
        onOpenChange(false);
        onCreated?.();
        return;
      }

      const created = await createPurchaseOrder(payload);
      clearDraft(); // the new order exists now; its form is no longer an unsaved draft

      if (!shouldConfirm) {
        toast.success(`${created.po_number} saved as draft`);
        // First-time creation stays open — the drawer now edits this new PO
        // in place instead of closing.
        onCreated?.(created);
        return;
      }

      const confirmed = await confirmPurchaseOrder(created.id);

      if (purchaseStatus === "received") {
        const message = await receiveDirectly(confirmed);
        if (message) toast.success(message);
      } else if (purchaseStatus === "pending") {
        toast.success(`${confirmed.po_number} saved as pending receive`);
      } else {
        toast.success(`${confirmed.po_number} ordered`);
      }

      // First-time creation stays open — the drawer now edits this new,
      // now-confirmed PO in place, so the Receive button becomes enabled.
      onCreated?.(confirmed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save purchase order");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    if (!window.confirm(`Cancel ${order.po_number}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const cancelled = await cancelPurchaseOrder(order.id);
      toast.success(`${cancelled.po_number} cancelled`);
      clearDraft();
      onCreated?.(cancelled);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel purchase order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        ref={(el) => setPortalHost(el)}
        side="right"
        className={cn(AGAIN_DRAWER_CONTENT_CLASS, "sm:!max-w-none sm:!min-w-0")}
        style={{ width: `min(100vw, ${Math.round(drawerWidth)}px)`, maxWidth: "100vw" }}
        title={formTitle}
        onPointerDownOutside={(event) => {
          if (nestedOpen) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (nestedOpen) event.preventDefault();
        }}
        onFocusOutside={(event) => {
          if (nestedOpen) event.preventDefault();
        }}
      >
        <DrawerResizeHandle {...drawerResizeHandle} />
        <div className="relative flex h-full min-h-0 flex-col bg-background">
        <AgainDrawerControlBar
          className="px-4 sm:px-6"
          trailing={
            <>
              <PoStatusSteps status={order?.status ?? null} choice={purchaseStatus} />
              <AgainDrawerCloseButton onClick={() => handleOpenChange(false)} />
            </>
          }
        >
          {!readOnly ? (
            <AgainDrawerButton
              variant="primary"
              disabled={blocked || saving || directReceiveIncomplete}
              aria-busy={saving}
              title={
                directReceiveIncomplete
                  ? "Add the serial numbers / batch of the tracked products first (Order Lines › Serial / Batch)"
                  : undefined
              }
              onClick={() => void submit()}
            >
              {saving ? "Saving…" : "Save"}
            </AgainDrawerButton>
          ) : null}
          {canReceiveInline ? (
            <AgainDrawerButton
              variant="success"
              title="Enter Received quantities in Order Lines, then Receive"
              disabled={receiveBlocked}
              onClick={() => {
                setLinesTab("lines");
                void submitReceiving();
              }}
            >
              {receivingSaving ? "Receiving…" : "Receive"}
            </AgainDrawerButton>
          ) : null}
          <AgainDrawerButton onClick={handlePrint}>Print</AgainDrawerButton>
          {!readOnly && (!isEdit || order?.status === "draft") ? (
            <AgainDrawerButton disabled={blocked || saving} onClick={() => void submit(true)}>
              Draft
            </AgainDrawerButton>
          ) : null}
          {isEdit && order && order.status !== "completed" && order.status !== "cancelled" ? (
            <AgainDrawerButton disabled={saving} onClick={() => void handleCancelOrder()}>
              Cancel
            </AgainDrawerButton>
          ) : null}
          <AgainDrawerButton
            disabled={saving}
            onClick={() => {
              if (!readOnly) clearDraft();
              onOpenChange(false);
            }}
          >
            {readOnly ? "Close" : "Discard"}
          </AgainDrawerButton>
          <AgainDrawerButton onClick={handlePreview}>Preview</AgainDrawerButton>
          {isEdit && order && purchaseOrderIsReturnable(order) ? (
            <AgainDrawerButton
              onClick={() => {
                setDrawerPanel("order");
                setPreviewPayload(null);
                setLinesTab("returns");
              }}
            >
              Return
            </AgainDrawerButton>
          ) : null}
        </AgainDrawerControlBar>

        {drawerPanel === "preview" && previewPayload ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#ececec] dark:bg-muted/20">
            <div className="print-hide flex shrink-0 items-center justify-between border-b border-border/80 bg-background px-4 py-2">
              <button
                type="button"
                onClick={() => {
                  setDrawerPanel("order");
                  setPreviewPayload(null);
                }}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#00a09d] hover:underline"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to {order?.po_number ?? "purchase order"}
              </button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-none"
                onClick={() => {
                  if (!openPrintPage(previewPayload)) {
                    toast.info("Allow pop-ups to open the print page.");
                  }
                }}
              >
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
            </div>
            <AgainDrawerScrollBody className="px-4 py-4 sm:px-6 sm:py-6">
              <div id="purchase-print-area" className="mx-auto max-w-[820px]">
                <PurchaseOrderPrintDocument data={previewPayload} />
              </div>
            </AgainDrawerScrollBody>
          </div>
        ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AgainDrawerScrollBody scrollRef={bodyScrollRef} className="bg-white px-4 py-4 pt-0 dark:bg-muted/20 sm:px-6">
          <div className="-mx-4 sm:-mx-6">
            <div className="@container border-b border-border bg-background px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className={cn(AGAIN_FORM_TITLE_CLASS, "min-w-0 flex-1 truncate")}>
                  {isEdit ? (order?.po_number ?? formTitle) : "New"}
                </h2>
              </div>
              <div className="mt-4 grid gap-x-10 gap-y-4 @xl:grid-cols-2">
                {/* left: the supplier, with its contact details under the name (Odoo purchase order form) */}
                <div className="grid grid-cols-[6.75rem_minmax(0,1fr)] items-start gap-x-2">
                  <span className="pt-0.5 text-[13px] font-semibold text-muted-foreground">Supplier</span>
                  <div className="relative min-w-0" ref={supplierAnchorRef}>
                    {/* Odoo form: the supplier is a teal link; the change / clear buttons show on hover */}
                    {readOnly || lockedSupplier ? (
                      selectedSupplierLabel ? (
                        <button
                          type="button"
                          onClick={selectedSupplierDetail ? openSupplierView : undefined}
                          className={cn(
                            "block max-w-full truncate py-1 text-left text-[13px] font-medium text-[#00a09d]",
                            selectedSupplierDetail && "hover:underline",
                          )}
                        >
                          {selectedSupplierLabel}
                        </button>
                      ) : (
                        <p className="py-1 text-[13px] text-muted-foreground">No supplier</p>
                      )
                    ) : selectedSupplier && !supplierOpen ? (
                      <div className="group/cust flex min-w-0 items-center gap-1 border-b border-transparent hover:border-border/60">
                        <button
                          type="button"
                          onClick={openSupplierView}
                          className="min-w-0 truncate py-1 text-left text-[13px] font-medium text-[#00a09d] hover:underline"
                          title="Open supplier"
                        >
                          {selectedSupplierLabel}
                        </button>
                        <span className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/cust:opacity-100">
                          <button
                            type="button"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="Search suppliers"
                            title="Choose another supplier"
                            aria-expanded={supplierOpen}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setSupplierOpen(true);
                              setSupplierQuery(selectedSupplierLabel);
                            }}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={clearSupplier}
                            title="Remove supplier"
                            aria-label="Change supplier"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "flex min-w-0 items-center gap-1 border-b focus-within:border-[#00a09d]",
                          supplierOpen ? "border-[#00a09d]" : "border-border/60",
                        )}
                      >
                        <input
                          value={supplierOpen ? supplierQuery : selectedSupplierLabel || supplierQuery}
                          onChange={(event) => {
                            setSupplierQuery(event.target.value);
                            setSupplierOpen(true);
                            if (!event.target.value) clearSupplier();
                          }}
                          onFocus={() => {
                            setSupplierOpen(true);
                            if (selectedSupplier && !supplierQuery) {
                              setSupplierQuery(selectedSupplierLabel);
                            }
                          }}
                          placeholder="Type to find a supplier..."
                          className="h-8 min-w-0 flex-1 bg-transparent text-[13px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
                          autoFocus={supplierOpen}
                        />
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Search suppliers"
                          aria-expanded={supplierOpen}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            if (supplierOpen) setSupplierOpen(false);
                            else {
                              setSupplierOpen(true);
                              if (selectedSupplier) setSupplierQuery(selectedSupplierLabel);
                            }
                          }}
                        >
                          <span aria-hidden className="h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-[#00a09d]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openSupplierCreate()}
                          title="Add supplier"
                          aria-label="Add supplier"
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-[#00a09d] hover:bg-[#00a09d]/10"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <SearchDropdown
                      open={!readOnly && !lockedSupplier && supplierOpen}
                      placement="bottom" // always straight under the field, never flipped above it
                      getAnchor={() => supplierAnchorRef.current}
                      portalContainer={portalHost}
                      items={supplierResults}
                      onSelect={selectSupplier}
                      onSearchMore={
                        supplierQuery.trim()
                          ? () => openSupplierCreate(supplierQuery.trim())
                          : undefined
                      }
                      searchMoreLabel={
                        supplierQuery.trim()
                          ? `Create "${supplierQuery.trim()}"`
                          : "Search more..."
                      }
                      renderItem={(item) => (
                        <div className="flex w-full min-w-0 items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-foreground">{item.primary}</span>
                          {item.secondary ? (
                            <span className="shrink-0 whitespace-nowrap text-right tabular-nums text-muted-foreground">
                              {item.secondary}
                            </span>
                          ) : null}
                        </div>
                      )}
                    />
                    {selectedSupplier && selectedSupplierOption ? (
                      <div className="mt-1.5 space-y-0.5 text-[13px] leading-snug text-foreground">
                        {selectedSupplierOption.contactPerson ? (
                          <p className="truncate">{selectedSupplierOption.contactPerson}</p>
                        ) : null}
                        {selectedSupplierOption.phone ? <p>{selectedSupplierOption.phone}</p> : null}
                        {selectedSupplierOption.email ? (
                          <p className="truncate">{selectedSupplierOption.email}</p>
                        ) : null}
                        {supplierAddress && supplierAddress !== selectedSupplierLabel ? (
                          <p>{supplierAddress}</p>
                        ) : null}
                        {selectedSupplierOption.balanceDue && selectedSupplierOption.balanceDue > 0 ? (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400">
                            Due: {formatCurrency(selectedSupplierOption.balanceDue)}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                {/* right: purchase date, expected date, payment terms, location, status */}
                <div className="again-odoo-form min-w-0">
                  <AgainFormField label="Purchase Date" className={PO_HEADER_ROW_CLASS}>
                    <input
                      type="date"
                      value={purchaseDate}
                      disabled={readOnly}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      className="h-8 w-full bg-transparent px-1 text-[13px] outline-none disabled:opacity-60"
                    />
                  </AgainFormField>
                  <AgainFormField label="Business Location" className={PO_HEADER_ROW_CLASS}>
                    <FilterSelect
                      value={effectiveWarehouseId}
                      onChange={setWarehouseId}
                      width="w-full"
                      ariaLabel="Business location"
                      options={[
                        { value: "", label: "Please Select" },
                        ...selectableWarehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
                      ]}
                    />
                  </AgainFormField>
                  <AgainFormField label="Purchase Status" className={PO_HEADER_ROW_CLASS}>
                    {isEdit && order && order.status !== "draft" ? (
                      <div className="flex min-h-[28px] items-center">
                        <Badge
                          variant="outline"
                          className={cn("rounded-none", PO_STATUS_TONE[order.status])}
                        >
                          {PO_STATUS_LABEL[order.status] ?? order.status}
                        </Badge>
                      </div>
                    ) : (
                      <select
                        value={purchaseStatus}
                        disabled={readOnly}
                        onChange={(e) => setPurchaseStatus(e.target.value as PurchaseStatusChoice)}
                        aria-label="Purchase status"
                        className="h-8 w-full bg-transparent px-1 text-[13px] outline-none disabled:opacity-60"
                      >
                        <option value="">Please Select</option>
                        <option value="draft">Draft — not sent to supplier yet</option>
                        <option value="received">Received — stock is added on save</option>
                        <option value="pending">Pending</option>
                        <option value="ordered">Ordered</option>
                      </select>
                    )}
                  </AgainFormField>
                </div>
              </div>
            </div>
          </div>

          {/* Notebook tabs — same purple top-border style as the sales order drawer */}
          <div className="-mx-4 sm:-mx-6">
            <AgainFormNotebook
              tabs={[
                { id: "lines" as const, label: "Order Lines" },
                { id: "payment" as const, label: "Payment" },
                { id: "others" as const, label: "Others" },
                { id: "info" as const, label: "Info" },
                ...(isEdit ? [{ id: "receiving" as const, label: "Receiving" }] : []),
                ...(isEdit ? [{ id: "returns" as const, label: "Returns" }] : []),
              ]}
              active={linesTab}
              onChange={setLinesTab}
              className="border-t-0"
              tabsClassName="pl-1.5 sm:pl-3.5"
              contentClassName="bg-transparent px-4 py-4 dark:bg-transparent sm:px-6"
            >
              {linesTab === "lines" ? (
                <div className="mt-0">
                  <div className="mb-3 min-w-0">
                    <ProductSearchAdd
                      items={items}
                      portalHost={portalHost}
                      onPick={(item) => addProducts([item])}
                      onAddNew={() => {
                        setViewProductId(null);
                        setQuickAddOpen(true);
                      }}
                    />
                  </div>
                  <div className="relative">
                <div className="overflow-x-auto">
                <table
                  className="w-full border-collapse text-[13px]"
                  style={{
                    tableLayout: "fixed",
                    minWidth:
                      lineColOrder.reduce(
                        (sum, col) => sum + (col === "product" ? PO_MIN_WIDTHS.product : lineColWidths[col]),
                        0,
                      ) + PO_LINE_ACTION_COL_WIDTH,
                  }}
                >
                  <colgroup>
                    {lineColOrder.map((col) =>
                      col === "product" ? <col key={col} /> : <col key={col} style={{ width: lineColWidths[col] }} />,
                    )}
                    <col style={{ width: PO_LINE_ACTION_COL_WIDTH }} />
                  </colgroup>
                  <thead>
                    <tr className={cn(LINE_HEAD_H, "border-b border-border/80 text-left text-[11px] text-muted-foreground")}>
                      {lineColOrder.map((col) => (
                        <PoLineHeaderCell
                          key={col}
                          col={col}
                          width={lineColWidths[col]}
                          dragCol={dragCol}
                          onDragColChange={setDragCol}
                          onMoveColumn={moveColumn}
                          onResizeStart={startResize}
                        />
                      ))}
                      <th aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      if (line.kind === "section" || line.kind === "note") {
                        const isSection = line.kind === "section";
                        return (
                          <tr
                            key={line.key}
                            className={cn(LINE_ROW_H, "border-b border-border/80")}
                            onMouseEnter={() => setHoveredLineKey(line.key)}
                            onMouseLeave={(event) => {
                              const next = event.relatedTarget;
                              if (
                                next instanceof HTMLElement &&
                                next.getAttribute("aria-label") === "Delete line"
                              ) {
                                return;
                              }
                              setHoveredLineKey((current) => (current === line.key ? null : current));
                            }}
                          >
                            <td colSpan={lineColOrder.length + 1} className="py-1.5 pr-8">
                              <input
                                value={line.name}
                                onChange={(event) =>
                                  setLines((rows) =>
                                    rows.map((row) =>
                                      row.key === line.key ? { ...row, name: event.target.value } : row,
                                    ),
                                  )
                                }
                                placeholder={
                                  isSection ? "Section name (e.g. Accessories)" : "Add a note..."
                                }
                                className={cn(
                                  "h-8 w-full border-b border-border/50 bg-transparent outline-none focus:border-[#00a09d]",
                                  isSection
                                    ? "font-semibold uppercase tracking-wide text-foreground"
                                    : "italic text-muted-foreground",
                                )}
                                autoFocus={!line.name}
                              />
                            </td>
                          </tr>
                        );
                      }

                      const calc = lineCalc(line);
                      const r = line.kind === "product" ? receiveRows[line.key] : undefined;
                      const receiveParsedQty = r ? Number.parseInt(r.qty, 10) || 0 : 0;
                      const receiveSerialsReady = r ? r.serials.filter(Boolean).length : 0;
                      return (
                        <tr
                          key={line.key}
                          className={cn(LINE_ROW_H, "border-b border-border/80")}
                          onMouseEnter={() => setHoveredLineKey(line.key)}
                          onMouseLeave={(event) => {
                            const next = event.relatedTarget;
                            if (
                              next instanceof HTMLElement &&
                              next.getAttribute("aria-label") === "Delete line"
                            ) {
                              return;
                            }
                            setHoveredLineKey((current) => (current === line.key ? null : current));
                          }}
                        >
                          {lineColOrder.map((col) => (
                            <td
                              key={col}
                              className={cn(
                                "overflow-hidden py-1.5 pr-2.5",
                                col === "product" && "align-top",
                                col !== "product" && col !== "serialBatch" && "text-right",
                              )}
                              style={poColStyle(col, lineColWidths[col])}
                            >
                              {col === "product" ? (
                                <ProductCell
                                  line={line}
                                  onView={() => openProductEdit(line)}
                                  onNameChange={(name) => patchLine(line.key, { name })}
                                />
                              ) : null}
                              {col === "quantity" ? (
                                <LineNumericInput
                                  value={num(line.quantity) || 1}
                                  min={1}
                                  steppers
                                  onChange={(value) =>
                                    patchLine(line.key, { quantity: String(value) }, "cost")
                                  }
                                  className={CELL_INPUT}
                                />
                              ) : null}
                              {col === "unitCost" ? (
                                <LineNumericInput
                                  value={num(line.unitCostBeforeDiscount)}
                                  min={0}
                                  onChange={(value) =>
                                    patchLine(
                                      line.key,
                                      { unitCostBeforeDiscount: String(value) },
                                      "cost",
                                    )
                                  }
                                  className={CELL_INPUT}
                                />
                              ) : null}
                              {col === "discount" ? (
                                <div className="flex h-8 min-w-0 items-center border-b border-border/50 focus-within:border-[#00a09d]">
                                  <LineNumericInput
                                    value={num(line.discountPercent)}
                                    min={0}
                                    onChange={(value) =>
                                      patchLine(
                                        line.key,
                                        {
                                          discountPercent: String(
                                            line.discountType === "percent"
                                              ? Math.min(100, value)
                                              : Math.max(0, value),
                                          ),
                                        },
                                        "cost",
                                      )
                                    }
                                    className="h-8 min-w-0 flex-1 border-0 bg-transparent text-right text-[13px] outline-none"
                                  />
                                  <DiscTypeToggle
                                    value={line.discountType}
                                    onChange={(next) =>
                                      patchLine(line.key, { discountType: next }, "cost")
                                    }
                                  />
                                </div>
                              ) : null}
                              {col === "amount" ? (
                                <span className="block min-w-0 overflow-hidden truncate tabular-nums font-medium">
                                  {formatCurrency(calc.lineTotal)}
                                </span>
                              ) : null}
                              {col === "received" ? (
                                r ? (
                                  directReceive ? (
                                    // a direct purchase receives everything that is ordered
                                    <span className="block tabular-nums">{r.qty}</span>
                                  ) : (
                                  <input
                                    type="number"
                                    min={0}
                                    max={order?.allow_over_receive ? undefined : r.remaining}
                                    value={r.qty}
                                    disabled={r.remaining <= 0}
                                    onChange={(e) => patchReceive(line.key, { qty: e.target.value })}
                                    className={CELL_INPUT}
                                  />
                                  )
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )
                              ) : null}
                              {col === "serialBatch" ? (
                                r ? (
                                  r.tracking === "serial" ? (
                                    <button
                                      type="button"
                                      className={cn(
                                        "text-[11px] hover:underline disabled:text-muted-foreground",
                                        // a direct purchase cannot be saved until every unit has its serial
                                        directReceive && receiveSerialsReady < receiveParsedQty
                                          ? "text-amber-600 dark:text-amber-400"
                                          : "text-[#00a09d]",
                                      )}
                                      disabled={receiveParsedQty <= 0}
                                      onClick={() => setSerialTarget({ key: line.key, name: line.name })}
                                    >
                                      Manage serials {receiveParsedQty > 0 ? `(${receiveSerialsReady}/${receiveParsedQty})` : ""}
                                    </button>
                                  ) : r.tracking === "batch" ? (
                                    <div className="flex min-w-[160px] flex-col gap-1">
                                      <Input
                                        value={r.batchNumber}
                                        placeholder="Batch / LOT"
                                        onChange={(e) => patchReceive(line.key, { batchNumber: e.target.value })}
                                        className="h-7 rounded-none"
                                      />
                                      <Input
                                        type="date"
                                        value={r.batchExpiry}
                                        onChange={(e) => patchReceive(line.key, { batchExpiry: e.target.value })}
                                        className="h-7 rounded-none"
                                      />
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground">None</span>
                                  )
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )
                              ) : null}
                            </td>
                          ))}
                          <td aria-hidden />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                <div className="pointer-events-none absolute right-0 top-0 z-20 flex w-7 flex-col">
                  <div className={cn(LINE_HEAD_H, "shrink-0")} />
                  {lines.map((line) => (
                    <div
                      key={line.key}
                      className={cn(LINE_ROW_H, "flex shrink-0 items-center justify-end")}
                    >
                      <LineDeleteBtn
                        visible={hoveredLineKey === line.key}
                        onHoverStart={() => setHoveredLineKey(line.key)}
                        onHoverEnd={() =>
                          setHoveredLineKey((current) => (current === line.key ? null : current))
                        }
                        onRemove={() =>
                          setLines((rows) => {
                            const next = rows.filter((row) => row.key !== line.key);
                            if (line.kind === "section" || line.kind === "note") return next;
                            return next.length ? next : [newLine()];
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
                  </div>
                  {/* room under the last line: the totals card floats over the bottom right, the list scrolls clear of it */}
                  <div className="h-36" aria-hidden />
                </div>
              ) : linesTab === "payment" ? (
                <div className="space-y-6">
                  {/* Odoo form: titled group, label left / underline control right (docs/common/formcommon.md) */}
                  <div className="again-odoo-form @container">
                    <AgainFormGroupTitle>{payKind === "refund" ? "Register return due" : "Register payment"}</AgainFormGroupTitle>
                    {refundOpen ? (
                      // the supplier owes money back (paid more than the net purchase): money in, not out
                      <AgainFormField label="Entry type">
                        <div className="flex min-h-[28px] items-center">
                          <span className="inline-flex h-5 shrink-0 border border-border" role="group" aria-label="Entry type">
                            {(["payment", "refund"] as const).map((kind, index) => (
                              <button
                                key={kind}
                                type="button"
                                aria-pressed={payKind === kind}
                                className={cn(
                                  "inline-flex h-full items-center justify-center px-2 text-[10px] font-medium",
                                  index > 0 && "border-l border-border",
                                  payKind === kind
                                    ? kind === "refund"
                                      ? "bg-amber-600 text-white"
                                      : "bg-[#00a09d] text-white"
                                    : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                                )}
                                onClick={() => {
                                  setPayDraftKind(kind);
                                  setPayDraftAmount(kind === "refund" ? returnDue : dueBalance);
                                }}
                              >
                                {kind === "refund" ? "Return due" : "Payment"}
                              </button>
                            ))}
                          </span>
                        </div>
                      </AgainFormField>
                    ) : null}
                    {payKind === "refund" ? (
                      <p className="mb-1 text-[12px] text-amber-700 dark:text-amber-400">
                        The supplier owes {formatCurrency(returnDue)} on this order. Recording it books the money into the
                        account below and clears the supplier&apos;s credit.
                      </p>
                    ) : null}
                    <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                      <AgainFormField label="Method">
                        <select
                          value={payDraftMethod}
                          onChange={(event) => setPayDraftMethod(event.target.value)}
                          className="h-8 w-full bg-transparent px-1 text-[13px] outline-none"
                        >
                          {PAYMENT_METHOD_OPTIONS.map((method) => (
                            <option key={method} value={method}>
                              {method}
                            </option>
                          ))}
                        </select>
                      </AgainFormField>
                      <AgainFormField label="Date">
                        <input
                          type="datetime-local"
                          value={payDraftAt}
                          onChange={(event) => setPayDraftAt(event.target.value)}
                          className="h-8 w-full min-w-0 bg-transparent px-1 text-[13px] outline-none"
                          aria-label="Payment date and time"
                        />
                      </AgainFormField>
                      <AgainFormField label="Amount">
                        <LineNumericInput
                          value={payDraftAmount}
                          onChange={setPayDraftAmount}
                          className="h-8 w-full bg-transparent px-1 text-[13px] tabular-nums outline-none"
                        />
                      </AgainFormField>
                      {paymentAccounts.length > 0 ? (
                        <AgainFormField label="Account">
                          <select
                            value={payDraftAccountId}
                            onChange={(event) => setPayDraftAccountId(event.target.value)}
                            className="h-8 w-full bg-transparent px-1 text-[13px] outline-none"
                            aria-label="Payment account"
                          >
                            {paymentAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </AgainFormField>
                      ) : null}
                      <AgainFormField label="Note" className="@xl:col-span-2">
                        <input
                          value={payDraftNote}
                          onChange={(event) => setPayDraftNote(event.target.value)}
                          placeholder="Note / transaction ID (optional)"
                          className="h-8 w-full bg-transparent px-1 text-[13px] outline-none"
                        />
                      </AgainFormField>
                    </div>
                    <div className="flex justify-end pt-2">
                      <AgainDrawerButton
                        variant="primary"
                        disabled={paySaving}
                        style={payKind === "refund" ? { backgroundColor: "#b45309" } : undefined}
                        onClick={() => void registerPayment()}
                      >
                        {paySaving ? "Adding…" : payKind === "refund" ? "Receive return due" : "Add payment"}
                      </AgainDrawerButton>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <SectionTitle>Payment history</SectionTitle>
                      {paymentHistory.length > 0 ? (
                        <p className="text-[12px] tabular-nums text-muted-foreground">
                          Paid {formatCurrency(amountPaid)}
                        </p>
                      ) : null}
                    </div>
                    {paymentHistory.length > 0 ? (
                      <ul className="divide-y divide-border/60 border border-border">
                        {paymentHistory.map((entry) => (
                          <li key={entry.id} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
                            {entry.kind === "refund" ? (
                              <span className="shrink-0 border border-amber-700/40 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-400/40 dark:text-amber-400">
                                Return due
                              </span>
                            ) : null}
                            <p className="min-w-0 shrink-0 font-medium text-foreground">{entry.method}</p>
                            {entry.accountName ? (
                              <p className="shrink-0 text-[11px] text-muted-foreground">
                                → {entry.accountName}
                              </p>
                            ) : null}
                            {entry.note ? (
                              <p className="min-w-0 truncate text-[12px] text-muted-foreground">
                                {entry.note}
                              </p>
                            ) : null}
                            <p className="h-6 w-[168px] shrink-0 truncate px-1 text-[11px] leading-6 text-muted-foreground">
                              {formatDateTime(entry.at)}
                            </p>
                            <p className="shrink-0 capitalize text-[12px] text-muted-foreground">
                              {entry.status}
                            </p>
                            <p
                              className={cn(
                                "ml-auto shrink-0 tabular-nums font-medium",
                                entry.kind === "refund" && "text-amber-700 dark:text-amber-400",
                              )}
                            >
                              {entry.kind === "refund" ? "-" : ""}
                              {formatCurrency(entry.amount)}
                            </p>
                            {entry.kind === "refund" ? (
                              <span
                                className="inline-flex shrink-0 text-muted-foreground/70"
                                title="Posted to the books - it cannot be deleted"
                                aria-label="Posted to the books - it cannot be deleted"
                              >
                                <Lock className="h-3.5 w-3.5" />
                              </span>
                            ) : confirmDeletePaymentId === entry.id ? (
                              <div className="flex shrink-0 items-center gap-1">
                                <span className="text-[11px] text-muted-foreground">Delete?</span>
                                <button
                                  type="button"
                                  className="rounded-none border border-destructive/50 bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
                                  disabled={deletingPaymentId === entry.id}
                                  onClick={() => void deletePaymentEntry(entry)}
                                >
                                  {deletingPaymentId === entry.id ? "…" : "Yes"}
                                </button>
                                <button
                                  type="button"
                                  className="rounded-none border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                                  onClick={() => setConfirmDeletePaymentId(null)}
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="shrink-0 text-muted-foreground hover:text-destructive"
                                aria-label="Delete payment"
                                title="Delete payment"
                                onClick={() => setConfirmDeletePaymentId(entry.id)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
                        No payments recorded yet.
                      </p>
                    )}
                  </div>
                </div>
              ) : linesTab === "receiving" && order ? (
                <div className="space-y-3">
                  {(() => {
                    const summary = poReceiveSummary(order);
                    const canReceive =
                      order.status === "confirmed" || order.status === "partial_received";
                    return (
                      <>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="border border-border px-2 py-1.5">
                            <p className="text-[10px] uppercase text-muted-foreground">Ordered</p>
                            <p className="mt-0.5 tabular-nums font-medium">{summary.ordered}</p>
                          </div>
                          <div className="border border-border px-2 py-1.5">
                            <p className="text-[10px] uppercase text-muted-foreground">Received</p>
                            <p className="mt-0.5 tabular-nums font-medium">{summary.received}</p>
                          </div>
                          <div className="border border-border px-2 py-1.5">
                            <p className="text-[10px] uppercase text-muted-foreground">Remaining</p>
                            <p className="mt-0.5 tabular-nums font-medium">{summary.remaining}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {canReceive ? (
                            <AgainDrawerButton onClick={() => setLinesTab("lines")}>
                              Go to Order Lines to receive
                            </AgainDrawerButton>
                          ) : order.status === "completed" ? (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400">Fully Received</p>
                          ) : null}
                          {purchaseOrderIsReturnable(order) ? (
                            <AgainDrawerButton onClick={() => setLinesTab("returns")}>Return</AgainDrawerButton>
                          ) : null}
                        </div>
                        <PurchaseReceivingHistory
                          receipts={poReceipts}
                          warehouseName={order.warehouse_name}
                        />
                      </>
                    );
                  })()}
                </div>
              ) : linesTab === "returns" && order ? (
                <div className="space-y-6">
                  {returnRows.length > 0 ? (
                    // Odoo form: titled group, label left / underline control right (docs/common/formcommon.md)
                    <div className="again-odoo-form @container">
                      <div className="flex items-end gap-1">
                        <AgainFormGroupTitle className="flex-1">New return</AgainFormGroupTitle>
                        <button
                          type="button"
                          className={cn(
                            "mb-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground",
                            returnHelpOpen && "bg-[#00a09d]/10 text-[#00a09d]",
                          )}
                          aria-label="How a return works"
                          aria-expanded={returnHelpOpen}
                          title="How a return works"
                          onClick={() => setReturnHelpOpen((v) => !v)}
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {returnHelpOpen ? (
                        <p className="mb-2 border-l-2 border-[#00a09d] bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground">
                          Goods sent back to the supplier against {order.po_number}. Pick the location they go back from, then
                          the quantity of each product (the serials, for serial products); Create return takes them out of the
                          stock of that location and reduces what is owed to the supplier.
                        </p>
                      ) : null}
                      <AgainFormField label="Return from">
                        {returnLocations.length > 1 ? (
                          // the goods are in more than one place (a transfer moved some on): the user says which one goes back
                          <select
                            value={returnWarehouse}
                            onChange={(e) => {
                              // another location holds other pieces and other serials: start the selection again
                              setReturnWarehouseId(e.target.value);
                              setReturnQty({});
                              setReturnSerials({});
                              setSerialPickId(null);
                            }}
                            aria-label="Return from location"
                            className="h-8 w-full bg-transparent px-1 text-[13px] outline-none"
                          >
                            {returnLocations.map((w) => {
                              const pcs = locationScore(w.id);
                              return (
                                <option key={w.id} value={w.id}>
                                  {`${w.code} — ${w.name}${pcs > 0 ? ` · ${pcs} pcs to return here` : ""}`}
                                </option>
                              );
                            })}
                          </select>
                        ) : (
                          // received at one place and never moved: that is where it goes back from
                          <p className="py-1 text-[13px] text-foreground">
                            {returnLocations[0] ? `${returnLocations[0].code} — ${returnLocations[0].name}` : returnWarehouseName}
                          </p>
                        )}
                      </AgainFormField>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full min-w-[700px] border-collapse text-[13px]">
                          <thead>
                            <tr className="border-b border-border/80 text-left text-[11px] font-semibold text-foreground">
                              <th className="py-2 pr-3">Product</th>
                              <th className="w-20 py-2 pr-3 text-right">Received</th>
                              <th className="w-20 py-2 pr-3 text-right">Returned</th>
                              <th className="w-24 py-2 pr-3 text-right">Returnable</th>
                              <th className="w-28 py-2 pr-3 text-right" title={`Available at ${returnWarehouseName}`}>
                                In stock here
                              </th>
                              <th className="w-32 py-2 pr-3 text-right">Return</th>
                              <th className="w-28 py-2 text-right">Credit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {returnRows.map(({ line, returnable, qty, credit, serialTracked, here, pool, poolAll, picked, cap }) => (
                              <Fragment key={line.id}>
                              <tr className="border-b border-border/80 align-top">
                                <td className="py-2 pr-3">
                                  <p className="font-medium text-foreground">{line.name || line.sku}</p>
                                  <p className="text-[11px] text-muted-foreground">{line.sku}</p>
                                </td>
                                <td className="py-2 pr-3 text-right tabular-nums">{line.quantity_received}</td>
                                <td className="py-2 pr-3 text-right tabular-nums">
                                  {(line.quantity_returned ?? 0) > 0 ? (
                                    <span className="font-medium text-amber-700 dark:text-amber-400">
                                      {line.quantity_returned}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">0</span>
                                  )}
                                </td>
                                <td className="py-2 pr-3 text-right tabular-nums">{returnable}</td>
                                <td className="py-2 pr-3 text-right tabular-nums">
                                  {returnable <= 0 ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : (serialTracked ? pool.length : here) === null ? (
                                    <span className="text-muted-foreground">…</span>
                                  ) : (
                                    <span
                                      className={cn(
                                        (serialTracked ? pool.length : (here ?? 0)) < returnable &&
                                          "text-amber-700 dark:text-amber-400",
                                      )}
                                      title={
                                        (serialTracked ? pool.length : (here ?? 0)) < returnable
                                          ? `Only ${serialTracked ? pool.length : here} at ${returnWarehouseName}`
                                          : undefined
                                      }
                                    >
                                      {serialTracked ? pool.length : here}
                                    </span>
                                  )}
                                </td>
                                <td className="py-1.5 pr-3">
                                  {returnable <= 0 ? (
                                    <span className="block text-right text-[11px] text-muted-foreground">All returned</span>
                                  ) : cap <= 0 && !serialTracked ? (
                                    <span className="block text-right text-[11px] text-muted-foreground">None here</span>
                                  ) : serialTracked ? (
                                    <button
                                      type="button"
                                      disabled={poolAll.length === 0}
                                      aria-expanded={serialPickId === line.id}
                                      className={cn(
                                        "w-full text-right text-[11px] hover:underline disabled:text-muted-foreground",
                                        picked.length > 0 ? "font-medium text-[#00a09d]" : "text-[#00a09d]",
                                      )}
                                      onClick={() => setSerialPickId(serialPickId === line.id ? null : line.id)}
                                    >
                                      {poolAll.length === 0 ? "No serials in stock" : `Select serials (${picked.length})`}
                                    </button>
                                  ) : (
                                    <LineNumericInput
                                      value={qty}
                                      min={0}
                                      steppers
                                      onChange={(value) =>
                                        setReturnQty((rows) => ({
                                          ...rows,
                                          [line.id]: Math.min(cap, Math.max(0, Math.round(value))),
                                        }))
                                      }
                                      className={CELL_INPUT}
                                    />
                                  )}
                                </td>
                                <td className="py-2 text-right tabular-nums">{qty > 0 ? formatCurrency(credit) : "—"}</td>
                              </tr>
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-2 grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                        <AgainFormField label="Reason">
                          <select
                            value={returnReason}
                            onChange={(e) => setReturnReason(e.target.value as ReturnReason)}
                            className="h-8 w-full bg-transparent px-1 text-[13px] outline-none"
                          >
                            {(Object.keys(RETURN_REASON_LABELS) as ReturnReason[]).map((reason) => (
                              <option key={reason} value={reason}>
                                {RETURN_REASON_LABELS[reason]}
                              </option>
                            ))}
                          </select>
                        </AgainFormField>
                        <AgainFormField label="Note">
                          <input
                            value={returnNotes}
                            onChange={(e) => setReturnNotes(e.target.value)}
                            placeholder="Optional"
                            className="h-8 w-full bg-transparent px-1 text-[13px] outline-none"
                          />
                        </AgainFormField>
                      </div>
                      <div className="flex items-center justify-end gap-4 pt-2">
                        {returnCredit > 0 ? (
                          <span className="text-[13px] tabular-nums text-muted-foreground">
                            Credit <span className="font-semibold text-foreground">{formatCurrency(returnCredit)}</span>
                          </span>
                        ) : null}
                        <AgainDrawerButton
                          variant="primary"
                          disabled={returnSaving || returnPicked.length === 0}
                          onClick={() => void submitReturn()}
                        >
                          {returnSaving ? "Saving…" : "Create return"}
                        </AgainDrawerButton>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Receive goods first to return them. Goods sent back to the supplier against {order.po_number} are listed below.
                    </p>
                  )}
                  <div className="space-y-2">
                  <SectionTitle>Returns on this order</SectionTitle>
                  {poReturns === null ? (
                    <p className="px-1 py-6 text-center text-xs text-muted-foreground">Loading returns…</p>
                  ) : poReturns.length === 0 ? (
                    <p className="border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                      No returns on this order yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border border border-border">
                      {poReturns.map((ret) => {
                        const isOpen = openReturnId === ret.id;
                        const busy = returnBusyId === ret.id;
                        return (
                          <li key={ret.id} className="text-xs">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                                aria-expanded={isOpen}
                                onClick={() => setOpenReturnId(isOpen ? null : ret.id)}
                              >
                                <ChevronDown className={cn("h-3 w-3 transition-transform", !isOpen && "-rotate-90")} />
                                {ret.return_number}
                              </button>
                              <span className="text-muted-foreground">{String(ret.return_date ?? "").slice(0, 10)}</span>
                              <span className="border border-border px-1.5 py-0.5 text-[10px]">
                                {RETURN_STATUS_LABELS[ret.status as ReturnStatus] ?? ret.status}
                              </span>
                              <span className="ml-auto tabular-nums font-medium">
                                {formatCurrency(Number(ret.credit_amount || 0))}
                              </span>
                              <button
                                type="button"
                                className="inline-flex h-6 w-6 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                                aria-label={`Print ${ret.return_number}`}
                                title="Print this return"
                                onClick={() => void printReturn(ret.id)}
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {isOpen ? (
                              <div className="space-y-2 border-t border-border/60 bg-muted/10 px-3 py-2">
                                <table className="w-full border-collapse text-[12px]">
                                  <thead>
                                    <tr className="text-left text-[11px] font-semibold text-foreground">
                                      <th className="py-1 pr-3">Product</th>
                                      <th className="w-16 py-1 pr-3 text-right">Qty</th>
                                      <th className="w-24 py-1 pr-3 text-right">Unit cost</th>
                                      <th className="w-24 py-1 text-right">Credit</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ret.lines.map((row) => (
                                      <tr key={row.id} className="border-t border-border/50">
                                        <td className="py-1 pr-3">
                                          {row.name || row.sku}
                                          <span className="ml-2 text-[11px] text-muted-foreground">{row.sku}</span>
                                          {row.serial_numbers?.length ? (
                                            <p className="mt-0.5 whitespace-normal break-all font-mono text-[10px] text-muted-foreground">
                                              S/N: {row.serial_numbers.join(", ")}
                                            </p>
                                          ) : null}
                                        </td>
                                        <td className="py-1 pr-3 text-right tabular-nums">{row.quantity_returned}</td>
                                        <td className="py-1 pr-3 text-right tabular-nums">
                                          {formatCurrency(Number(row.unit_cost) || 0)}
                                        </td>
                                        <td className="py-1 text-right tabular-nums">
                                          {formatCurrency(Number(row.line_total) || 0)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                <p className="text-[11px] text-muted-foreground">
                                  {[
                                    ret.warehouse_name ? `From: ${ret.warehouse_name}` : null,
                                    `Reason: ${RETURN_REASON_LABELS[ret.reason as ReturnReason] ?? ret.reason}`,
                                    `Requested ${formatDateTime(ret.created_at)}`,
                                    ret.approved_at ? `Approved ${formatDateTime(ret.approved_at)}` : null,
                                    ret.credited_at ? `Credited ${formatDateTime(ret.credited_at)}` : null,
                                    ret.rejected_at ? `Rejected ${formatDateTime(ret.rejected_at)}` : null,
                                    ret.cancelled_at ? `Cancelled ${formatDateTime(ret.cancelled_at)}` : null,
                                    ret.notes ? `Note: ${ret.notes}` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                                <div className="flex items-center gap-1.5">
                                  <AgainDrawerButton onClick={() => void printReturn(ret.id)}>Print</AgainDrawerButton>
                                </div>
                                {canWrite && (ret.status === "requested" || ret.status === "approved") ? (
                                  <div className="flex items-center gap-1.5">
                                    <AgainDrawerButton
                                      variant="primary"
                                      disabled={busy}
                                      onClick={() => void runReturnAction(ret, "finish")}
                                    >
                                      {busy ? "Saving…" : ret.status === "requested" ? "Approve & credit" : "Credit"}
                                    </AgainDrawerButton>
                                    {ret.status === "requested" ? (
                                      <AgainDrawerButton disabled={busy} onClick={() => void runReturnAction(ret, "reject")}>
                                        Reject
                                      </AgainDrawerButton>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  </div>
                  {/* room under the last row: the totals card floats over the bottom right */}
                  <div className="h-24" aria-hidden />
                </div>
              ) : linesTab === "others" ? (
                // Odoo form: label left, underline control right, groups with a titled rule (docs/common/formcommon.md).
                <div className="again-odoo-form @container space-y-5">
                  <div>
                    <AgainFormGroupTitle>Order</AgainFormGroupTitle>
                    <AgainFormField label="Payment Terms">
                      <select
                        value={paymentTerms}
                        disabled={readOnly}
                        onChange={(e) => setPaymentTerms(e.target.value)}
                        aria-label="Payment terms"
                        className="h-8 w-full bg-transparent px-1 text-[13px] outline-none disabled:opacity-60"
                      >
                        {PAYMENT_TERM_OPTIONS.some((option) => option.value === paymentTerms) ? null : (
                          <option value={paymentTerms}>{paymentTerms}</option>
                        )}
                        {PAYMENT_TERM_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </AgainFormField>
                    <AgainFormField label="Expected Date">
                      <input
                        type="date"
                        value={expectedDate}
                        disabled={readOnly}
                        onChange={(e) => setExpectedDate(e.target.value)}
                        className="h-8 w-full bg-transparent px-1 text-[13px] outline-none disabled:opacity-60"
                      />
                    </AgainFormField>
                    <AgainFormField label="Reference No">
                      <input
                        value={referenceNo}
                        disabled={readOnly}
                        onChange={(e) => setReferenceNo(e.target.value)}
                        placeholder="Optional — leave blank to use PO number"
                        className="h-8 w-full bg-transparent px-1 text-[13px] outline-none disabled:opacity-60"
                      />
                    </AgainFormField>
                  </div>
                  <div>
                    <AgainFormGroupTitle>Supplier</AgainFormGroupTitle>
                    <AgainFormField label="Info">
                      <div className="flex min-h-[28px] items-center gap-2">
                        <div className="min-w-0 flex-1">
                          {selectedSupplierOption ? (
                            <>
                              <p className="truncate text-[13px] font-medium text-foreground">
                                {[selectedSupplierOption.name, selectedSupplierOption.contactPerson]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {[
                                  selectedSupplierOption.phone,
                                  selectedSupplierOption.email,
                                  supplierAddress,
                                  selectedSupplierOption.balanceDue && selectedSupplierOption.balanceDue > 0
                                    ? `Due: ${formatCurrency(selectedSupplierOption.balanceDue)}`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </>
                          ) : (
                            <p className="text-[13px] text-muted-foreground">Select a supplier</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={openSupplierView}
                          disabled={!selectedSupplierDetail}
                          title="View supplier"
                          aria-label="View supplier"
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-[#00a09d]/10 hover:text-[#00a09d] disabled:pointer-events-none disabled:opacity-40"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </AgainFormField>
                  </div>
                </div>
              ) : linesTab === "info" ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    For the products on this order: the last 3 purchase prices from{" "}
                    {selectedSupplierLabel || "the supplier"} and the pieces available in each location.
                  </p>
                  {infoLines.length === 0 ? (
                    <p className="border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                      Add products in Order Lines to see their purchase prices and stock here.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] border-collapse text-[13px]">
                        <thead>
                          <tr className="border-b border-border/80 text-left text-[11px] font-semibold text-foreground">
                            <th className="py-2 pr-3">Product</th>
                            <th className="py-2 pr-3">Last 3 purchases</th>
                            <th className="py-2">Stock by location</th>
                          </tr>
                        </thead>
                        <tbody>
                          {infoLines.map((line) => {
                            const purchases = history?.bySku[line.sku] ?? [];
                            const stock = stockBySku[line.sku];
                            return (
                              <tr key={line.key} className="border-b border-border/80 align-top">
                                <td className="py-2 pr-3">
                                  <p className="font-medium text-foreground">{line.name || line.sku}</p>
                                  <p className="text-[11px] text-muted-foreground">{line.sku}</p>
                                </td>
                                <td className="py-2 pr-3">
                                  {!selectedSupplier ? (
                                    <span className="text-muted-foreground">Select a supplier first</span>
                                  ) : !history ? (
                                    <span className="text-muted-foreground">Loading…</span>
                                  ) : history.failed ? (
                                    <span className="text-destructive">Could not load the purchase history</span>
                                  ) : purchases.length === 0 ? (
                                    <span className="text-muted-foreground">Not purchased from this supplier yet</span>
                                  ) : (
                                    <ul className="space-y-1">
                                      {purchases.map((p, i) => (
                                        <li key={`${p.poNumber}-${i}`} className="flex flex-wrap items-baseline gap-x-3">
                                          <span className="min-w-[72px] font-medium tabular-nums">
                                            {formatCurrency(p.unitCost)}
                                          </span>
                                          <span className="text-[11px] text-muted-foreground">
                                            {[p.date ? formatDate(p.date) : null, p.poNumber, `${p.quantity} pcs`]
                                              .filter(Boolean)
                                              .join(" · ")}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </td>
                                <td className="py-2">
                                  {stock === undefined ? (
                                    <span className="text-muted-foreground">Loading…</span>
                                  ) : stock === "failed" ? (
                                    <span className="text-destructive">Could not load the stock</span>
                                  ) : stock.length === 0 ? (
                                    <span className="text-muted-foreground">No stock in any location</span>
                                  ) : (
                                    <ul className="max-w-[280px] space-y-1">
                                      {stock.map((row) => (
                                        <li key={row.id} className="flex items-baseline justify-between gap-4">
                                          <span
                                            className={cn(
                                              "min-w-0 truncate",
                                              row.warehouse_id === effectiveWarehouseId && "font-medium",
                                            )}
                                            title={row.warehouse_id === effectiveWarehouseId ? "This order's location" : undefined}
                                          >
                                            {row.warehouse_name}
                                          </span>
                                          <span
                                            className={cn(
                                              "shrink-0 tabular-nums",
                                              row.available <= 0 && "text-muted-foreground",
                                            )}
                                          >
                                            {row.available} pcs
                                          </span>
                                        </li>
                                      ))}
                                      {stock.length > 1 ? (
                                        <li className="flex items-baseline justify-between gap-4 border-t border-border/60 pt-1 font-medium">
                                          <span>Total</span>
                                          <span className="tabular-nums">
                                            {stock.reduce((sum, row) => sum + row.available, 0)} pcs
                                          </span>
                                        </li>
                                      ) : null}
                                    </ul>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {/* room under the last row: the totals card floats over the bottom right */}
                  <div className="h-24" aria-hidden />
                </div>
              ) : null}
            </AgainFormNotebook>
          </div>
        </AgainDrawerScrollBody>

        {/* totals card: fixed in place like a popup, above the footer line, at the right - a long product list scrolls UNDER it
            (the wrapper has no height, so it takes no room from the list) */}
        <div className="pointer-events-none relative z-30 h-0 shrink-0">
          <div className="pointer-events-auto absolute bottom-2 right-4 w-[min(100%,260px)] sm:right-6">
            {totalsMinimized ? (
              <div className="relative ml-auto w-[min(100%,260px)] border border-border bg-background px-3 py-2.5 text-[12px] shadow-md">
                <button
                  type="button"
                  className="absolute -left-2.5 -top-2.5 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Expand totals"
                  title="Expand totals"
                  onClick={() => setTotalsMinimized(false)}
                >
                  <Plus className="h-3 w-3" />
                </button>
                <div className="flex items-center justify-between gap-4 text-[13px] font-semibold text-foreground">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(totals.total)}</span>
                </div>
                {returnedCredit > 0 || amountPaid > 0 ? (
                  <div className="mt-0.5 flex items-center justify-between gap-4 text-muted-foreground">
                    <span>{returnDue > 0 ? "Return due" : "Due"}</span>
                    <span className="tabular-nums font-medium text-foreground">
                      {formatCurrency(returnDue > 0 ? returnDue : dueBalance)}
                    </span>
                  </div>
                ) : null}
                {balancePayable !== null && previousBalance !== null && Math.abs(previousBalance) >= 0.005 ? (
                  <div className="mt-0.5 flex items-center justify-between gap-4 text-muted-foreground">
                    <span>{balancePayable < 0 ? "Supplier owes" : "Balance payable"}</span>
                    <span className="tabular-nums font-medium text-foreground">
                      {formatCurrency(Math.abs(balancePayable))}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="relative ml-auto w-[min(100%,260px)] border border-border bg-background shadow-md dark:bg-background">
                <button
                  type="button"
                  className="absolute -left-2.5 -top-2.5 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Minimize totals"
                  title="Minimize totals"
                  onClick={() => setTotalsMinimized(true)}
                >
                  <Minus className="h-3 w-3" />
                </button>
                <div className="space-y-1.5 px-3 py-2.5 text-[12px]">
                  <div className="flex items-center justify-between gap-4 text-muted-foreground">
                    <span>Sub total</span>
                    <span className="tabular-nums text-foreground">
                      {formatCurrency(totals.subtotal)}
                    </span>
                  </div>
                  {totals.discount > 0 ? (
                    <div className="flex items-center justify-between gap-4 text-muted-foreground">
                      <span>Discount</span>
                      <span className="tabular-nums text-foreground">
                        −{formatCurrency(totals.discount)}
                      </span>
                    </div>
                  ) : null}
                  {companyTaxEnabled && totals.tax > 0 ? (
                    <div className="flex items-center justify-between gap-4 text-muted-foreground">
                      <span>Taxes</span>
                      <span className="tabular-nums text-foreground">
                        {formatCurrency(totals.tax)}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-4 border-t border-border pt-1.5 text-[13px] font-semibold text-foreground">
                    <span>Total</span>
                    <span className="tabular-nums">{formatCurrency(totals.total)}</span>
                  </div>

                  {/* returns credited against this order (posted to the supplier's ledger as credit notes) */}
                  {returnedCredit > 0 ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          className="text-left text-muted-foreground hover:text-[#00a09d]"
                          title="Product returns credited by the supplier"
                          onClick={() => setLinesTab("returns")}
                        >
                          Product return
                        </button>
                        <span className="tabular-nums text-foreground">−{formatCurrency(returnedCredit)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 font-medium text-foreground">
                        <span>Net purchase</span>
                        <span className="tabular-nums">{formatCurrency(netPurchase)}</span>
                      </div>
                    </>
                  ) : null}
                  {returnPendingCredit > 0 ? (
                    <div className="flex items-center justify-between gap-3 text-[11px] text-amber-700 dark:text-amber-400">
                      <button type="button" className="text-left hover:underline" onClick={() => setLinesTab("returns")}>
                        Return awaiting credit
                      </button>
                      <span className="tabular-nums">{formatCurrency(returnPendingCredit)}</span>
                    </div>
                  ) : null}

                  {amountPaid > 0 ? (
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        className="text-left text-muted-foreground hover:text-[#00a09d]"
                        onClick={() => setLinesTab("payment")}
                      >
                        Paid
                      </button>
                      <span className="tabular-nums text-foreground">{formatCurrency(amountPaid)}</span>
                    </div>
                  ) : null}
                  {returnedCredit > 0 || amountPaid > 0 ? (
                    returnDue > 0 ? (
                      <div
                        className="flex items-center justify-between gap-4 font-medium text-amber-700 dark:text-amber-400"
                        title="Paid more than the net purchase: the supplier owes this back"
                      >
                        <span>Return due</span>
                        <span className="tabular-nums">{formatCurrency(returnDue)}</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-4 text-muted-foreground">
                        <span>Due</span>
                        <span className="tabular-nums font-medium text-foreground">{formatCurrency(dueBalance)}</span>
                      </div>
                    )
                  ) : null}

                  {/* the supplier's account: what stood before this order, and what is owed in all once it is settled */}
                  {previousBalance !== null && Math.abs(previousBalance) >= 0.005 ? (
                    <div className="space-y-1.5 border-t border-border/60 pt-1.5">
                      <div className="flex items-center justify-between gap-4 text-muted-foreground">
                        <span>{previousBalance < 0 ? "Previous credit" : "Previous balance"}</span>
                        <span className="tabular-nums text-foreground">{formatCurrency(Math.abs(previousBalance))}</span>
                      </div>
                      {balancePayable !== null ? (
                        <div className="flex items-center justify-between gap-4 font-semibold text-foreground">
                          <span>{balancePayable < 0 ? "Supplier owes you" : "Balance payable"}</span>
                          <span className="tabular-nums">{formatCurrency(Math.abs(balancePayable))}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="relative z-20 shrink-0 border-t border-border bg-background">
          <div className="flex items-center justify-between gap-4 px-4 py-2 sm:px-6">
            <div className="relative z-10 flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
              {!readOnly ? (
                <>
                  <button
                    type="button"
                    className={LINK}
                    onClick={() => {
                      setLinesTab("lines");
                      addProductLine();
                    }}
                  >
                    Add a product
                  </button>
                  <button
                    type="button"
                    className={LINK}
                    onClick={() => {
                      setLinesTab("lines");
                      setLines((rows) => [...rows, newMetaLine("section")]);
                    }}
                  >
                    Add a section
                  </button>
                  <button
                    type="button"
                    className={LINK}
                    onClick={() => {
                      setLinesTab("lines");
                      setLines((rows) => [...rows, newMetaLine("note")]);
                    }}
                  >
                    Add a note
                  </button>
                  <button
                    type="button"
                    className={LINK}
                    onClick={() => {
                      setLinesTab("lines");
                      setLines((rows) => [...rows, newServiceLine()]);
                    }}
                  >
                    Add a service
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
        </div>
        )}
        </div>
      </SheetContent>
    </Sheet>
    <SupplierFormDrawer
      open={supplierFormOpen}
      onOpenChange={setSupplierFormOpen}
      supplier={viewingSupplier ? selectedSupplierDetail : null}
      draftName={supplierDraftName}
      onSaved={(saved) => {
        setExtraSuppliers((rows) =>
          rows.some((row) => row.id === saved.id)
            ? rows
            : [
                ...rows,
                {
                  id: saved.id,
                  name: saved.name,
                  country: saved.country,
                  phone: saved.phone,
                  email: saved.email,
                },
              ],
        );
        setSelectedSupplier(saved.id);
        setSupplierQuery("");
        setSupplierOpen(false);
      }}
    />
    {productViewId ? (
      <ProductDrawer
        open
        nested
        productId={productViewId}
        onOpenChange={(next) => {
          if (!next) setProductViewId(null);
        }}
        onEdit={(product) => {
          // the editor opens above the order; the product drawer steps aside
          setProductViewId(null);
          setQuickAddOpen(false);
          setViewProductId(product.id);
        }}
      />
    ) : null}
    <InventoryProductQuickAdd
      open={quickAddOpen || Boolean(viewProductId)}
      nested
      productId={viewProductId}
      onOpenChange={(next) => {
        if (!next) {
          setQuickAddOpen(false);
          setViewProductId(null);
        }
      }}
      onSaved={(product: Product) => {
        if (viewProductId) {
          setLines((rows) =>
            rows.map((row) =>
              row.productId === product.id || row.sku === product.sku
                ? { ...row, name: product.name, sku: product.sku, productId: product.id }
                : row,
            ),
          );
          void loadItems();
          return;
        }
        addProducts([
          {
            id: product.id,
            sku: product.sku,
            name: product.name,
            unitCost: product.purchasePrice ?? 0,
            sellingPrice: product.price ?? 0,
            brand: product.brand || undefined,
            category: product.category || undefined,
            model: product.model || undefined,
            stock: product.stock,
            imageUrl: product.thumbnail || undefined,
          },
        ]);
        void loadItems();
        toast.success(`${product.name} added to the order`);
      }}
    />
    <SerialsDrawer
      open={Boolean(serialTarget)}
      onOpenChange={(next) => {
        if (!next) setSerialTarget(null);
      }}
      product={serialTarget?.name ?? ""}
      required={
        serialTarget ? Number.parseInt(receiveRows[serialTarget.key]?.qty ?? "0", 10) || 0 : 0
      }
      value={serialTarget ? (receiveRows[serialTarget.key]?.serials ?? []) : []}
      onSave={(serials) => {
        if (!serialTarget) return;
        patchReceive(serialTarget.key, { serials });
      }}
    />
    {(() => {
      // the serials going back on a return: opens like the receive serial entry, scan or tick the units
      const pickRow = returnRows.find((row) => row.line.id === serialPickId);
      return (
        <ReturnSerialsDrawer
          open={Boolean(pickRow)}
          onOpenChange={(next) => {
            if (!next) setSerialPickId(null);
          }}
          product={pickRow?.line.name || pickRow?.line.sku || ""}
          units={(pickRow?.poolAll ?? [])
            .filter((unit) => unit.warehouse_id)
            .map((unit) => ({
              serial: unit.serial_number,
              locationId: unit.warehouse_id as string,
              location: warehouses.find((w) => w.id === unit.warehouse_id)?.name ?? "Unknown location",
            }))}
          selected={pickRow?.picked ?? []}
          max={pickRow?.returnable ?? 0}
          preferredLocationId={returnWarehouse}
          onSave={(serials, locationId) => {
            if (!pickRow) return;
            if (locationId && locationId !== returnWarehouse) {
              // the units picked are at another location: the return follows them, and what was set for the old one is dropped
              setReturnWarehouseId(locationId);
              setReturnQty({});
              setReturnSerials({ [pickRow.line.id]: serials });
              toast.info(`Return location set to ${warehouses.find((w) => w.id === locationId)?.name ?? "the serials' location"}`);
              return;
            }
            setReturnSerials((rows) => ({ ...rows, [pickRow.line.id]: serials }));
          }}
        />
      );
    })()}
    </>
  );
}
