"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Eye, FileText, Minus, Percent, Plus, Printer, Trash2, X } from "lucide-react";
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
  AGAIN_DRAWER_ACTION_BTN,
  AGAIN_DRAWER_CONTENT_CLASS,
  AGAIN_DRAWER_PRIMARY_BTN,
  AGAIN_DRAWER_PRIMARY_COLOR,
  AgainDrawerControlBar,
  DrawerResizeHandle,
  useDrawerResize,
} from "@/components/again/again-drawer";
import { AgainFormNotebook } from "@/components/again/again-form-sheet-layout";
import { SearchDropdown } from "@/components/again/again-search-dropdown";
import { LineNumericInput } from "@/components/sales/sales-order-line-row-cells";
import { cancelPurchaseOrder, confirmPurchaseOrder, createPurchaseOrder, updatePurchaseOrder, type ApiPurchaseOrder } from "@/lib/api/purchase-orders";
import { createPurchaseReceipt, fetchPurchaseReceipts, postPurchaseReceipt, type ApiPurchaseReceipt } from "@/lib/api/purchase-receipts";
import {
  deleteSupplierPayment,
  fetchSupplierPayments,
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
import { apiFetch } from "@/lib/api/client";
import { apiStockToStockItem, type ApiStockListResponse } from "@/lib/api/inventory";
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
import { purchasePaths, readPurchaseSettings, type PurchaseOrderPrefillLine } from "@/lib/purchase/purchase-paths";
import { purchaseOrderIsReturnable } from "@/lib/mock-data/purchase-returns";
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
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

const TOOLBAR_DISABLED = "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-muted/50";

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

const PO_DEFAULT_WIDTHS: Record<PoLineCol, number> = {
  product: 240,
  quantity: 64,
  unitCost: 120,
  discount: 148,
  amount: 110,
  received: 140,
  serialBatch: 200,
};

const PO_MIN_WIDTHS: Record<PoLineCol, number> = {
  product: 64,
  quantity: 36,
  unitCost: 36,
  discount: 56,
  amount: 36,
  received: 72,
  serialBatch: 96,
};

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
      style={{ width, minWidth: width, maxWidth: width }}
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
};

type PurchaseStatusChoice = "" | "draft" | "ordered" | "pending" | "received";
type NotebookTab = "lines" | "payment" | "receiving" | "others";

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

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-xs font-medium text-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </label>
      {children}
    </div>
  );
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
  const router = useRouter();
  const { warehouses } = useInventoryWarehouses();
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
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const supplierAnchorRef = useRef<HTMLDivElement | null>(null);
  const [linesTab, setLinesTab] = useState<NotebookTab>("lines");
  const [paymentTerms, setPaymentTerms] = useState("net30");
  const [paymentHistory, setPaymentHistory] = useState<PaymentEntry[]>([]);
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [drawerPanel, setDrawerPanel] = useState<"order" | "preview">("order");
  const [previewPayload, setPreviewPayload] = useState<PurchasePrintPayload | null>(null);
  const [companyTaxEnabled, setCompanyTaxEnabled] = useState(true);
  const { width: drawerWidth, handleProps: drawerResizeHandle } = useDrawerResize({
    defaultWidth: typeof window !== "undefined" ? Math.round(window.innerWidth * 0.6) : 780,
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
  } = usePoLineTableLayout(canReceiveInline);

  const loadItems = async () => {
    try {
      const catalog = await apiFetch<ApiProductListResponse>(
        "/api/v1/catalog/products?per_page=200",
      );
      const seen = new Set<string>();
      const options: ItemOption[] = [];
      for (const product of catalog.data.map(apiProductToProduct)) {
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
    setSelectedSupplier(order?.supplier_id ?? supplierId ?? initialSupplierId ?? "");
    setSupplierQuery("");
    setSupplierOpen(false);
    setSupplierFormOpen(false);
    setSupplierDraftName("");
    setExtraSuppliers([]);
    setSupplierAddress("");
    setReferenceNo(stored.referenceNo);
    setPurchaseDate(order?.order_date ?? todayIso());
    setPurchaseStatus(
      order?.status === "completed" || order?.status === "partial_received"
        ? "received"
        : order?.status === "draft"
          ? "pending"
          : "ordered",
    );
    setWarehouseId(order?.warehouse_id ?? initialWarehouseId ?? settings.defaultWarehouseId ?? "");
    setExpectedDate(order?.expected_date ?? "");
    setBuyerName(order?.buyer_name ?? "");
    setLines(
      order?.lines?.length
        ? order.lines.map(lineFromOrderLine)
        : initialLines?.length
          ? initialLines.map((l) => newLine(l))
          : [],
    );
    setLinesTab("lines");
    setPaymentTerms(stored.paymentTerms);
    setPaymentHistory([]);
    setPayDraftMethod("Cash");
    setPayDraftAmount(0);
    setPayDraftAt(toDatetimeLocalValue(new Date().toISOString()));
    setPayDraftNote("");
    setViewProductId(null);
    setPoReceipts([]);
    setSerialTarget(null);
    setDrawerPanel("order");
    setPreviewPayload(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on order?.id, not the
    // whole object: a fresh-but-same-PO object from a parent refetch (e.g. after posting a
    // receipt) must not wipe in-progress local state like poReceipts or paymentHistory.
  }, [open, supplierId, initialSupplierId, initialWarehouseId, initialLines, order?.id]);

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
        secondary:
          [
            row.phone,
            row.email,
            row.balanceDue && row.balanceDue > 0 ? `Due: ${formatCurrency(row.balanceDue)}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
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

  const defaultWarehouseId =
    (warehouses.find((w) => w.isDefault) ?? warehouses[0])?.id || "";
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
    const productId = line.productId || items.find((item) => item.sku === line.sku)?.id;
    if (!productId) {
      toast.info("Product details are not available");
      return;
    }
    setQuickAddOpen(false);
    setViewProductId(productId);
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

  const amountPaid = paymentHistory
    .filter((entry) => entry.status === "completed")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const dueBalance = Math.max(0, round2(totals.total - amountPaid));

  useEffect(() => {
    if (linesTab !== "payment") return;
    setPayDraftAmount(dueBalance);
    // Prefill remaining due when opening the Payment tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on tab switch
  }, [linesTab]);

  const registerPayment = async () => {
    if (payDraftAmount <= 0) {
      toast.error("Enter a payment amount");
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
      });
      const entry: PaymentEntry = {
        id: payment.id,
        method,
        amount: payDraftAmount,
        status: "completed",
        at: fromDatetimeLocalValue(payDraftAt),
        note: payDraftNote.trim() || undefined,
        accountId: account?.id,
        accountName: account?.name,
      };
      setPaymentHistory((rows) => [entry, ...rows]);
      const remaining = Math.max(0, round2(dueBalance - payDraftAmount));
      setPayDraftAmount(remaining);
      setPayDraftNote("");
      setPayDraftAt(toDatetimeLocalValue(new Date().toISOString()));
      toast.success("Payment recorded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
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

  const patchReceive = (lineId: string, patch: Partial<ReceiveLineState>) =>
    setReceiveByLine((rows) =>
      rows[lineId] ? { ...rows, [lineId]: { ...rows[lineId], ...patch } } : rows,
    );

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
      printLines.push({
        kind: line.kind,
        name: line.name.trim() || line.sku,
        sku: line.sku || undefined,
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

  const submit = async (asDraft = false) => {
    if (blocked) return;
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
          await confirmPurchaseOrder(saved.id);
          toast.success(`${saved.po_number} confirmed`);
        } else {
          toast.success(`${saved.po_number} updated`);
        }
        onOpenChange(false);
        onCreated?.();
        return;
      }

      const created = await createPurchaseOrder(payload);

      if (!shouldConfirm) {
        toast.success(`${created.po_number} saved as draft`);
        // First-time creation stays open — the drawer now edits this new PO
        // in place instead of closing.
        onCreated?.(created);
        return;
      }

      const confirmed = await confirmPurchaseOrder(created.id);

      if (purchaseStatus === "received") {
        const needsTracking = confirmed.lines.some(
          (l) => l.tracking_type === "serial" || l.tracking_type === "batch",
        );
        if (needsTracking) {
          toast.success(
            `${confirmed.po_number} ordered — use Receive for serial/batch items`,
          );
        } else {
          const receipt = await createPurchaseReceipt({
            purchase_order_id: confirmed.id,
            receipt_date: purchaseDate || undefined,
            lines: confirmed.lines.map((l) => ({
              purchase_order_line_id: l.id,
              quantity_received: l.quantity_ordered,
            })),
          });
          await postPurchaseReceipt(receipt.id);
          toast.success(`${confirmed.po_number} received — stock updated`);
        }
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={(el) => setPortalHost(el)}
        side="right"
        className={cn(AGAIN_DRAWER_CONTENT_CLASS, "sm:!max-w-none sm:!min-w-0")}
        style={{ width: `min(100vw, ${Math.round(drawerWidth)}px)`, maxWidth: "100vw" }}
        title={formTitle}
        onPointerDownOutside={(event) => {
          if (viewProductId || quickAddOpen || supplierFormOpen || serialTarget) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (viewProductId || quickAddOpen || supplierFormOpen || serialTarget) event.preventDefault();
        }}
        onFocusOutside={(event) => {
          if (viewProductId || quickAddOpen || supplierFormOpen || serialTarget) event.preventDefault();
        }}
      >
        <DrawerResizeHandle {...drawerResizeHandle} />
        <div className="relative flex h-full min-h-0 flex-col bg-background">
        <AgainDrawerControlBar>
          <button
            type="button"
            className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]", TOOLBAR_DISABLED)}
            style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
            disabled={blocked || saving}
            onClick={() => void submit()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]", TOOLBAR_DISABLED)}
            style={{ backgroundColor: "#059669" }}
            title={canReceiveInline ? "Enter Received quantities in Order Lines, then Receive" : undefined}
            disabled={receiveBlocked}
            onClick={() => {
              setLinesTab("lines");
              void submitReceiving();
            }}
          >
            {receivingSaving ? "Receiving…" : "Receive"}
          </button>
          <button
            type="button"
            className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]", TOOLBAR_DISABLED)}
            disabled={blocked || saving}
            onClick={() => void submit(true)}
          >
            Drafts
          </button>
          <button
            type="button"
            className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]", TOOLBAR_DISABLED)}
            onClick={() => onOpenChange(false)}
          >
            Discard
          </button>
          {isEdit && order && order.status !== "completed" && order.status !== "cancelled" ? (
            <button
              type="button"
              className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]", TOOLBAR_DISABLED)}
              disabled={saving}
              onClick={() => void handleCancelOrder()}
            >
              Cancel
            </button>
          ) : null}
          {isEdit && order && purchaseOrderIsReturnable(order) ? (
            <button
              type="button"
              className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
              onClick={() => {
                onOpenChange(false);
                router.push(`${purchasePaths.returns}?order=${encodeURIComponent(order.id)}`);
              }}
            >
              Return
            </button>
          ) : null}
          <button
            type="button"
            className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
            onClick={handlePreview}
          >
            Preview
          </button>
          <button
            type="button"
            className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
            onClick={handlePrint}
          >
            Print
          </button>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-none"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
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
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
              <div id="purchase-print-area" className="mx-auto max-w-[820px]">
                <PurchaseOrderPrintDocument data={previewPayload} />
              </div>
            </div>
          </div>
        ) : (
        <>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-6">
          <div className="-mx-4 -mt-3 sm:-mx-6">
            <div className="border-b border-border bg-background px-4 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-3">
                <div
                  className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-none border border-border/80 bg-[#00a09d] text-white"
                  aria-hidden
                >
                  <FileText className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div className="relative min-w-0 flex-1" ref={supplierAnchorRef}>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="min-w-0 truncate text-[13px] font-semibold text-foreground">
                      {isEdit ? (order?.po_number ?? formTitle) : "New"}
                    </p>
                  </div>
                  {!lockedSupplier && !selectedSupplier ? (
                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openSupplierCreate()}
                        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-none border border-[#00a09d]/35 bg-[#00a09d]/10 px-2 text-[11px] font-semibold text-[#00a09d] hover:bg-[#00a09d] hover:text-white"
                      >
                        <Plus className="h-3 w-3" />
                        Add supplier
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSupplierOpen(true);
                          if (selectedSupplier) setSupplierQuery(selectedSupplierLabel);
                        }}
                        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-none border border-border px-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        List Supplier
                      </button>
                    </div>
                  ) : null}
                  {lockedSupplier ? (
                    <p className="mt-0.5 truncate text-[12px] font-medium text-foreground">
                      {selectedSupplierLabel}
                    </p>
                  ) : selectedSupplier && !supplierOpen ? (
                    <div className="mt-0.5 flex min-w-0 items-center gap-0.5">
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-[#00a09d]/10 hover:text-[#00a09d]"
                        aria-label="Search suppliers"
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
                        className="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-foreground hover:text-[#00a09d] hover:underline"
                        onClick={() => {
                          setSupplierOpen(true);
                          setSupplierQuery(selectedSupplierLabel);
                        }}
                      >
                        {selectedSupplierLabel}
                      </button>
                      <button
                        type="button"
                        onClick={clearSupplier}
                        title="Change supplier"
                        aria-label="Change supplier"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openSupplierCreate()}
                        title="Add supplier"
                        aria-label="Add supplier"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none bg-[#00a09d]/10 text-[#00a09d] hover:bg-[#00a09d] hover:text-white"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-0.5 flex min-w-0 items-center gap-0.5">
                      {selectedSupplier ? (
                        <button
                          type="button"
                          onClick={clearSupplier}
                          title="Change supplier"
                          aria-label="Change supplier"
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-[#00a09d]/10 hover:text-[#00a09d]"
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
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
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
                        placeholder="Search supplier..."
                        className="h-6 min-w-0 flex-1 bg-transparent text-[12px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
                        autoFocus={supplierOpen}
                      />
                      <button
                        type="button"
                        onClick={() => openSupplierCreate()}
                        title="Add supplier"
                        aria-label="Add supplier"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none bg-[#00a09d]/10 text-[#00a09d] hover:bg-[#00a09d] hover:text-white"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <SearchDropdown
                    open={!lockedSupplier && supplierOpen}
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
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-foreground">{item.primary}</span>
                        {item.secondary ? (
                          <span className="truncate text-[11px] text-muted-foreground">
                            {item.secondary}
                          </span>
                        ) : null}
                      </div>
                    )}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border border-border">
            <button
              type="button"
              className="flex h-8 w-full items-center gap-1.5 rounded-none bg-muted/20 px-2 text-left hover:bg-muted/40"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((open) => !open)}
            >
              {detailsOpen ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="shrink-0 text-xs font-medium text-foreground">Order details</span>
              {!detailsOpen ? (
                <span className="min-w-0 truncate text-[11px] font-normal text-muted-foreground">
                  {[
                    purchaseDate,
                    order && order.status !== "draft"
                      ? (PO_STATUS_LABEL[order.status] ?? order.status)
                      : purchaseStatus === "received"
                        ? "Received"
                        : purchaseStatus === "pending"
                          ? "Pending"
                          : purchaseStatus === "ordered"
                            ? "Ordered"
                            : purchaseStatus === "draft"
                              ? "Draft"
                              : null,
                    warehouses.find((w) => w.id === effectiveWarehouseId)?.code,
                    referenceNo || null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              ) : null}
            </button>
            {detailsOpen ? (
              <div className="grid grid-cols-2 gap-3 border-t border-border px-2 py-3">
                <Field label="Reference No">
                  <Input
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder="Optional — leave blank to use PO number"
                    className="rounded-none"
                  />
                </Field>
                <Field label="Purchase Date" required>
                  <Input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="rounded-none"
                  />
                </Field>
                <Field label="Purchase Status" required>
                  {isEdit && order && order.status !== "draft" ? (
                    <Badge
                      variant="outline"
                      className={cn("h-8 w-full justify-center rounded-none", PO_STATUS_TONE[order.status])}
                    >
                      {PO_STATUS_LABEL[order.status] ?? order.status}
                    </Badge>
                  ) : (
                    <FilterSelect
                      value={purchaseStatus}
                      onChange={(v) => setPurchaseStatus(v as PurchaseStatusChoice)}
                      width="w-full"
                      ariaLabel="Purchase status"
                      options={[
                        { value: "", label: "Please Select" },
                        { value: "draft", label: "Draft — not sent to supplier yet" },
                        { value: "received", label: "Received" },
                        { value: "pending", label: "Pending" },
                        { value: "ordered", label: "Ordered" },
                      ]}
                    />
                  )}
                </Field>
                <Field label="Business Location" required>
                  <FilterSelect
                    value={effectiveWarehouseId}
                    onChange={setWarehouseId}
                    width="w-full"
                    ariaLabel="Business location"
                    options={[
                      { value: "", label: "Please Select" },
                      ...warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
                    ]}
                  />
                </Field>
                <Field label="Expected date">
                  <Input
                    type="date"
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="rounded-none"
                  />
                </Field>
              </div>
            ) : null}
          </div>

          <div className="-mx-4 sm:-mx-6">
            <AgainFormNotebook
              tabs={[
                { id: "lines" as const, label: "Order Lines" },
                { id: "payment" as const, label: "Payment" },
                { id: "others" as const, label: "Others" },
                ...(isEdit ? [{ id: "receiving" as const, label: "Receiving" }] : []),
              ]}
              active={linesTab}
              onChange={setLinesTab}
              className="border-t-0"
              contentClassName="bg-transparent px-4 py-4 dark:bg-transparent sm:px-6"
            >
              {linesTab === "lines" ? (
                <>
              <div className="mb-3">
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
              <div className={cn("relative", !totalsMinimized && "pb-16")}>
                <div className="overflow-x-auto">
                <table
                  className="w-full border-collapse text-[13px]"
                  style={{ tableLayout: "fixed", minWidth: lineColOrder.reduce((sum, col) => sum + lineColWidths[col], 0) }}
                >
                  <colgroup>
                    {lineColOrder.map((col) => (
                      <col key={col} style={{ width: lineColWidths[col] }} />
                    ))}
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
                            <td colSpan={lineColOrder.length} className="py-1.5 pr-8">
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
                      const r = line.kind === "product" ? receiveByLine[line.key] : undefined;
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
                              style={{
                                width: lineColWidths[col],
                                minWidth: lineColWidths[col],
                                maxWidth: lineColWidths[col],
                              }}
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
                                  <input
                                    type="number"
                                    min={0}
                                    max={order?.allow_over_receive ? undefined : r.remaining}
                                    value={r.qty}
                                    disabled={r.remaining <= 0}
                                    onChange={(e) => patchReceive(line.key, { qty: e.target.value })}
                                    className={CELL_INPUT}
                                  />
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )
                              ) : null}
                              {col === "serialBatch" ? (
                                r ? (
                                  r.tracking === "serial" ? (
                                    <button
                                      type="button"
                                      className="text-[11px] text-[#00a09d] hover:underline disabled:text-muted-foreground"
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
                </>
              ) : linesTab === "payment" ? (
                <div className="space-y-6">
                  <div className="border border-border bg-muted/20 p-2 dark:bg-muted/10">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Register payment
                    </p>
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_88px_60px]">
                        <select
                          value={payDraftMethod}
                          onChange={(event) => setPayDraftMethod(event.target.value)}
                          className="h-6 w-full rounded-none border border-border bg-background px-1.5 text-[11px] outline-none focus:border-[#00a09d]"
                        >
                          {PAYMENT_METHOD_OPTIONS.map((method) => (
                            <option key={method} value={method}>
                              {method}
                            </option>
                          ))}
                        </select>
                        <input
                          type="datetime-local"
                          value={payDraftAt}
                          onChange={(event) => setPayDraftAt(event.target.value)}
                          className="h-6 w-full min-w-0 rounded-none border border-border bg-background px-1.5 text-[11px] outline-none focus:border-[#00a09d]"
                          aria-label="Payment date and time"
                        />
                        <LineNumericInput
                          value={payDraftAmount}
                          onChange={setPayDraftAmount}
                          className="h-6 w-full rounded-none border border-border bg-background px-1.5 text-right text-[11px] tabular-nums outline-none focus:border-[#00a09d]"
                        />
                        <button
                          type="button"
                          className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 w-full text-[11px]")}
                          style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
                          disabled={paySaving}
                          onClick={() => void registerPayment()}
                        >
                          {paySaving ? "Adding…" : "Add"}
                        </button>
                      </div>
                      <div className={cn("grid gap-1.5", paymentAccounts.length > 0 ? "grid-cols-2" : "grid-cols-1")}>
                        <input
                          value={payDraftNote}
                          onChange={(event) => setPayDraftNote(event.target.value)}
                          placeholder="Note / transaction ID (optional)"
                          className="h-6 w-full rounded-none border border-border bg-background px-1.5 text-[11px] outline-none placeholder:text-muted-foreground/70 focus:border-[#00a09d]"
                        />
                        {paymentAccounts.length > 0 ? (
                          <select
                            value={payDraftAccountId}
                            onChange={(event) => setPayDraftAccountId(event.target.value)}
                            className="h-6 w-full rounded-none border border-border bg-background px-1.5 text-[11px] outline-none focus:border-[#00a09d]"
                            aria-label="Payment account"
                          >
                            {paymentAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
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
                            <p className="ml-auto shrink-0 tabular-nums font-medium">
                              {formatCurrency(entry.amount)}
                            </p>
                            {confirmDeletePaymentId === entry.id ? (
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
                          <button
                            type="button"
                            className={cn(AGAIN_DRAWER_ACTION_BTN, "h-7 px-3 text-[11px]")}
                            onClick={() => setLinesTab("lines")}
                          >
                            Go to Order Lines to receive
                          </button>
                        ) : order.status === "completed" ? (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">Fully Received</p>
                        ) : null}
                        {purchaseOrderIsReturnable(order) ? (
                          <button
                            type="button"
                            className={cn(AGAIN_DRAWER_ACTION_BTN, "h-7 px-3 text-[11px]")}
                            onClick={() => {
                              onOpenChange(false);
                              router.push(`${purchasePaths.returns}?order=${encodeURIComponent(order.id)}`);
                            }}
                          >
                            Return
                          </button>
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
              ) : linesTab === "others" ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Info</label>
                  <div className="flex min-h-9 items-center gap-2 rounded-none border border-input bg-muted/40 px-3 py-1.5">
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
                </div>
              ) : null}
            </AgainFormNotebook>
          </div>
        </div>

        <div className="relative z-20 shrink-0 border-t border-border bg-background">
          <div className="flex items-center justify-between gap-3 px-4 py-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
              <button
                type="button"
                className={LINK}
                onClick={() => {
                  setLinesTab("lines");
                  addProductLine();
                }}
              >
                + Product
              </button>
              <button
                type="button"
                className={LINK}
                onClick={() => {
                  setLinesTab("lines");
                  setLines((rows) => [...rows, newMetaLine("section")]);
                }}
              >
                + Section
              </button>
              <button
                type="button"
                className={LINK}
                onClick={() => {
                  setLinesTab("lines");
                  setLines((rows) => [...rows, newMetaLine("note")]);
                }}
              >
                + Note
              </button>
              <button
                type="button"
                className={LINK}
                onClick={() => {
                  setLinesTab("lines");
                  setLines((rows) => [...rows, newServiceLine()]);
                }}
              >
                + Service
              </button>
            </div>
            <div className="relative z-10 flex shrink-0 items-end gap-2">
              {totalsMinimized ? (
                <div className="relative min-w-[168px] border border-border bg-background px-2.5 pb-2 pt-6 text-[12px] shadow-sm">
                  <button
                    type="button"
                    className="absolute left-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-none border border-border/80 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                  {amountPaid > 0 ? (
                    <div className="mt-0.5 flex items-center justify-between gap-4 text-muted-foreground">
                      <span>Due</span>
                      <span className="tabular-nums font-medium text-foreground">
                        {formatCurrency(dueBalance)}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="invisible min-w-[200px]" aria-hidden>
                  <div className="h-8" />
                </div>
              )}
            </div>
          </div>

          {!totalsMinimized ? (
            <div className="absolute bottom-2 right-4 z-30 w-[min(100%,260px)] border border-border bg-background shadow-md dark:bg-background sm:right-6">
              <button
                type="button"
                className="absolute left-1.5 top-1.5 z-10 inline-flex h-5 w-5 items-center justify-center rounded-none border border-border/80 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Minimize totals"
                title="Minimize totals"
                onClick={() => setTotalsMinimized(true)}
              >
                <Minus className="h-3 w-3" />
              </button>
              <div className="space-y-1.5 px-3 pb-2.5 pt-7 text-[12px]">
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
                      {formatCurrency(totals.discount)}
                    </span>
                  </div>
                ) : null}
                {companyTaxEnabled && totals.tax > 0 ? (
                  <div className="flex items-center justify-between gap-4 text-muted-foreground">
                    <span>Tax</span>
                    <span className="tabular-nums text-foreground">
                      {formatCurrency(totals.tax)}
                    </span>
                  </div>
                ) : null}
                {amountPaid > 0 ? (
                  <div className="flex items-center justify-between gap-4 text-muted-foreground">
                    <span>Paid</span>
                    <span className="tabular-nums text-foreground">
                      {formatCurrency(amountPaid)}
                    </span>
                  </div>
                ) : null}
                {amountPaid > 0 ? (
                  <div className="flex items-center justify-between gap-4 text-muted-foreground">
                    <span>Due</span>
                    <span className="tabular-nums text-foreground">
                      {formatCurrency(dueBalance)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-4 border-t border-border pt-1.5 text-[13px] font-semibold text-foreground">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(totals.total)}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        </>
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
        serialTarget ? Number.parseInt(receiveByLine[serialTarget.key]?.qty ?? "0", 10) || 0 : 0
      }
      value={serialTarget ? (receiveByLine[serialTarget.key]?.serials ?? []) : []}
      onSave={(serials) => {
        if (!serialTarget) return;
        patchReceive(serialTarget.key, { serials });
      }}
    />
    </>
  );
}
