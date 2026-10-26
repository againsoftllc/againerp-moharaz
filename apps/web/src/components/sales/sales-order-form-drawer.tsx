"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { FilterSelect } from "@/components/shared/filter-select";
import { AGAIN_FORM_TITLE_CLASS, AgainFormField, AgainFormGroupTitle } from "@/components/again/again-form-sheet";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import { useWarehouseAccess } from "@/lib/auth/warehouse-access";
import { LineSerialsDrawer } from "@/components/sales/line-serials-drawer";
import { createPortal } from "react-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDot,
  CloudUpload,
  Copy,
  FileText,
  GripVertical,
  Lock,
  Menu,
  MoreHorizontal,
  Eraser,
  ExternalLink,
  Plus,
  Minus,
  Printer,
  Settings,
  Settings2,
  Trash2,
  User,
  X,
  Percent,
} from "lucide-react";
import { toast } from "sonner";
import {
  defaultAiInsights,
  normalizeOrder,
  ORDER_STATUS_LABELS,
  type Order,
  type OrderLine,
  type OrderStatus,
} from "@/lib/mock-data/orders";
import { useCommerceCustomers } from "@/lib/api/use-commerce-customers";
import {
  apiCustomerToCustomer,
  buildCustomerQuery,
  type ApiCustomerListResponse,
  type CustomerListRow,
} from "@/lib/api/commerce-customers";
import { apiFetch, getApiBaseUrl } from "@/lib/api/client";
import { fetchCatalogProductDetail } from "@/lib/api/catalog-products";
import type { ProductDetail } from "@/lib/api/catalog-products";
import type { SalesRecordMeta } from "@/lib/api/sales";
import {
  apiSalesOrderToOrder,
  fetchSalesOrder,
  createSalesOrderPathaoConsignment,
  fetchCustomerDueList,
  issueSalesInvoice,
  orderOutstandingDue,
  stripPaymentMeta,
  type CustomerDueRow,
} from "@/lib/api/sales";
import type { Product } from "@/lib/mock-data/products";
import { InventoryProductQuickAdd } from "@/components/inventory/inventory-product-quick-add";
import { ProductSearchAdd } from "@/components/products/product-search-add";
import {
  SalesVariantPicker,
  type PickerVariant,
  type PickerVariantOption,
  type VariantPickResult,
} from "@/components/sales/sales-variant-picker";
import { AgainPartnerDrawer } from "@/components/shared/again-partner-drawer";
import { FieldHelpTip } from "@/components/sales/field-help-tip";
import { parsePayTerm, formatPayTerm } from "@/components/customers/partner-form-sheet";
import { useMentionableUsers } from "@/lib/api/use-mentionable-users";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { clearDraft, draftAgeLabel, readDraft, writeDraft } from "@/lib/hooks/use-drawer-draft";
import { createSalesReturn, fetchSalesReturns, type ApiSalesReturn } from "@/lib/api/sales-returns";
import type { SalesReturnReason } from "@/lib/sales/sales-returns";
import {
  fetchCollabFiles,
  uploadCollabFile,
  deleteCollabFile,
  type CollabFile,
} from "@/lib/api/collaboration";
import {
  INVOICE_SCHEME_LABELS,
  SHIPPING_STATUS_LABELS,
} from "@/lib/mock-data/orders";
import {
  LINE_ACTION_COL_WIDTH,
  LINE_TABLE_ACTION_HEAD_CLASS,
  LineTableHeaderCell,
  useLineTableLayout,
} from "@/components/sales/sales-order-line-table-layout";
import {
  lineCellClassName,
  LineActionCell,
  LineNumericInput,
  renderSalesOrderLineCell,
} from "@/components/sales/sales-order-line-row-cells";
import {
  buildCustomerAddressOptions,
  getCustomerPrimaryContact,
  makePartnerAddress,
  matchAddressOptionId,
  type PartnerAddress,
  type SalesAddressOption,
} from "@/lib/sales/sales-partner-address";
import { SalesOrderPrintDocument } from "@/components/sales/sales-order-print-document";
import { InvoiceLayoutPreviewDocument } from "@/components/workspace/invoice-layout-preview";
import {
  buildSalesPrintPayload,
  salesPrintPath,
  storeSalesPrintPayload,
  type SalesPrintPayload,
} from "@/lib/sales/sales-print";
import { attachSalesInvoicePrint } from "@/lib/sales/sales-invoice-print";
import { attachSalesPackingPrint, type SalesPackingDocumentKind } from "@/lib/sales/sales-packing-print";
import { fetchWorkspaceCompany } from "@/lib/api/workspace-company";
import { fetchPaymentAccounts, type ApiFinancePaymentAccount } from "@/lib/api/finance";
import { companyTaxRatePct, companyTaxesEnabled } from "@/lib/api/workspace-company";
import {
  calculateDropshipShipping,
  type DropshipShippingMethod,
} from "@/lib/sales/dropship-shipping-calc";
import { buildMinimalPartnerFromSales, resolvePartnerForDrawer } from "@/lib/mock-data/partner-drawer-seed";
import type { Customer } from "@/lib/mock-data/customers";
import { detectCustomerCreateDraft } from "@/lib/sales/detect-customer-create-draft";
import type { CustomerCreateDraft } from "@/lib/sales/detect-customer-create-draft";
import { useSalesFeatureFlags } from "@/lib/sales/use-sales-settings";
import { fetchProductSales, fetchProductStockLevels, type ProductSalesLine } from "@/lib/api/product-history";
import type { ApiStockLevel } from "@/lib/api/inventory";
import { cn, formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { zonedTodayIso } from "@/lib/localisation/company-format";
import { getCompanyFormat } from "@/lib/store/company-format-store";
import { useAdminCanWrite, useAdminIsAdmin } from "@/lib/hooks/use-admin-can-write";
import { requestSalesOrderEdit, reviewSalesOrderEditRequest, setWebsiteOrderStatus } from "@/lib/api/sales";
import { getCommerceCustomer } from "@/lib/api/commerce-customers";
import { fetchInventorySettings } from "@/lib/api/inventory-settings";
import { lookupSerial, SERIAL_STATUS_LABEL, type SerialStatus } from "@/lib/api/inventory-serials";
import type { ScanProductHit } from "@/lib/api/product-scan";
import { Button } from "@/components/ui/button";
import { AgainFormNotebook } from "@/components/again/again-form-sheet-layout";
import {
  AGAIN_DRAWER_ACTION_BTN,
  AGAIN_DRAWER_CONTENT_CLASS,
  AGAIN_DRAWER_PRIMARY_BTN,
  AGAIN_DRAWER_PRIMARY_COLOR,
  AGAIN_DRAWER_SALES_SHEET_CLASS,
  AgainDrawerButton,
  AgainDrawerControlBar,
  AgainDrawerScrollBody,
  DrawerResizeHandle,
  useDrawerResize,
} from "@/components/again/again-drawer";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// loaded when the eye on a line is first used: the product drawer brings its tabs and grids with it
const ProductDrawer = dynamic(
  () => import("@/components/products/product-drawer/product-drawer").then((module) => module.ProductDrawer),
  { ssr: false },
);

/** create = new record; edit = open existing (always editable when user can write — no separate view). */
export type SalesOrderFormMode = "create" | "edit";

type Props = {
  open: boolean;
  mode: SalesOrderFormMode;
  order: Order | null;
  /** All sales records — used to sum this customer’s previous outstanding due. */
  orders?: Order[];
  onOpenChange: (open: boolean) => void;
  onSave: (order: Order) => void;
  onSaveAction?: (
    order: Order,
    action: "save" | "confirm" | "cancel" | "duplicate" | "delete",
  ) => Promise<Order>;
  onSaved?: (order: Order) => void;
  /** Stack above another drawer (e.g. customer partner sheet). */
  nested?: boolean;
  /** Default record type for a brand-new record (create mode only). User can still switch it in the header. Defaults to "quotation" for back-compat. */
  initialKind?: "order" | "quotation";
};

type FormLine = {
  id: string;
  kind: "product" | "section" | "note";
  itemId: string;
  name: string;
  sku: string;
  imageUrl: string;
  variant: string;
  description: string;
  leadTime: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  discountType: "percent" | "fixed";
  tax: number;
  taxRate: number;
  /** Serial-tracked products: one entry per unit sold. */
  serialNumbers?: string[];
};

type FormLineGroup = {
  key: string;
  name: string;
  itemId: string;
  totalQty: number;
  totalAmount: number;
  lines: FormLine[];
  /** True when more than one line, or any line carries a variant label. */
  grouped: boolean;
};

/** Absolute CDN urls pass through; relative /uploads paths resolve to the API. */
function resolveVariantImage(url: string | null | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${getApiBaseUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
}

function parseVariantOptions(raw: string | null | undefined): PickerVariantOption[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const out: PickerVariantOption[] = [];
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const name = String(rec.name ?? "").trim();
      const value = String(rec.value ?? "").trim();
      if (!name || !value) continue;
      const img = rec.img_url ?? rec.image_url;
      out.push({
        name,
        value,
        imageUrl: typeof img === "string" && img ? resolveVariantImage(img) : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function toPickerVariants(detail: ProductDetail): PickerVariant[] {
  return (detail.variants || []).map((v) => ({
    id: v.id,
    sku: v.sku,
    name: v.name,
    price: parseFloat(v.price) || 0,
    stock: Number(v.stock || 0),
    imageUrl: v.image_url ? resolveVariantImage(v.image_url) : null,
    options: parseVariantOptions(v.options_json),
  }));
}

type VariantPickerState = {
  lineId: string;
  productName: string;
  productImageUrl: string | null;
  variants: PickerVariant[];
};

function groupFormLines(lines: FormLine[]): FormLineGroup[] {
  const groups = new Map<string, FormLineGroup>();
  for (const line of lines) {
    if (line.kind === "section" || line.kind === "note") {
      groups.set(line.id, {
        key: line.id,
        name: line.name || (line.kind === "section" ? "Section" : "Note"),
        itemId: "",
        totalQty: 0,
        totalAmount: 0,
        lines: [line],
        grouped: false,
      });
      continue;
    }
    const key = line.itemId || line.name || line.id;
    const disc = lineDiscountAmount(
      line.quantity,
      line.unitPrice,
      line.discount,
      line.discountType,
    );
    const amount = Math.max(0, line.quantity * line.unitPrice - disc);
    const existing = groups.get(key);
    if (existing) {
      existing.lines.push(line);
      existing.totalQty += line.quantity;
      existing.totalAmount += amount;
    } else {
      groups.set(key, {
        key,
        name: line.name || "Product",
        itemId: line.itemId,
        totalQty: line.quantity,
        totalAmount: amount,
        lines: [line],
        grouped: false,
      });
    }
  }
  return Array.from(groups.values()).map((g) => ({
    ...g,
    grouped:
      g.lines[0]?.kind === "product" &&
      (g.lines.length > 1 || g.lines.some((l) => Boolean(l.variant?.trim()))),
  }));
}

const LINE_COLUMN_KEYS = [
  "variant",
  "product",
  "description",
  "quantity",
  "unitPrice",
  "discount",
  "amount",
  "leadTime",
  "taxes",
  "taxIncl",
] as const;
type LineColumnKey = (typeof LINE_COLUMN_KEYS)[number];

const LINE_COLUMN_LABELS: Record<LineColumnKey, string> = {
  variant: "Product Variant",
  product: "Product",
  description: "Description",
  quantity: "Quantity",
  unitPrice: "Unit Price",
  discount: "Disc",
  amount: "Amount",
  leadTime: "Lead Time",
  taxes: "Taxes",
  taxIncl: "Tax Incl.",
};

const DEFAULT_LINE_COLUMNS: Record<LineColumnKey, boolean> = {
  variant: false,
  product: true,
  description: false,
  quantity: true,
  unitPrice: true,
  discount: true,
  amount: true,
  leadTime: false,
  taxes: false,
  taxIncl: false,
};

type FormPaymentEntry = {
  id: string;
  method: string;
  amount: number;
  status: "completed" | "pending" | "failed";
  at: string;
  note?: string;
  accountId?: string;
  accountName?: string;
  /** "refund" = money paid back out to the customer (e.g. for a sales return). */
  kind?: "payment" | "refund";
};

type FormExpenseEntry = {
  id: string;
  title: string;
  amount: number;
};

type FormState = {
  orderNumber: string;
  /** Only meaningful while orderNumber === "New" — which document type Save will create. */
  recordKind: "order" | "quotation";
  status: OrderStatus;
  /** The header Order Status pick on a record not yet confirmed: "" = whatever Save does by default. */
  confirmChoice: "" | "draft" | "confirmed";
  /** Order details box — explicit date/warehouse; falls back to deliveryDate/default warehouse when unset. */
  orderDate: string;
  warehouseId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  invoiceAddress: PartnerAddress;
  deliveryAddress: PartnerAddress;
  invoiceAddressId: string;
  deliveryAddressId: string;
  expiration: string;
  paymentTerms: string;
  deliveryDate: string;
  notes: string;
  lines: FormLine[];
  /** Other Info */
  salesperson: string;
  salesTeam: string;
  onlineSignature: boolean;
  onlinePayment: boolean;
  customerReference: string;
  tags: string;
  fiscalPosition: string;
  /** Allowed / used payment methods for this order (multi-select). */
  paymentMethods: string[];
  /** Recorded payments shown on the Payment tab. */
  paymentHistory: FormPaymentEntry[];
  incoterm: string;
  incotermLocation: string;
  shippingMethod: DropshipShippingMethod;
  shippingWeight: string;
  /** Selected carrier / shipping line id. */
  shippingLineId: string;
  shippingNote: string;
  /** Order-level extras shown in sticky totals (`null` = row hidden). */
  orderDiscount: number | null;
  /** How `orderDiscount` is interpreted. Default fixed money amount. */
  orderDiscountType: "fixed" | "percent";
  orderShippingCharge: number | null;
  /** Repeatable order-level extra charges (freight surcharge, packing fee, etc). */
  additionalExpenses: FormExpenseEntry[];
  orderPayment: number | null;
  sourceDocument: string;
  campaign: string;
  medium: string;
  trackingSource: string;
  /** AgainPOS-style document stage — distinct from the fulfillment `status` above. */
  saleStage: NonNullable<Order["saleStage"]>;
  invoiceScheme: NonNullable<Order["invoiceScheme"]>;
  shippingStatus: NonNullable<Order["shippingStatus"]>;
  deliveredTo: string;
  deliveryPersonId: string;
  /** Set once a real courier consignment (Pathao) has been booked. Read-only in the UI. */
  courier: string;
  trackingNumber: string;
  trackingUrl: string;
};

const PAYMENT_METHOD_OPTIONS = [
  "Cash",
  "Manual Payment (Bank)",
  "bKash",
  "Nagad",
  "COD",
  "Card",
] as const;

function normalizeSalesPaymentMethod(raw: string | null | undefined): string {
  const value = (raw || "").trim();
  if (!value) return "Cash";
  const key = value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    cod: "COD",
    "cash on delivery": "COD",
    cashondelivery: "COD",
    bkash: "bKash",
    "b kash": "bKash",
    nagad: "Nagad",
    card: "Card",
    "card / sslcommerz": "Card",
    sslcommerz: "Card",
    stripe: "Card",
    paypal: "Card",
    bank: "Manual Payment (Bank)",
    "bank transfer": "Manual Payment (Bank)",
    "manual payment (bank)": "Manual Payment (Bank)",
    manual: "Manual Payment (Bank)",
    cash: "Cash",
  };
  if (aliases[key]) return aliases[key];
  if (PAYMENT_METHOD_OPTIONS.includes(value as (typeof PAYMENT_METHOD_OPTIONS)[number])) {
    return value;
  }
  return value;
}

/** Matches sales.ts's PAYMENT_META_RE — kept in sync so editing the visible Note never drops it. */
const PAYMENT_META_MARKER_RE = /<!--againerp:payment-->[\s\S]*?<!--\/againerp:payment-->/;

const DRAFT_KEY = "sales-order";
type SalesOrderDraftPayload = { form: FormState; scrollTop?: number };

const SHIPPING_LINE_OPTIONS = [
  {
    id: "air",
    label: "By Air",
    eta: "7–12 days",
    method: "air" as DropshipShippingMethod,
    usesEstimate: true,
  },
  {
    id: "sea",
    label: "By Sea",
    eta: "25–40 days",
    method: "sea" as DropshipShippingMethod,
    usesEstimate: true,
  },
  {
    id: "pathao",
    label: "Pathao",
    eta: "1–2 days",
    method: "air" as DropshipShippingMethod,
    usesEstimate: false,
  },
  {
    id: "steadfast",
    label: "Steadfast",
    eta: "1–3 days",
    method: "air" as DropshipShippingMethod,
    usesEstimate: false,
  },
  {
    id: "redx",
    label: "RedX",
    eta: "1–3 days",
    method: "air" as DropshipShippingMethod,
    usesEstimate: false,
  },
  {
    id: "sundarban",
    label: "Sundarban",
    eta: "2–5 days",
    method: "air" as DropshipShippingMethod,
    usesEstimate: false,
  },
  {
    id: "pickup",
    label: "Store pickup",
    eta: "Same day",
    method: "air" as DropshipShippingMethod,
    usesEstimate: false,
  },
] as const;

const OTHER_INFO_DEFAULTS = {
  salesperson: "admin@againerp.local",
  salesTeam: "Sales",
  onlineSignature: true,
  onlinePayment: false,
  customerReference: "",
  tags: "",
  fiscalPosition: "National",
  paymentMethods: ["Cash"] as string[],
  paymentHistory: [] as FormPaymentEntry[],
  incoterm: "[CFR] COST AND FREIGHT",
  incotermLocation: "",
  shippingMethod: "air" as DropshipShippingMethod,
  shippingWeight: "",
  shippingLineId: "pickup",
  shippingNote: "",
  orderDiscount: null as number | null,
  orderDiscountType: "fixed" as "fixed" | "percent",
  orderShippingCharge: null as number | null,
  additionalExpenses: [] as FormExpenseEntry[],
  orderPayment: null as number | null,
  sourceDocument: "",
  campaign: "",
  medium: "",
  trackingSource: "",
  saleStage: "final" as NonNullable<Order["saleStage"]>,
  invoiceScheme: "standard" as NonNullable<Order["invoiceScheme"]>,
  shippingStatus: "ordered" as NonNullable<Order["shippingStatus"]>,
  deliveredTo: "",
  deliveryPersonId: "",
  courier: "",
  trackingNumber: "",
  trackingUrl: "",
};

const STATUS_STAGES = ["quotation", "quotation_sent", "sales_order"] as const;
type StatusStage = (typeof STATUS_STAGES)[number];

/** the statuses of a website order, as the shopper's account words them */
const WEBSITE_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  returned: "Returned",
  refunded: "Refunded",
};

const ORDER_STATUS_OPTIONS = (Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map(
  (status) => ({
    id: status,
    primary: ORDER_STATUS_LABELS[status],
  }),
);

type SalesProductOption = {
  id: string;
  name: string;
  sku: string;
  price: number;
  description: string;
  imageUrl?: string;
  barcode?: string | null;
  itemId?: string;
  /** Catalog product id (distinct from the item id) — used to fetch variants. */
  catalogProductId?: string;
  /** Real per-unit weight from the product's Weight field, in kg. Absent when not set. */
  weightKg?: number;
  purchasePrice?: number;
  stock?: number;
  trackQuantity?: boolean;
  trackSerial?: boolean;
  /** For the product search bar's Brand / Category filter. */
  brand?: string;
  category?: string;
};

/** Product "Weight" is free text (e.g. "1.5 kg"); pull the first number and treat it as kg. */
function parseProductWeightKg(raw: string | null | undefined): number | undefined {
  const match = (raw ?? "").match(/[\d.]+/);
  if (!match) return undefined;
  const value = parseFloat(match[0]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function mapItemsToSalesProducts(
  items: { id: string; sku: string; name: string; barcode?: string | null }[],
  products: {
    id: string;
    item_id?: string | null;
    price: string;
    purchase_price?: string | null;
    stock?: number | null;
    track_quantity?: boolean | null;
    track_serial?: boolean | null;
    thumbnail?: string | null;
    weight?: string | null;
    brand?: string | null;
    category?: string | null;
  }[],
): SalesProductOption[] {
  const brandByItem = new Map<string, string>();
  const categoryByItem = new Map<string, string>();
  const priceByItem = new Map<string, number>();
  const imageByItem = new Map<string, string>();
  const productIdByItem = new Map<string, string>();
  const weightByItem = new Map<string, number>();
  const costByItem = new Map<string, number>();
  const stockByItem = new Map<string, number>();
  const trackByItem = new Map<string, boolean>();
  const serialByItem = new Map<string, boolean>();
  for (const product of products) {
    if (product.item_id) {
      priceByItem.set(product.item_id, parseFloat(product.price) || 0);
      if (product.thumbnail) imageByItem.set(product.item_id, product.thumbnail);
      productIdByItem.set(product.item_id, product.id);
      const weightKg = parseProductWeightKg(product.weight);
      if (weightKg != null) weightByItem.set(product.item_id, weightKg);
      const cost = product.purchase_price != null ? parseFloat(product.purchase_price) : NaN;
      if (Number.isFinite(cost)) costByItem.set(product.item_id, cost);
      if (typeof product.stock === "number") stockByItem.set(product.item_id, product.stock);
      trackByItem.set(product.item_id, product.track_quantity ?? true);
      serialByItem.set(product.item_id, product.track_serial === true);
      if (product.brand) brandByItem.set(product.item_id, product.brand);
      if (product.category) categoryByItem.set(product.item_id, product.category);
    }
  }
  return items.map((item) => ({
    id: item.id,
    itemId: item.id,
    name: item.name,
    sku: item.sku,
    barcode: item.barcode ?? null,
    price: priceByItem.get(item.id) ?? 0,
    description: item.name,
    imageUrl: imageByItem.get(item.id),
    catalogProductId: productIdByItem.get(item.id),
    weightKg: weightByItem.get(item.id),
    purchasePrice: costByItem.get(item.id),
    stock: stockByItem.get(item.id),
    trackQuantity: trackByItem.get(item.id),
    trackSerial: serialByItem.get(item.id),
    brand: brandByItem.get(item.id),
    category: categoryByItem.get(item.id),
  }));
}

/** "sold", "in service" … for messages about a serial that cannot be sold. */
function serialStatusPhrase(status: string | null | undefined): string {
  const label = SERIAL_STATUS_LABEL[status as SerialStatus];
  return label ? label.toLowerCase() : status || "unavailable";
}

/** Chips + "Scan or type serial…" input under a serial-tracked product line. */
function LineSerialRow({
  serials,
  quantity,
  readOnly,
  compact,
  onAdd,
  onRemove,
  onPick,
}: {
  serials: string[];
  quantity: number;
  readOnly: boolean;
  compact?: boolean;
  /** Resolves to an error message, or null once the serial is on the line. */
  onAdd: (serial: string) => Promise<string | null>;
  onRemove: (serial: string) => void;
  /** Opens the serials in stock at the order's location to pick from. */
  onPick?: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const serial = value.trim();
    if (!serial || busy) return;
    setBusy(true);
    try {
      const problem = await onAdd(serial);
      setError(problem);
      if (!problem) setValue("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("mt-1 space-y-0.5", compact && "pl-2")} data-testid="line-serials">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          S/N
        </span>
        {serials.map((serial) => (
          <span
            key={serial}
            className="inline-flex items-center gap-0.5 border border-border bg-muted/40 px-1 font-mono text-[10px] leading-4 text-foreground"
          >
            {serial}
            {!readOnly ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remove serial ${serial}`}
                onClick={() => onRemove(serial)}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            ) : null}
          </span>
        ))}
        {!readOnly ? (
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              e.stopPropagation();
              void submit();
            }}
            placeholder="Scan or type serial…"
            aria-label="Add serial number"
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
            className="h-5 w-[150px] min-w-0 border-b border-border/50 bg-transparent px-1 font-mono text-[11px] outline-none placeholder:font-sans placeholder:text-muted-foreground/70 focus:border-[#00a09d] disabled:opacity-60"
          />
        ) : null}
        {onPick && !readOnly ? (
          <button
            type="button"
            onClick={onPick}
            title="Pick serials from stock"
            className={cn(
              "text-[10px] tabular-nums underline-offset-2 hover:underline",
              serials.length !== quantity ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {serials.length !== quantity
              ? `${serials.length} / ${quantity} serials`
              : `${serials.length} serial${serials.length === 1 ? "" : "s"}`}
          </button>
        ) : serials.length !== quantity ? (
          <span className="text-[10px] tabular-nums text-amber-600 dark:text-amber-400">
            {serials.length} / {quantity} serials
          </span>
        ) : null}
      </div>
      {error ? <p className="text-[10px] text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}

const DEFAULT_TAX_RATE = 0;
/** Applied only after the user clicks Add taxes (Sales Settings › Taxes must be on). */
const ORDER_TAX_RATE = 5;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function lineDiscountAmount(
  quantity: number,
  unitPrice: number,
  discount: number,
  discountType: "percent" | "fixed" = "fixed",
): number {
  const gross = Math.max(0, quantity * unitPrice);
  const raw = Math.max(0, discount || 0);
  if (discountType === "percent") {
    return roundMoney(gross * (Math.min(100, raw) / 100));
  }
  return roundMoney(Math.min(gross, raw));
}

function calcLineTax(
  quantity: number,
  unitPrice: number,
  taxRate = DEFAULT_TAX_RATE,
  discountAmt = 0,
): number {
  if (!taxRate || taxRate <= 0) return 0;
  const base = Math.max(0, quantity * unitPrice - discountAmt);
  return roundMoney(base * (taxRate / 100));
}

function taxForLine(line: {
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discount: number;
  discountType: "percent" | "fixed";
}): number {
  return calcLineTax(
    line.quantity,
    line.unitPrice,
    line.taxRate,
    lineDiscountAmount(line.quantity, line.unitPrice, line.discount, line.discountType),
  );
}

type SalesCustomerOption = {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  invoiceAddress: PartnerAddress;
  deliveryAddress: PartnerAddress;
};

/** Matches POS seed (`DEFAULT_WALK_IN_CUSTOMER_CODE`). */
const WALK_IN_CUSTOMER_CODE = "WALK-IN";
const WALK_IN_CUSTOMER_NAME = "Walk-in Customer";

function isWalkInCustomer(c: { id: string; name: string; customerId?: string }): boolean {
  return (
    c.customerId === WALK_IN_CUSTOMER_CODE ||
    c.id === "cust_walk_in" ||
    c.name.trim().toLowerCase() === WALK_IN_CUSTOMER_NAME.toLowerCase()
  );
}

function makeAddress(
  street: string,
  city: string,
  state = city,
  zip = "1207",
  country = "Bangladesh",
  street2?: string,
): PartnerAddress {
  return makePartnerAddress(street, city, state, zip, country, street2);
}

const WALK_IN_SALES_CUSTOMER: SalesCustomerOption = {
  id: "cust_walk_in",
  name: WALK_IN_CUSTOMER_NAME,
  email: "walkin@againerp.local",
  phone: "",
  city: "Dhaka",
  invoiceAddress: makeAddress("", "Dhaka", "Dhaka", ""),
  deliveryAddress: makeAddress("", "Dhaka", "Dhaka", ""),
};


const LINK =
  "text-[13px] font-normal text-[#00a09d] hover:text-[#00c4bf] hover:underline";

/** Toolbar action buttons while a save is in flight (primary btn already has disabled:opacity-50). */
const TOOLBAR_DISABLED = "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-muted/50";

/** Once an order reaches one of these, completed payments/refunds are posted to
 * Finance on save — deleting the entry would leave the ledger out of sync. */
const LEDGER_POSTED_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "delivered",
  "completed",
]);

/** The header field rows (Order Date … Order Status): a label column wide enough that "Business Location" stays on one line. */
const SALES_HEADER_ROW_CLASS = "grid-cols-[9rem_minmax(0,1fr)]";

const SALES_STATUS_TONE: Partial<Record<OrderStatus, string>> = {
  draft: "border-border bg-muted text-muted-foreground",
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  confirmed: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  processing: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  packed: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  shipped: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  delivered: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  failed: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  returned: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  refunded: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

function statusToStage(status: OrderStatus): StatusStage {
  if (status === "draft") return "quotation";
  if (status === "pending") return "quotation_sent";
  return "sales_order";
}

const STAGE_STEPS: { id: StatusStage; label: string }[] = [
  { id: "quotation", label: "Quotation" },
  { id: "quotation_sent", label: "Quotation Sent" },
  { id: "sales_order", label: "Sales Order" },
];

/** Odoo's status bar: Quotation > Quotation Sent > Sales Order, the current step filled; a closed order (cancelled, returned,
 * refunded, failed) shows its state instead. Hidden on narrow drawers. */
function SalesStatusSteps({ stage, status }: { stage: StatusStage; status: OrderStatus }) {
  const closed = status === "cancelled" || status === "returned" || status === "refunded" || status === "failed";
  if (closed) {
    return (
      <span className="hidden h-6 items-center bg-muted px-2 text-[11px] font-medium capitalize text-muted-foreground lg:inline-flex">{status}</span>
    );
  }
  return (
    <div className="hidden items-center text-[11px] lg:flex" aria-label="Order stage">
      {STAGE_STEPS.map((step, i) => (
        <div key={step.id} className="flex items-center">
          {i > 0 ? <span className="px-1 text-muted-foreground">›</span> : null}
          <span className={cn("px-2 py-0.5", step.id === stage ? "bg-[#00a09d] font-medium text-white" : "bg-muted text-muted-foreground")}>
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function localYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's calendar day in the company timezone — `toISOString()` would give
 * the UTC day, which is yesterday for a Dhaka user between midnight and 06:00. */
function todayIso(): string {
  return zonedTodayIso(getCompanyFormat());
}

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localYmd(d);
}

/** Again form date — e.g. Aug 3 */
function formatShortDate(iso: string) {
  if (!iso) return "";
  return formatDate(iso.slice(0, 10));
}

/** API activity timestamps are naive UTC (no offset); without a designator
 * `new Date()` reads them as local time, 6 h off in Asia/Dhaka. */
function apiTimestampToIso(value: string): string {
  const s = (value || "").trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(s) ? `${s}Z` : s;
}

function formatHistoryAt(iso: string) {
  if (!iso) return "—";
  const normalized = apiTimestampToIso(iso);
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDateTime(normalized);
}

/** Persisted-field view of the form for the "anything to save?" check. The
 * address option ids are UI selection state an effect fills in after load. */
function formSaveSignature(form: FormState): string {
  const rest: Partial<FormState> = { ...form };
  delete rest.invoiceAddressId;
  delete rest.deliveryAddressId;
  return JSON.stringify(rest);
}

function formatFullAddress(addr: PartnerAddress | null | undefined): string {
  if (!addr) return "";
  const seen = new Set<string>();
  return [addr.street, addr.street2, addr.city, addr.state, addr.zip, addr.country]
    .map((p) => (p || "").trim())
    // "Dhaka, Dhaka" (city and region the same) reads once
    .filter((p) => p && !seen.has(p.toLowerCase()) && !!seen.add(p.toLowerCase()))
    .join(", ");
}

/** `datetime-local` input value from an ISO string (local timezone). */
function toDatetimeLocalValue(iso: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO string from a `datetime-local` value. */
function fromDatetimeLocalValue(local: string): string {
  if (!local) return new Date().toISOString();
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function parseDeliveryDate(value: string): Date {
  if (!value) {
    const d = new Date();
    d.setHours(14, 0, 0, 0);
    return d;
  }
  if (value.includes("T")) return new Date(value);
  return new Date(`${value.slice(0, 10)}T14:00:00`);
}

function toLocalDateTimeIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

/** Field display — 07/04/2026 02:00:00 PM */
function formatDeliveryField(iso: string) {
  if (!iso) return "";
  const d = parseDeliveryDate(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(h)}:${pad(d.getMinutes())}:00 ${ampm}`;
}

/** Time input — 2:00pm */
function formatTimeInput(d: Date) {
  let h = d.getHours();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")}${ampm}`;
}

/** Every 15 minutes — 12:00am … 11:45pm */
const TIME_SLOTS_15 = Array.from({ length: 96 }, (_, i) => {
  const total = i * 15;
  const d = new Date(2000, 0, 1, Math.floor(total / 60), total % 60);
  return formatTimeInput(d);
});

function parseTimeInput(text: string, base: Date): Date {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return base;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = (m[3] || "").toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  const d = new Date(base);
  d.setHours(h, min, 0, 0);
  return d;
}

/** Nearest 15-minute slot label for highlight/scroll. */
function nearestTimeSlot(d: Date): string {
  const snapped = new Date(d);
  const mins = snapped.getMinutes();
  const rounded = Math.round(mins / 15) * 15;
  if (rounded === 60) {
    snapped.setHours(snapped.getHours() + 1, 0, 0, 0);
  } else {
    snapped.setMinutes(rounded, 0, 0);
  }
  return formatTimeInput(snapped);
}

function formatInputDate(iso: string) {
  if (!iso) return "";
  const [y, m, day] = iso.slice(0, 10).split("-");
  return `${m}/${day}/${y}`;
}

function orderToForm(order: Order): FormState {
  const orderDay = order.orderDate.slice(0, 10);
  return {
    orderNumber: order.orderNumber,
    recordKind:
      (order as Order & { kind?: "order" | "quotation" }).kind ??
      (order.orderNumber.startsWith("QUO-") ? "quotation" : "order"),
    status: order.status,
    confirmChoice: "",
    orderDate: orderDay,
    warehouseId: order.warehouseId ?? "",
    customerId: order.customer.id,
    customerName: order.customer.name,
    customerEmail: order.customer.email,
    customerPhone: order.customer.phone,
    // the placeholder city / postal code are for hand-entered orders; a website order carries what the shopper typed
    invoiceAddress: makeAddress(
      order.billing.address || "",
      order.billing.city || (order.billing.zip !== undefined ? "" : "Dhaka"),
      order.billing.region || order.billing.city || (order.billing.zip !== undefined ? "" : "Dhaka"),
      order.billing.zip ?? "1207",
      order.billing.country || "Bangladesh",
    ),
    deliveryAddress: makeAddress(
      order.shipping.address || "",
      order.shipping.city || (order.shipping.zip !== undefined ? "" : "Dhaka"),
      order.shipping.region || order.shipping.city || (order.shipping.zip !== undefined ? "" : "Dhaka"),
      order.shipping.zip ?? "1207",
      order.shipping.country || "Bangladesh",
    ),
    invoiceAddressId: "",
    deliveryAddressId: "",
    expiration: order.expiration?.slice(0, 10) ?? "",
    paymentTerms: order.paymentTerms || "Immediate",
    deliveryDate: `${addDays(orderDay, 7)}T14:00:00`,
    notes: order.notes ?? "",
    lines: order.items.map((li) => ({
      id: li.id,
      kind: li.displayType === "section" || li.displayType === "note" ? li.displayType : "product",
      itemId: li.productId || "",
      name: li.name,
      sku: li.sku ?? "—",
      imageUrl: li.imageUrl ?? "",
      variant: li.variant ?? "",
      description: "",
      leadTime: "",
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      discount: li.discount || 0,
      discountType: "fixed",
      tax: li.tax,
      taxRate: (() => {
        const net = Math.max(0, li.quantity * li.unitPrice - (li.discount || 0));
        return net > 0 ? (li.tax / net) * 100 : DEFAULT_TAX_RATE;
      })(),
      serialNumbers: li.serialNumbers?.length ? [...li.serialNumbers] : undefined,
    })),
    ...OTHER_INFO_DEFAULTS,
    salesperson: order.assignedStaff || OTHER_INFO_DEFAULTS.salesperson,
    tags: order.tags.join(", "),
    shippingLineId: (() => {
      const courier = (order.shipment?.courier || "").toLowerCase();
      const match = SHIPPING_LINE_OPTIONS.find(
        (o) => o.id === courier || o.label.toLowerCase() === courier,
      );
      return match?.id ?? (order.shippingAmount > 0 ? "pathao" : "pickup");
    })(),
    shippingNote: "",
    orderDiscount:
      order.orderDiscountValue != null
        ? order.orderDiscountValue
        : (() => {
            // Legacy orders saved before the header discount was persisted.
            const lineDisc = order.items.reduce((s, i) => s + (i.discount || 0), 0);
            const extra = (order.discountAmount || 0) - lineDisc;
            return extra > 0.009 ? extra : null;
          })(),
    orderDiscountType: order.orderDiscountType ?? "fixed",
    orderShippingCharge: order.shippingAmount > 0 ? order.shippingAmount : null,
    additionalExpenses: (order.additionalExpenses ?? []).map((e, idx) => ({
      id: e.id ?? `exp_${idx}`,
      title: e.title,
      amount: e.amount,
    })),
    orderPayment: order.payment.paidAmount > 0 ? order.payment.paidAmount : null,
    paymentMethods: (() => {
      const method = normalizeSalesPaymentMethod(order.payment.method);
      return [method];
    })(),
    paymentHistory: (order.paymentTimeline ?? []).map((evt) => ({
      id: evt.id,
      method: evt.method || normalizeSalesPaymentMethod(order.payment.method),
      amount: evt.amount,
      status: evt.status,
      at: evt.at,
      note: evt.label,
      accountName: evt.accountName,
      accountId: evt.accountId,
      kind: evt.kind ?? "payment",
    })),
    trackingSource: order.source ?? "",
    saleStage: order.saleStage ?? "final",
    invoiceScheme: order.invoiceScheme ?? "standard",
    shippingStatus: order.shippingStatus ?? "ordered",
    deliveredTo: order.deliveredTo ?? "",
    deliveryPersonId: order.deliveryPersonId ?? "",
    courier: order.courier ?? "",
    trackingNumber: order.trackingNumber ?? "",
    trackingUrl: order.trackingUrl ?? "",
  };
}

export function emptySalesOrderForm(
  initialKind: "order" | "quotation" = "quotation",
  /** A user limited to some warehouses starts in their default one. */
  warehouseId = "",
): FormState {
  const today = todayIso();
  return {
    orderNumber: "New",
    recordKind: initialKind,
    status: "draft",
    confirmChoice: "",
    orderDate: today,
    warehouseId,
    customerId: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    invoiceAddress: makeAddress("", ""),
    deliveryAddress: makeAddress("", ""),
    invoiceAddressId: "",
    deliveryAddressId: "",
    expiration: "",
    paymentTerms: "Immediate",
    deliveryDate: "",
    notes: "",
    lines: [],
    ...OTHER_INFO_DEFAULTS,
  };
}

/** Resolve sticky-totals discount to a money amount (fixed ৳ or % of untaxed). */
function resolveOrderDiscountAmount(
  value: number | null,
  type: "fixed" | "percent" | undefined,
  untaxedBase: number,
): number {
  if (value == null || value <= 0) return 0;
  if ((type ?? "fixed") === "percent") {
    const pct = Math.min(100, Math.max(0, value));
    return Math.max(0, Math.min(untaxedBase, (untaxedBase * pct) / 100));
  }
  return Math.max(0, value);
}

function formToOrder(
  form: FormState,
  existing: Order | null,
  returned: { subtotal: number; tax: number } = { subtotal: 0, tax: 0 },
): Order & Partial<SalesRecordMeta> {
  const lines: OrderLine[] = form.lines.map((li, idx) => {
    if (li.kind === "section" || li.kind === "note") {
      return {
        id: li.id || `${li.kind}_${idx}_${Date.now()}`,
        productId: "",
        name: li.name,
        sku: "",
        quantity: 0,
        unitPrice: 0,
        discount: 0,
        tax: 0,
        lineTotal: 0,
        displayType: li.kind,
      };
    }
    const disc = lineDiscountAmount(
      li.quantity,
      li.unitPrice,
      li.discount,
      li.discountType,
    );
    const net = Math.max(0, li.quantity * li.unitPrice - disc);
    const lineTotal = net + (li.tax || 0);
    return {
      id: li.id || `li_${idx}_${Date.now()}`,
      productId: li.itemId || existing?.items[idx]?.productId || "",
      name: li.name || "Product",
      sku: li.sku || existing?.items[idx]?.sku || "—",
      imageUrl: li.imageUrl || existing?.items[idx]?.imageUrl,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      discount: disc,
      tax: li.tax || 0,
      lineTotal,
      variant: li.variant || undefined,
      serialNumbers: li.serialNumbers?.length ? li.serialNumbers : undefined,
      displayType: "product",
    };
  });
  const productLines = lines.filter((l) => !l.displayType || l.displayType === "product");
  const subtotal = productLines.reduce(
    (s, l) => s + Math.max(0, l.quantity * l.unitPrice - (l.discount || 0)),
    0,
  );
  const taxAmount = productLines.reduce((s, l) => s + (l.tax || 0), 0);
  const lineDiscountTotal = productLines.reduce((s, l) => s + (l.discount || 0), 0);
  const orderLevelDiscount = resolveOrderDiscountAmount(
    form.orderDiscount,
    form.orderDiscountType,
    subtotal,
  );
  const discountAmount = lineDiscountTotal + orderLevelDiscount;
  // Mirror the totals footer's shipping fallback (form.orderShippingCharge ?? 0) exactly.
  // Falling back to the dropship shipping *estimate* here (as this used to do) silently
  // inflated the persisted grandTotal/dueAmount — and the payment-history "due" figure
  // packed into `notes` — by a phantom shipping charge the backend never stores as part
  // of `total` (backend total = subtotal + tax_total only; see sales_service.py).
  const shippingAmount = form.orderShippingCharge ?? 0;
  const additionalExpensesAmount = form.additionalExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const historyPaid = form.paymentHistory
    .filter((p) => p.status === "completed")
    .reduce((s, p) => s + (p.kind === "refund" ? -p.amount : p.amount), 0);
  const historyRefunded = form.paymentHistory
    .filter((p) => p.status === "completed" && p.kind === "refund")
    .reduce((s, p) => s + p.amount, 0);
  const paidAmount =
    form.orderPayment != null ? form.orderPayment : historyPaid;
  const netSubtotal = Math.max(0, subtotal - returned.subtotal);
  const netTaxAmount = Math.max(0, taxAmount - returned.tax);
  const grandTotal = Math.max(
    0,
    netSubtotal + netTaxAmount - orderLevelDiscount + shippingAmount + additionalExpensesAmount,
  );
  const isNewRecord = !existing || existing.orderNumber === "New";
  const id = existing?.id && !existing.id.startsWith("ord_") ? existing.id : `ord_${Date.now()}`;
  const orderNumber = isNewRecord ? "New" : form.orderNumber;
  const orderDate = form.orderDate || form.deliveryDate || todayIso();

  const existingMeta = existing as (Order & { kind?: "order" | "quotation" }) | null;
  const kind: "order" | "quotation" =
    existingMeta?.kind ??
    (form.orderNumber.startsWith("QUO-")
      ? "quotation"
      : !existing && form.orderNumber === "New"
        ? form.recordKind
        : "order");

  return {
    ...normalizeOrder({
    id,
    orderNumber,
    orderDate: `${orderDate}T12:00:00`,
    warehouseId: form.warehouseId || existing?.warehouseId,
    status: form.status,
    paymentStatus:
      paidAmount <= 0
        ? "unpaid"
        : Math.max(0, grandTotal - paidAmount) > 0
          ? "partial"
          : "paid",
    shipmentStatus: existing?.shipmentStatus ?? "unfulfilled",
    source: form.trackingSource || existing?.source || "Sales",
    branch: existing?.branch ?? "Dhaka HQ",
    assignedStaff: form.salesperson || existing?.assignedStaff,
    priority: existing?.priority ?? "normal",
    tags: form.tags
      ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : existing?.tags ?? [],
    customer: {
      id: form.customerId || existing?.customer.id || "c_new",
      name: form.customerName || "Customer",
      phone: form.customerPhone,
      email: form.customerEmail,
      group: existing?.customer.group ?? "Retail",
      lifetimeValue: existing?.customer.lifetimeValue ?? 0,
      orderCount: existing?.customer.orderCount ?? 0,
      riskScore: existing?.customer.riskScore ?? 20,
    },
    billing: {
      address: form.invoiceAddress.street,
      city: form.invoiceAddress.city || "Dhaka",
      region: form.invoiceAddress.state || "Dhaka",
      country: form.invoiceAddress.country || "Bangladesh",
    },
    shipping: {
      address: form.deliveryAddress.street || form.invoiceAddress.street,
      city: form.deliveryAddress.city || form.invoiceAddress.city || "Dhaka",
      region: form.deliveryAddress.state || form.invoiceAddress.state || "Dhaka",
      country: form.deliveryAddress.country || form.invoiceAddress.country || "Bangladesh",
    },
    payment: {
      method: form.paymentMethods[0] || existing?.payment.method || "COD",
      paidAmount,
      dueAmount: Math.max(0, grandTotal - paidAmount),
      refundAmount: historyRefunded,
    },
    shipment: {
      shippingCost: shippingAmount,
      courier:
        SHIPPING_LINE_OPTIONS.find((o) => o.id === form.shippingLineId)?.label ||
        existing?.shipment?.courier,
    },
    items: lines,
    subtotal,
    discountAmount,
    taxAmount,
    shippingAmount,
    grandTotal,
    orderDiscountValue: form.orderDiscount,
    orderDiscountType: form.orderDiscountType,
    additionalExpenses: form.additionalExpenses.map((e) => ({
      id: e.id,
      title: e.title,
      amount: e.amount,
    })),
    notes: form.notes,
    timeline: existing?.timeline ?? [],
    activities: existing?.activities ?? [],
    comments: existing?.comments ?? [],
    attachments: existing?.attachments ?? [],
    paymentTimeline: form.paymentHistory.map((p) => ({
      id: p.id,
      label: p.note || `${p.method} ${p.kind === "refund" ? "refund" : "payment"}`,
      amount: p.amount,
      status: p.status,
      at: p.at,
      method: p.method,
      accountName: p.accountName,
      accountId: p.accountId,
      kind: p.kind ?? "payment",
    })),
    followers: existing?.followers ?? [],
    aiRisk: existing?.aiRisk ?? "low",
    aiInsights: existing?.aiInsights ?? defaultAiInsights("low", 20),
    expiration: form.expiration || undefined,
    paymentTerms: form.paymentTerms,
    saleStage: form.saleStage,
    invoiceScheme: form.invoiceScheme,
    shippingStatus: form.shippingStatus,
    deliveredTo: form.deliveredTo || undefined,
    deliveryPersonId: form.deliveryPersonId || undefined,
    courier: form.courier || undefined,
    trackingNumber: form.trackingNumber || undefined,
    trackingUrl: form.trackingUrl || undefined,
    }),
    kind,
  };
}

/** AgainPOS "Shipping documents" — reuses the generic collaboration file
 * store, tagged "shipping_document" so it stays separate from any other
 * order attachments. Needs a saved order id, so it's disabled on brand-new,
 * unsaved records. */
function OrderDocumentsBox({
  orderId,
  readOnly,
  fileType,
  savePrompt,
  emptyText,
}: {
  orderId?: string;
  readOnly?: boolean;
  fileType: "document" | "shipping_document";
  savePrompt: string;
  emptyText: string;
}) {
  const [files, setFiles] = useState<CollabFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!orderId) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchCollabFiles("sales_order", orderId, fileType)
      .then((rows) => {
        if (!cancelled) setFiles(rows);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, fileType]);

  const upload = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file || !orderId) return;
    setUploading(true);
    try {
      const created = await uploadCollabFile("sales_order", orderId, file, fileType);
      setFiles((prev) => [created, ...prev]);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const remove = async (file: CollabFile) => {
    if (!orderId) return;
    try {
      await deleteCollabFile("sales_order", orderId, file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch {
      toast.error("Delete failed");
    }
  };

  return (
    <div className="space-y-2">
      {!orderId ? (
        <p className="text-[11px] text-muted-foreground">{savePrompt}</p>
      ) : (
        <>
          {!readOnly ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => void upload(e.target.files)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 rounded-none px-2 text-[11px]"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <CloudUpload className="mr-1 h-3.5 w-3.5" />
                {uploading ? "Uploading…" : "Attach document"}
              </Button>
            </div>
          ) : null}
          {loading ? (
            <p className="text-[11px] text-muted-foreground">Loading…</p>
          ) : files.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{emptyText}</p>
          ) : (
            <ul className="space-y-1">
              {files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-2 border border-border bg-background/50 px-2 py-1"
                >
                  <a
                    href={f.storage_ref}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-[12px] text-[#00a09d] hover:underline"
                  >
                    {f.filename}
                  </a>
                  {!readOnly ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 rounded-none p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => void remove(f)}
                      aria-label={`Delete ${f.filename}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function AvatarChip({ label }: { label: string }) {
  const initial = (label.trim()[0] || "A").toUpperCase();
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-[#714b67] text-[11px] font-semibold text-white">
      {initial}
    </span>
  );
}

function SortableOrderLineRow({
  id,
  readOnly,
  compact,
  children,
}: {
  id: string;
  readOnly?: boolean;
  compact?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: readOnly,
  });

  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "group border-b border-border/50",
        compact && "text-[11px] leading-tight",
        isDragging && "relative z-10 bg-muted/50 shadow-sm",
      )}
    >
      <td className={cn("w-4 p-0 text-muted-foreground", compact ? "py-1" : "py-1.5")}>
        {!readOnly ? (
          <button
            type="button"
            className="inline-flex touch-none"
            aria-label="Drag to reorder line"
            {...attributes}
            {...listeners}
          >
            <GripVertical
              className={cn(
                "cursor-grab opacity-50 group-hover:opacity-100 active:cursor-grabbing",
                "h-3.5 w-3.5",
              )}
            />
          </button>
        ) : null}
      </td>
      {children}
    </tr>
  );
}

function SearchDropdown({
  open,
  items,
  onSelect,
  onSearchMore,
  searchMoreLabel = "Search more...",
  onAddNew,
  addNewLabel = "Add a new product",
  renderItem,
  getAnchor,
  portalContainer,
  placement = "auto",
}: {
  open: boolean;
  items: {
    id: string;
    primary: string;
    secondary?: string;
    imageUrl?: string;
    phone?: string;
    email?: string;
    phoneVerified?: boolean;
    emailVerified?: boolean;
  }[];
  onSelect: (id: string) => void;
  onSearchMore?: () => void;
  searchMoreLabel?: string;
  onAddNew?: () => void;
  addNewLabel?: string;
  renderItem?: (item: {
    id: string;
    primary: string;
    secondary?: string;
    imageUrl?: string;
    phone?: string;
    email?: string;
    phoneVerified?: boolean;
    emailVerified?: boolean;
  }) => React.ReactNode;
  /** Anchor to the input row so menu sits under it (not under description). */
  getAnchor: () => HTMLElement | null;
  /**
   * Must be inside the Sheet content so pointer-events work (Radix modal
   * blocks clicks on portals attached to document.body).
   */
  portalContainer: HTMLElement | null;
  placement?: "bottom" | "auto";
}) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 240 });

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = getAnchor();
      if (!el) return;
      const r = el.getBoundingClientRect();
      const menuH = Math.min(220, 40 + items.length * 32 + 36);
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const openUp =
        placement === "auto" && spaceBelow < menuH && r.top > spaceBelow;
      setPos({
        top: openUp ? Math.max(8, r.top - menuH - 2) : r.bottom + 2,
        left: r.left,
        width: Math.max(r.width, 200),
      });
    };
    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, getAnchor, items.length, placement]);

  if (!open || !portalContainer) return null;

  return createPortal(
    <div
      data-sales-search-dropdown
      className="flex flex-col overflow-hidden rounded-md border border-border/70 bg-popover py-1 text-popover-foreground shadow-2xl"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 50,
        // under the field: as tall as the space below allows (the list scrolls inside), so it never runs off the screen
        maxHeight: placement === "bottom" ? Math.max(140, Math.min(280, window.innerHeight - pos.top - 8)) : 280,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ul className="group/list max-h-[240px] min-h-0 flex-1 overflow-y-auto px-1">
        {items.length === 0 ? (
          <li className="px-3 py-2 text-[13px] text-muted-foreground">No results</li>
        ) : (
          items.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-sm px-2.5 py-1.5 text-left text-[13px] hover:bg-accent",
                  // the first row is the one Enter would pick - highlighted until the pointer moves to another
                  index === 0 && "bg-accent/70 group-hover/list:bg-transparent group-hover/list:hover:bg-accent",
                )}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(item.id);
                }}
              >
                {renderItem ? (
                  renderItem(item)
                ) : (
                  <>
                    <span className="truncate text-foreground">{item.primary}</span>
                    {item.secondary ? (
                      <span className="shrink-0 text-muted-foreground">{item.secondary}</span>
                    ) : null}
                  </>
                )}
              </button>
            </li>
          ))
        )}
      </ul>
      {onSearchMore || onAddNew ? (
        <div className="flex w-full flex-col items-start px-1 pt-0.5">
          {onSearchMore ? (
            <button
              type="button"
              className={cn("w-full rounded-sm px-2.5 py-1.5 text-left hover:bg-accent", LINK)}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSearchMore();
              }}
            >
              {searchMoreLabel}
            </button>
          ) : null}
          {onAddNew ? (
            <button
              type="button"
              className={cn("w-full rounded-sm px-2.5 py-1.5 text-left hover:bg-accent", LINK)}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddNew();
              }}
            >
              {addNewLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>,
    portalContainer,
  );
}

function DatePickerPopover({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (iso: string) => void;
  onClose: () => void;
}) {
  const base = value ? new Date(`${value}T12:00:00`) : new Date();
  const [cursor, setCursor] = useState(
    () => new Date(base.getFullYear(), base.getMonth(), 1),
  );
  const selected = value ? new Date(`${value}T12:00:00`) : null;
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const cells: { day: number; inMonth: boolean; date: Date }[] = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({
      day: prevDays - i,
      inMonth: false,
      date: new Date(year, month - 1, prevDays - i),
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true, date: new Date(year, month, d) });
  }
  while (cells.length % 7 !== 0) {
    const n = cells.length - (firstDow + daysInMonth) + 1;
    cells.push({ day: n, inMonth: false, date: new Date(year, month + 1, n) });
  }

  const weekNums = Array.from({ length: cells.length / 7 }, (_, w) => {
    const d = cells[w * 7].date;
    const oneJan = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
  });

  return (
    <div
      data-sales-date-picker
      className="absolute left-0 top-full z-50 mt-1 w-[280px] rounded-md border border-border bg-popover p-2 shadow-xl"
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <button
          type="button"
          className="rounded p-1 hover:bg-muted"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-muted-foreground">
          {cursor.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
        </span>
        <button
          type="button"
          className="rounded p-1 hover:bg-muted"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-[28px_repeat(7,1fr)] gap-y-0.5 text-center text-[11px]">
        <span className="text-muted-foreground" />
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={`${d}-${i}`} className="py-1 text-muted-foreground">
            {d}
          </span>
        ))}
        {cells.map((cell, i) => {
          if (i % 7 === 0) {
            /* week number rendered before each week row via fragment below */
          }
          return null;
        })}
        {Array.from({ length: cells.length / 7 }, (_, week) => (
          <div key={week} className="contents">
            <span className="flex items-center justify-center text-[11px] font-semibold text-foreground">
              {weekNums[week]}
            </span>
            {cells.slice(week * 7, week * 7 + 7).map((cell) => {
              const iso = cell.date.toISOString().slice(0, 10);
              const isSelected =
                selected &&
                cell.date.getFullYear() === selected.getFullYear() &&
                cell.date.getMonth() === selected.getMonth() &&
                cell.date.getDate() === selected.getDate();
              return (
                <button
                  key={iso + String(cell.inMonth)}
                  type="button"
                  onClick={() => {
                    onChange(iso);
                    onClose();
                  }}
                  className={cn(
                    "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[12px]",
                    !cell.inMonth && "text-muted-foreground/40",
                    cell.inMonth && "text-foreground hover:bg-muted",
                    isSelected && "bg-[#017e84] text-white hover:bg-[#017e84]",
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Delivery date/time picker — calendar + time + Apply/Clear. */
function DeliveryDateTimePopover({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (iso: string) => void;
  onClose: () => void;
}) {
  const initial = parseDeliveryDate(value);
  const [cursor, setCursor] = useState(
    () => new Date(initial.getFullYear(), initial.getMonth(), 1),
  );
  const [draft, setDraft] = useState(initial);
  const [timeText, setTimeText] = useState(() => formatTimeInput(initial));
  const [timeOpen, setTimeOpen] = useState(false);
  const selectedSlotRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = parseDeliveryDate(value);
    setDraft(d);
    setTimeText(formatTimeInput(d));
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [value]);

  useEffect(() => {
    if (!timeOpen) return;
    selectedSlotRef.current?.scrollIntoView({ block: "nearest" });
  }, [timeOpen]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const cells: { day: number; inMonth: boolean; date: Date }[] = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({
      day: prevDays - i,
      inMonth: false,
      date: new Date(year, month - 1, prevDays - i),
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true, date: new Date(year, month, d) });
  }
  while (cells.length % 7 !== 0) {
    const n = cells.length - (firstDow + daysInMonth) + 1;
    cells.push({ day: n, inMonth: false, date: new Date(year, month + 1, n) });
  }

  const weekNums = Array.from({ length: cells.length / 7 }, (_, w) => {
    const d = cells[w * 7].date;
    const oneJan = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
  });

  const pickDay = (date: Date) => {
    const next = new Date(date);
    next.setHours(draft.getHours(), draft.getMinutes(), 0, 0);
    setDraft(next);
    setTimeOpen(false);
  };

  const applyTimeText = () => {
    const next = parseTimeInput(timeText, draft);
    setDraft(next);
    setTimeText(formatTimeInput(next));
  };

  const pickTimeSlot = (slot: string) => {
    const next = parseTimeInput(slot, draft);
    setDraft(next);
    setTimeText(formatTimeInput(next));
    setTimeOpen(false);
  };

  const handleApply = () => {
    const next = parseTimeInput(timeText, draft);
    onChange(toLocalDateTimeIso(next));
    onClose();
  };

  const handleClear = () => {
    onChange("");
    onClose();
  };

  const activeSlot = nearestTimeSlot(parseTimeInput(timeText, draft));

  return (
    <div
      data-sales-date-picker
      className="absolute right-0 top-full z-50 mt-1 w-[300px] rounded-md border border-border bg-popover p-3 shadow-lg"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between px-0.5">
        <button
          type="button"
          className="rounded p-1 text-foreground hover:bg-muted"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[13px] font-bold text-foreground">
          {cursor.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
        </span>
        <button
          type="button"
          className="rounded p-1 text-foreground hover:bg-muted"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-[28px_repeat(7,1fr)] gap-y-0.5 text-center text-[12px]">
        <span />
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={`${d}-${i}`} className="py-1 font-bold text-foreground">
            {d}
          </span>
        ))}
        {Array.from({ length: cells.length / 7 }, (_, week) => (
          <div key={week} className="contents">
            <span className="flex items-center justify-center text-[11px] font-bold text-foreground">
              {weekNums[week]}
            </span>
            {cells.slice(week * 7, week * 7 + 7).map((cell) => {
              const isSelected =
                cell.date.getFullYear() === draft.getFullYear() &&
                cell.date.getMonth() === draft.getMonth() &&
                cell.date.getDate() === draft.getDate();
              return (
                <button
                  key={`${cell.date.toISOString()}-${cell.inMonth}`}
                  type="button"
                  onClick={() => pickDay(cell.date)}
                  className={cn(
                    "relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[12px]",
                    !cell.inMonth && "text-[#adb5bd]",
                    cell.inMonth && !isSelected && "text-foreground hover:bg-muted",
                  )}
                >
                  {isSelected ? (
                    <>
                      <span className="absolute inset-0 rounded-full bg-[#cfe2ff]" />
                      <span className="absolute inset-[5px] rounded-full bg-[#e74c3c]" />
                      <span className="relative font-medium text-white">{cell.day}</span>
                    </>
                  ) : (
                    cell.day
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <div className="relative">
          {timeOpen ? (
            <div
              data-sales-time-slots
              className="absolute bottom-full left-0 z-10 mb-1 max-h-[196px] w-[92px] overflow-y-auto rounded border border-border bg-popover py-0.5 shadow-md"
            >
              {TIME_SLOTS_15.map((slot) => {
                const selected = slot === activeSlot || slot === timeText;
                return (
                  <button
                    key={slot}
                    ref={selected ? selectedSlotRef : undefined}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickTimeSlot(slot);
                    }}
                    className={cn(
                      "block w-full px-2.5 py-[3px] text-left text-[13px] text-foreground",
                      selected ? "bg-muted" : "hover:bg-muted",
                    )}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          ) : null}
          <input
            value={timeText}
            onChange={(e) => {
              setTimeText(e.target.value);
              setTimeOpen(true);
            }}
            onFocus={() => setTimeOpen(true)}
            onClick={() => setTimeOpen(true)}
            onBlur={() => {
              applyTimeText();
              window.setTimeout(() => setTimeOpen(false), 120);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyTimeText();
                setTimeOpen(false);
              }
              if (e.key === "Escape") {
                setTimeOpen(false);
              }
            }}
            className="w-20 border-0 border-b border-input bg-transparent px-0.5 text-[13px] text-foreground outline-none focus:border-[#00a09d]"
            aria-label="Time"
            aria-expanded={timeOpen}
            aria-haspopup="listbox"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-[3px] bg-muted text-muted-foreground hover:bg-muted"
            aria-label="Clear"
            onClick={handleClear}
          >
            <Eraser className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="h-8 rounded-[3px] bg-[#714B67] px-3 text-[13px] font-bold text-white hover:bg-[#5c3d54]"
            onClick={handleApply}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export function SalesOrderFormDrawer({
  open,
  mode,
  order,
  orders = [],
  onOpenChange,
  onSave,
  onSaveAction,
  onSaved,
  nested = false,
  initialKind,
}: Props) {
  const canWrite = useAdminCanWrite();
  const isAdmin = useAdminIsAdmin();
  const featureFlags = useSalesFeatureFlags();
  const { warehouses } = useInventoryWarehouses();
  const warehouseAccess = useWarehouseAccess();
  const { users: mentionableUsers } = useMentionableUsers();
  const currentAdminUser = useAdminAuth((s) => s.user);
  // Once a sales order leaves draft, staff need an admin-approved edit request
  // (good for one save); admins edit directly. Quotations are not gated.
  const editRequest = order?.editRequest ?? null;
  const orderRecordKind =
    (order as { kind?: string } | null)?.kind ??
    (order?.orderNumber?.startsWith("QUO-") ? "quotation" : "order");
  const editApprovedForMe =
    editRequest?.status === "approved" && editRequest.requestedBy === currentAdminUser?.id;
  /** A cancelled order is a closed record — nothing on it can be edited or saved. */
  const isCancelledOrder = mode === "edit" && order?.status === "cancelled";
  const isLockableOrder =
    mode === "edit" &&
    !!order &&
    orderRecordKind === "order" &&
    order.status !== "draft" &&
    !isCancelledOrder;
  const editLocked = isLockableOrder && !isAdmin && !editApprovedForMe;
  /** Same form for view & edit — fields stay editable when user has write access. */
  const readOnly = !canWrite || editLocked || isCancelledOrder;
  const canEditOrder = canWrite && !editLocked && !isCancelledOrder;
  /** Completed payment entries on a confirmed sales order are already in the ledger. */
  const paymentsPosted =
    mode === "edit" &&
    !!order &&
    orderRecordKind === "order" &&
    LEDGER_POSTED_STATUSES.has(order.status);
  const [editReason, setEditReason] = useState("");
  // Inventory policy: with this off, out-of-stock products can't be added or sold.
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [editRequestBusy, setEditRequestBusy] = useState(false);
  const [websiteStatusBusy, setWebsiteStatusBusy] = useState(false);
  // One save at a time: the ref blocks re-entry synchronously (a double-click
  // lands before React re-renders), the state disables the toolbar.
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  /** Signature of the form as loaded from `order`; null while creating. */
  const loadedFormSigRef = useRef<string | null>(null);
  const [tab, setTab] = useState<
    "lines" | "shipping" | "payment" | "others" | "info" | "return" | "history"
  >("lines");
  const [form, setForm] = useState<FormState>(() => emptySalesOrderForm("quotation", warehouseAccess.defaultId ?? ""));
  const [restoredDraftAt, setRestoredDraftAt] = useState<string | null>(null);
  // docs/drawercommon.md: one draft per record ("sales-order" for a new one, "sales-order:<id>" for an existing order) that
  // keeps the form AND the scroll position, so a drawer closed by accident comes back where the user was
  const draftKeyFor = (m: typeof mode, id?: string | null) => (m === "create" ? DRAFT_KEY : id ? `${DRAFT_KEY}:${id}` : null);
  const clearCurrentDraft = () => {
    const key = draftKeyFor(mode, order?.id);
    if (key) clearDraft(key);
  };
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<number | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [returnLineDiscounts, setReturnLineDiscounts] = useState<
    Record<string, { value: number; type: "fixed" | "percent" }>
  >({});
  const [returnDiscount, setReturnDiscount] = useState<number | null>(null);
  const [returnDiscountType, setReturnDiscountType] = useState<"fixed" | "percent">("fixed");
  const [returnReason, setReturnReason] = useState<SalesReturnReason>("customer_changed_mind");
  const [returnWarehouseId, setReturnWarehouseId] = useState(""); // "" = automatic (see the Return details note)
  const [returnNotes, setReturnNotes] = useState("");
  /** Serials ticked for a partial return, per order line id. */
  const [returnSerials, setReturnSerials] = useState<Record<string, string[]>>({});
  const [returnSaving, setReturnSaving] = useState(false);
  const [existingReturns, setExistingReturns] = useState<ApiSalesReturn[]>([]);
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [statusQuery, setStatusQuery] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [productOpenId, setProductOpenId] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [dateField, setDateField] = useState<"expiration" | "deliveryDate" | null>(null);
  const [lineColumns, setLineColumns] = useState(DEFAULT_LINE_COLUMNS);
  const [descOpenIds, setDescOpenIds] = useState<Set<string>>(() => new Set());
  /** Catalog id of the product whose drawer is open over the order (the eye on a line). */
  const [viewProductId, setViewProductId] = useState<string | null>(null);
  // the line whose serials are being picked from stock
  const [serialPickLineId, setSerialPickLineId] = useState<string | null>(null);
  // where the order sells from: its Business Location, else the first active one (what the server falls back to)
  const sellingWarehouse =
    warehouses.find((w) => w.id === form.warehouseId) ?? (form.warehouseId ? undefined : (warehouses.find((w) => w.active) ?? warehouses[0]));
  const [drawerPanel, setDrawerPanel] = useState<"order" | "preview" | "variant">("order");
  const [previewPayload, setPreviewPayload] = useState<SalesPrintPayload | null>(null);
  const [variantPicker, setVariantPicker] = useState<VariantPickerState | null>(null);

  // Drag-to-resize widths — the variant picker overlay stays a bit narrower
  // than the sales drawer it sits on.
  const { width: drawerWidth, handleProps: drawerResizeHandle } = useDrawerResize({
    defaultWidth: 880,
    defaultWidthRatio: 0.8, // the sales order is the busiest drawer: it opens at 80 % of the screen (others: 60 %)
    minWidth: 480,
    maxWidthRatio: 0.95,
    storageKey: "againerp:sales-order-drawer-width",
  });
  const { width: variantPanelWidth, handleProps: variantResizeHandle } = useDrawerResize({
    defaultWidth: 460,
    minWidth: 340,
    getMaxWidth: () =>
      Math.min(
        typeof window !== "undefined" ? window.innerWidth : 1200,
        drawerWidth,
      ) - 48,
    storageKey: "againerp:sales-variant-picker-width",
  });
  const [partnerRecord, setPartnerRecord] = useState<Customer | null>(null);
  const [partnerSheetOpen, setPartnerSheetOpen] = useState(false);
  const [partnerSheetMode, setPartnerSheetMode] = useState<"create" | "edit">("create");
  const [customerCreateDraft, setCustomerCreateDraft] = useState<CustomerCreateDraft>({});
  const [productCreateOpen, setProductCreateOpen] = useState(false);
  const [productCreateLineId, setProductCreateLineId] = useState<string | null>(null);
  const [productCreateName, setProductCreateName] = useState("");
  const [totalsMinimized, setTotalsMinimized] = useState(false);
  const [customerDueRows, setCustomerDueRows] = useState<CustomerDueRow[]>([]);
  const [customerDueOpen, setCustomerDueOpen] = useState(false);
  /** When company tax is on and Sales Settings › Taxes is on, user can add taxes on this order. */
  const [orderTaxesVisible, setOrderTaxesVisible] = useState(false);
  const [companyTaxEnabled, setCompanyTaxEnabled] = useState(false);
  const [companyTaxRate, setCompanyTaxRate] = useState(ORDER_TAX_RATE);
  const salesTaxesEnabled = featureFlags.optionTaxes && companyTaxEnabled;
  const [payDraftMethod, setPayDraftMethod] = useState<string>("Cash");
  const [payDraftKind, setPayDraftKind] = useState<"payment" | "refund">("payment");
  const [payDraftAmount, setPayDraftAmount] = useState(0);
  /** True once the user manually edits the amount — stops it from auto-following the live due balance. */
  const [payDraftAmountTouched, setPayDraftAmountTouched] = useState(false);
  const [payDraftNote, setPayDraftNote] = useState("");
  const [payDraftAt, setPayDraftAt] = useState(() => toDatetimeLocalValue(new Date().toISOString()));
  const [payDraftAccountId, setPayDraftAccountId] = useState("");
  const [paymentAccounts, setPaymentAccounts] = useState<ApiFinancePaymentAccount[]>([]);
  const [pathaoBooking, setPathaoBooking] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<SalesProductOption[]>([]);
  const productSearchTimer = useRef<number | null>(null);
  const productSearchSeq = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const customerAnchorRef = useRef<HTMLDivElement | null>(null);
  const statusAnchorRef = useRef<HTMLDivElement | null>(null);
  const deliveryAddrAnchorRef = useRef<HTMLDivElement | null>(null);
  const productAnchorsRef = useRef(new Map<string, HTMLElement>());
  const walkInDefaultAppliedRef = useRef(false);
  const [deliveryAddrOpen, setDeliveryAddrOpen] = useState(false);

  // the dropdown opens straight under the search line (not under the address / contact lines below it)
  const customerFieldRef = useRef<HTMLDivElement | null>(null);
  const getCustomerAnchor = useCallback(() => customerFieldRef.current ?? customerAnchorRef.current, []);
  const getStatusAnchor = useCallback(() => statusAnchorRef.current, []);

  const setRootEl = useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el;
    setPortalHost(el);
  }, []);

  // Which order the tab was last reset for — a refresh of the same order
  // (e.g. after recording a return) must not bounce the user to Order Lines.
  const tabInitOrderIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      tabInitOrderIdRef.current = null;
      setDrawerPanel("order");
      setPartnerRecord(null);
      setPartnerSheetOpen(false);
      setProductCreateOpen(false);
      setProductCreateLineId(null);
      setPreviewPayload(null);
      setVariantPicker(null);
      setOrderTaxesVisible(false);
      setLineColumns((cols) => ({ ...cols, taxes: false, taxIncl: false }));
      return;
    }
    void fetchWorkspaceCompany()
      .then((row) => {
        setCompanyTaxEnabled(companyTaxesEnabled(row));
        const rate = companyTaxRatePct(row);
        setCompanyTaxRate(rate > 0 ? rate : ORDER_TAX_RATE);
      })
      .catch(() => {
        setCompanyTaxEnabled(false);
      });
    void fetchInventorySettings()
      .then((s) => setAllowNegativeStock(Boolean(s.allow_negative_stock)))
      .catch(() => setAllowNegativeStock(false));
    void fetchPaymentAccounts()
      .then((res) => {
        setPaymentAccounts(res.data);
        setPayDraftAccountId((current) =>
          current || res.data.find((a) => a.is_default)?.id || res.data[0]?.id || "",
        );
      })
      .catch(() => setPaymentAccounts([]));
    void Promise.all([
      apiFetch<{ data: { id: string; sku: string; name: string; barcode?: string | null }[] }>("/api/v1/items?per_page=100"),
      apiFetch<{
        data: {
          id: string;
          sku: string;
          name: string;
          barcode?: string | null;
          item_id?: string | null;
          price: string;
          thumbnail?: string | null;
          weight?: string | null;
          brand?: string | null;
          category?: string | null;
        }[];
      }>("/api/v1/catalog/products?per_page=200&sellable=true&exclude_status=unlisted"),
    ])
      .then(([itemsRes, productsRes]) => {
        const sellable = productsRes.data ?? [];
        const fromSellable = mapItemsToSalesProducts(
          sellable.filter((p) => p.item_id).map((p) => ({ id: p.item_id as string, sku: p.sku, name: p.name, barcode: p.barcode ?? null })),
          sellable,
        );
        const plain = mapItemsToSalesProducts(itemsRes.data ?? [], sellable);
        setCatalogProducts([...fromSellable, ...plain.filter((p) => !fromSellable.some((f) => f.id === p.id))]);
      })
      .catch(() => {
        setCatalogProducts([]);
      });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const orderKey = order?.id ?? null;
    if (tabInitOrderIdRef.current !== orderKey) {
      setTab("lines");
      tabInitOrderIdRef.current = orderKey;
    }
    setCustomerOpen(false);
    setStatusOpen(false);
    setProductOpenId(null);
    setDateField(null);
    setDescOpenIds(new Set());
    setViewProductId(null);
    if (order) {
      const f = orderToForm(order);
      const editDraft = order.id ? readDraft<SalesOrderDraftPayload>(`${DRAFT_KEY}:${order.id}`) : null;
      const shown = editDraft ? { ...f, ...editDraft.values.form } : f;
      setForm(shown);
      loadedFormSigRef.current = formSaveSignature(f);
      setRestoredDraftAt(editDraft?.savedAt ?? null);
      pendingScrollRef.current = editDraft?.values.scrollTop ?? null;
      setCustomerQuery(shown.customerName);
      setStatusQuery(ORDER_STATUS_LABELS[shown.status] ?? shown.status);
      setPayDraftMethod(f.paymentMethods[0] || "Cash");
      walkInDefaultAppliedRef.current = true;
      const hasTax =
        featureFlags.optionTaxes &&
        f.lines.some((l) => l.kind === "product" && (l.tax || 0) > 0);
      setOrderTaxesVisible(hasTax);
      setLineColumns((cols) => ({ ...cols, taxes: hasTax, taxIncl: hasTax }));
    } else {
      const base: FormState = {
        ...emptySalesOrderForm(initialKind ?? "quotation", warehouseAccess.defaultId ?? ""),
        salesperson: currentAdminUser?.name || OTHER_INFO_DEFAULTS.salesperson,
      };
      const draft = readDraft<SalesOrderDraftPayload>(DRAFT_KEY);
      const f = draft ? { ...base, ...draft.values.form } : base;
      // a draft saved before the user was given a warehouse list may hold none, or one they can no longer use
      if (warehouseAccess.restricted && !warehouseAccess.allowedIds.includes(f.warehouseId)) {
        f.warehouseId = warehouseAccess.defaultId ?? "";
      }
      setForm(f);
      loadedFormSigRef.current = null;
      setRestoredDraftAt(draft?.savedAt ?? null);
      pendingScrollRef.current = draft?.values.scrollTop ?? null;
      setCustomerQuery(f.customerName);
      setStatusQuery(ORDER_STATUS_LABELS.draft);
      setPayDraftMethod("Cash");
      walkInDefaultAppliedRef.current = false;
      setOrderTaxesVisible(false);
      setLineColumns((cols) => ({ ...cols, taxes: false, taxIncl: false }));
    }
  }, [open, order, mode, featureFlags.optionTaxes, initialKind, currentAdminUser, warehouseAccess]);

  useEffect(() => {
    const existingOrder = mode !== "create" && !!form.orderNumber && form.orderNumber !== "New";
    // every real order (not a draft quotation, not cancelled) can have a return — also the "pending" ones a shop's
    // new-order feed brings in, which the drawer otherwise treats as a sent quotation
    const salesOrder =
      statusToStage(form.status) !== "quotation" ||
      (!!order?.websiteStatus && order.websiteStatus !== "cancelled");
    if (tab === "shipping" && !featureFlags.tabShipping) setTab("lines");
    else if (tab === "payment" && !featureFlags.tabPayment) setTab("lines");
    else if (tab === "return" && !(existingOrder && salesOrder && !isCancelledOrder)) setTab("lines");
    else if (tab === "history" && !featureFlags.tabHistory) setTab("lines");
  }, [
    tab,
    featureFlags.tabShipping,
    featureFlags.tabPayment,
    featureFlags.tabOthers,
    featureFlags.tabHistory,
    form.status,
    form.orderNumber,
    mode,
    isCancelledOrder,
    order?.websiteStatus,
  ]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      // Keep open when interacting with the portaled list.
      if (target.closest("[data-sales-search-dropdown], [data-again-search-dropdown]")) return;
      if (target.closest("[data-sales-date-picker]")) return;
      // Keep open when clicking the field that owns the dropdown.
      if (customerAnchorRef.current?.contains(target)) return;
      if (statusAnchorRef.current?.contains(target)) return;
      if (deliveryAddrAnchorRef.current?.contains(target)) return;
      for (const el of productAnchorsRef.current.values()) {
        if (el.contains(target)) return;
      }
      if (target.closest("[data-sales-date-field]")) return;
      setCustomerOpen(false);
      setStatusOpen(false);
      setDeliveryAddrOpen(false);
      setProductOpenId(null);
      setDateField(null);
    };
    document.addEventListener("pointerdown", onDoc, true);
    return () => document.removeEventListener("pointerdown", onDoc, true);
  }, [open]);

  // Info tab: for the products on the order - the last three sales to this customer and to anyone, and the stock in each location
  const [infoSales, setInfoSales] = useState<
    Record<string, { mine: ProductSalesLine[]; all: ProductSalesLine[] } | "failed">
  >({});
  const [infoStock, setInfoStock] = useState<Record<string, ApiStockLevel[] | "failed">>({});
  const infoLines = useMemo(
    () => form.lines.filter((l) => l.kind === "product" && l.itemId),
    [form.lines],
  );
  const infoItemKey = [...new Set(infoLines.map((l) => l.itemId))].join("|");
  /** A walk-in is many people under one record, so "the same customer" means nothing for it. */
  const infoCustomerId =
    form.customerId && !isWalkInCustomer({ id: form.customerId, name: form.customerName }) ? form.customerId : "";

  useEffect(() => {
    if (!open || tab !== "info" || !infoItemKey) return;
    let cancelled = false;
    // the order's own earlier save is not "a previous sale": ask for one more and leave it out
    const lastThree = (rows: ProductSalesLine[]) => rows.filter((r) => r.order_id !== order?.id).slice(0, 3);
    for (const itemId of infoItemKey.split("|")) {
      const mine = infoCustomerId
        ? fetchProductSales(itemId, { perPage: 4, customerId: infoCustomerId }).then((r) => lastThree(r.data))
        : Promise.resolve<ProductSalesLine[]>([]);
      void Promise.all([mine, fetchProductSales(itemId, { perPage: 4 }).then((r) => lastThree(r.data))])
        .then(([mineRows, allRows]) => {
          if (!cancelled) setInfoSales((prev) => ({ ...prev, [itemId]: { mine: mineRows, all: allRows } }));
        })
        .catch(() => {
          if (!cancelled) setInfoSales((prev) => ({ ...prev, [itemId]: "failed" }));
        });
      void fetchProductStockLevels(itemId)
        .then((rows) => {
          if (!cancelled) setInfoStock((prev) => ({ ...prev, [itemId]: rows }));
        })
        .catch(() => {
          if (!cancelled) setInfoStock((prev) => ({ ...prev, [itemId]: "failed" }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open, tab, infoItemKey, infoCustomerId, order?.id]);

  const stage = statusToStage(form.status);
  const untaxed = useMemo(
    () =>
      form.lines
        .filter((l) => l.kind === "product")
        .reduce((s, l) => {
          const disc = lineDiscountAmount(
            l.quantity,
            l.unitPrice,
            l.discount,
            l.discountType,
          );
          return s + Math.max(0, l.quantity * l.unitPrice - disc);
        }, 0),
    [form.lines],
  );
  const taxTotal = useMemo(
    () =>
      form.lines
        .filter((l) => l.kind === "product")
        .reduce((s, l) => s + (l.tax || 0), 0),
    [form.lines],
  );
  /** Taxes stay off until Sales Settings › Taxes is on and the user clicks Add taxes. */
  const showOrderTaxes = salesTaxesEnabled && orderTaxesVisible;
  const effectiveTaxTotal = showOrderTaxes ? taxTotal : 0;
  const lineGroups = useMemo(() => groupFormLines(form.lines), [form.lines]);
  const discountAmount = resolveOrderDiscountAmount(
    form.orderDiscount,
    form.orderDiscountType,
    untaxed,
  );
  const shippingChargeAmount = form.orderShippingCharge ?? 0;
  const additionalExpensesAmount = form.additionalExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const paymentAmount = useMemo(() => {
    if (form.paymentHistory.length > 0) {
      return form.paymentHistory
        .filter((p) => p.status === "completed")
        .reduce((s, p) => s + (p.kind === "refund" ? -p.amount : p.amount), 0);
    }
    return form.orderPayment ?? 0;
  }, [form.paymentHistory, form.orderPayment]);
  const activeReturns = useMemo(
    () => existingReturns.filter((r) => r.status !== "cancelled"),
    [existingReturns],
  );
  // Quantity already claimed by draft/confirmed returns against each order line.
  // A credited return's units are already reflected in the line's own
  // quantityReturned field; draft/confirmed ones aren't, so without this a line
  // could be added to any number of separate return drafts before any is credited.
  const pendingReturnedByLine = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ret of existingReturns) {
      if (ret.status !== "draft" && ret.status !== "confirmed") continue;
      for (const line of ret.lines) {
        map[line.sales_order_line_id] = (map[line.sales_order_line_id] ?? 0) + line.quantity_returned;
      }
    }
    return map;
  }, [existingReturns]);
  const savedReturnedSubtotal = useMemo(
    () => activeReturns.reduce((s, r) => s + (Number(r.subtotal) || 0), 0),
    [activeReturns],
  );
  const savedReturnedDiscount = useMemo(
    () => activeReturns.reduce((s, r) => s + (Number(r.discount_amount) || 0), 0),
    [activeReturns],
  );
  const savedReturnedTax = useMemo(
    () => activeReturns.reduce((s, r) => s + (Number(r.tax_amount) || 0), 0),
    [activeReturns],
  );
  // The Return tab's in-progress draft (before its own Save is clicked) — folded into
  // the totals box live so Sub total/Total/Due react as return quantities are typed,
  // without ever being sent to the backend until the return itself is actually saved.
  const draftReturnLines = useMemo(() => {
    const sellLines = (order?.items ?? []).filter(
      (li) => !li.displayType || li.displayType === "product",
    );
    return sellLines.map((li) => {
      const qty = Number(returnQuantities[li.id] || 0) || 0;
      const disc = returnLineDiscounts[li.id];
      const lineDiscAmt = disc ? lineDiscountAmount(qty, li.unitPrice, disc.value, disc.type) : 0;
      // the order line's own discount goes back with the units (per unit: line discount / ordered quantity)
      const ownDiscPerUnit = li.quantity > 0 ? (li.discount || 0) / li.quantity : 0;
      const net = Math.max(0, qty * (li.unitPrice - ownDiscPerUnit));
      const subtotal = Math.max(0, net - lineDiscAmt);
      // the line's tax rate: its tax over its value AFTER the line's own discount (what the tax was charged on)
      const taxBase = li.quantity * li.unitPrice - (li.discount || 0);
      const taxRate = taxBase > 0 ? (li.tax / taxBase) * 100 : 0;
      return { subtotal, net, tax: (subtotal * taxRate) / 100 };
    });
  }, [order?.items, returnQuantities, returnLineDiscounts]);
  const draftReturnSubtotal = draftReturnLines.reduce((s, r) => s + r.subtotal, 0);
  const draftReturnTax = draftReturnLines.reduce((s, r) => s + r.tax, 0);
  // the returned share of the order-level discount (the customer paid the lines MINUS that discount)
  const draftReturnOrderShare = useMemo(() => {
    const sellLines = (order?.items ?? []).filter((li) => !li.displayType || li.displayType === "product");
    const orderNet = sellLines.reduce((s, li) => s + Math.max(0, li.quantity * li.unitPrice - (li.discount || 0)), 0);
    if (orderNet <= 0 || discountAmount <= 0) return 0;
    const returnedNet = draftReturnLines.reduce((s, r) => s + r.net, 0);
    return roundMoney((discountAmount * returnedNet) / orderNet);
  }, [order?.items, draftReturnLines, discountAmount]);
  const draftReturnDiscount =
    resolveOrderDiscountAmount(returnDiscount, returnDiscountType, draftReturnSubtotal) + draftReturnOrderShare;
  const returnedSubtotal = savedReturnedSubtotal + draftReturnSubtotal;
  const returnedDiscount = savedReturnedDiscount + draftReturnDiscount;
  const returnedTax = savedReturnedTax + draftReturnTax;
  const returnedTotal = returnedSubtotal - returnedDiscount + returnedTax;
  const netSubtotal = Math.max(0, untaxed - returnedSubtotal);
  const netTax = Math.max(0, effectiveTaxTotal - returnedTax);
  const orderTotal = Math.max(
    0,
    netSubtotal +
      returnedDiscount +
      netTax -
      discountAmount +
      shippingChargeAmount +
      additionalExpensesAmount,
  );
  const dueBalance = Math.max(0, orderTotal - paymentAmount);
  const refundDue = Math.max(0, paymentAmount - orderTotal);
  const returnedForPersist = useMemo(
    () => ({ subtotal: savedReturnedSubtotal - savedReturnedDiscount, tax: savedReturnedTax }),
    [savedReturnedSubtotal, savedReturnedDiscount, savedReturnedTax],
  );

  // Load this customer's outstanding dues from API (not limited to the current sales grid page).
  useEffect(() => {
    if (!open) {
      setCustomerDueRows([]);
      setCustomerDueOpen(false);
      return;
    }
    const customerId = form.customerId;
    if (!customerId || isWalkInCustomer({ id: customerId, name: form.customerName })) {
      setCustomerDueRows([]);
      return;
    }
    let cancelled = false;
    void fetchCustomerDueList(customerId, order?.id)
      .then((rows) => {
        if (!cancelled) setCustomerDueRows(rows);
      })
      .catch(() => {
        if (!cancelled) setCustomerDueRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, form.customerId, form.customerName, order?.id]);

  /** Prefer live API due list; fall back to in-memory sales grid rows. */
  const previousDueRows = useMemo(() => {
    if (customerDueRows.length > 0) return customerDueRows;
    const customerId = form.customerId;
    if (!customerId || isWalkInCustomer({ id: customerId, name: form.customerName })) {
      return [] as CustomerDueRow[];
    }
    const currentId = order?.id;
    return orders
      .filter((o) => {
        if (o.customer?.id !== customerId) return false;
        if (currentId && o.id === currentId) return false;
        return orderOutstandingDue(o as Order & SalesRecordMeta) > 0;
      })
      .map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        orderDate: o.orderDate,
        status: o.status,
        dueAmount: orderOutstandingDue(o as Order & SalesRecordMeta),
        grandTotal: o.grandTotal,
        paidAmount: o.payment?.paidAmount ?? 0,
      }));
  }, [customerDueRows, orders, form.customerId, form.customerName, order?.id]);

  const previousDue = useMemo(
    () => previousDueRows.reduce((sum, row) => sum + row.dueAmount, 0),
    [previousDueRows],
  );

  const showDueRow = paymentAmount > 0 || previousDue > 0 || dueBalance > 0;

  useEffect(() => {
    if (tab !== "payment") return;
    setPayDraftAt((prev) => prev || toDatetimeLocalValue(new Date().toISOString()));
    // Reset "touched" on entering the tab, then always mirror the live due balance
    // (discount/expense/shipping edits) until the user types their own amount.
    setPayDraftAmountTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on tab enter
  }, [tab]);

  useEffect(() => {
    if (tab !== "payment" || payDraftAmountTouched) return;
    setPayDraftAmount(payDraftKind === "refund" ? refundDue : dueBalance);
  }, [tab, dueBalance, refundDue, payDraftKind, payDraftAmountTouched]);

  useEffect(() => {
    if (refundDue <= 0 && payDraftKind === "refund") setPayDraftKind("payment");
  }, [refundDue, payDraftKind]);

  useEffect(() => {
    if (!open || !order?.id) {
      setExistingReturns([]);
      return;
    }
    setReturnsLoading(true);
    fetchSalesReturns({ sales_order_id: order.id })
      .then((res) => setExistingReturns(res.data))
      .catch(() => setExistingReturns([]))
      .finally(() => setReturnsLoading(false));
  }, [open, order?.id]);

  const shippingSummary = useMemo(() => {
    const parsedWeight = parseFloat(form.shippingWeight);
    return calculateDropshipShipping(
      form.lines
        .filter((l) => l.kind === "product" && l.quantity > 0)
        .map((l) => ({
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          variant: l.variant,
          name: l.name,
        })),
      {
        shippingMethod: form.shippingMethod,
        weightKg:
          Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : undefined,
      },
    );
  }, [form.lines, form.shippingWeight, form.shippingMethod]);

  useEffect(() => {
    const weightByItemId = new Map(
      catalogProducts.filter((p) => p.weightKg != null).map((p) => [p.itemId, p.weightKg as number]),
    );
    let totalWeightKg = 0;
    let hasRealWeight = false;
    for (const line of form.lines) {
      if (line.kind !== "product" || line.quantity <= 0) continue;
      const weightKg = weightByItemId.get(line.itemId);
      if (weightKg == null) continue;
      hasRealWeight = true;
      totalWeightKg += weightKg * line.quantity;
    }
    // Only the real per-product Weight field feeds this — no product has one set means blank, not a guess.
    const next = hasRealWeight ? totalWeightKg.toFixed(2) : "";
    setForm((f) => (f.shippingWeight === next ? f : { ...f, shippingWeight: next }));
  }, [form.lines, catalogProducts]);

  const titleLabel = mode === "create" ? "New" : form.orderNumber;
  const selectedIsWalkIn =
    !!form.customerId &&
    isWalkInCustomer({ id: form.customerId, name: form.customerName });
  const isExistingOrder = mode !== "create" && !!form.orderNumber && form.orderNumber !== "New";

  const { customers: preloadedCustomers, refetch: refetchCustomers } = useCommerceCustomers();

  // The preloaded list is capped (2,000 of 6,000+ customers, ordered by name), so a
  // typed query also asks the server — otherwise a customer whose name sorts past
  // that window (e.g. one just added) can never be picked.
  const [lookupCustomers, setLookupCustomers] = useState<CustomerListRow[]>([]);
  useEffect(() => {
    const q = customerQuery.trim();
    if (!customerOpen || q.length < 2) {
      setLookupCustomers([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      apiFetch<ApiCustomerListResponse>(
        `/api/v1/commerce/customers${buildCustomerQuery({ search: q, limit: 20 })}`,
        { cache: "no-store" },
      )
        .then((res) => {
          if (!cancelled) setLookupCustomers(res.data.map(apiCustomerToCustomer));
        })
        .catch(() => {
          /* the preloaded list still answers what it can */
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerQuery, customerOpen]);

  // Server matches first (they are the best answer to the typed query), then the
  // rest of the preloaded list.
  const apiCustomers = useMemo((): CustomerListRow[] => {
    if (lookupCustomers.length === 0) return preloadedCustomers;
    const fromServer = new Set(lookupCustomers.map((c) => c.id));
    return [...lookupCustomers, ...preloadedCustomers.filter((c) => !fromServer.has(c.id))];
  }, [preloadedCustomers, lookupCustomers]);

  const allSalesCustomers = useMemo((): SalesCustomerOption[] => {
    const fromApi: SalesCustomerOption[] = apiCustomers.map((c) => {
      const inv = c.addresses[0];
      const del = c.addresses[1] ?? c.addresses[0];
      const invoiceAddress = makeAddress(
        inv?.address ?? "",
        inv?.city ?? c.city,
        inv?.region ?? c.region ?? c.city,
        "1207",
        inv?.country ?? c.country ?? "Bangladesh",
      );
      const deliveryAddress = makeAddress(
        del?.address ?? inv?.address ?? "",
        del?.city ?? c.city,
        del?.region ?? c.region ?? c.city,
        "1207",
        del?.country ?? c.country ?? "Bangladesh",
      );
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        city: c.city,
        phoneVerified: Boolean(c.phoneVerified),
        emailVerified: Boolean(c.emailVerified),
        invoiceAddress,
        deliveryAddress,
      };
    });
    if (fromApi.length > 0) {
      const hasWalkIn = fromApi.some((c) => {
        const full = apiCustomers.find((a) => a.id === c.id);
        return full ? isWalkInCustomer(full) : isWalkInCustomer(c);
      });
      return hasWalkIn ? fromApi : [WALK_IN_SALES_CUSTOMER, ...fromApi];
    }
    return [WALK_IN_SALES_CUSTOMER];
  }, [apiCustomers]);

  const customerResults = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    const phoneQuery = q.replace(/\D/g, "");
    // Exact name/phone hits first, then names starting with the query — so a
    // customer literally called what was typed is never pushed out by partial matches.
    const rank = (c: SalesCustomerOption): number => {
      if (!q) return 2;
      const name = c.name.toLowerCase();
      if (name === q || (phoneQuery.length > 0 && c.phone.replace(/\D/g, "") === phoneQuery)) return 0;
      if (name.startsWith(q)) return 1;
      return 2;
    };
    return allSalesCustomers
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (phoneQuery.length > 0 && c.phone.replace(/\D/g, "").includes(phoneQuery)) ||
          c.city.toLowerCase().includes(q) ||
          c.invoiceAddress.street.toLowerCase().includes(q),
      )
      .map((c, index) => ({ c, index, rank: rank(c) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map(({ c }) => c)
      .slice(0, 20)
      .map((c) => {
        const phone = c.phone?.trim() || "";
        const email = c.email?.trim() || "";
        const secondary =
          phone && email ? `${phone} · ${email}` : phone || email || undefined;
        return {
          id: c.id,
          primary: c.name,
          secondary,
          phone,
          email,
          phoneVerified: Boolean(c.phoneVerified),
          emailVerified: Boolean(c.emailVerified),
        };
      });
  }, [allSalesCustomers, customerQuery]);

  const selectedCustomer = useMemo((): Customer | null => {
    if (!form.customerId) return null;
    const fromApi = apiCustomers.find((c) => c.id === form.customerId);
    if (fromApi) return fromApi;
    return resolvePartnerForDrawer(form.customerId);
  }, [apiCustomers, form.customerId]);

  const customerAddressOptions = useMemo(
    () => buildCustomerAddressOptions(selectedCustomer),
    [selectedCustomer],
  );

  const customerPreviewContact = useMemo(
    () => getCustomerPrimaryContact(selectedCustomer),
    [selectedCustomer],
  );

  const customerDisplayPhone =
    form.customerPhone || customerPreviewContact.phone || selectedCustomer?.phone || "";
  const customerDisplayEmail = selectedIsWalkIn
    ? ""
    : form.customerEmail || customerPreviewContact.email || selectedCustomer?.email || "";
  // the company the contact belongs to (a person that works for a company), shown under the name
  const customerCompanyName = (selectedCustomer?.parentCompany ?? "").trim();
  const customerPhoneVerified = Boolean(selectedCustomer?.phoneVerified);
  const customerEmailVerified = Boolean(selectedCustomer?.emailVerified);

  const statusResults = useMemo(() => {
    const q = statusQuery.trim().toLowerCase();
    return ORDER_STATUS_OPTIONS.filter(
      (option) =>
        !q ||
        option.primary.toLowerCase().includes(q) ||
        option.id.toLowerCase().includes(q),
    );
  }, [statusQuery]);

  const productById = useMemo(
    () => new Map(catalogProducts.map((p) => [p.id, p])),
    [catalogProducts],
  );

  const productResults = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return catalogProducts
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q),
      )
      .slice(0, 12)
      .map((p) => ({
        id: p.id,
        primary: p.name,
        secondary: `${p.sku}${p.price > 0 ? ` · ${formatCurrency(p.price)}` : ""}`,
        imageUrl: p.imageUrl,
      }));
  }, [catalogProducts, productQuery]);

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const patchLine = (id: string, next: Partial<FormLine>) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l) => {
        if (l.id !== id) return l;
        const merged = { ...l, ...next };
        if (
          "quantity" in next ||
          "unitPrice" in next ||
          "taxRate" in next ||
          "discount" in next ||
          "discountType" in next
        ) {
          merged.tax = taxForLine(merged);
        }
        return merged;
      }),
    }));
  };

  /** Why this product/quantity can't be sold under the current stock policy, or null. */
  const stockBlocksSale = (
    product: SalesProductOption | undefined,
    quantity: number,
  ): string | null => {
    if (allowNegativeStock || !product || product.stock == null || product.trackQuantity === false) {
      return null;
    }
    if (product.stock <= 0) {
      return `${product.name} is out of stock — enable "Allow negative stock" in Inventory settings to sell it`;
    }
    if (quantity > product.stock) {
      return `${product.name}: only ${product.stock} in stock (requested ${quantity})`;
    }
    return null;
  };

  const applyProductToLine = (lineId: string, product: SalesProductOption) => {
    const blocked = stockBlocksSale(product, 1);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    const taxRate =
      salesTaxesEnabled && orderTaxesVisible ? companyTaxRate : 0;
    const unitPrice = product.price;
    patchLine(lineId, {
      itemId: product.id,
      name: product.name,
      sku: product.sku,
      imageUrl: product.imageUrl ?? "",
      unitPrice,
      taxRate,
      tax: calcLineTax(1, unitPrice, taxRate),
      discount: 0,
      discountType: "fixed",
      description: product.description,
    });
    setProductOpenId(null);
    // If the product carries selectable variants, open the picker drawer so
    // the user can set per-variant quantities (storefront-style).
    if (product.catalogProductId) void openVariantPickerIfAny(lineId, product);
  };

  const pickProductFromSearch = (product: SalesProductOption, scan?: ScanProductHit | null) => {
    const serial = scan?.match === "serial" ? scan.serial_number?.trim() || null : null;
    if (serial && scan?.serial_status && scan.serial_status !== "in_stock") {
      toast.error(`Serial ${serial} is already ${serialStatusPhrase(scan.serial_status)}`);
      return;
    }
    const existing = form.lines.find(
      (l) =>
        l.kind === "product" &&
        ((product.id && l.itemId === product.id) ||
          (product.sku && l.sku === product.sku)),
    );
    // A double scan (or Enter racing the debounced scan) must not add a second unit.
    if (serial && existing?.serialNumbers?.includes(serial)) return;
    const blocked = stockBlocksSale(product, existing ? existing.quantity + 1 : 1);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    if (existing) {
      patchLine(existing.id, {
        quantity: existing.quantity + 1,
        ...(serial ? { serialNumbers: [...(existing.serialNumbers ?? []), serial] } : {}),
      });
      return;
    }
    const empty = form.lines.find(
      (l) =>
        l.kind === "product" && !l.itemId && !l.sku.trim() && !l.name.trim(),
    );
    if (empty) {
      applyProductToLine(empty.id, product);
      if (serial) patchLine(empty.id, { serialNumbers: [serial] });
      return;
    }
    const id = `li_${Date.now()}`;
    const taxRate = salesTaxesEnabled && orderTaxesVisible ? companyTaxRate : 0;
    const unitPrice = product.price;
    setForm((f) => ({
      ...f,
      lines: [
        ...f.lines,
        {
          id,
          kind: "product",
          itemId: product.id,
          name: product.name,
          sku: product.sku,
          imageUrl: product.imageUrl ?? "",
          variant: "",
          description: product.description,
          leadTime: "",
          quantity: 1,
          unitPrice,
          discount: 0,
          discountType: "fixed",
          tax: calcLineTax(1, unitPrice, taxRate),
          taxRate,
          serialNumbers: serial ? [serial] : undefined,
        },
      ],
    }));
    if (product.catalogProductId) void openVariantPickerIfAny(id, product);
  };

  /** Validates a typed serial against inventory; returns the problem or null once added. */
  const addSerialToLine = async (lineId: string, raw: string): Promise<string | null> => {
    const line = form.lines.find((l) => l.id === lineId);
    if (!line || line.kind !== "product") return "Line not found";
    const current = line.serialNumbers ?? [];
    let found;
    try {
      found = (await lookupSerial(raw)).data;
    } catch (err) {
      return err instanceof Error ? err.message : "Could not check the serial";
    }
    if (!found) return `Serial ${raw} is not registered`;
    const serial = found.serial_number || raw;
    if (current.includes(serial)) return `${serial} is already on this line`;
    // Editing a confirmed order: its own units read "sold" but stay valid here.
    const onThisOrder =
      found.status === "sold" && !!found.order_number && found.order_number === form.orderNumber;
    if (found.status !== "in_stock" && !onThisOrder) {
      return `Serial ${serial} is ${serialStatusPhrase(found.status)}`;
    }
    const sameProduct =
      (!!line.itemId && found.item_id === line.itemId) || (!!line.sku && found.sku === line.sku);
    if (!sameProduct) {
      return `Serial ${serial} belongs to ${found.sku || found.product_name}, not ${line.sku || line.name}`;
    }
    if (found.status === "in_stock" && sellingWarehouse && found.warehouse_id && found.warehouse_id !== sellingWarehouse.id) {
      return `Serial ${serial} is at ${found.warehouse_name ?? "another location"}, this order sells from ${sellingWarehouse.name}. Change the Business Location to sell it.`;
    }
    const next = [...current, serial];
    // Scan-driven flow: a serial past the typed quantity is one more unit sold.
    const quantity = Math.max(line.quantity, next.length);
    if (quantity !== line.quantity) {
      const blocked = stockBlocksSale(productById.get(line.itemId), quantity);
      if (blocked) return blocked;
    }
    patchLine(lineId, { serialNumbers: next, quantity });
    return null;
  };

  /** Done in the serials drawer: the picked units become the line's serials; more units than the quantity raise it. */
  const applyPickedSerials = (lineId: string, serials: string[]) => {
    const line = form.lines.find((l) => l.id === lineId);
    if (!line || line.kind !== "product") return;
    const quantity = Math.max(line.quantity, serials.length);
    if (quantity !== line.quantity) {
      const blocked = stockBlocksSale(productById.get(line.itemId), quantity);
      if (blocked) {
        toast.error(blocked);
        return;
      }
    }
    patchLine(lineId, { serialNumbers: serials, quantity });
  };

  const removeSerialFromLine = (lineId: string, serial: string) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l) =>
        l.id === lineId
          ? { ...l, serialNumbers: (l.serialNumbers ?? []).filter((s) => s !== serial) }
          : l,
      ),
    }));
  };

  const openProductCreate = (lineId: string) => {
    setProductOpenId(null);
    setProductCreateLineId(lineId);
    setProductCreateName(productQuery.trim() || "");
    setProductCreateOpen(true);
  };

  const openVariantPickerIfAny = async (lineId: string, product: SalesProductOption) => {
    if (!product.catalogProductId) return;
    try {
      const detail = await fetchCatalogProductDetail(product.catalogProductId);
      const variants = toPickerVariants(detail);
      const hasSelectable = variants.some((v) => v.options.length > 0);
      if (variants.length > 1 && hasSelectable) {
        setVariantPicker({
          lineId,
          productName: product.name,
          productImageUrl:
            resolveVariantImage(product.imageUrl) ||
            resolveVariantImage(detail.thumbnail) ||
            variants.find((v) => v.imageUrl)?.imageUrl ||
            null,
          variants,
        });
        setDrawerPanel("variant");
      }
    } catch {
      /* No variants / fetch failed — keep the plain single line. */
    }
  };

  /**
   * The list loaded up front is only the most recently updated products, so the shop's real products are often not in it.
   * While the user types, ask the server for what matches and merge it in (newest answer wins, the list is capped).
   */
  const searchProductsOnServer = useCallback((raw: string) => {
    const q = raw.trim();
    if (productSearchTimer.current) window.clearTimeout(productSearchTimer.current);
    if (q.length < 2) return;
    const seq = ++productSearchSeq.current;
    productSearchTimer.current = window.setTimeout(() => {
      const enc = encodeURIComponent(q);
      type SearchProduct = {
        id: string;
        sku: string;
        name: string;
        barcode?: string | null;
        item_id?: string | null;
        price: string;
        purchase_price?: string | null;
        stock?: number | null;
        track_quantity?: boolean | null;
        track_serial?: boolean | null;
        thumbnail?: string | null;
        weight?: string | null;
        brand?: string | null;
        category?: string | null;
      };
      // Two asks: the products that have a selling price (the ones the shop really sells, found first) and the plain match,
      // which still lets a free / unpriced item be found by its SKU or name.
      void Promise.all([
        apiFetch<{ data: SearchProduct[] }>(`/api/v1/catalog/products?per_page=60&sellable=true&exclude_status=unlisted&q=${enc}`),
        apiFetch<{ data: { id: string; sku: string; name: string; barcode?: string | null }[] }>(`/api/v1/items?per_page=40&q=${enc}`),
      ])
        .then(([sellableRes, itemsRes]) => {
          if (seq !== productSearchSeq.current) return;
          const sellable = sellableRes.data ?? [];
          const fromSellable = mapItemsToSalesProducts(
            sellable
              .filter((p) => p.item_id)
              .map((p) => ({ id: p.item_id as string, sku: p.sku, name: p.name, barcode: p.barcode ?? null })),
            sellable,
          );
          const plain = mapItemsToSalesProducts(itemsRes.data ?? [], sellable);
          const found = [...fromSellable, ...plain.filter((p) => !fromSellable.some((f) => f.id === p.id))];
          if (!found.length) return;
          setCatalogProducts((prev) => {
            const foundIds = new Set(found.map((p) => p.id));
            return [...found, ...prev.filter((p) => !foundIds.has(p.id))].slice(0, 800);
          });
        })
        .catch(() => undefined);
    }, 250);
  }, []);

  // The Brand / Category filter of the product search bar: the products of that brand / category come from the database (the
  // list loaded here is only a slice of the catalog), then the bar filters them.
  const filterSeq = useRef(0);
  const loadProductsForFilter = useCallback((filter: { brand: string; categories: string[] }) => {
    const seq = ++filterSeq.current;
    const params = new URLSearchParams({ per_page: "200", sellable: "true", exclude_status: "unlisted" });
    if (filter.brand) params.set("brand", filter.brand);
    for (const name of filter.categories) params.append("category", name);
    type FilteredProduct = {
      id: string;
      sku: string;
      name: string;
      barcode?: string | null;
      item_id?: string | null;
      price: string;
      purchase_price?: string | null;
      stock?: number | null;
      track_quantity?: boolean | null;
      track_serial?: boolean | null;
      thumbnail?: string | null;
      weight?: string | null;
      brand?: string | null;
      category?: string | null;
    };
    void apiFetch<{ data: FilteredProduct[] }>(`/api/v1/catalog/products?${params}`)
      .then((res) => {
        if (seq !== filterSeq.current) return;
        const rows = res.data ?? [];
        const found = mapItemsToSalesProducts(
          rows.filter((p) => p.item_id).map((p) => ({ id: p.item_id as string, sku: p.sku, name: p.name, barcode: p.barcode ?? null })),
          rows,
        );
        if (!found.length) return;
        setCatalogProducts((prev) => {
          const foundIds = new Set(found.map((p) => p.id));
          return [...found, ...prev.filter((p) => !foundIds.has(p.id))].slice(0, 1200);
        });
      })
      .catch(() => undefined);
  }, []);

  const handleProductCreated = async (saved?: Product) => {
    const lineId = productCreateLineId;
    setProductCreateOpen(false);
    setProductCreateLineId(null);
    setProductCreateName("");
    if (!lineId || !saved) return;

    let option: SalesProductOption | null = null;
    try {
      const [itemsRes, productsRes] = await Promise.all([
        apiFetch<{ data: { id: string; sku: string; name: string; barcode?: string | null }[] }>("/api/v1/items?per_page=100"),
        apiFetch<{
          data: {
            id: string;
            item_id?: string | null;
            price: string;
            thumbnail?: string | null;
          }[];
        }>("/api/v1/catalog/products?per_page=200"),
      ]);
      if (itemsRes.data?.length) {
        const next = mapItemsToSalesProducts(itemsRes.data, productsRes.data ?? []);
        setCatalogProducts(next);
        const itemKey = saved.itemId || saved.id;
        option =
          next.find((p) => p.id === itemKey || p.catalogProductId === saved.id) ?? null;
      }
    } catch {
      /* fall through to local option */
    }

    if (!option) {
      option = {
        id: saved.itemId || saved.id,
        name: saved.name,
        sku: saved.sku,
        price: saved.price,
        description: saved.shortDescription || saved.description || saved.name,
        imageUrl: saved.thumbnail,
        catalogProductId: saved.id,
      };
      setCatalogProducts((prev) =>
        prev.some((p) => p.id === option!.id) ? prev : [option!, ...prev],
      );
    }

    applyProductToLine(lineId, option);
  };

  const handleVariantConfirm = (results: VariantPickResult[]) => {
    const picker = variantPicker;
    if (!picker || results.length === 0) {
      setVariantPicker(null);
      setDrawerPanel("order");
      return;
    }
    setForm((f) => {
      const idx = f.lines.findIndex((l) => l.id === picker.lineId);
      if (idx < 0) return f;
      const base = f.lines[idx];
      const newLines: FormLine[] = results.map((res, i) => ({
        id: i === 0 ? base.id : `li_${Date.now()}_${i}`,
        kind: "product" as const,
        itemId: base.itemId,
        name: res.name || base.name,
        sku: res.sku || base.sku,
        imageUrl: res.imageUrl || base.imageUrl,
        variant: res.variantLabel,
        description: base.description,
        leadTime: base.leadTime,
        quantity: res.qty,
        unitPrice: res.price,
        discount: 0,
        discountType: "fixed" as const,
        tax: calcLineTax(res.qty, res.price, base.taxRate),
        taxRate: base.taxRate,
      }));
      const next = [...f.lines];
      next.splice(idx, 1, ...newLines);
      return { ...f, lines: next };
    });
    setVariantPicker(null);
    setDrawerPanel("order");
  };

  const handleVariantCancel = () => {
    setVariantPicker(null);
    setDrawerPanel("order");
  };

  const addSection = () => {
    const id = `sec_${Date.now()}`;
    setForm((f) => ({
      ...f,
      lines: [
        ...f.lines,
        {
          id,
          kind: "section",
          itemId: "",
          name: "",
          sku: "",
          imageUrl: "",
          variant: "",
          description: "",
          leadTime: "",
          quantity: 0,
          unitPrice: 0,
          discount: 0,
          discountType: "fixed",
          tax: 0,
          taxRate: 0,
        },
      ],
    }));
  };

  const addNote = () => {
    const id = `note_${Date.now()}`;
    setForm((f) => ({
      ...f,
      lines: [
        ...f.lines,
        {
          id,
          kind: "note",
          itemId: "",
          name: "",
          sku: "",
          imageUrl: "",
          variant: "",
          description: "",
          leadTime: "",
          quantity: 0,
          unitPrice: 0,
          discount: 0,
          discountType: "fixed",
          tax: 0,
          taxRate: 0,
        },
      ],
    }));
  };

  const applyShippingLine = (lineId: string) => {
    const opt =
      SHIPPING_LINE_OPTIONS.find((o) => o.id === lineId) ?? SHIPPING_LINE_OPTIONS[0];
    const parsedWeight = parseFloat(form.shippingWeight);
    const summary = calculateDropshipShipping(
      form.lines
        .filter((l) => l.kind === "product" && l.quantity > 0)
        .map((l) => ({
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          variant: l.variant,
          name: l.name,
        })),
      {
        shippingMethod: opt.method,
        weightKg:
          Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : undefined,
      },
    );
    setForm((f) => ({
      ...f,
      shippingLineId: opt.id,
      shippingMethod: opt.method,
      orderShippingCharge:
        opt.id === "pickup"
          ? 0
          : opt.usesEstimate
            ? summary.shippingTotal
            : f.orderShippingCharge ?? 0,
    }));
  };

  const bookPathaoShipment = async () => {
    if (!order?.id) {
      toast.error("Save the order first to create a Pathao shipment");
      return;
    }
    const address =
      formatFullAddress(form.deliveryAddress) || formatFullAddress(customerPreviewContact.address);
    if (!address) {
      toast.error("No shipping address to book with Pathao");
      return;
    }
    const quantity = form.lines
      .filter((l) => l.kind === "product")
      .reduce((sum, l) => sum + l.quantity, 0);
    const weight = parseFloat(form.shippingWeight);
    setPathaoBooking(true);
    try {
      const result = await createSalesOrderPathaoConsignment(order.id, {
        recipientName: form.customerName || "Customer",
        recipientPhone: form.customerPhone || customerPreviewContact.phone || "",
        recipientAddress: address,
        itemQuantity: quantity > 0 ? quantity : undefined,
        itemWeightKg: Number.isFinite(weight) && weight > 0 ? weight : undefined,
      });
      if (result.created) {
        setForm((f) => ({
          ...f,
          courier: "Pathao",
          trackingNumber: result.consignment_id,
          trackingUrl: result.tracking_url,
        }));
        toast.success(result.message || "Pathao shipment created");
      } else if (result.skipped) {
        toast.info(result.message || "Pathao plugin is not connected");
      } else {
        toast.error(result.message || "Failed to create Pathao shipment");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create Pathao shipment");
    } finally {
      setPathaoBooking(false);
    }
  };

  const selectDeliveryAddress = (option: SalesAddressOption) => {
    setForm((f) => ({
      ...f,
      deliveryAddressId: option.id,
      deliveryAddress: { ...option.address },
      customerPhone: option.phone || f.customerPhone,
      customerEmail: option.email || f.customerEmail,
    }));
    setDeliveryAddrOpen(false);
  };

  const registerPayment = () => {
    if (payDraftAmount <= 0) {
      toast.error(payDraftKind === "refund" ? "Enter a refund amount" : "Enter a payment amount");
      return;
    }
    const method = payDraftMethod || PAYMENT_METHOD_OPTIONS[0];
    const account = paymentAccounts.find((a) => a.id === payDraftAccountId);
    const entry: FormPaymentEntry = {
      id: `pay_${Date.now()}`,
      method,
      amount: payDraftAmount,
      status: "completed",
      at: fromDatetimeLocalValue(payDraftAt),
      note: payDraftNote.trim() || undefined,
      accountId: account?.id,
      accountName: account?.name,
      kind: payDraftKind,
    };
    const delta = payDraftKind === "refund" ? -payDraftAmount : payDraftAmount;
    setForm((f) => {
      const methods = f.paymentMethods.includes(method)
        ? f.paymentMethods
        : [...f.paymentMethods, method];
      const nextPaid = (f.orderPayment ?? 0) + delta;
      return {
        ...f,
        paymentMethods: methods,
        paymentHistory: [entry, ...f.paymentHistory],
        orderPayment: nextPaid,
      };
    });
    const remaining = Math.max(0, (payDraftKind === "refund" ? refundDue : dueBalance) - payDraftAmount);
    setPayDraftAmount(remaining);
    setPayDraftNote("");
    setPayDraftAt(toDatetimeLocalValue(new Date().toISOString()));
    toast.success(payDraftKind === "refund" ? "Refund recorded" : "Payment recorded");
  };

  const updatePaymentEntry = (id: string, patchEntry: Partial<FormPaymentEntry>) => {
    setForm((f) => ({
      ...f,
      paymentHistory: f.paymentHistory.map((p) =>
        p.id === id ? { ...p, ...patchEntry } : p,
      ),
    }));
  };

  const removePaymentEntry = (id: string) => {
    setForm((f) => {
      const removed = f.paymentHistory.find((p) => p.id === id);
      const nextHistory = f.paymentHistory.filter((p) => p.id !== id);
      const removedDelta =
        removed && removed.status === "completed"
          ? removed.kind === "refund"
            ? -removed.amount
            : removed.amount
          : 0;
      const nextPaid =
        f.orderPayment != null ? Math.max(0, f.orderPayment - removedDelta) : f.orderPayment;
      return {
        ...f,
        paymentHistory: nextHistory,
        orderPayment: nextPaid === 0 && nextHistory.length === 0 ? null : nextPaid,
      };
    });
  };

  const toggleLineColumn = (key: LineColumnKey) => {
    setLineColumns((cols) => ({ ...cols, [key]: !cols[key] }));
  };

  const lineColVisibility = useMemo(
    () => ({
      variant: lineColumns.variant,
      product: lineColumns.product,
      quantity: lineColumns.quantity,
      unitPrice: lineColumns.unitPrice,
      discount: featureFlags.optionDiscounts && lineColumns.discount,
      amount: lineColumns.amount,
      leadTime: lineColumns.leadTime,
      taxes: showOrderTaxes && lineColumns.taxes,
      taxIncl: showOrderTaxes && lineColumns.taxIncl,
    }),
    [lineColumns, showOrderTaxes, featureFlags.optionDiscounts],
  );

  const {
    visibleCols: visibleLineCols,
    widths: lineColWidths,
    dragCol: dragLineCol,
    setDragCol: setDragLineCol,
    moveColumn: moveLineColumn,
    startResize: startLineColResize,
  } = useLineTableLayout(lineColVisibility);

  const lineDragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleLineDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setForm((f) => {
      const oldIndex = f.lines.findIndex((l) => l.id === active.id);
      const newIndex = f.lines.findIndex((l) => l.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return f;
      return { ...f, lines: arrayMove(f.lines, oldIndex, newIndex) };
    });
  };

  const toggleDescription = (lineId: string) => {
    setDescOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const openProductView = (productName: string, itemId?: string) => {
    if (!productName.trim()) {
      toast.info("Select a product first");
      return;
    }
    // the line's own product first (its item id), the name only when the line has none
    const option =
      (itemId ? catalogProducts.find((p) => p.id === itemId) : undefined) ??
      catalogProducts.find((p) => p.name === productName);
    if (!option?.catalogProductId) {
      toast.info("This product is not in the catalog");
      return;
    }
    setViewProductId(option.catalogProductId);
  };

  const removeLine = (id: string) => {
    setForm((f) => ({ ...f, lines: f.lines.filter((l) => l.id !== id) }));
  };

  const clearCustomer = () => {
    setForm((f) => ({
      ...f,
      customerId: "",
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      invoiceAddress: makeAddress("", ""),
      deliveryAddress: makeAddress("", ""),
      invoiceAddressId: "",
      deliveryAddressId: "",
    }));
    setCustomerQuery("");
    setCustomerOpen(true);
  };

  const openPartnerCreate = () => {
    setCustomerOpen(false);
    const q = customerQuery.trim();
    // The search box echoes the selected customer's name, so only prefill from
    // a fresh, unmatched search — never the already-selected customer (this is
    // "add another customer", not edit) or Walk-in.
    const isSelectedCustomerName =
      !!form.customerId && q.toLowerCase() === form.customerName.trim().toLowerCase();
    const draftSource =
      !q || isSelectedCustomerName || q.toLowerCase() === WALK_IN_CUSTOMER_NAME.toLowerCase()
        ? ""
        : q;
    setCustomerCreateDraft(detectCustomerCreateDraft(draftSource));
    setPartnerRecord(null);
    setPartnerSheetMode("create");
    setPartnerSheetOpen(true);
  };

  const applyCustomerToForm = useCallback(
    (c: SalesCustomerOption) => {
      const cust = apiCustomers.find((x) => x.id === c.id) ?? null;
      const options = buildCustomerAddressOptions(cust);
      const invId = matchAddressOptionId(options, c.invoiceAddress) || options[0]?.id || "";
      const delId = matchAddressOptionId(options, c.deliveryAddress) || options[0]?.id || "";
      const invOpt = options.find((o) => o.id === invId) ?? options[0];
      const delOpt = options.find((o) => o.id === delId) ?? options[0];
      setForm((f) => ({
        ...f,
        customerId: c.id,
        customerName: c.name,
        customerEmail: c.email,
        customerPhone: c.phone,
        invoiceAddressId: invId,
        deliveryAddressId: delId,
        invoiceAddress: invOpt ? { ...invOpt.address } : { ...c.invoiceAddress },
        deliveryAddress: delOpt ? { ...delOpt.address } : { ...c.deliveryAddress },
      }));
      setCustomerQuery(c.name);
      setCustomerOpen(false);
    },
    [apiCustomers],
  );

  // New sales orders default to Walk-in Customer once (user can still change or create another).
  useEffect(() => {
    if (!open) {
      walkInDefaultAppliedRef.current = false;
      return;
    }
    if (mode !== "create" || order) return;
    if (walkInDefaultAppliedRef.current) return;
    // Wait until create reset cleared the form (avoid applying against a stale prior order).
    if (form.customerId) return;
    const fromApi = apiCustomers.find((c) => isWalkInCustomer(c));
    const walkIn =
      (fromApi ? allSalesCustomers.find((c) => c.id === fromApi.id) : null) ??
      allSalesCustomers.find((c) => isWalkInCustomer(c)) ??
      WALK_IN_SALES_CUSTOMER;
    applyCustomerToForm(walkIn);
    walkInDefaultAppliedRef.current = true;
  }, [
    open,
    mode,
    order,
    form.customerId,
    apiCustomers,
    allSalesCustomers,
    applyCustomerToForm,
  ]);

  const handleCustomerCreated = useCallback(
    async (saved: Customer) => {
      await refetchCustomers();
      const inv =
        saved.addresses?.find((a) => a.isDefault || a.contactType === "primary") ??
        saved.addresses?.[0];
      const del = saved.addresses?.[1] ?? inv;
      applyCustomerToForm({
        id: saved.id,
        name: saved.name,
        email: saved.email,
        phone: saved.phone,
        city: saved.city,
        invoiceAddress: makeAddress(
          inv?.address ?? "",
          inv?.city ?? saved.city,
          inv?.region ?? saved.region ?? saved.city,
          inv?.zip ?? "",
          inv?.country ?? saved.country ?? "Bangladesh",
          inv?.street2,
        ),
        deliveryAddress: makeAddress(
          del?.address ?? inv?.address ?? "",
          del?.city ?? saved.city,
          del?.region ?? saved.region ?? saved.city,
          del?.zip ?? "",
          del?.country ?? saved.country ?? "Bangladesh",
          del?.street2,
        ),
      });
      setPartnerSheetOpen(false);
    },
    [applyCustomerToForm, refetchCustomers],
  );

  const handlePartnerSaved = useCallback(
    async (saved: Customer) => {
      await refetchCustomers();
      setPartnerRecord(saved);
      const inv =
        saved.addresses?.find((a) => a.isDefault || a.contactType === "primary") ??
        saved.addresses?.[0];
      const del = saved.addresses?.[1] ?? inv;
      applyCustomerToForm({
        id: saved.id,
        name: saved.name,
        email: saved.email,
        phone: saved.phone,
        city: saved.city,
        invoiceAddress: makeAddress(
          inv?.address ?? "",
          inv?.city ?? saved.city,
          inv?.region ?? saved.region ?? saved.city,
          inv?.zip ?? "",
          inv?.country ?? saved.country ?? "Bangladesh",
          inv?.street2,
        ),
        deliveryAddress: makeAddress(
          del?.address ?? inv?.address ?? "",
          del?.city ?? saved.city,
          del?.region ?? saved.region ?? saved.city,
          del?.zip ?? "",
          del?.country ?? saved.country ?? "Bangladesh",
          del?.street2,
        ),
      });
      setPartnerSheetOpen(false);
    },
    [applyCustomerToForm, refetchCustomers],
  );

  // Hydrate empty customer contact/address fields from the live customer record
  // (orders only persist customer_id; phone/email/address come from the customer).
  useEffect(() => {
    if (!open || !form.customerId || !selectedCustomer) return;
    if (selectedCustomer.id !== form.customerId) return;
    setForm((f) => {
      const inv =
        selectedCustomer.addresses?.find(
          (a) => a.contactType !== "related" && (a.isDefault || a.contactType === "primary"),
        ) ?? selectedCustomer.addresses?.find((a) => a.contactType !== "related");
      const del =
        selectedCustomer.addresses?.filter((a) => a.contactType !== "related")[1] ?? inv;
      const next = { ...f };
      let changed = false;
      if (!f.customerPhone && selectedCustomer.phone) {
        next.customerPhone = selectedCustomer.phone;
        changed = true;
      }
      if (!f.customerEmail && selectedCustomer.email) {
        next.customerEmail = selectedCustomer.email;
        changed = true;
      }
      if (!f.invoiceAddress.street && inv?.address) {
        next.invoiceAddress = makeAddress(
          inv.address,
          inv.city || selectedCustomer.city,
          inv.region || selectedCustomer.region || selectedCustomer.city,
          inv.zip ?? "",
          inv.country || selectedCustomer.country || "Bangladesh",
          inv.street2,
        );
        changed = true;
      }
      if (!f.deliveryAddress.street && (del?.address || inv?.address)) {
        const src = del?.address ? del : inv!;
        next.deliveryAddress = makeAddress(
          src.address,
          src.city || selectedCustomer.city,
          src.region || selectedCustomer.region || selectedCustomer.city,
          src.zip ?? "",
          src.country || selectedCustomer.country || "Bangladesh",
          src.street2,
        );
        changed = true;
      }
      return changed ? next : f;
    });
  }, [open, form.customerId, selectedCustomer]);

  useEffect(() => {
    if (!open || !form.customerId || !customerAddressOptions.length) return;
    setForm((f) => {
      if (f.invoiceAddressId && f.deliveryAddressId) return f;
      const invId =
        f.invoiceAddressId ||
        matchAddressOptionId(customerAddressOptions, f.invoiceAddress) ||
        customerAddressOptions[0].id;
      const delId =
        f.deliveryAddressId ||
        matchAddressOptionId(customerAddressOptions, f.deliveryAddress) ||
        customerAddressOptions[0].id;
      if (invId === f.invoiceAddressId && delId === f.deliveryAddressId) return f;
      return { ...f, invoiceAddressId: invId, deliveryAddressId: delId };
    });
  }, [
    open,
    form.customerId,
    customerAddressOptions,
    form.invoiceAddressId,
    form.deliveryAddressId,
    form.invoiceAddress,
    form.deliveryAddress,
  ]);

  useEffect(() => {
    if (statusOpen) return;
    setStatusQuery(ORDER_STATUS_LABELS[form.status] ?? form.status);
  }, [form.status, statusOpen]);

  const selectCustomer = (id: string) => {
    const c = allSalesCustomers.find((x) => x.id === id);
    if (!c) return;
    applyCustomerToForm(c);
  };

  const selectStatus = (id: string) => {
    const status = id as OrderStatus;
    patch("status", status);
    setStatusQuery(ORDER_STATUS_LABELS[status]);
    setStatusOpen(false);
  };

  const openPartnerDrawer = async () => {
    if (!form.customerId.trim()) {
      toast.error("Select a customer first");
      return;
    }
    // The customer's own record. The loaded customer list is paged, so the one on this order may not be in it —
    // fetch it; failing that, show only what the order itself knows (never placeholder profile data).
    let resolved: Customer | null = null;
    try {
      resolved = await getCommerceCustomer(form.customerId);
    } catch {
      resolved = selectedCustomer;
    }
    setPartnerRecord(
      resolved ??
        buildMinimalPartnerFromSales(form.customerId, form.customerName, form.customerEmail, form.customerPhone, {
          street: form.invoiceAddress.street,
          city: form.invoiceAddress.city,
          state: form.invoiceAddress.state,
          zip: form.invoiceAddress.zip,
          country: form.invoiceAddress.country,
        }),
    );
    setPartnerSheetMode("edit");
    setPartnerSheetOpen(true);
  };

  const validateBeforeSave = (opts?: { checkStock?: boolean; requireSerials?: boolean }): boolean => {
    if (!form.customerId.trim() || !form.customerName.trim()) {
      toast.error("Select a customer");
      return false;
    }
    if (form.customerId.startsWith("sc_")) {
      toast.error("Select a customer from the database list");
      return false;
    }
    const productLines = form.lines.filter((line) => line.kind === "product");
    if (productLines.length === 0) {
      toast.error("Add at least one product line");
      return false;
    }
    if (opts?.checkStock !== false) {
      for (const line of productLines) {
        const blocked = stockBlocksSale(
          line.itemId ? productById.get(line.itemId) : undefined,
          line.quantity,
        );
        if (blocked) {
          toast.error(blocked);
          return false;
        }
      }
    }
    if (productLines.some((line) => !line.name.trim() || (!line.itemId && !line.sku.trim()))) {
      toast.error("Each product line needs a product from the catalog");
      return false;
    }
    if (productLines.some((line) => line.quantity <= 0)) {
      toast.error("Quantity must be at least 1");
      return false;
    }
    if (productLines.some((line) => line.unitPrice < 0)) {
      toast.error("Unit price cannot be negative");
      return false;
    }
    if (opts?.requireSerials) {
      for (const line of productLines) {
        const count = line.serialNumbers?.length ?? 0;
        const tracked = productById.get(line.itemId)?.trackSerial === true || count > 0;
        if (tracked && count !== line.quantity) {
          toast.error(
            `Add serial numbers for ${line.name || line.sku} (${count} of ${line.quantity})`,
          );
          return false;
        }
      }
    }
    if (isWalkInCustomer({ id: form.customerId, name: form.customerName })) {
      const due = formToOrder(formForPersist(), order, returnedForPersist).payment.dueAmount;
      if (due > 0.004) {
        toast.error("Walk-in Customer sales must be paid in full — no due/credit allowed");
        return false;
      }
    }
    return true;
  };

  const persist = useCallback(
    async (
      next: Order,
      action: "save" | "confirm" | "cancel" | "duplicate" | "delete",
      message: string,
      close = false,
    ) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      try {
        if (onSaveAction) {
          const saved = await onSaveAction(next, action);
          onSaved?.(saved);
        } else {
          onSave(next);
          onSaved?.(next);
        }
        clearCurrentDraft();
        toast.success(message);
        if (close) onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [onOpenChange, onSave, onSaveAction, onSaved, mode],
  );

  const applyStatus = (status: OrderStatus, message: string) => {
    if (!form.customerName.trim() && status !== "cancelled") {
      toast.error("Customer is required");
      return;
    }
    const next = formToOrder({ ...formForPersist(), status }, order, returnedForPersist);
    const action =
      status === "cancelled" ? "cancel" : status === "confirmed" ? "confirm" : "save";
    void persist(next, action, message);
    setForm((f) => ({ ...f, status }));
  };

  const handleSend = () => {
    toast.success("Email sent (mock)");
  };

  const handleDeliver = () => {
    applyStatus("shipped", `${form.orderNumber} marked for delivery`);
  };

  /* A website order's status: the shopper's order and this one move together (the shopper sees it in their
     account) and the Activity tab records it. The server answers with the order, activity included. */
  const handleWebsiteStatus = async (next: string) => {
    if (!order?.id || !next || next === order.websiteStatus) return;
    setWebsiteStatusBusy(true);
    try {
      const updated = await setWebsiteOrderStatus(order.id, next);
      onSaved?.(updated);
      toast.success(`Order status → ${WEBSITE_STATUS_LABELS[next] ?? next}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the status");
    } finally {
      setWebsiteStatusBusy(false);
    }
  };

  const handleRequestEdit = async () => {
    if (!order?.id) return;
    setEditRequestBusy(true);
    try {
      const updated = await requestSalesOrderEdit(order.id, editReason);
      onSaved?.(updated);
      setEditReason("");
      toast.success("Edit request sent for admin approval");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send edit request");
    } finally {
      setEditRequestBusy(false);
    }
  };

  const handleReviewEdit = async (decision: "approve" | "reject") => {
    if (!order?.id || !editRequest) return;
    setEditRequestBusy(true);
    try {
      const updated = await reviewSalesOrderEditRequest(order.id, editRequest.id, decision);
      onSaved?.(updated);
      toast.success(decision === "approve" ? "Edit request approved" : "Edit request rejected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not review edit request");
    } finally {
      setEditRequestBusy(false);
    }
  };

  const handleCancel = () => {
    if (!window.confirm(`Cancel ${form.orderNumber}? This cannot be undone.`)) return;
    void persist(
      formToOrder({ ...form, status: "cancelled" }, order, returnedForPersist),
      "cancel",
      `${form.orderNumber === "New" ? "Order" : form.orderNumber} cancelled`,
      true,
    );
  };

  const buildDocumentPayload = useCallback((): SalesPrintPayload | null => {
    const productLines = form.lines.filter((line) => line.kind === "product");
    if (productLines.length === 0) {
      toast.error("Add at least one product line before previewing");
      return null;
    }
    const existingMeta = order as (Order & { kind?: "order" | "quotation" }) | null;
    const kind: "order" | "quotation" =
      existingMeta?.kind ??
      (form.orderNumber.startsWith("QUO-")
        ? "quotation"
        : form.orderNumber === "New"
          ? form.recordKind
          : "order");
    const orderDate =
      order?.orderDate?.slice(0, 10) ||
      form.orderDate?.slice(0, 10) ||
      todayIso();
    return buildSalesPrintPayload({
      orderNumber: form.orderNumber === "New" ? "Draft" : form.orderNumber,
      orderDate,
      customerName: form.customerName || "Customer",
      customerCompany:
        selectedCustomer?.parentCompany?.trim() ||
        selectedCustomer?.addresses?.find((a) => a.parentCompany?.trim())?.parentCompany?.trim() ||
        undefined,
      customerPhone:
        form.customerPhone ||
        selectedCustomer?.phone ||
        order?.customer.phone ||
        "",
      customerEmail:
        form.customerEmail ||
        selectedCustomer?.email ||
        order?.customer.email ||
        "",
      invoiceAddress: form.invoiceAddress,
      columns: visibleLineCols,
      showDescription: lineColumns.description,
      lines: form.lines.map((line) => ({
        name: line.name,
        sku: line.sku,
        imageUrl: line.imageUrl,
        variant: line.variant,
        description: line.description,
        leadTime: line.leadTime,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountAmount: lineDiscountAmount(
          line.quantity,
          line.unitPrice,
          line.discount,
          line.discountType,
        ),
        // Hidden taxes are not charged (formForPersist zeroes them) — keep
        // the document on the same numbers as the totals box.
        taxRate: showOrderTaxes ? line.taxRate : 0,
        tax: showOrderTaxes ? line.tax : 0,
        serialNumbers: line.serialNumbers,
      })),
      kind,
      // Order-level totals exactly as the drawer's totals box shows them.
      orderDiscountAmount: discountAmount,
      shippingAmount: shippingChargeAmount,
      additionalExpenses: form.additionalExpenses.map((e) => ({
        title: e.title.trim() || "Additional expense",
        amount: e.amount || 0,
      })),
      returnedAmount: returnedTotal,
      paidAmount: paymentAmount,
      previousDueAmount: previousDue,
    });
  }, [
    form,
    lineColumns.description,
    order,
    selectedCustomer,
    visibleLineCols,
    showOrderTaxes,
    discountAmount,
    shippingChargeAmount,
    returnedTotal,
    paymentAmount,
    previousDue,
  ]);

  const openPrintPage = useCallback((payload: SalesPrintPayload): boolean => {
    const printKey = storeSalesPrintPayload(payload);
    const opened = window.open(salesPrintPath(printKey), "_blank", "noopener,noreferrer");
    return opened != null;
  }, []);

  const wrapWithCompanyInvoice = useCallback(
    // `source` lets Save and Print use the order the API just returned, since
    // the `order` prop still holds the pre-save (or null, for a new order)
    // record inside this closure.
    async (
      payload: SalesPrintPayload,
      source: Order | null = order,
    ): Promise<SalesPrintPayload> => {
      const existingMeta = source as (Order & Partial<SalesRecordMeta>) | null;
      const orderNumber = source?.orderNumber ?? form.orderNumber;
      const kind: "order" | "quotation" =
        existingMeta?.kind ??
        (orderNumber.startsWith("QUO-")
          ? "quotation"
          : orderNumber === "New"
            ? form.recordKind
            : "order");
      if (kind === "quotation") return payload;
      try {
        const company = await fetchWorkspaceCompany();
        let invoiceNumber = existingMeta?.invoiceNumber || "";
        let issuedAt = existingMeta?.invoicedAt || payload.orderDate;
        const canIssue = Boolean(
          source?.id && !source.id.startsWith("ord_") && orderNumber !== "New",
        );
        if (!invoiceNumber && canIssue && source?.id) {
          try {
            const issued = await issueSalesInvoice(source.id);
            invoiceNumber = issued.invoice_number || "";
            issuedAt = issued.invoiced_at || issuedAt;
            onSaved?.(apiSalesOrderToOrder(issued));
          } catch {
            invoiceNumber = company.invoice_next_preview || payload.documentNumber;
          }
        }
        const payments = form.paymentHistory
          .filter((p) => p.status === "completed")
          .map((p) =>
            p.kind === "refund"
              ? { method: `Refund · ${p.method}`, amount: -p.amount }
              : { method: p.method, amount: p.amount },
          );
        return attachSalesInvoicePrint(payload, company, {
          invoiceNumber,
          issuedAt,
          paid: paymentAmount,
          payments,
        });
      } catch {
        return payload;
      }
    },
    [form.orderNumber, form.paymentHistory, form.recordKind, onSaved, order, paymentAmount],
  );

  const handlePreview = () => {
    void (async () => {
      const payload = buildDocumentPayload();
      if (!payload) return;
      const next = await wrapWithCompanyInvoice(payload);
      setPreviewPayload(next);
      setDrawerPanel("preview");
    })();
  };

  const formForPersist = useCallback((): FormState => {
    if (showOrderTaxes) return form;
    return {
      ...form,
      lines: form.lines.map((l) =>
        l.kind === "product" ? { ...l, tax: 0, taxRate: 0 } : l,
      ),
    };
  }, [form, showOrderTaxes]);

  // Save on a draft sales order commits it as a confirmed sale (the backend
  // only confirms from "draft"); quotations and orders already past draft just
  // persist their edits. The separate Draft action keeps a sales order
  // unconfirmed.
  // The header Order Status pick overrides that default: Confirmed also confirms a quotation (it becomes the sales order),
  // Draft keeps a sales order unconfirmed.
  const canConfirmHere = form.status === "draft" || form.status === "pending";
  const saveConfirms =
    featureFlags.actionConfirm &&
    canConfirmHere &&
    (form.confirmChoice
      ? form.confirmChoice === "confirmed"
      : form.recordKind === "order" && form.status === "draft");
  // Serials are only enforced once the result is a confirmed sales order (never on drafts/quotes).
  const serialsRequired = (form.recordKind === "order" || saveConfirms) && (saveConfirms || form.status !== "draft");
  // Only a record not yet confirmed can still choose between staying a draft and being confirmed on Save.
  const statusChoosable = !readOnly && canConfirmHere;
  const statusSelectValue = form.confirmChoice || (saveConfirms ? "confirmed" : form.status);

  const saveMessage = (orderNumber: string) => {
    if (saveConfirms) {
      return mode === "create" ? "Sales order confirmed" : `${orderNumber} confirmed`;
    }
    return mode === "create"
      ? form.recordKind === "order"
        ? "Sales order saved"
        : "Quotation saved"
      : `${orderNumber} saved`;
  };

  const handleSave = () => {
    if (savingRef.current) return;
    if (!validateBeforeSave({ checkStock: saveConfirms, requireSerials: serialsRequired })) return;
    const status: OrderStatus = saveConfirms ? "confirmed" : form.status;
    const next = formToOrder({ ...formForPersist(), status }, order, returnedForPersist);
    void persist(next, saveConfirms ? "confirm" : "save", saveMessage(next.orderNumber), true);
    setForm((f) => ({ ...f, status, confirmChoice: "" }));
  };

  const handleSaveDraft = () => {
    if (savingRef.current) return;
    if (!validateBeforeSave({ checkStock: false })) return;
    const next = formToOrder({ ...formForPersist(), status: "draft" }, order, returnedForPersist);
    void persist(
      next,
      "save",
      mode === "create" ? "Sales order saved as draft" : `${next.orderNumber} saved as draft`,
      true,
    );
  };

  // typed but not saved: a new order with anything in it, or an existing order that differs from what was loaded
  const formDirty = useMemo(() => {
    if (!open) return false;
    if (mode === "create") {
      return (
        form.lines.some((l) => l.name.trim() || l.sku.trim() || l.description.trim()) ||
        (!!form.customerId && !isWalkInCustomer({ id: form.customerId, name: form.customerName })) ||
        form.notes.trim().length > 0
      );
    }
    return loadedFormSigRef.current != null && formSaveSignature(form) !== loadedFormSigRef.current;
  }, [open, mode, form]);

  const saveDraftIfDirty = () => {
    const key = draftKeyFor(mode, order?.id);
    if (!key || !formDirty) return;
    writeDraft<SalesOrderDraftPayload>(key, { form, scrollTop: bodyScrollRef.current?.scrollTop ?? 0 });
  };

  // a restored draft: go back to where the user was
  useEffect(() => {
    if (!open || pendingScrollRef.current == null) return;
    const top = pendingScrollRef.current;
    pendingScrollRef.current = null;
    const timer = window.setTimeout(() => bodyScrollRef.current?.scrollTo({ top }), 120);
    return () => window.clearTimeout(timer);
  }, [open, restoredDraftAt]);

  const toastedDraftRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !restoredDraftAt || toastedDraftRef.current === restoredDraftAt) return;
    toastedDraftRef.current = restoredDraftAt;
    toast.info(`Restored unsaved order draft from ${draftAgeLabel(restoredDraftAt)}`, {
      action: {
        label: "Discard",
        onClick: () => {
          clearCurrentDraft();
          if (mode === "create" || !order) {
            setForm({
              ...emptySalesOrderForm(initialKind ?? "quotation", warehouseAccess.defaultId ?? ""),
              salesperson: currentAdminUser?.name || OTHER_INFO_DEFAULTS.salesperson,
            });
          } else {
            const saved = orderToForm(order); // an existing order goes back to what was saved
            setForm(saved);
            setCustomerQuery(saved.customerName);
          }
          setRestoredDraftAt(null);
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, restoredDraftAt, initialKind, currentAdminUser]);

  const handleSaveAndPrint = () => {
    if (savingRef.current) return;
    // A clean, already-saved record has nothing to PUT (each PUT also writes a
    // "saved" activity row) — go straight to print. Confirming is a change.
    const skipSave =
      mode === "edit" &&
      !!order?.id &&
      !saveConfirms &&
      loadedFormSigRef.current != null &&
      formSaveSignature(form) === loadedFormSigRef.current;
    if (
      !skipSave &&
      !validateBeforeSave({ checkStock: saveConfirms, requireSerials: serialsRequired })
    ) {
      return;
    }
    const status: OrderStatus = saveConfirms ? "confirmed" : form.status;
    const next = formToOrder({ ...formForPersist(), status }, order, returnedForPersist);
    // Open the tab inside the click gesture so pop-up blockers allow it; it is
    // pointed at the print page once the save has returned the real order.
    // Keep the opener link: detaching it ("noopener" or opener = null) makes
    // browsers refuse the later location assignment. The print page is
    // same-origin, so that's safe.
    const printTab = window.open("", "_blank");
    savingRef.current = true;
    setSaving(true);
    void (async () => {
      try {
        let saved: Order = next;
        if (skipSave && order) {
          saved = order;
        } else if (onSaveAction) {
          saved = await onSaveAction(next, saveConfirms ? "confirm" : "save");
          onSaved?.(saved);
        } else {
          onSave(next);
          onSaved?.(next);
        }
        if (!skipSave) {
          clearCurrentDraft();
          toast.success(saveMessage(saved.orderNumber));
        }

        const base = buildDocumentPayload();
        if (!base) {
          printTab?.close();
          return;
        }
        const payload = await wrapWithCompanyInvoice(
          {
            ...base,
            documentNumber: saved.orderNumber,
            orderDate: saved.orderDate?.slice(0, 10) || base.orderDate,
            customerName: saved.customer?.name || base.customerName,
            customerPhone: base.customerPhone || saved.customer?.phone || "",
            customerEmail: base.customerEmail || saved.customer?.email || "",
          },
          saved,
        );
        if (printTab) {
          printTab.location.href = salesPrintPath(storeSalesPrintPayload(payload));
        } else if (!openPrintPage(payload)) {
          setPreviewPayload(payload);
          setDrawerPanel("preview");
          toast.info("Pop-up blocked. Use Print in the preview panel.");
        }
      } catch (err) {
        printTab?.close();
        toast.error(err instanceof Error ? err.message : "Save failed");
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    })();
  };

  const handlePrintPacking = (documentKind: SalesPackingDocumentKind) => {
    if (savingRef.current) return;
    // Same skip-save shortcut as Print: a clean, already-saved record has
    // nothing to PUT, so a re-print of the packing slip/delivery note goes
    // straight through without another activity row.
    const skipSave =
      mode === "edit" &&
      !!order?.id &&
      !saveConfirms &&
      loadedFormSigRef.current != null &&
      formSaveSignature(form) === loadedFormSigRef.current;
    if (
      !skipSave &&
      !validateBeforeSave({ checkStock: saveConfirms, requireSerials: serialsRequired })
    ) {
      return;
    }
    const status: OrderStatus = saveConfirms ? "confirmed" : form.status;
    const next = formToOrder({ ...formForPersist(), status }, order, returnedForPersist);
    const printTab = window.open("", "_blank");
    savingRef.current = true;
    setSaving(true);
    void (async () => {
      try {
        let saved: Order = next;
        if (skipSave && order) {
          saved = order;
        } else if (onSaveAction) {
          saved = await onSaveAction(next, saveConfirms ? "confirm" : "save");
          onSaved?.(saved);
        } else {
          onSave(next);
          onSaved?.(next);
        }
        if (!skipSave) {
          clearCurrentDraft();
          toast.success(saveMessage(saved.orderNumber));
        }

        const base = buildDocumentPayload();
        if (!base) {
          printTab?.close();
          return;
        }
        const merged = {
          ...base,
          documentNumber: saved.orderNumber,
          orderDate: saved.orderDate?.slice(0, 10) || base.orderDate,
          customerName: saved.customer?.name || base.customerName,
          customerPhone: base.customerPhone || saved.customer?.phone || "",
          customerEmail: base.customerEmail || saved.customer?.email || "",
        };
        const company = await fetchWorkspaceCompany();
        const payload = attachSalesPackingPrint(merged, company, documentKind, form.deliveryAddress);
        if (printTab) {
          printTab.location.href = salesPrintPath(storeSalesPrintPayload(payload));
        } else if (!openPrintPage(payload)) {
          setPreviewPayload(payload);
          setDrawerPanel("preview");
          toast.info("Pop-up blocked. Use Print in the preview panel.");
        }
      } catch (err) {
        printTab?.close();
        toast.error(err instanceof Error ? err.message : "Save failed");
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    })();
  };

  const handleDownloadPdf = () => {
    const payload = buildDocumentPayload();
    if (!payload) return;
    setPreviewPayload(payload);
    setDrawerPanel("preview");
    toast.info("Use Print, then choose Save as PDF");
  };

  const handleInvoiceUrl = async () => {
    const label = form.orderNumber === "New" ? "draft" : form.orderNumber;
    const url = `${window.location.origin}/print?order=${encodeURIComponent(label)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invoice URL copied to clipboard");
    } catch {
      toast.info(url);
    }
  };

  const handleDuplicate = () => {
    const next = formToOrder(
      {
        ...form,
        orderNumber: "New",
        status: "draft",
        confirmChoice: "",
      },
      null,
    );
    void persist(next, "duplicate", `Duplicated as ${next.orderNumber}`, true);
  };

  const handleDelete = () => {
    if (order) {
      void persist({ ...order, status: "cancelled" }, "delete", `${form.orderNumber === "New" ? "Order" : form.orderNumber} deleted`, true);
    }
  };

  const recordLabel = mode === "create" ? "New" : form.orderNumber;

  // a shop order still "Pending" is a real order too (the drawer files it under draft internally)
  const isSalesOrder =
    stage === "sales_order" || (!!order?.websiteStatus && order.websiteStatus !== "cancelled");

  return (
    <>
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) saveDraftIfDirty();
        onOpenChange(next);
      }}
    >
      <SheetContent
        title="Sales order"
        side="right"
        className={cn(
          AGAIN_DRAWER_CONTENT_CLASS,
          "sm:!max-w-none sm:!min-w-0",
          nested && "z-[280]",
        )}
        style={{ width: `min(100vw, ${Math.round(drawerWidth)}px)`, maxWidth: "100vw" }}
        onPointerDownOutside={() => saveDraftIfDirty()}
        onInteractOutside={() => saveDraftIfDirty()}
        onEscapeKeyDown={() => saveDraftIfDirty()}
      >
        <DrawerResizeHandle {...drawerResizeHandle} />
        <div ref={setRootEl} className="relative flex h-full min-h-0 flex-col bg-background">
          <AgainDrawerControlBar className="px-4 sm:px-6">
            {canEditOrder ? (
              <button
                type="button"
                className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
                style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
                disabled={saving}
                aria-busy={saving}
                onClick={() => {
                  handleSave();
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            ) : null}
            {canEditOrder ? (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]", TOOLBAR_DISABLED)} disabled={saving}>
                    Print
                    <ChevronDown className="ml-1 inline h-3 w-3" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[160px] rounded-none">
                  <DropdownMenuItem onSelect={handleSaveAndPrint}>Print order</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => handlePrintPacking("packing-slip")}>Packing slip</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => handlePrintPacking("delivery-note")}>Delivery note</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {canEditOrder && saveConfirms ? (
              <button
                type="button"
                className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]", TOOLBAR_DISABLED)}
                disabled={saving}
                onClick={handleSaveDraft}
              >
                Draft
              </button>
            ) : null}
            {canEditOrder &&
            mode === "edit" &&
            order?.id &&
            form.recordKind === "order" &&
            form.status !== "cancelled" &&
            form.status !== "completed" ? (
              <button
                type="button"
                className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]", TOOLBAR_DISABLED)}
                disabled={saving}
                onClick={handleCancel}
              >
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]", TOOLBAR_DISABLED)}
              disabled={saving}
              onClick={() => {
                if (canEditOrder) clearCurrentDraft();
                onOpenChange(false);
              }}
            >
              {canEditOrder ? "Discard" : "Close"}
            </button>
            {featureFlags.actionPreview ? (
              <button
                type="button"
                className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
                onClick={handlePreview}
              >
                Preview
              </button>
            ) : null}
            {canWrite && isSalesOrder && mode === "edit" && order?.id && form.status !== "cancelled" ? (
              <button
                type="button"
                className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
                onClick={() => setTab("return")}
              >
                Return
              </button>
            ) : null}
            {mode === "create" && canWrite ? (
              <div
                className="ml-2 inline-flex h-6 shrink-0 rounded-none border border-border/80"
                role="group"
                aria-label="Document type"
              >
                {(["quotation", "order"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      if (k === form.recordKind) return;
                      // Switch the document type in place — everything typed so far stays.
                      setForm((f) => ({ ...f, recordKind: k }));
                    }}
                    className={cn(
                      "px-2 text-[11px] font-medium capitalize transition-colors",
                      form.recordKind === k
                        ? "bg-[#00a09d] text-white"
                        : "bg-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {k === "order" ? "Sales order" : "Quotation"}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              <SalesStatusSteps stage={stage} status={form.status} />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-none"
                aria-label="Close"
                onClick={() => {
                  saveDraftIfDirty();
                  onOpenChange(false);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </AgainDrawerControlBar>

          {isLockableOrder &&
          (editRequest?.status === "pending" || editApprovedForMe || editLocked) ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-[11px] text-foreground">
              {editRequest?.status === "pending" ? (
                <>
                  <span className="font-medium">
                    Edit request pending — {editRequest.requestedByName ?? "staff"}
                    {editRequest.reason ? `: ${editRequest.reason}` : ""}
                  </span>
                  {isAdmin ? (
                    <>
                      <button
                        type="button"
                        className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
                        disabled={editRequestBusy}
                        onClick={() => void handleReviewEdit("approve")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
                        disabled={editRequestBusy}
                        onClick={() => void handleReviewEdit("reject")}
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Waiting for admin approval</span>
                  )}
                </>
              ) : editApprovedForMe ? (
                <span className="font-medium">
                  Edit approved by {editRequest?.reviewedByName ?? "admin"} — your next Save uses it.
                </span>
              ) : (
                <>
                  <span className="font-medium">This order is locked after confirmation.</span>
                  <input
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    placeholder="Reason for edit (optional)"
                    className="h-6 w-56 rounded-none border border-input bg-background px-2 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
                    disabled={editRequestBusy}
                    onClick={() => void handleRequestEdit()}
                  >
                    Request edit
                  </button>
                </>
              )}
            </div>
          ) : null}

          {isCancelledOrder ? (
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-1.5 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3 shrink-0" aria-hidden />
              <span>
                <span className="font-medium text-foreground">Cancelled</span> — this order is
                read-only.
              </span>
            </div>
          ) : null}

          {/* Sheet body */}
          {drawerPanel === "preview" && previewPayload ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#ececec] dark:bg-muted/20">
              <div className="flex shrink-0 items-center justify-between border-b border-border/80 bg-background px-4 py-2">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerPanel("order");
                    setPreviewPayload(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#00a09d] hover:underline"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back to{" "}
                  {form.orderNumber === "New"
                    ? form.recordKind === "order"
                      ? "sales order"
                      : "quotation"
                    : form.orderNumber}
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-none"
                  onClick={() => {
                    if (!previewPayload) return;
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
                <div id="sales-print-area" className="mx-auto max-w-[820px]">
                  {previewPayload.invoicePrint ? (
                    <InvoiceLayoutPreviewDocument
                      company={previewPayload.invoicePrint.company}
                      layout={previewPayload.invoicePrint.layout}
                      document={previewPayload.invoicePrint.document}
                    />
                  ) : (
                    <SalesOrderPrintDocument data={previewPayload} />
                  )}
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
                        {isExistingOrder ? form.orderNumber : titleLabel}
                      </h2>
                      {isExistingOrder && order?.websiteStatus ? (
                        <label
                          className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                          title="The shopper sees this status in their account"
                        >
                          Status
                          <span className="relative inline-flex w-[108px] shrink-0">
                            <select
                              id="website-order-status"
                              value={order.websiteStatus}
                              disabled={!canWrite || websiteStatusBusy || !(order.websiteNextStatuses ?? []).length}
                              onChange={(e) => void handleWebsiteStatus(e.target.value)}
                              // same size and look as the "Add customer" button below it
                              className={cn(
                                "h-6 w-full appearance-none rounded-none border px-2 pr-5 text-[11px] font-semibold normal-case tracking-normal outline-none",
                                "border-[#00a09d]/35 bg-[#00a09d]/10 text-[#00a09d] focus-visible:border-[#00a09d]",
                                "disabled:cursor-not-allowed disabled:opacity-70",
                                order.websiteStatus === "cancelled" && "border-red-500/40 bg-red-500/10 text-red-600",
                              )}
                            >
                              <option value={order.websiteStatus}>
                                {WEBSITE_STATUS_LABELS[order.websiteStatus] ?? order.websiteStatus}
                              </option>
                              {(order.websiteNextStatuses ?? []).map((st) => (
                                <option key={st} value={st}>
                                  {WEBSITE_STATUS_LABELS[st] ?? st}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[#00a09d]" aria-hidden />
                          </span>
                        </label>
                      ) : null}
                    </div>
                <div className="mt-4 grid gap-x-10 gap-y-4 @xl:grid-cols-2">
                  {/* left: the customer, with the invoice address under the name (Odoo sales order form) */}
                  <div className="grid grid-cols-[6.75rem_minmax(0,1fr)] items-start gap-x-2">
                    <span className="pt-0.5 text-[13px] font-semibold text-muted-foreground">Customer</span>
                    <div className="relative min-w-0" ref={customerAnchorRef}>
                    {/* Odoo form: the customer is a teal link with its address under it; the change / clear buttons show on hover */}
                    {readOnly ? (
                      form.customerName ? (
                        <button
                          type="button"
                          onClick={form.customerId ? openPartnerDrawer : undefined}
                          className={cn(
                            "block max-w-full truncate py-1 text-left text-[13px] font-medium text-[#00a09d]",
                            form.customerId && "hover:underline",
                          )}
                        >
                          {form.customerName}
                        </button>
                      ) : (
                        <p className="py-1 text-[13px] text-muted-foreground">No customer</p>
                      )
                    ) : form.customerId && !customerOpen ? (
                      <div className="group/cust flex min-w-0 items-center gap-1 border-b border-transparent hover:border-border/60">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openPartnerDrawer();
                          }}
                          className="min-w-0 truncate py-1 text-left text-[13px] font-medium text-[#00a09d] hover:underline"
                          title="Open customer"
                        >
                          {form.customerName}
                        </button>
                        <span className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/cust:opacity-100">
                          <button
                            type="button"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="Search customers"
                            title="Choose another customer"
                            aria-expanded={customerOpen}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setCustomerOpen(true);
                              setCustomerQuery(form.customerName);
                            }}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={clearCustomer}
                            title="Remove customer"
                            aria-label="Change customer"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </div>
                    ) : (
                      <div
                        ref={customerFieldRef}
                        className={cn("flex min-w-0 items-center gap-1 border-b focus-within:border-[#00a09d]", customerOpen ? "border-[#00a09d]" : "border-border/60")}
                      >
                        <input
                          value={customerOpen ? customerQuery : form.customerName || customerQuery || ""}
                          onChange={(e) => {
                            setCustomerQuery(e.target.value);
                            setCustomerOpen(true);
                            if (!e.target.value) {
                              clearCustomer();
                            }
                          }}
                          onFocus={() => {
                            setCustomerOpen(true);
                            if (form.customerId && !customerQuery) {
                              setCustomerQuery(form.customerName);
                            }
                          }}
                          placeholder="Type to find a customer..."
                          className="h-8 min-w-0 flex-1 bg-transparent text-[13px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
                          autoFocus={customerOpen}
                        />
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Search customers"
                          aria-expanded={customerOpen}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            if (customerOpen) setCustomerOpen(false);
                            else {
                              setCustomerOpen(true);
                              if (form.customerId) setCustomerQuery(form.customerName);
                            }
                          }}
                        >
                          <span aria-hidden className="h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-[#00a09d]" />
                        </button>
                        <button
                          type="button"
                          onClick={openPartnerCreate}
                          title="Add customer"
                          aria-label="Add customer"
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-[#00a09d] hover:bg-[#00a09d]/10"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <SearchDropdown
                      open={!readOnly && customerOpen}
                      placement="bottom" // always straight under the field, never flipped above it
                      getAnchor={getCustomerAnchor}
                      portalContainer={portalHost}
                      items={customerResults}
                      onSelect={selectCustomer}
                      onSearchMore={
                        customerQuery.trim()
                          ? () => {
                              setCustomerOpen(false);
                              openPartnerCreate();
                            }
                          : undefined
                      }
                      searchMoreLabel={
                        customerQuery.trim()
                          ? `Create "${customerQuery.trim()}"`
                          : "Search more..."
                      }
                      renderItem={(item) => (
                        <>
                          <span className="min-w-0 truncate text-foreground">{item.primary}</span>
                          {item.phone || item.email ? (
                            <span className="inline-flex max-w-[65%] shrink-0 items-center justify-end gap-x-1.5 truncate text-right text-muted-foreground">
                              {item.phone ? (
                                <span className="inline-flex min-w-0 items-center gap-0.5">
                                  <span className="truncate">{item.phone}</span>
                                  {item.phoneVerified ? (
                                    <BadgeCheck
                                      className="h-3.5 w-3.5 shrink-0 text-[#00a09d]"
                                      aria-label="Phone verified"
                                    />
                                  ) : null}
                                </span>
                              ) : null}
                              {item.phone && item.email ? (
                                <span className="text-border" aria-hidden>
                                  ·
                                </span>
                              ) : null}
                              {item.email ? (
                                <span className="inline-flex min-w-0 items-center gap-0.5">
                                  <span className="truncate">{item.email}</span>
                                  {item.emailVerified ? (
                                    <BadgeCheck
                                      className="h-3.5 w-3.5 shrink-0 text-[#00a09d]"
                                      aria-label="Email verified"
                                    />
                                  ) : null}
                                </span>
                              ) : null}
                            </span>
                          ) : item.secondary ? (
                            <span className="max-w-[60%] shrink-0 truncate text-right text-muted-foreground">
                              {item.secondary}
                            </span>
                          ) : null}
                        </>
                      )}
                    />
                      {form.customerName && (customerCompanyName || customerDisplayPhone || customerDisplayEmail) ? (
                        <div className="mt-1.5 space-y-0.5 text-[13px] leading-snug text-foreground">
                          {customerCompanyName ? <p className="truncate">{customerCompanyName}</p> : null}
                          {customerDisplayPhone ? (
                            <p className="flex items-center gap-1">
                              {customerDisplayPhone}
                              {customerPhoneVerified ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[#00a09d]" aria-label="Phone verified" /> : null}
                            </p>
                          ) : null}
                          {customerDisplayEmail ? (
                            <p className="flex min-w-0 items-center gap-1">
                              <span className="truncate">{customerDisplayEmail}</span>
                              {customerEmailVerified ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[#00a09d]" aria-label="Email verified" /> : null}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {(() => {
                        const a = form.invoiceAddress;
                        const lines = [
                          a.street,
                          a.street2,
                          [a.city, a.state, a.zip].filter((p) => p && p.trim()).join(" "),
                          a.country,
                        ].filter((l): l is string => Boolean(l && l.trim()));
                        return lines.length && form.customerName ? (
                          <div className="mt-1.5 space-y-0.5 text-[13px] leading-snug text-foreground">
                            {lines.map((line, i) => (
                              <p key={i}>{line}</p>
                            ))}
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  {/* right: order date, payment terms, promised delivery */}
                  <div className="again-odoo-form min-w-0">
                    <AgainFormField label="Order Date" className={SALES_HEADER_ROW_CLASS}>
                      <input
                        type="date"
                        value={form.orderDate}
                        disabled={readOnly}
                        onChange={(e) => patch("orderDate", e.target.value)}
                        className="h-8 w-full bg-transparent px-1 text-[13px] outline-none disabled:opacity-60"
                      />
                    </AgainFormField>
                    <AgainFormField label="Business Location" className={SALES_HEADER_ROW_CLASS}>
                      <FilterSelect
                        value={form.warehouseId}
                        onChange={(v) => patch("warehouseId", v)}
                        width="w-full"
                        ariaLabel="Business location"
                        options={[
                          ...(warehouseAccess.restricted ? [] : [{ value: "", label: "Default" }]),
                          ...warehouseAccess
                            .pickable(warehouses, form.warehouseId)
                            .map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
                        ]}
                      />
                    </AgainFormField>
                    <AgainFormField label="Order Status" className={SALES_HEADER_ROW_CLASS}>
                      {statusChoosable ? (
                        <select
                          value={statusSelectValue}
                          disabled={readOnly}
                          onChange={(e) => {
                            const v = e.target.value;
                            patch("confirmChoice", v === "draft" || v === "confirmed" ? v : "");
                          }}
                          aria-label="Order status"
                          className="h-8 w-full bg-transparent px-1 text-[13px] outline-none disabled:opacity-60"
                        >
                          <option value="draft">Draft — not confirmed yet</option>
                          {form.status === "pending" ? <option value="pending">Pending</option> : null}
                          {featureFlags.actionConfirm ? (
                            <option value="confirmed">Confirmed — becomes a sales order on save</option>
                          ) : null}
                        </select>
                      ) : (
                        <div className="flex min-h-[28px] items-center">
                          <span
                            className={cn(
                              "inline-flex h-6 items-center border px-2 text-[11px] font-medium",
                              SALES_STATUS_TONE[form.status] ?? SALES_STATUS_TONE.draft,
                            )}
                          >
                            {ORDER_STATUS_LABELS[form.status] ?? form.status}
                          </span>
                        </div>
                      )}
                    </AgainFormField>
                  </div>
                </div>
              </div>
            </div>

            {/* Notebook tabs — same purple top-border style as customer drawer */}
            <div className="-mx-4 sm:-mx-6">
              <AgainFormNotebook
                tabs={[
                  { id: "lines" as const, label: "Order Lines" },
                  ...(featureFlags.tabPayment
                    ? [{ id: "payment" as const, label: "Payment" }]
                    : []),
                  ...(featureFlags.tabShipping
                    ? [{ id: "shipping" as const, label: "Shipping" }]
                    : []),
                  { id: "others" as const, label: "Others" },
                  { id: "info" as const, label: "Info" },
                  ...(isExistingOrder &&
                  !isCancelledOrder &&
                  (stage !== "quotation" || (!!order?.websiteStatus && order.websiteStatus !== "cancelled"))
                    ? [{ id: "return" as const, label: "Returns" }]
                    : []),
                  ...(featureFlags.tabHistory
                    ? [{ id: "history" as const, label: "Activity" }]
                    : []),
                ]}
                active={tab}
                onChange={setTab}
                className="border-t-0"
                tabsClassName="pl-1.5 sm:pl-3.5"
                contentClassName="bg-transparent px-4 py-4 dark:bg-transparent sm:px-6"
              >
            {tab === "lines" ? (
              <div className="mt-0">
                {!readOnly ? (
                  <div className="mb-3 min-w-0">
                    <ProductSearchAdd
                      items={catalogProducts}
                      portalHost={portalHost}
                      onQueryChange={searchProductsOnServer}
                      onFilterChange={loadProductsForFilter}
                      onPick={(item, scan) => pickProductFromSearch(item, scan)}
                      onAddNew={() => {
                        const empty = form.lines.find(
                          (l) =>
                            l.kind === "product" &&
                            !l.itemId &&
                            !l.sku.trim() &&
                            !l.name.trim(),
                        );
                        if (empty) {
                          openProductCreate(empty.id);
                          return;
                        }
                        const id = `li_${Date.now()}`;
                        setForm((f) => ({
                          ...f,
                          lines: [
                            ...f.lines,
                            {
                              id,
                              kind: "product",
                              itemId: "",
                              name: "",
                              sku: "",
                              imageUrl: "",
                              variant: "",
                              description: "",
                              leadTime: "",
                              quantity: 1,
                              unitPrice: 0,
                              discount: 0,
                              discountType: "fixed",
                              tax: 0,
                              taxRate: DEFAULT_TAX_RATE,
                            },
                          ],
                        }));
                        openProductCreate(id);
                      }}
                    />
                  </div>
                ) : null}
                <div className="relative">
                <div className="overflow-x-auto">
                  <DndContext
                    sensors={lineDragSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleLineDragEnd}
                  >
                  <table
                    className="w-full min-w-[640px] border-collapse text-[13px]"
                    style={{ tableLayout: "fixed" }}
                  >
                    <colgroup>
                      <col style={{ width: 16 }} />
                      {visibleLineCols.map((col) =>
                        col === "product" ? <col key={col} /> : <col key={col} style={{ width: lineColWidths[col] }} />,
                      )}
                      <col style={{ width: LINE_ACTION_COL_WIDTH }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-border/80 text-left">
                        <th className="w-4 py-2" aria-label="Reorder" />
                        {visibleLineCols.map((col) => (
                          <LineTableHeaderCell
                            key={col}
                            col={col}
                            width={lineColWidths[col]}
                            align={
                              col === "quantity" ||
                              col === "unitPrice" ||
                              col === "discount" ||
                              col === "taxes" ||
                              col === "taxIncl" ||
                              col === "amount" ||
                              col === "leadTime"
                                ? "right"
                                : "left"
                            }
                            readOnly={readOnly}
                            dragCol={dragLineCol}
                            onDragColChange={setDragLineCol}
                            onMoveColumn={moveLineColumn}
                            onResizeStart={startLineColResize}
                          />
                        ))}
                        <th className={cn(LINE_TABLE_ACTION_HEAD_CLASS, "py-1")}>
                          {!readOnly ? (
<DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="Optional columns"
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          sideOffset={6}
                          className="z-[200] min-w-[168px] border-border bg-popover p-1 text-popover-foreground"
                        >
                          {LINE_COLUMN_KEYS.filter((key) => {
                            if (
                              (key === "taxes" || key === "taxIncl") &&
                              !salesTaxesEnabled
                            ) {
                              return false;
                            }
                            if (key === "discount" && !featureFlags.optionDiscounts) {
                              return false;
                            }
                            return true;
                          }).map((key) => (
                            <DropdownMenuItem
                              key={key}
                              className="gap-2.5"
                              onSelect={(e) => {
                                e.preventDefault();
                                toggleLineColumn(key);
                              }}
                            >
                              <span
                                className={cn(
                                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border",
                                  lineColumns[key]
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-muted-foreground/50 bg-transparent",
                                )}
                              >
                                {lineColumns[key] ? (
                                  <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                                    <path
                                      d="M2.5 6.2 5 8.7 9.5 3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                ) : null}
                              </span>
                              {LINE_COLUMN_LABELS[key]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                          ) : null}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <SortableContext
                        items={form.lines.map((l) => l.id)}
                        strategy={verticalListSortingStrategy}
                      >
                          {lineGroups.map((group) => {
                            const renderLine = (line: FormLine, asVariantChild: boolean) => {
                              if (line.kind === "section" || line.kind === "note") {
                                const isSection = line.kind === "section";
                                return (
                                  <SortableOrderLineRow
                                    key={line.id}
                                    id={line.id}
                                    readOnly={readOnly}
                                  >
                                    <td
                                      colSpan={visibleLineCols.length}
                                      className="relative py-1.5 pr-3"
                                    >
                                      {readOnly ? (
                                        <p
                                          className={cn(
                                            "px-1 text-[13px]",
                                            isSection
                                              ? "font-semibold uppercase tracking-wide text-foreground"
                                              : "italic text-muted-foreground",
                                          )}
                                        >
                                          {line.name || (isSection ? "Section" : "Note")}
                                        </p>
                                      ) : (
                                        <input
                                          value={line.name}
                                          onChange={(e) =>
                                            patchLine(line.id, { name: e.target.value })
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
                                      )}
                                    </td>
                                    <LineActionCell readOnly={readOnly} onRemove={() => removeLine(line.id)} />
                                  </SortableOrderLineRow>
                                );
                              }

                              const discAmt = lineDiscountAmount(
                                line.quantity,
                                line.unitPrice,
                                line.discount,
                                line.discountType,
                              );
                              const amount = Math.max(
                                0,
                                line.quantity * line.unitPrice - discAmt,
                              );
                              const taxIncl = amount + (line.tax || 0);
                              const isProductOpen = productOpenId === line.id;
                              const cellInput = cn(
                                "w-full border-b border-border/50 bg-transparent outline-none focus:border-[#00a09d]",
                                asVariantChild
                                  ? "h-6 text-[11px] leading-tight"
                                  : "h-8",
                              );
                              const cellCtx = {
                                readOnly,
                                line,
                                amount,
                                taxIncl,
                                isProductOpen,
                                productQuery,
                                cellInput,
                                descOpenIds,
                                productResults,
                                productById,
                                portalHost,
                                productAnchorsRef,
                                onPatchLine: patchLine,
                                onProductQueryChange: setProductQuery,
                                onProductOpenIdChange: setProductOpenId,
                                onApplyProduct: applyProductToLine,
                                onToggleDescription: toggleDescription,
                                onOpenProductView: openProductView,
                                onAddNewProduct: openProductCreate,
                                productDisplayOverride: asVariantChild
                                  ? line.variant?.trim() || line.sku || "Option"
                                  : null,
                                compact: asVariantChild,
                                SearchDropdown,
                              };
                              return (
                                <SortableOrderLineRow
                                  key={line.id}
                                  id={line.id}
                                  readOnly={readOnly}
                                  compact={asVariantChild}
                                >
                                  {visibleLineCols.map((col, colIdx) => (
                                    <td
                                      key={col}
                                      className={cn(
                                        lineCellClassName(col, asVariantChild),
                                        colIdx === visibleLineCols.length - 1 && "relative",
                                      )}
                                    >
                                      {renderSalesOrderLineCell(col, cellCtx)}
                                      {col === "product" &&
                                      (productById.get(line.itemId)?.trackSerial ||
                                        line.serialNumbers?.length) ? (
                                        <LineSerialRow
                                          serials={line.serialNumbers ?? []}
                                          quantity={line.quantity}
                                          readOnly={readOnly}
                                          compact={asVariantChild}
                                          onAdd={(serial) => addSerialToLine(line.id, serial)}
                                          onRemove={(serial) => removeSerialFromLine(line.id, serial)}
                                          onPick={() => setSerialPickLineId(line.id)}
                                        />
                                      ) : null}
                                    </td>
                                  ))}
                                  <LineActionCell readOnly={readOnly} compact={asVariantChild} onRemove={() => removeLine(line.id)} />
                                </SortableOrderLineRow>
                              );
                            };

                            if (!group.grouped) {
                              return renderLine(group.lines[0], false);
                            }

                            return (
                              <Fragment key={group.key}>
                                <tr className="border-b border-border/60 bg-muted/30">
                                  <td className="w-4 py-1.5" />
                                  {visibleLineCols.map((col) => (
                                    <td key={col} className={lineCellClassName(col)}>
                                      {col === "product" ? (
                                        <p className="line-clamp-2 text-[12px] font-medium leading-snug text-foreground">
                                          {group.name}
                                        </p>
                                      ) : null}
                                      {col === "quantity" ? (
                                        <span className="tabular-nums text-[12px] text-muted-foreground">
                                          {group.totalQty}
                                        </span>
                                      ) : null}
                                      {col === "amount" ? (
                                        <span className="tabular-nums text-[12px] font-medium">
                                          {formatCurrency(group.totalAmount)}
                                        </span>
                                      ) : null}
                                    </td>
                                  ))}
                                  <td className="w-6 bg-muted/30" />
                                </tr>
                                {group.lines.map((line) => renderLine(line, true))}
                              </Fragment>
                            );
                          })}
                      </SortableContext>
                    </tbody>
                  </table>
                  </DndContext>
                </div>
                </div>
                {/* room under the last line: the totals card floats over the bottom right, the list scrolls clear of it */}
                <div className="h-36" aria-hidden />
              </div>
            ) : null}

            {tab === "shipping" ? (
              // Odoo form: titled groups, label left / underline control right (docs/common/formcommon.md).
              <div className="again-odoo-form @container space-y-5">
                <div>
                  <AgainFormGroupTitle>Ship to</AgainFormGroupTitle>
                <div>
                  <div
                    ref={deliveryAddrAnchorRef}
                    className="flex items-start gap-0.5 border-b border-border/50 pb-0.5 focus-within:border-[#00a09d]"
                  >
                    {!readOnly && form.customerId && customerAddressOptions.length > 0 ? (
                      <button
                        type="button"
                        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-muted-foreground transition-colors hover:bg-[#00a09d]/10 hover:text-[#00a09d]"
                        aria-label="Select shipping address"
                        aria-expanded={deliveryAddrOpen}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (deliveryAddrOpen) setDeliveryAddrOpen(false);
                          else setDeliveryAddrOpen(true);
                        }}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    <div className="min-w-0 flex-1 py-1">
                      {form.customerId ? (
                        <>
                          <p className="text-[13px] font-medium text-foreground">
                            {form.customerName || "Customer"}
                          </p>
                          {(form.customerPhone || customerPreviewContact.phone) ? (
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                              {form.customerPhone || customerPreviewContact.phone}
                            </p>
                          ) : null}
                          {(form.customerEmail || customerPreviewContact.email) ? (
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                              {form.customerEmail || customerPreviewContact.email}
                            </p>
                          ) : null}
                          <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-snug text-muted-foreground">
                            {formatFullAddress(form.deliveryAddress) ||
                              formatFullAddress(customerPreviewContact.address) ||
                              "No shipping address"}
                          </p>
                        </>
                      ) : (
                        <p className="py-1 text-[13px] text-muted-foreground">
                          Select a customer in the header to set shipping address.
                        </p>
                      )}
                    </div>
                  </div>
                  <SearchDropdown
                    open={
                      !readOnly &&
                      deliveryAddrOpen &&
                      customerAddressOptions.length > 0
                    }
                    getAnchor={() => deliveryAddrAnchorRef.current}
                    portalContainer={portalHost}
                    items={customerAddressOptions.map((o) => ({
                      id: o.id,
                      primary: formatFullAddress(o.address) || o.primary,
                      secondary: [o.phone, o.primary !== form.customerName ? o.primary : null]
                        .filter(Boolean)
                        .join(" · "),
                    }))}
                    onSelect={(id) => {
                      const opt = customerAddressOptions.find((o) => o.id === id);
                      if (opt) selectDeliveryAddress(opt);
                    }}
                    renderItem={(item) => (
                      <div className="min-w-0 py-0.5">
                        <p className="whitespace-normal break-words text-[13px] leading-snug text-foreground">
                          {item.primary}
                        </p>
                        {item.secondary ? (
                          <p className="mt-0.5 text-[12px] text-muted-foreground">
                            {item.secondary}
                          </p>
                        ) : null}
                      </div>
                    )}
                  />
                </div>
                </div>

                <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                  <AgainFormGroupTitle className="@xl:col-span-2">Shipping</AgainFormGroupTitle>
                  {readOnly ? (
                    <>
                      <AgainFormField label="Line">
                        <p className="py-1 text-[13px]">{SHIPPING_LINE_OPTIONS.find((o) => o.id === form.shippingLineId)?.label || "\u2014"}</p>
                      </AgainFormField>
                      <AgainFormField label="Charge">
                        <p className="py-1 text-[13px] tabular-nums">{formatCurrency(form.orderShippingCharge ?? 0)}</p>
                      </AgainFormField>
                      <AgainFormField label="Weight">
                        <p className="py-1 text-[13px] tabular-nums">{form.shippingWeight ? `${form.shippingWeight} kg` : "\u2014"}</p>
                      </AgainFormField>
                      {form.shippingNote ? (
                        <AgainFormField label="Note">
                          <p className="whitespace-pre-wrap py-1 text-[13px]">{form.shippingNote}</p>
                        </AgainFormField>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <AgainFormField label="Line">
                        <select
                          value={form.shippingLineId}
                          onChange={(e) => applyShippingLine(e.target.value)}
                          className="h-8 w-full bg-transparent px-1 text-[13px] outline-none"
                        >
                          {SHIPPING_LINE_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label} · {opt.eta}
                            </option>
                          ))}
                        </select>
                      </AgainFormField>
                      <AgainFormField label="Charge">
                        <LineNumericInput
                          value={form.orderShippingCharge ?? 0}
                          onChange={(n) => patch("orderShippingCharge", n)}
                          className="h-8 w-full bg-transparent px-1 text-[13px] tabular-nums outline-none"
                        />
                      </AgainFormField>
                      <AgainFormField label="Weight">
                        <div className="flex h-8 items-center gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={form.shippingWeight}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v !== "" && !/^\d*\.?\d*$/.test(v)) return;
                              patch("shippingWeight", v);
                            }}
                            placeholder="—"
                            aria-label="Shipping weight"
                            className="h-full min-w-0 flex-1 bg-transparent px-1 text-[13px] tabular-nums outline-none"
                          />
                          <span className="shrink-0 text-[11px] text-muted-foreground">kg</span>
                        </div>
                      </AgainFormField>
                      <AgainFormField label="Note">
                        <input
                          value={form.shippingNote}
                          onChange={(e) => patch("shippingNote", e.target.value)}
                          placeholder="Shipping note (optional)"
                          className="h-8 w-full bg-transparent px-1 text-[13px] outline-none"
                        />
                      </AgainFormField>
                    </>
                  )}
                </div>

                {form.shippingLineId === "pathao" ? (
                  <div>
                    <AgainFormGroupTitle>Pathao courier</AgainFormGroupTitle>
                    {form.trackingNumber ? (
                      <AgainFormField label="Consignment">
                        <p className="py-1 text-[13px]">
                          {form.trackingUrl ? (
                            <a href={form.trackingUrl} target="_blank" rel="noreferrer" className="font-medium text-[#00a09d] hover:underline">
                              {form.trackingNumber}
                            </a>
                          ) : (
                            <span className="font-medium">{form.trackingNumber}</span>
                          )}
                        </p>
                      </AgainFormField>
                    ) : readOnly ? (
                      <p className="py-1 text-[13px] text-muted-foreground">Not booked yet.</p>
                    ) : (
                      <div className="space-y-1.5 py-1">
                        <AgainDrawerButton variant="primary" disabled={pathaoBooking || !order?.id} onClick={() => void bookPathaoShipment()}>
                          {pathaoBooking ? "Booking\u2026" : "Create Pathao shipment"}
                        </AgainDrawerButton>
                        {!order?.id ? <p className="text-[11px] text-muted-foreground">Save the order first.</p> : null}
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                  <AgainFormGroupTitle className="@xl:col-span-2">Delivery</AgainFormGroupTitle>
                  {readOnly ? (
                    <>
                      <AgainFormField label="Shipping status">
                        <p className="py-1 text-[13px]">{SHIPPING_STATUS_LABELS[form.shippingStatus]}</p>
                      </AgainFormField>
                      <AgainFormField label="Delivered to">
                        <p className="py-1 text-[13px]">{form.deliveredTo || "\u2014"}</p>
                      </AgainFormField>
                      <AgainFormField label="Delivery person">
                        <p className="py-1 text-[13px]">{mentionableUsers.find((u) => u.id === form.deliveryPersonId)?.name || "\u2014"}</p>
                      </AgainFormField>
                    </>
                  ) : (
                    <>
                      <AgainFormField label="Shipping status">
                        <select
                          value={form.shippingStatus}
                          onChange={(e) => patch("shippingStatus", e.target.value as FormState["shippingStatus"])}
                          className="h-8 w-full bg-transparent px-1 text-[13px] outline-none"
                        >
                          {Object.entries(SHIPPING_STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </AgainFormField>
                      <AgainFormField label="Delivered to">
                        <input
                          value={form.deliveredTo}
                          onChange={(e) => patch("deliveredTo", e.target.value)}
                          placeholder="Recipient name"
                          className="h-8 w-full bg-transparent px-1 text-[13px] outline-none"
                        />
                      </AgainFormField>
                      <AgainFormField label="Delivery person">
                        <select
                          value={form.deliveryPersonId}
                          onChange={(e) => patch("deliveryPersonId", e.target.value)}
                          className="h-8 w-full bg-transparent px-1 text-[13px] outline-none"
                        >
                          <option value="">Unassigned</option>
                          {mentionableUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </AgainFormField>
                    </>
                  )}
                </div>

                <div>
                  <AgainFormGroupTitle>Shipping documents</AgainFormGroupTitle>
                  <OrderDocumentsBox
                    orderId={order?.id}
                    readOnly={readOnly}
                    fileType="shipping_document"
                    savePrompt="Save the order first to attach shipping documents."
                    emptyText="No shipping documents yet."
                  />
                </div>
              </div>
            ) : null}

            {tab === "payment" ? (
              <div className="space-y-6">
                {!readOnly && featureFlags.optionRegisterPayment ? (
                  <div className="again-odoo-form @container">
                    <AgainFormGroupTitle>{payDraftKind === "refund" ? "Register return due" : "Register payment"}</AgainFormGroupTitle>
                    {refundDue > 0 ? (
                      <AgainFormField label="Entry type">
                        <div className="flex min-h-[28px] items-center">
                        <span
                          className="inline-flex h-5 shrink-0 border border-border"
                          role="group"
                          aria-label="Entry type"
                        >
                          <button
                            type="button"
                            className={cn(
                              "inline-flex h-full items-center justify-center px-2 text-[10px] font-medium",
                              payDraftKind === "payment"
                                ? "bg-[#00a09d] text-white"
                                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                            aria-pressed={payDraftKind === "payment"}
                            onClick={() => {
                              setPayDraftKind("payment");
                              setPayDraftAmountTouched(false);
                            }}
                          >
                            Payment
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "inline-flex h-full items-center justify-center border-l border-border px-2 text-[10px] font-medium",
                              payDraftKind === "refund"
                                ? "bg-amber-600 text-white"
                                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                            aria-pressed={payDraftKind === "refund"}
                            onClick={() => {
                              setPayDraftKind("refund");
                              setPayDraftAmountTouched(false);
                            }}
                          >
                            Return due
                          </button>
                        </span>
                        </div>
                      </AgainFormField>
                    ) : null}
                    {payDraftKind === "refund" ? (
                      <p className="mb-1 text-[12px] text-amber-700 dark:text-amber-400">Refund owed to customer: {formatCurrency(refundDue)}</p>
                    ) : null}
                    <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                      <AgainFormField label="Method">
                        <select value={payDraftMethod} onChange={(e) => setPayDraftMethod(e.target.value)} className="h-8 w-full bg-transparent px-1 text-[13px] outline-none">
                          {PAYMENT_METHOD_OPTIONS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </AgainFormField>
                      <AgainFormField label="Date">
                        <input
                          type="datetime-local"
                          value={payDraftAt}
                          onChange={(e) => setPayDraftAt(e.target.value)}
                          className="h-8 w-full min-w-0 bg-transparent px-1 text-[13px] outline-none"
                          aria-label="Payment date and time"
                        />
                      </AgainFormField>
                      <AgainFormField label="Amount">
                        <LineNumericInput
                          value={payDraftAmount}
                          onChange={(n) => {
                            setPayDraftAmount(n);
                            setPayDraftAmountTouched(true);
                          }}
                          className="h-8 w-full bg-transparent px-1 text-[13px] tabular-nums outline-none"
                        />
                      </AgainFormField>
                      {paymentAccounts.length > 0 ? (
                        <AgainFormField label="Account">
                          <select
                            value={payDraftAccountId}
                            onChange={(e) => setPayDraftAccountId(e.target.value)}
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
                          onChange={(e) => setPayDraftNote(e.target.value)}
                          placeholder="Note / transaction ID (optional)"
                          className="h-8 w-full bg-transparent px-1 text-[13px] outline-none"
                        />
                      </AgainFormField>
                    </div>
                    <div className="flex justify-end pt-2">
                      <AgainDrawerButton
                        variant="primary"
                        style={payDraftKind === "refund" ? { backgroundColor: "#b45309" } : undefined}
                        onClick={registerPayment}
                      >
                        {payDraftKind === "refund" ? "Add return due" : "Add payment"}
                      </AgainDrawerButton>
                    </div>
                  </div>
                ) : null}

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <SectionTitle>Payment history</SectionTitle>
                    {form.paymentHistory.length > 0 ? (
                      <p className="text-[12px] tabular-nums text-muted-foreground">
                        Paid{" "}
                        {formatCurrency(
                          form.paymentHistory
                            .filter((p) => p.status === "completed" && p.kind !== "refund")
                            .reduce((s, p) => s + p.amount, 0),
                        )}
                        {form.paymentHistory.some((p) => p.kind === "refund") ? (
                          <span className="ml-2 text-amber-700 dark:text-amber-400">
                            Refunded{" "}
                            {formatCurrency(
                              form.paymentHistory
                                .filter((p) => p.status === "completed" && p.kind === "refund")
                                .reduce((s, p) => s + p.amount, 0),
                            )}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>

                  {form.paymentHistory.length > 0 ? (
                    <ul className="divide-y divide-border/60 border border-border">
                      {form.paymentHistory.map((evt) => (
                        <li
                          key={evt.id}
                          className="flex items-center gap-2 px-3 py-1.5 text-[13px]"
                        >
                          {evt.kind === "refund" ? (
                            <span className="shrink-0 border border-amber-700/40 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-400/40 dark:text-amber-400">
                              Refund
                            </span>
                          ) : null}
                          <p className="min-w-0 shrink-0 font-medium text-foreground">
                            {evt.method}
                          </p>
                          {evt.accountName ? (
                            <p className="shrink-0 text-[11px] text-muted-foreground">
                              → {evt.accountName}
                            </p>
                          ) : null}
                          {evt.note ? (
                            <p className="min-w-0 truncate text-[12px] text-muted-foreground">
                              {evt.note}
                            </p>
                          ) : null}
                          {readOnly ? (
                            <p className="shrink-0 text-[12px] text-muted-foreground">
                              {formatHistoryAt(evt.at)}
                            </p>
                          ) : (
                            <input
                              type="datetime-local"
                              value={toDatetimeLocalValue(evt.at)}
                              onChange={(e) =>
                                updatePaymentEntry(evt.id, {
                                  at: fromDatetimeLocalValue(e.target.value),
                                })
                              }
                              className="h-6 w-[168px] shrink-0 rounded-none border border-border/60 bg-transparent px-1 text-[11px] text-muted-foreground outline-none focus:border-[#00a09d] focus:text-foreground"
                              aria-label="Payment date and time"
                            />
                          )}
                          <p className="shrink-0 capitalize text-[12px] text-muted-foreground">
                            {evt.status}
                          </p>
                          <p
                            className={cn(
                              "ml-auto shrink-0 tabular-nums font-medium",
                              evt.kind === "refund" && "text-amber-700 dark:text-amber-400",
                            )}
                          >
                            {evt.kind === "refund" ? "-" : ""}
                            {formatCurrency(evt.amount)}
                          </p>
                          {readOnly ? null : paymentsPosted && evt.status === "completed" ? (
                            <span
                              className="inline-flex shrink-0 text-muted-foreground/70"
                              title="Posted to ledger — record a refund to reverse"
                              aria-label="Posted to ledger — record a refund to reverse"
                            >
                              <Lock className="h-3.5 w-3.5" />
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="shrink-0 text-muted-foreground hover:text-foreground"
                              aria-label="Remove payment"
                              onClick={() => removePaymentEntry(evt.id)}
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
            ) : null}

            {tab === "others" ? (
              // Odoo form: label left, underline control right, groups with a titled rule (docs/common/formcommon.md).
              <div className="again-odoo-form @container space-y-5">
                <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                  <AgainFormGroupTitle className="@xl:col-span-2">Order</AgainFormGroupTitle>
                <AgainFormField label="Payment Terms">
                  {(() => {
                    const payTerm = parsePayTerm(form.paymentTerms);
                    return (
                      <div className="flex h-8 items-stretch gap-3">
                        <input
                          value={payTerm.number}
                          disabled={readOnly}
                          onChange={(e) => patch("paymentTerms", formatPayTerm(e.target.value.replace(/[^\d]/g, ""), payTerm.unit))}
                          placeholder="0"
                          aria-label="Payment terms number"
                          className="h-8 w-16 shrink-0 bg-transparent px-1 text-[13px] tabular-nums outline-none disabled:opacity-60"
                        />
                        <select
                          value={payTerm.unit}
                          disabled={readOnly}
                          onChange={(e) => patch("paymentTerms", formatPayTerm(payTerm.number, e.target.value as "days" | "months"))}
                          aria-label="Payment terms unit"
                          className="h-8 min-w-0 flex-1 bg-transparent px-1 text-[13px] outline-none disabled:opacity-60"
                        >
                          <option value="days">Days</option>
                          <option value="months">Months</option>
                        </select>
                      </div>
                    );
                  })()}
                </AgainFormField>
                  <AgainFormField label="Reference No">
                    <input
                      value={form.customerReference}
                      disabled={readOnly}
                      onChange={(e) => patch("customerReference", e.target.value)}
                      placeholder="Customer PO / reference"
                      className="h-8 w-full bg-transparent px-1 text-[13px] outline-none disabled:opacity-60"
                    />
                  </AgainFormField>
                  {stage === "quotation" || stage === "quotation_sent" ? (
                    <AgainFormField label="Expiration">
                      <input
                        type="date"
                        value={form.expiration?.slice(0, 10) ?? ""}
                        disabled={readOnly}
                        onChange={(e) => patch("expiration", e.target.value)}
                        className="h-8 w-full bg-transparent px-1 text-[13px] outline-none disabled:opacity-60"
                      />
                    </AgainFormField>
                  ) : (
                    <AgainFormField label="Promised Delivery">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="datetime-local"
                          value={(form.deliveryDate ?? "").slice(0, 16)}
                          disabled={readOnly}
                          onChange={(e) => patch("deliveryDate", e.target.value ? `${e.target.value}:00` : "")}
                          className="h-8 min-w-0 flex-1 bg-transparent px-1 text-[13px] outline-none disabled:opacity-60"
                        />
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center px-2 py-0.5 text-[11px] font-semibold",
                            form.shippingStatus === "delivered"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : "bg-sky-500/15 text-sky-600 dark:text-sky-400",
                          )}
                        >
                          {form.shippingStatus === "delivered" ? "Delivered" : "Not Delivered"}
                        </span>
                      </div>
                    </AgainFormField>
                  )}
                  <AgainFormField label="Salesperson">
                    <select
                      value={form.salesperson}
                      disabled={readOnly}
                      onChange={(e) => patch("salesperson", e.target.value)}
                      className="h-8 w-full bg-transparent px-1 text-[13px] outline-none disabled:opacity-60"
                    >
                      {form.salesperson && !mentionableUsers.some((u) => u.name === form.salesperson) ? (
                        <option value={form.salesperson}>{form.salesperson}</option>
                      ) : null}
                      {mentionableUsers.map((u) => (
                        <option key={u.id} value={u.name}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </AgainFormField>
                  <AgainFormGroupTitle className="@xl:col-span-2">Payment</AgainFormGroupTitle>
                  <AgainFormField label="Invoice scheme">
                    <FilterSelect
                      value={form.invoiceScheme}
                      onChange={(v) => patch("invoiceScheme", v as FormState["invoiceScheme"])}
                      width="w-full"
                      ariaLabel="Invoice scheme"
                      options={Object.entries(INVOICE_SCHEME_LABELS).map(([value, label]) => ({
                        value,
                        label,
                      }))}
                    />
                  </AgainFormField>
                </div>

                <div>
                  <AgainFormGroupTitle>Note</AgainFormGroupTitle>
                  <AgainFormField label="Internal note">
                    <textarea
                      value={stripPaymentMeta(form.notes)}
                      disabled={readOnly}
                      onChange={(e) => {
                        const marker = form.notes.match(PAYMENT_META_MARKER_RE)?.[0];
                        patch("notes", marker ? `${e.target.value}\n\n${marker}` : e.target.value);
                      }}
                      placeholder="Internal note about this order (optional)"
                      rows={3}
                      className="w-full resize-y bg-transparent px-1 py-1.5 text-[13px] outline-none disabled:opacity-60"
                    />
                  </AgainFormField>
                </div>

                <div>
                  <AgainFormGroupTitle>Attach document</AgainFormGroupTitle>
                  <OrderDocumentsBox
                    orderId={order?.id}
                    readOnly={readOnly}
                    fileType="document"
                    savePrompt="Save the order first to attach documents."
                    emptyText="No documents attached yet."
                  />
                </div>
              </div>
            ) : null}

            {tab === "info" ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  For the products on this order: the last 3 sales prices to {form.customerName || "this customer"} and to all
                  customers, and the pieces available in each location.
                </p>
                {infoLines.length === 0 ? (
                  <p className="border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                    Add products in Order Lines to see their sales prices and stock here.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse text-[13px]">
                      <thead>
                        <tr className="border-b border-border/80 text-left text-[11px] font-semibold text-foreground">
                          <th className="py-2 pr-3">Product</th>
                          <th className="py-2 pr-3">Last 3 sales · this customer</th>
                          <th className="py-2 pr-3">Last 3 sales · all customers</th>
                          <th className="py-2">Stock by location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {infoLines.map((line) => {
                          const sales = infoSales[line.itemId];
                          const stock = infoStock[line.itemId];
                          const salesList = (rows: ProductSalesLine[], showCustomer: boolean) => (
                            <ul className="space-y-1">
                              {rows.map((row) => (
                                <li key={row.id} className="flex flex-wrap items-baseline gap-x-3">
                                  <span className="min-w-[72px] font-medium tabular-nums">
                                    {formatCurrency(Number(row.unit_price) || 0)}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    {[
                                      row.date ? formatDate(row.date) : null,
                                      showCustomer ? row.customer_name : row.order_number,
                                      `${row.quantity} pcs`,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          );
                          return (
                            <tr key={line.id} className="border-b border-border/80 align-top">
                              <td className="py-2 pr-3">
                                <p className="font-medium text-foreground">{line.name || line.sku}</p>
                                <p className="text-[11px] text-muted-foreground">{line.sku}</p>
                              </td>
                              <td className="py-2 pr-3">
                                {!form.customerId ? (
                                  <span className="text-muted-foreground">Select a customer first</span>
                                ) : !infoCustomerId ? (
                                  <span className="text-muted-foreground">Walk-in customer</span>
                                ) : sales === undefined ? (
                                  <span className="text-muted-foreground">Loading…</span>
                                ) : sales === "failed" ? (
                                  <span className="text-destructive">Could not load</span>
                                ) : sales.mine.length === 0 ? (
                                  <span className="text-muted-foreground">Not sold to this customer yet</span>
                                ) : (
                                  salesList(sales.mine, false)
                                )}
                              </td>
                              <td className="py-2 pr-3">
                                {sales === undefined ? (
                                  <span className="text-muted-foreground">Loading…</span>
                                ) : sales === "failed" ? (
                                  <span className="text-destructive">Could not load</span>
                                ) : sales.all.length === 0 ? (
                                  <span className="text-muted-foreground">Not sold yet</span>
                                ) : (
                                  salesList(sales.all, true)
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
                                  <ul className="max-w-[260px] space-y-1">
                                    {stock.map((row) => (
                                      <li key={row.id} className="flex items-baseline justify-between gap-4">
                                        <span
                                          className={cn(
                                            "min-w-0 truncate",
                                            form.warehouseId && row.warehouse_id === form.warehouseId && "font-medium",
                                          )}
                                          title={
                                            form.warehouseId && row.warehouse_id === form.warehouseId
                                              ? "This order's warehouse"
                                              : undefined
                                          }
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

            {tab === "return" ? (
              <div className="space-y-6">
                {(() => {
                  const sellLines = (order?.items ?? []).filter(
                    (li) => !li.displayType || li.displayType === "product",
                  );
                  const returnedSerials = new Set(
                    existingReturns
                      .filter((ret) => ret.status !== "cancelled")
                      .flatMap((ret) => ret.lines.flatMap((l) => l.serial_numbers ?? [])),
                  );
                  const rows = sellLines.map((li) => {
                    const trackedDelivered = li.quantityDelivered ?? 0;
                    // Most orders never go through a separate warehouse delivery step —
                    // treat them as delivered-in-full so returns aren't blocked.
                    const delivered = trackedDelivered > 0 ? trackedDelivered : li.quantity;
                    const already = (li.quantityReturned ?? 0) + (pendingReturnedByLine[li.id] ?? 0);
                    const maxQty = Math.max(0, delivered - already);
                    const qty = Math.min(maxQty, Number(returnQuantities[li.id] || 0) || 0);
                    const taxBase = li.quantity * li.unitPrice - (li.discount || 0);
                    const taxRate = taxBase > 0 ? (li.tax / taxBase) * 100 : 0;
                    const lineDiscount = returnLineDiscounts[li.id] ?? { value: 0, type: "fixed" as const };
                    const lineDiscountAmt = lineDiscountAmount(
                      qty,
                      li.unitPrice,
                      lineDiscount.value,
                      lineDiscount.type,
                    );
                    // net of the order line's own discount, like the credit note the server posts
                    const ownDiscPerUnit = li.quantity > 0 ? (li.discount || 0) / li.quantity : 0;
                    const subtotal = Math.max(0, qty * (li.unitPrice - ownDiscPerUnit) - lineDiscountAmt);
                    const lineSerials = (li.serialNumbers ?? []).filter((s) => !returnedSerials.has(s));
                    // Partial return of a serial-tracked line: the API needs to know which units.
                    const pickSerials = lineSerials.length > 0 && qty > 0 && qty < li.quantity;
                    const selectedSerials = pickSerials
                      ? (returnSerials[li.id] ?? []).filter((s) => lineSerials.includes(s)).slice(0, qty)
                      : [];
                    return {
                      line: li,
                      already,
                      delivered,
                      maxQty,
                      qty,
                      taxRate,
                      lineDiscount,
                      lineDiscountAmt,
                      subtotal,
                      lineSerials,
                      pickSerials,
                      selectedSerials,
                    };
                  });
                  const returnSubtotal = rows.reduce((s, r) => s + r.subtotal, 0);
                  const returnDiscountAmount = resolveOrderDiscountAmount(
                    returnDiscount,
                    returnDiscountType,
                    returnSubtotal,
                  );
                  const hasQty = rows.some((r) => r.qty > 0);

                  const submitReturn = async () => {
                    if (!order?.id || !hasQty) return;
                    const short = rows.find(
                      (r) => r.qty > 0 && r.pickSerials && r.selectedSerials.length !== r.qty,
                    );
                    if (short) {
                      toast.error(
                        `Select ${short.qty} serial${short.qty === 1 ? "" : "s"} to return for ${short.line.name}`,
                      );
                      return;
                    }
                    setReturnSaving(true);
                    try {
                      // auto_credit: the return is confirmed and credited in the same
                      // request — units go back to stock and the credit note posts.
                      const created = await createSalesReturn({
                        sales_order_id: order.id,
                        reason: returnReason,
                        ...(returnWarehouseId ? { warehouse_id: returnWarehouseId } : {}),
                        notes: returnNotes.trim() || undefined,
                        discount_amount: returnDiscountAmount > 0 ? returnDiscountAmount : undefined,
                        auto_credit: true,
                        lines: rows
                          .filter((r) => r.qty > 0)
                          .map((r) => ({
                            sales_order_line_id: r.line.id,
                            quantity_returned: r.qty,
                            discount_amount: r.lineDiscountAmt > 0 ? r.lineDiscountAmt : undefined,
                            ...(r.pickSerials ? { serial_numbers: r.selectedSerials } : {}),
                          })),
                      });
                      toast.success(
                        `${created.return_number} recorded — stock returned, credit note posted`,
                      );
                      setReturnQuantities({});
                      setReturnLineDiscounts({});
                      setReturnSerials({});
                      setReturnNotes("");
                      setReturnWarehouseId("");
                      setReturnDiscount(null);
                      setReturnDiscountType("fixed");
                      const res = await fetchSalesReturns({ sales_order_id: order.id });
                      setExistingReturns(res.data);
                      // Pull the order again so per-line returned quantities, the
                      // activity feed and the list's Returned column catch up.
                      const fresh = await fetchSalesOrder(order.id);
                      onSaved?.(apiSalesOrderToOrder(fresh));
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Return failed");
                    } finally {
                      setReturnSaving(false);
                    }
                  };

                  return (
                    <>
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <SectionTitle>Return lines</SectionTitle>
                        </div>
                        {rows.length > 0 ? (
                          <table className="w-full border-collapse text-[13px]" style={{ tableLayout: "fixed" }}>
                            <colgroup>
                              <col style={{ width: 16 }} />
                              <col />
                              <col style={{ width: 84 }} />
                              <col style={{ width: 72 }} />
                              <col style={{ width: 84 }} />
                              <col style={{ width: 96 }} />
                              <col style={{ width: 90 }} />
                              <col style={{ width: 108 }} />
                              <col style={{ width: 24 }} />
                            </colgroup>
                            <thead>
                              <tr className="border-b border-border/80 text-left">
                                <th className="w-4 py-2" aria-hidden />
                                <th className="py-2 pr-3 text-[11px] font-semibold text-foreground">
                                  Product
                                </th>
                                <th className="py-2 pr-3 text-right text-[11px] font-semibold text-foreground">
                                  Return Qty
                                </th>
                                <th className="py-2 pr-3 text-right text-[11px] font-semibold text-foreground">
                                  Returned
                                </th>
                                <th className="py-2 pr-3 text-right text-[11px] font-semibold text-foreground">
                                  Quantity
                                </th>
                                <th className="py-2 pr-3 text-right text-[11px] font-semibold text-foreground">
                                  Unit Price
                                </th>
                                <th className="py-2 pr-3 text-right text-[11px] font-semibold text-foreground">
                                  Disc
                                </th>
                                <th className="py-2 pr-3 text-right text-[11px] font-semibold text-foreground">
                                  Amount
                                </th>
                                <th className="w-6 py-2" aria-hidden />
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r) => (
                                <tr key={r.line.id} className="border-b border-border/50">
                                  <td className="w-4 p-0" aria-hidden />
                                  <td className="py-1.5 pr-3 text-foreground">
                                    {r.line.name}
                                    {r.pickSerials ? (
                                      <div
                                        className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5"
                                        role="group"
                                        aria-label={`Serials to return for ${r.line.name}`}
                                      >
                                        {r.lineSerials.map((serial) => {
                                          const checked = r.selectedSerials.includes(serial);
                                          const full = !checked && r.selectedSerials.length >= r.qty;
                                          return (
                                            <label
                                              key={serial}
                                              className={cn(
                                                "inline-flex items-center gap-1 font-mono text-[10px]",
                                                full && "opacity-50",
                                              )}
                                            >
                                              <input
                                                type="checkbox"
                                                className="h-3 w-3 accent-[#00a09d]"
                                                checked={checked}
                                                disabled={readOnly || full}
                                                onChange={(e) =>
                                                  setReturnSerials((f) => {
                                                    const rest = (f[r.line.id] ?? []).filter((s) => s !== serial);
                                                    return {
                                                      ...f,
                                                      [r.line.id]: e.target.checked ? [...rest, serial] : rest,
                                                    };
                                                  })
                                                }
                                              />
                                              {serial}
                                            </label>
                                          );
                                        })}
                                        <span
                                          className={cn(
                                            "text-[10px] tabular-nums",
                                            r.selectedSerials.length === r.qty
                                              ? "text-muted-foreground"
                                              : "text-amber-600 dark:text-amber-400",
                                          )}
                                        >
                                          {r.selectedSerials.length} / {r.qty}
                                        </span>
                                      </div>
                                    ) : null}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right">
                                    {readOnly ? (
                                      <span className="tabular-nums">{r.qty}</span>
                                    ) : (
                                      <LineNumericInput
                                        value={r.qty}
                                        min={0}
                                        steppers
                                        onChange={(n) => {
                                          const clamped = Math.max(0, Math.min(r.maxQty, n));
                                          setReturnQuantities((f) => ({
                                            ...f,
                                            [r.line.id]: String(clamped),
                                          }));
                                        }}
                                        className="h-8 w-full border-b border-border/50 bg-transparent px-1 text-right text-[13px] outline-none focus:border-[#00a09d] disabled:opacity-50"
                                      />
                                    )}
                                  </td>
                                  <td
                                    className={cn(
                                      "py-1.5 pr-3 text-right tabular-nums",
                                      r.already > 0 ? "font-medium text-foreground" : "text-muted-foreground",
                                    )}
                                    title={r.maxQty === 0 ? "Fully returned" : `${r.maxQty} still returnable`}
                                  >
                                    {r.already}
                                    {r.maxQty === 0 ? (
                                      <span className="ml-1 text-[10px] text-muted-foreground">(all)</span>
                                    ) : null}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right">
                                    <div className="flex w-full min-w-0 items-stretch gap-0.5 opacity-60">
                                      <input
                                        type="text"
                                        readOnly
                                        tabIndex={-1}
                                        value={r.line.quantity}
                                        className="h-8 w-full min-w-0 border-b border-border/50 bg-transparent px-1 text-right text-[13px] outline-none"
                                      />
                                      <div className="flex shrink-0 flex-col self-stretch border-b border-border/50">
                                        <span className="flex h-1/2 min-h-[12px] w-4 items-center justify-center text-muted-foreground">
                                          <ChevronUp className="h-3 w-3" strokeWidth={2} />
                                        </span>
                                        <span className="flex h-1/2 min-h-[12px] w-4 items-center justify-center text-muted-foreground">
                                          <ChevronDown className="h-3 w-3" strokeWidth={2} />
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                                    {formatCurrency(r.line.unitPrice)}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right">
                                    {readOnly ? (
                                      <span className="tabular-nums">
                                        {r.lineDiscount.type === "percent"
                                          ? `${r.lineDiscount.value || 0}%`
                                          : formatCurrency(r.lineDiscount.value || 0)}
                                      </span>
                                    ) : (
                                      <div className="flex h-7 min-w-0 items-center justify-end gap-1 border-b border-border/50 focus-within:border-[#00a09d]">
                                        <LineNumericInput
                                          value={r.lineDiscount.value || 0}
                                          min={0}
                                          onChange={(value) =>
                                            setReturnLineDiscounts((f) => ({
                                              ...f,
                                              [r.line.id]: {
                                                type: f[r.line.id]?.type ?? "fixed",
                                                value:
                                                  (f[r.line.id]?.type ?? "fixed") === "percent"
                                                    ? Math.min(100, value)
                                                    : Math.max(0, value),
                                              },
                                            }))
                                          }
                                          className="h-7 w-12 min-w-0 flex-1 border-0 bg-transparent text-right text-[13px] outline-none"
                                        />
                                        <span
                                          className="inline-flex h-5 shrink-0 border border-border"
                                          role="group"
                                          aria-label="Return line discount type"
                                        >
                                          <button
                                            type="button"
                                            className={cn(
                                              "inline-flex h-full w-5 items-center justify-center rounded-none text-[10px] font-medium",
                                              (r.lineDiscount.type ?? "fixed") === "fixed"
                                                ? "bg-[#00a09d] text-white"
                                                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                                            )}
                                            title="Fixed amount (৳)"
                                            aria-label="Fixed amount"
                                            aria-pressed={(r.lineDiscount.type ?? "fixed") === "fixed"}
                                            onClick={() =>
                                              setReturnLineDiscounts((f) => ({
                                                ...f,
                                                [r.line.id]: {
                                                  value: f[r.line.id]?.value ?? 0,
                                                  type: "fixed",
                                                },
                                              }))
                                            }
                                          >
                                            <span className="leading-none">৳</span>
                                          </button>
                                          <button
                                            type="button"
                                            className={cn(
                                              "inline-flex h-full w-5 items-center justify-center rounded-none border-l border-border",
                                              r.lineDiscount.type === "percent"
                                                ? "bg-[#00a09d] text-white"
                                                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                                            )}
                                            title="Percent (%)"
                                            aria-label="Percent"
                                            aria-pressed={r.lineDiscount.type === "percent"}
                                            onClick={() =>
                                              setReturnLineDiscounts((f) => ({
                                                ...f,
                                                [r.line.id]: {
                                                  value: Math.min(100, f[r.line.id]?.value ?? 0),
                                                  type: "percent",
                                                },
                                              }))
                                            }
                                          >
                                            <Percent className="h-2.5 w-2.5" strokeWidth={2.25} />
                                          </button>
                                        </span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums font-medium">
                                    {formatCurrency(r.subtotal)}
                                  </td>
                                  <td className="w-6 p-0" aria-hidden />
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
                            No products on this order.
                          </p>
                        )}
                      </div>

                      <div className="again-odoo-form @container">
                        <AgainFormGroupTitle>Return details</AgainFormGroupTitle>
                        <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                          <AgainFormField label="Reason">
                            <select
                              value={returnReason}
                              disabled={readOnly}
                              onChange={(e) => setReturnReason(e.target.value as SalesReturnReason)}
                              className="h-8 w-full bg-transparent px-1 text-[13px] outline-none disabled:opacity-60"
                            >
                              <option value="customer_changed_mind">Customer changed mind</option>
                              <option value="defective">Defective</option>
                              <option value="wrong_item">Wrong item</option>
                              <option value="warranty">Warranty</option>
                              <option value="damaged_in_transit">Damaged in transit</option>
                              <option value="other">Other</option>
                            </select>
                          </AgainFormField>
                          <AgainFormField
                            label="Return to"
                            hint={
                              returnWarehouseId
                                ? undefined
                                : ["defective", "warranty", "damaged_in_transit"].includes(returnReason)
                                  ? "Automatic: a faulty / damaged unit goes to the RMA store - it does not come back as sellable stock."
                                  : `Automatic: back into ${warehouses.find((w) => w.id === form.warehouseId)?.name ?? "the warehouse this order was sold from"}.`
                            }
                          >
                            <FilterSelect
                              value={returnWarehouseId}
                              onChange={setReturnWarehouseId}
                              width="w-full"
                              ariaLabel="Warehouse that receives the returned units"
                              disabled={readOnly}
                              options={[
                                { value: "", label: "Automatic" },
                                ...warehouses.map((w) => ({ value: w.id, label: `${w.code} \u2014 ${w.name}` })),
                              ]}
                            />
                          </AgainFormField>
                          <AgainFormField label="Notes">
                            <input
                              value={returnNotes}
                              disabled={readOnly}
                              onChange={(e) => setReturnNotes(e.target.value)}
                              placeholder="Optional"
                              className="h-8 w-full bg-transparent px-1 text-[13px] outline-none disabled:opacity-60"
                            />
                          </AgainFormField>
                        </div>
                      </div>

                      {!readOnly ? (
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            className="rounded-none"
                            disabled={!hasQty || returnSaving}
                            onClick={() => void submitReturn()}
                          >
                            {returnSaving ? "Saving…" : "Save"}
                          </Button>
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            ) : null}

            {tab === "history" ? (
              <div className="space-y-4">
                <SectionTitle>Activity</SectionTitle>
                {(() => {
                  type ActivityRow = {
                    id: string;
                    title: string;
                    description?: string;
                    actor: string;
                    actorInitials?: string;
                    at: string;
                    kind: string;
                  };
                  const rows: ActivityRow[] = [
                    ...(order?.timeline ?? []).map((evt) => ({
                      id: evt.id,
                      title: evt.title,
                      description: evt.description,
                      actor: evt.actor,
                      actorInitials: evt.actorInitials,
                      at: apiTimestampToIso(evt.at),
                      kind: evt.type || "event",
                    })),
                    ...(order?.comments ?? []).map((c) => ({
                      id: `comment_${c.id}`,
                      title: c.isInternal ? "Internal note" : "Comment",
                      description: c.body,
                      actor: c.author,
                      actorInitials: c.authorInitials,
                      at: apiTimestampToIso(c.at),
                      kind: "comment",
                    })),
                    ...(order?.activities ?? []).map((a) => ({
                      id: `activity_${a.id}`,
                      title: a.title,
                      description: a.assignee
                        ? `${a.type} · ${a.status}${a.dueDate ? ` · due ${a.dueDate}` : ""}`
                        : `${a.type} · ${a.status}`,
                      actor: a.assignee || "Unassigned",
                      actorInitials: (a.assignee || "U").slice(0, 2).toUpperCase(),
                      // Date-only: a naive T12:00:00 would now be read as UTC noon.
                      at: a.dueDate ? a.dueDate.slice(0, 10) : "",
                      kind: a.type || "task",
                    })),
                    ...form.paymentHistory.map((p) => ({
                      id: `pay_hist_${p.id}`,
                      title: `Payment recorded · ${p.method}`,
                      description: [
                        formatCurrency(p.amount),
                        p.status,
                        p.note,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                      actor: form.salesperson
                        ? form.salesperson.split("@")[0]?.replace(/\./g, " ") || "User"
                        : "User",
                      actorInitials: (form.salesperson || "U").slice(0, 1).toUpperCase(),
                      at: p.at,
                      kind: "payment",
                    })),
                  ].sort((a, b) => {
                    const ta = a.at ? new Date(a.at).getTime() : 0;
                    const tb = b.at ? new Date(b.at).getTime() : 0;
                    return tb - ta;
                  });

                  if (rows.length === 0) {
                    return (
                      <p className="border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
                        No activity yet. Save the order or register a payment to start tracking.
                      </p>
                    );
                  }

                  return (
                    <ul className="divide-y divide-border/60 border border-border">
                      {rows.map((row) => (
                        <li
                          key={row.id}
                          className="flex items-start gap-3 px-3 py-2.5 text-[13px]"
                        >
                          <AvatarChip label={row.actorInitials || row.actor} />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground">{row.title}</p>
                            {row.description ? (
                              <p className="mt-0.5 text-[12px] text-muted-foreground">
                                {row.description}
                              </p>
                            ) : null}
                            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                              <p>
                                <span className="font-medium text-foreground/80">{row.actor}</span>
                                <span className="mx-1.5 text-border">·</span>
                                <span className="capitalize">{row.kind}</span>
                              </p>
                              {row.at ? (
                                <p className="shrink-0">{formatHistoryAt(row.at)}</p>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>
            ) : null}

              </AgainFormNotebook>
            </div>
          </AgainDrawerScrollBody>

          {/* totals box: in the flow, right-aligned, above the footer line (the footer links are below it) */}
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
                      <span className="tabular-nums">{formatCurrency(orderTotal)}</span>
                    </div>
                    {showDueRow ? (
                      <div className="mt-0.5 flex items-center justify-between gap-4 text-muted-foreground">
                        <span>Due</span>
                        <span className="tabular-nums font-medium text-foreground">
                          {formatCurrency(dueBalance)}
                        </span>
                      </div>
                    ) : null}
                    {refundDue > 0 ? (
                      <div className="mt-0.5 flex items-center justify-between gap-4 text-[11px] text-amber-700 dark:text-amber-400">
                        <span>Refund due</span>
                        <span className="tabular-nums">{formatCurrency(refundDue)}</span>
                      </div>
                    ) : null}
                    {previousDue > 0 ? (
                      <div className="mt-0.5 flex items-center justify-between gap-4 text-[11px] text-amber-700 dark:text-amber-400">
                        <span>Previous due</span>
                        <span className="tabular-nums">{formatCurrency(previousDue)}</span>
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
                      {formatCurrency(untaxed)}
                    </span>
                  </div>

                  {form.orderDiscount != null ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                        <span>Discount</span>
                        {!readOnly ? (
                          <span
                            className="inline-flex h-5 shrink-0 border border-border"
                            role="group"
                            aria-label="Discount type"
                          >
                            <button
                              type="button"
                              className={cn(
                                "inline-flex h-full w-5 items-center justify-center rounded-none text-[10px] font-medium",
                                (form.orderDiscountType ?? "fixed") === "fixed"
                                  ? "bg-[#00a09d] text-white"
                                  : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                              title="Fixed amount (৳)"
                              aria-label="Fixed amount"
                              aria-pressed={(form.orderDiscountType ?? "fixed") === "fixed"}
                              onClick={() => patch("orderDiscountType", "fixed")}
                            >
                              <span className="leading-none">৳</span>
                            </button>
                            <button
                              type="button"
                              className={cn(
                                "inline-flex h-full w-5 items-center justify-center rounded-none border-l border-border",
                                (form.orderDiscountType ?? "fixed") === "percent"
                                  ? "bg-[#00a09d] text-white"
                                  : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                              title="Percent (%)"
                              aria-label="Percent"
                              aria-pressed={(form.orderDiscountType ?? "fixed") === "percent"}
                              onClick={() => patch("orderDiscountType", "percent")}
                            >
                              <Percent className="h-2.5 w-2.5" strokeWidth={2.25} />
                            </button>
                          </span>
                        ) : (form.orderDiscountType ?? "fixed") === "percent" ? (
                          <span className="text-[10px]">%</span>
                        ) : (
                          <span className="text-[10px]">৳</span>
                        )}
                        {!readOnly ? (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Remove discount"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                orderDiscount: null,
                                orderDiscountType: "fixed",
                              }))
                            }
                          >
                            <X className="h-3 w-3" />
                          </button>
                        ) : null}
                      </span>
                      {readOnly ? (
                        <span className="tabular-nums text-foreground">
                          {(form.orderDiscountType ?? "fixed") === "percent"
                            ? `−${form.orderDiscount}% (−${formatCurrency(discountAmount)})`
                            : `−${formatCurrency(form.orderDiscount)}`}
                        </span>
                      ) : (
                        <LineNumericInput
                          value={form.orderDiscount}
                          onChange={(n) => patch("orderDiscount", n)}
                          className="h-6 w-[80px] border-b border-border/50 bg-transparent text-right text-[12px] tabular-nums outline-none focus:border-[#00a09d]"
                        />
                      )}
                    </div>
                  ) : null}

                  {form.orderShippingCharge != null ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        Shipping
                        {!readOnly ? (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Remove shipping"
                            onClick={() => patch("orderShippingCharge", null)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        ) : null}
                      </span>
                      {readOnly ? (
                        <span className="tabular-nums text-foreground">
                          {formatCurrency(form.orderShippingCharge)}
                        </span>
                      ) : (
                        <LineNumericInput
                          value={form.orderShippingCharge}
                          onChange={(n) => patch("orderShippingCharge", n)}
                          className="h-6 w-[80px] border-b border-border/50 bg-transparent text-right text-[12px] tabular-nums outline-none focus:border-[#00a09d]"
                        />
                      )}
                    </div>
                  ) : null}

                  {form.additionalExpenses.map((expense) => (
                    <div key={expense.id} className="flex items-center justify-between gap-3">
                      <span className="inline-flex min-w-0 flex-1 items-center gap-1 text-muted-foreground">
                        {readOnly ? (
                          <span className="truncate">{expense.title || "Additional expense"}</span>
                        ) : (
                          <>
                            <input
                              value={expense.title}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  additionalExpenses: f.additionalExpenses.map((row) =>
                                    row.id === expense.id ? { ...row, title: e.target.value } : row,
                                  ),
                                }))
                              }
                              placeholder="Expense title"
                              className="min-w-0 flex-1 border-b border-border/50 bg-transparent text-[12px] outline-none focus:border-[#00a09d]"
                            />
                            <button
                              type="button"
                              className="shrink-0 text-muted-foreground hover:text-foreground"
                              aria-label="Remove expense"
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  additionalExpenses: f.additionalExpenses.filter(
                                    (row) => row.id !== expense.id,
                                  ),
                                }))
                              }
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </span>
                      {readOnly ? (
                        <span className="shrink-0 tabular-nums text-foreground">
                          {formatCurrency(expense.amount)}
                        </span>
                      ) : (
                        <LineNumericInput
                          value={expense.amount}
                          onChange={(n) =>
                            setForm((f) => ({
                              ...f,
                              additionalExpenses: f.additionalExpenses.map((row) =>
                                row.id === expense.id ? { ...row, amount: n } : row,
                              ),
                            }))
                          }
                          className="h-6 w-[80px] shrink-0 border-b border-border/50 bg-transparent text-right text-[12px] tabular-nums outline-none focus:border-[#00a09d]"
                        />
                      )}
                    </div>
                  ))}

                  {paymentAmount > 0 ? (
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        className="text-left text-muted-foreground hover:text-[#00a09d]"
                        onClick={() => setTab("payment")}
                      >
                        Payment
                      </button>
                      <span className="tabular-nums text-foreground">
                        {formatCurrency(paymentAmount)}
                      </span>
                    </div>
                  ) : null}

                  {showOrderTaxes ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        Taxes
                        {!readOnly ? (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Remove taxes"
                            onClick={() => {
                              setOrderTaxesVisible(false);
                              setLineColumns((cols) => ({
                                ...cols,
                                taxes: false,
                                taxIncl: false,
                              }));
                              setForm((f) => ({
                                ...f,
                                lines: f.lines.map((l) =>
                                  l.kind === "product"
                                    ? { ...l, tax: 0, taxRate: 0 }
                                    : l,
                                ),
                              }));
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        ) : null}
                      </span>
                      <span className="tabular-nums text-foreground">
                        {formatCurrency(netTax)}
                      </span>
                    </div>
                  ) : null}

                  {returnedTotal > 0 ? (
                    <div className="space-y-1 border-t border-border/60 pt-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          className="text-left text-muted-foreground hover:text-[#00a09d]"
                          onClick={() => setTab("return")}
                        >
                          Return subtotal
                        </button>
                        <span className="tabular-nums text-foreground">
                          -{formatCurrency(returnedSubtotal)}
                        </span>
                      </div>
                      {returnDiscount != null ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                            <span>Return discount</span>
                            {!readOnly ? (
                              <span
                                className="inline-flex h-5 shrink-0 border border-border"
                                role="group"
                                aria-label="Return discount type"
                              >
                                <button
                                  type="button"
                                  className={cn(
                                    "inline-flex h-full w-5 items-center justify-center rounded-none text-[10px] font-medium",
                                    returnDiscountType === "fixed"
                                      ? "bg-[#00a09d] text-white"
                                      : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                                  )}
                                  title="Fixed amount (৳)"
                                  aria-label="Fixed amount"
                                  aria-pressed={returnDiscountType === "fixed"}
                                  onClick={() => setReturnDiscountType("fixed")}
                                >
                                  <span className="leading-none">৳</span>
                                </button>
                                <button
                                  type="button"
                                  className={cn(
                                    "inline-flex h-full w-5 items-center justify-center rounded-none border-l border-border",
                                    returnDiscountType === "percent"
                                      ? "bg-[#00a09d] text-white"
                                      : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                                  )}
                                  title="Percent (%)"
                                  aria-label="Percent"
                                  aria-pressed={returnDiscountType === "percent"}
                                  onClick={() => setReturnDiscountType("percent")}
                                >
                                  <Percent className="h-2.5 w-2.5" strokeWidth={2.25} />
                                </button>
                              </span>
                            ) : returnDiscountType === "percent" ? (
                              <span className="text-[10px]">%</span>
                            ) : (
                              <span className="text-[10px]">৳</span>
                            )}
                            {!readOnly ? (
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground"
                                aria-label="Remove return discount"
                                onClick={() => {
                                  setReturnDiscount(null);
                                  setReturnDiscountType("fixed");
                                }}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            ) : null}
                          </span>
                          {readOnly ? (
                            <span className="tabular-nums text-foreground">
                              +{formatCurrency(returnedDiscount)}
                            </span>
                          ) : (
                            <LineNumericInput
                              value={returnDiscount}
                              onChange={(n) => setReturnDiscount(n)}
                              className="h-6 w-[100px] border-b border-border/50 bg-transparent text-right text-[12px] tabular-nums outline-none focus:border-[#00a09d]"
                            />
                          )}
                        </div>
                      ) : returnedDiscount > 0 ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Return discount</span>
                          <span className="tabular-nums text-foreground">
                            +{formatCurrency(returnedDiscount)}
                          </span>
                        </div>
                      ) : null}
                      {returnedTax > 0 ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Return tax</span>
                          <span className="tabular-nums text-foreground">
                            -{formatCurrency(returnedTax)}
                          </span>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-3 font-medium text-foreground">
                        <span>Return total</span>
                        <span className="tabular-nums">-{formatCurrency(returnedTotal)}</span>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between gap-4 border-t border-border pt-1.5 text-[13px] font-semibold text-foreground">
                    <span>Total</span>
                    <span className="tabular-nums">{formatCurrency(orderTotal)}</span>
                  </div>
                  {showDueRow ? (
                    <div className="flex items-center justify-between gap-4 text-muted-foreground">
                      <span>Due</span>
                      <span className="tabular-nums font-medium text-foreground">
                        {formatCurrency(dueBalance)}
                      </span>
                    </div>
                  ) : null}
                  {refundDue > 0 ? (
                    <div className="flex items-center justify-between gap-4 text-amber-700 dark:text-amber-400">
                      <span>Refund due</span>
                      <span className="tabular-nums font-medium">
                        {formatCurrency(refundDue)}
                      </span>
                    </div>
                  ) : null}
                  {previousDue > 0 ? (
                    <div className="space-y-1 border-t border-border/60 pt-1.5">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 text-left text-[11px] text-amber-700 hover:underline dark:text-amber-400"
                        onClick={() => setCustomerDueOpen((v) => !v)}
                        aria-expanded={customerDueOpen}
                      >
                        <span className="inline-flex items-center gap-1">
                          Previous due
                          <ChevronDown
                            className={cn(
                              "h-3 w-3 transition-transform",
                              customerDueOpen && "rotate-180",
                            )}
                          />
                        </span>
                        <span className="tabular-nums">{formatCurrency(previousDue)}</span>
                      </button>
                      {customerDueOpen ? (
                        <ul className="max-h-28 space-y-0.5 overflow-y-auto border border-border/60 bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground">
                          {previousDueRows.map((row) => (
                            <li
                              key={row.id}
                              className="flex items-center justify-between gap-3"
                            >
                              <span className="min-w-0 truncate">
                                {row.orderNumber}
                                <span className="ml-1 text-muted-foreground/80">
                                  · {row.orderDate.slice(0, 10)}
                                </span>
                              </span>
                              <span className="shrink-0 tabular-nums text-foreground">
                                {formatCurrency(row.dueAmount)}
                              </span>
                            </li>
                          ))}
                        </ul>
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
                    {featureFlags.optionLineSections ? (
                      <>
                        <button
                          type="button"
                          className={LINK}
                          onClick={() => {
                            setTab("lines");
                            addSection();
                          }}
                        >
                          Add a section
                        </button>
                        <button
                          type="button"
                          className={LINK}
                          onClick={() => {
                            setTab("lines");
                            addNote();
                          }}
                        >
                          Add a note
                        </button>
                      </>
                    ) : null}
                    {featureFlags.optionDiscounts && form.orderDiscount == null ? (
                      <button
                        type="button"
                        className={LINK}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            orderDiscount: 0,
                            orderDiscountType: "fixed",
                          }))
                        }
                      >
                        Add discount
                      </button>
                    ) : null}
                    {featureFlags.optionShippingCharge &&
                    featureFlags.tabShipping &&
                    form.orderShippingCharge == null ? (
                      <button
                        type="button"
                        className={LINK}
                        onClick={() => {
                          const line =
                            SHIPPING_LINE_OPTIONS.find((o) => o.id === form.shippingLineId) ??
                            SHIPPING_LINE_OPTIONS[0];
                          patch(
                            "orderShippingCharge",
                            line.id === "pickup"
                              ? 0
                              : line.usesEstimate
                                ? shippingSummary.shippingTotal || 0
                                : 0,
                          );
                          setTab("shipping");
                        }}
                      >
                        Add shipping
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={LINK}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          additionalExpenses: [
                            ...f.additionalExpenses,
                            { id: `exp_${Date.now()}`, title: "", amount: 0 },
                          ],
                        }))
                      }
                    >
                      Add Additional Expense
                    </button>
                    {salesTaxesEnabled && !orderTaxesVisible ? (
                      <button
                        type="button"
                        className={LINK}
                        onClick={() => {
                          setOrderTaxesVisible(true);
                          setLineColumns((cols) => ({ ...cols, taxes: true }));
                          setForm((f) => ({
                            ...f,
                            lines: f.lines.map((l) => {
                              if (l.kind !== "product") return l;
                              const rate = l.taxRate > 0 ? l.taxRate : companyTaxRate;
                              return {
                                ...l,
                                taxRate: rate,
                                tax: calcLineTax(
                                  l.quantity,
                                  l.unitPrice,
                                  rate,
                                  lineDiscountAmount(
                                    l.quantity,
                                    l.unitPrice,
                                    l.discount,
                                    l.discountType,
                                  ),
                                ),
                              };
                            }),
                          }));
                        }}
                      >
                        Add taxes
                      </button>
                    ) : null}
                    {!readOnly && draftReturnSubtotal > 0 && returnDiscount == null ? (
                      <button
                        type="button"
                        className={LINK}
                        onClick={() => setReturnDiscount(0)}
                      >
                        Add Return Discount
                      </button>
                    ) : null}
                    {featureFlags.tabPayment && paymentAmount <= 0 ? (
                      <button
                        type="button"
                        className={LINK}
                        onClick={() => setTab("payment")}
                      >
                        Add payment
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>

            </div>

          </div>
          </div>
          )}


          {/* The eye on a line opens the product's own drawer (the same one the catalog opens): overview, stock, sales, purchases,
              serials. Nested over this order, so closing it comes straight back to the order. */}
          {viewProductId ? (
            <ProductDrawer open onOpenChange={(next) => !next && setViewProductId(null)} productId={viewProductId} nested />
          ) : null}

          {/* "x / n serials" under a serial product: the units in stock at the order's location, to tick or scan. */}
          {(() => {
            const pickLine = serialPickLineId ? form.lines.find((l) => l.id === serialPickLineId) : undefined;
            return pickLine && pickLine.kind === "product" ? (
              <LineSerialsDrawer
                open
                onOpenChange={(next) => !next && setSerialPickLineId(null)}
                product={pickLine.name}
                itemId={pickLine.itemId}
                sku={pickLine.sku}
                warehouseId={sellingWarehouse?.id ?? ""}
                warehouseName={sellingWarehouse?.name ?? ""}
                selected={pickLine.serialNumbers ?? []}
                quantity={pickLine.quantity}
                onSave={(serials) => applyPickedSerials(pickLine.id, serials)}
              />
            ) : null;
          })()}

          {/* Variant picker — narrower nested drawer over the order form */}
          {drawerPanel === "variant" && variantPicker ? (
            <div
              className="absolute inset-0 z-40 flex justify-end bg-black/40"
              onClick={handleVariantCancel}
            >
              <div
                className="relative flex h-full min-h-0 flex-col border-l border-border bg-background shadow-xl"
                style={{ width: `min(100%, ${Math.round(variantPanelWidth)}px)` }}
                onClick={(e) => e.stopPropagation()}
              >
                <DrawerResizeHandle {...variantResizeHandle} />
                <SalesVariantPicker
                  productName={variantPicker.productName}
                  productImageUrl={variantPicker.productImageUrl}
                  variants={variantPicker.variants}
                  onCancel={handleVariantCancel}
                  onConfirm={handleVariantConfirm}
                />
              </div>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>

    <AgainPartnerDrawer
      open={partnerSheetOpen}
      mode={partnerSheetMode}
      customer={partnerSheetMode === "edit" ? partnerRecord : null}
      initialName={customerCreateDraft.name ?? ""}
      initialEmail={customerCreateDraft.email ?? ""}
      initialPhone={customerCreateDraft.phone ?? ""}
      nested
      moduleLabel="Sales"
      onOpenChange={setPartnerSheetOpen}
      onSaved={(saved) => {
        if (partnerSheetMode === "create") {
          void handleCustomerCreated(saved);
        } else {
          void handlePartnerSaved(saved);
        }
      }}
    />

    <InventoryProductQuickAdd
      open={productCreateOpen}
      nested
      onOpenChange={(next) => {
        setProductCreateOpen(next);
        if (!next) {
          setProductCreateLineId(null);
          setProductCreateName("");
        }
      }}
      onSaved={(saved) => void handleProductCreated(saved)}
    />
    </>
  );
}
