"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Eye, FileText, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  AGAIN_DRAWER_ACTION_BTN,
  AGAIN_DRAWER_PRIMARY_BTN,
  AGAIN_DRAWER_PRIMARY_COLOR,
  AgainDrawerControlBar,
} from "@/components/again/again-drawer";
import { AgainFormNotebook } from "@/components/again/again-form-sheet-layout";
import { SearchDropdown } from "@/components/again/again-search-dropdown";
import { ProductSearchAdd } from "@/components/products/product-search-add";
import { InventoryProductQuickAdd } from "@/components/inventory/inventory-product-quick-add";
import { SupplierFormDrawer } from "@/components/suppliers/supplier-form-drawer";
import { FilterSelect } from "@/components/shared/filter-select";
import {
  ResizableLineHeaderCell,
  useResizableLineColumns,
} from "@/components/shared/resizable-line-table";
import { LineNumericInput } from "@/components/sales/sales-order-line-row-cells";
import { apiFetch } from "@/lib/api/client";
import { apiProductToProduct, type ApiProductListResponse } from "@/lib/api/catalog-products";
import { apiStockToStockItem, type ApiStockListResponse } from "@/lib/api/inventory";
import {
  apiRfqToLegacy,
  createPurchaseRfq,
  submitRfqQuote,
  updatePurchaseRfq,
  updateRfqQuote,
  type RfqQuoteInput,
} from "@/lib/api/purchase-rfq";
import type { Product } from "@/lib/mock-data/products";
import type { Supplier } from "@/lib/mock-data/suppliers";
import {
  QUOTATION_STATUS_LABELS,
  type PurchaseRfq,
  type QuotationStatus,
  type RfqVendorQuote,
} from "@/lib/mock-data/purchase-rfq";
import { cn, formatCurrency } from "@/lib/utils";

const CELL_INPUT =
  "h-8 min-w-0 w-full overflow-hidden border-b border-border/50 bg-transparent text-right text-[13px] outline-none focus:border-[#00a09d]";

const LINE_HEAD_H = "h-10";
const LINE_ROW_H = "h-11";

const QUOTE_LINE_COLS = ["product", "quantity", "unitPrice", "amount"] as const;
type QuoteLineCol = (typeof QUOTE_LINE_COLS)[number];

const QUOTE_LINE_LABELS: Record<QuoteLineCol, string> = {
  product: "Product",
  quantity: "Qty",
  unitPrice: "Unit Price",
  amount: "Amount",
};

const QUOTE_DEFAULT_WIDTHS: Record<QuoteLineCol, number> = {
  product: 280,
  quantity: 110,
  unitPrice: 130,
  amount: 130,
};

const QUOTE_MIN_WIDTHS: Record<QuoteLineCol, number> = {
  product: 160,
  quantity: 80,
  unitPrice: 90,
  amount: 90,
};

type CatalogItem = {
  id?: string;
  sku: string;
  name: string;
  brand?: string;
  category?: string;
  model?: string;
  stock?: number;
  imageUrl?: string;
  purchasePrice?: number;
};

type LineDraft = {
  key: string;
  rfqLineId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  productId?: string;
};

function addDaysIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function newLineKey() {
  return `rfl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function linesFromRfq(rfq: PurchaseRfq, quote?: RfqVendorQuote | null): LineDraft[] {
  return rfq.lines.map((line) => ({
    key: line.id || newLineKey(),
    rfqLineId: line.id,
    sku: line.sku,
    name: line.name,
    quantity: line.quantity || 1,
    unitPrice: quote?.lineQuotes.find((q) => q.rfqLineId === line.id)?.unitPrice ?? 0,
    productId: line.productId,
  }));
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </label>
      {children}
    </div>
  );
}

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

export function QuotationFormDrawer({
  open,
  onOpenChange,
  rfqs,
  quote,
  suppliers,
  onAward,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfqs: PurchaseRfq[];
  quote?: RfqVendorQuote | null;
  suppliers: Supplier[];
  onAward?: (quote: RfqVendorQuote) => void;
  onSaved?: () => void;
}) {
  const parentRfq = quote ? rfqs.find((r) => r.id === quote.rfqId) : undefined;
  const isEdit = Boolean(quote);
  const formTitle = isEdit ? quote?.quoteNumber ?? "Quotation" : "New quotation";

  const [linkedRfqId, setLinkedRfqId] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("7");
  const [moq, setMoq] = useState("1");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [viewProductId, setViewProductId] = useState<string | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [hoveredLineKey, setHoveredLineKey] = useState<string | null>(null);
  const [extraSuppliers, setExtraSuppliers] = useState<Supplier[]>([]);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [supplierDraftName, setSupplierDraftName] = useState("");
  const supplierAnchorRef = useRef<HTMLDivElement>(null);

  const {
    order: lineColOrder,
    widths: lineColWidths,
    dragCol,
    setDragCol,
    moveColumn,
    startResize,
  } = useResizableLineColumns({
    cols: QUOTE_LINE_COLS,
    defaultWidths: QUOTE_DEFAULT_WIDTHS,
    minWidths: QUOTE_MIN_WIDTHS,
  });

  const allSuppliers = useMemo(() => {
    const seen = new Set<string>();
    const rows: Supplier[] = [];
    for (const row of [...extraSuppliers, ...suppliers]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
    return rows;
  }, [extraSuppliers, suppliers]);

  const supplierName = useCallback(
    (id: string) => allSuppliers.find((s) => s.id === id)?.name ?? id,
    [allSuppliers],
  );
  const selectedSupplierLabel = selectedSupplier ? supplierName(selectedSupplier) : "";

  const linkedRfq = useMemo(
    () => rfqs.find((r) => r.id === linkedRfqId) ?? parentRfq,
    [linkedRfqId, parentRfq, rfqs],
  );

  const loadItems = async () => {
    try {
      const catalog = await apiFetch<ApiProductListResponse>(
        "/api/v1/catalog/products?per_page=200",
      );
      const seen = new Set<string>();
      const options: CatalogItem[] = [];
      for (const product of catalog.data.map(apiProductToProduct)) {
        if (!product.sku || seen.has(product.sku)) continue;
        seen.add(product.sku);
        options.push({
          id: product.id,
          sku: product.sku,
          name: product.name,
          purchasePrice: product.purchasePrice ?? 0,
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
      /* fall through */
    }
    try {
      const res = await apiFetch<ApiStockListResponse>("/api/v1/inventory/stock?limit=1000");
      const seen = new Set<string>();
      const options: CatalogItem[] = [];
      for (const row of res.data.map(apiStockToStockItem)) {
        if (seen.has(row.sku)) continue;
        seen.add(row.sku);
        options.push({
          id: row.productId,
          sku: row.sku,
          name: row.name,
          purchasePrice: row.unitCost ?? 0,
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
    const source = quote ? rfqs.find((r) => r.id === quote.rfqId) : undefined;
    setLinkedRfqId(quote?.rfqId ?? "");
    setSelectedSupplier(quote?.supplierId ?? "");
    setValidUntil(quote?.validUntil ?? addDaysIso(14));
    setLeadTimeDays(String(quote?.leadTimeDays ?? 7));
    setMoq(String(quote?.moq ?? 1));
    setLines(source ? linesFromRfq(source, quote) : []);
    setQuickAddOpen(false);
    setViewProductId(null);
    setSupplierOpen(false);
    setSupplierQuery("");
    setSupplierFormOpen(false);
    setDetailsOpen(false);
    setHoveredLineKey(null);
    void loadItems();
  }, [open, quote]);

  const applyLinkedRfq = (rfqId: string) => {
    if (isEdit) return;
    setLinkedRfqId(rfqId);
    const next = rfqs.find((r) => r.id === rfqId);
    if (!next) {
      setLines([]);
      return;
    }
    setLines((current) => {
      const bySku = new Map(current.map((line) => [line.sku, line]));
      return next.lines.map((line) => {
        const prev = bySku.get(line.sku);
        return {
          key: line.id || newLineKey(),
          rfqLineId: line.id,
          sku: line.sku,
          name: line.name,
          quantity: line.quantity || 1,
          unitPrice: prev?.unitPrice ?? 0,
          productId: line.productId,
        };
      });
    });
    if (next.invitedSupplierIds.length === 1 && !selectedSupplier) {
      setSelectedSupplier(next.invitedSupplierIds[0]);
    }
  };

  const addProducts = (picked: CatalogItem[]) => {
    setLines((rows) => {
      const next = [...rows];
      for (const product of picked) {
        if (!product.sku) continue;
        const existing = next.find((row) => row.sku === product.sku);
        if (existing) {
          existing.quantity += 1;
          continue;
        }
        const id = newLineKey();
        next.push({
          key: id,
          rfqLineId: id,
          sku: product.sku,
          name: product.name,
          quantity: 1,
          unitPrice: product.purchasePrice ?? 0,
          productId: product.id,
        });
      }
      return next;
    });
  };

  const productLines = lines.filter((line) => line.sku.trim() && line.name.trim());
  const totalAmount = productLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const blocked = !selectedSupplier || productLines.length === 0;

  /**
   * Ensures every product line on the draft has a real, server-side RFQ line id before we
   * submit a quote against it — staff can add an ad-hoc product straight from this form
   * that isn't yet part of the target RFQ's request lines (a real, pre-existing behavior
   * this drawer already supported against the mock store's `upsertQuote(rfqId, quote,
   * lines)` third argument). If nothing new was added, this makes no extra API call.
   *
   * When there's no target RFQ at all (a from-scratch quote), it creates a brand-new,
   * single-supplier RFQ first — matching the old store's fallback that built a throwaway
   * RFQ via `buildRfqDraft` around the quote.
   */
  const resolveTargetRfq = async (target: PurchaseRfq | undefined): Promise<PurchaseRfq> => {
    if (!target) {
      const created = await createPurchaseRfq({
        title: `${supplierName(selectedSupplier)} quotation`,
        deadline: validUntil || addDaysIso(14),
        invited_supplier_ids: [selectedSupplier],
        lines: productLines.map((line) => ({
          item_id: line.productId,
          sku: line.sku,
          quantity: line.quantity || 1,
        })),
      });
      return apiRfqToLegacy(created);
    }

    const existingIds = new Set(target.lines.map((l) => l.id));
    const missing = productLines.filter((line) => !existingIds.has(line.rfqLineId));
    const needsInvite = !target.invitedSupplierIds.includes(selectedSupplier);
    if (!missing.length && !needsInvite) return target;

    const mergedLines = [
      ...target.lines.map((l) => ({ item_id: l.productId, sku: l.sku, quantity: l.quantity })),
      ...missing.map((line) => ({
        item_id: line.productId,
        sku: line.sku,
        quantity: line.quantity || 1,
      })),
    ];
    const updated = await updatePurchaseRfq(target.id, {
      title: target.title,
      deadline: target.deadline,
      buyer_name: target.buyer,
      notes: target.notes,
      invited_supplier_ids: needsInvite
        ? [...target.invitedSupplierIds, selectedSupplier]
        : target.invitedSupplierIds,
      lines: mergedLines,
    });
    return apiRfqToLegacy(updated);
  };

  const persist = async (asSubmitted?: boolean): Promise<boolean> => {
    if (blocked) {
      toast.error("Select a supplier and add at least one product");
      return false;
    }
    const status: QuotationStatus = asSubmitted
      ? "submitted"
      : quote?.status && quote.status !== "draft"
        ? quote.status
        : "draft";

    try {
      const targetRfq = await resolveTargetRfq(quote ? parentRfq : linkedRfq);
      const lineQuotes = productLines.map((line) => {
        const match =
          targetRfq.lines.find((l) => l.id === line.rfqLineId) ??
          targetRfq.lines.find((l) => l.sku === line.sku);
        return { rfq_line_id: match?.id ?? line.rfqLineId, unit_price: line.unitPrice };
      });
      const input: RfqQuoteInput = {
        supplier_id: selectedSupplier,
        quote_number: quote?.quoteNumber || undefined,
        valid_until: validUntil || addDaysIso(14),
        lead_time_days: Number.parseInt(leadTimeDays, 10) || 0,
        moq: Number.parseInt(moq, 10) || 1,
        line_quotes: lineQuotes,
        status,
      };

      if (quote) {
        const saved = await updateRfqQuote(targetRfq.id, quote.id, input);
        toast.success(
          asSubmitted ? `${saved.quote_number || quote.quoteNumber} submitted` : `${saved.quote_number || quote.quoteNumber} saved`,
        );
      } else {
        const saved = await submitRfqQuote(targetRfq.id, input);
        toast.success(
          asSubmitted
            ? `${saved.quote_number || "Quotation"} submitted`
            : `${saved.quote_number || "Quotation"} saved as draft`,
        );
      }
      onSaved?.();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save quotation");
      return false;
    }
  };

  const submit = async (asSubmitted = false) => {
    setSaving(true);
    try {
      if (await persist(asSubmitted)) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const supplierMatches = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    return allSuppliers
      .filter((s) => s.id !== selectedSupplier)
      .filter((s) => {
        if (!q) return true;
        return `${s.name} ${s.country ?? ""} ${s.email ?? ""}`.toLowerCase().includes(q);
      })
      .slice(0, 12)
      .map((s) => ({
        id: s.id,
        primary: s.name,
        secondary: [s.country, s.phone].filter(Boolean).join(" · ") || undefined,
      }));
  }, [allSuppliers, selectedSupplier, supplierQuery]);

  const detailsSummary = [
    linkedRfq?.number || null,
    validUntil || null,
    leadTimeDays ? `${leadTimeDays}d lead` : null,
    formatCurrency(totalAmount),
  ]
    .filter(Boolean)
    .join(" · ");

  const nestedOpen = viewProductId || quickAddOpen || supplierFormOpen;
  const canSubmit = !isEdit || quote?.status === "draft";
  const canAward = isEdit && quote?.status === "submitted";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          ref={(el) => setPortalHost(el)}
          side="right"
          resizable
          resizeMaxWidth={2400}
          closeButton="inside"
          className="flex min-w-[160px] w-[60vw] max-w-[90vw] flex-col gap-0 p-0"
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
          <AgainDrawerControlBar>
            <button
              type="button"
              className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
              style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
              disabled={blocked || saving}
              onClick={() => void submit(false)}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            {canSubmit && (
              <button
                type="button"
                className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
                disabled={blocked || saving}
                onClick={() => void submit(true)}
              >
                Submit
              </button>
            )}
            {canAward && quote && onAward && (
              <button
                type="button"
                className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
                onClick={() => {
                  onAward(quote);
                  onOpenChange(false);
                }}
              >
                Award
              </button>
            )}
            <span className="ml-1 text-[13px] font-medium text-foreground">{formTitle}</span>
          </AgainDrawerControlBar>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            <div className="-mx-4 -mt-3">
              <div className="border-b border-border bg-background px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div
                    className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-none border border-border/80 bg-[#00a09d] text-white"
                    aria-hidden
                  >
                    <FileText className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div className="relative min-w-0 flex-1" ref={supplierAnchorRef}>
                    <p className="h-7 truncate text-[13px] font-semibold leading-7 text-foreground">
                      {selectedSupplierLabel || "Supplier quotation"}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {isEdit ? quote?.quoteNumber : "Draft quotation"}
                      {quote?.status ? ` · ${QUOTATION_STATUS_LABELS[quote.status]}` : ""}
                      {linkedRfq ? ` · ${linkedRfq.number}` : ""}
                    </p>
                    <div className="mt-0.5 flex min-w-0 items-center gap-0.5">
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-[#00a09d]/10 hover:text-[#00a09d]"
                        aria-label="Search suppliers"
                        aria-expanded={supplierOpen}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => setSupplierOpen((v) => !v)}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      {selectedSupplier && !supplierOpen ? (
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
                      ) : (
                        <input
                          value={supplierOpen ? supplierQuery : selectedSupplierLabel || supplierQuery}
                          onChange={(event) => {
                            setSupplierQuery(event.target.value);
                            setSupplierOpen(true);
                            if (!event.target.value) setSelectedSupplier("");
                          }}
                          onFocus={() => {
                            setSupplierOpen(true);
                            if (selectedSupplier && !supplierQuery) setSupplierQuery(selectedSupplierLabel);
                          }}
                          placeholder="Search supplier…"
                          className="h-6 min-w-0 flex-1 bg-transparent text-[12px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
                        />
                      )}
                      {selectedSupplier ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSupplier("");
                            setSupplierQuery("");
                            setSupplierOpen(true);
                          }}
                          title="Change supplier"
                          aria-label="Change supplier"
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setSupplierDraftName(supplierQuery.trim());
                          setSupplierFormOpen(true);
                        }}
                        title="Add supplier"
                        aria-label="Add supplier"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-none bg-[#00a09d]/10 text-[#00a09d] hover:bg-[#00a09d] hover:text-white"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <SearchDropdown
                      open={supplierOpen}
                      items={supplierMatches}
                      getAnchor={() => supplierAnchorRef.current}
                      portalContainer={portalHost}
                      onSelect={(id) => {
                        setSelectedSupplier(id);
                        setSupplierQuery("");
                        setSupplierOpen(false);
                      }}
                      onSearchMore={() => {
                        setSupplierDraftName(supplierQuery.trim());
                        setSupplierFormOpen(true);
                      }}
                      searchMoreLabel="Create supplier…"
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
                onClick={() => setDetailsOpen((v) => !v)}
              >
                {detailsOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="shrink-0 text-xs font-medium text-foreground">Quote details</span>
                {!detailsOpen ? (
                  <span className="min-w-0 truncate text-[11px] font-normal text-muted-foreground">
                    {detailsSummary}
                  </span>
                ) : null}
              </button>
              {detailsOpen ? (
                <div className="grid grid-cols-2 gap-3 border-t border-border px-2 py-3">
                  <Field label="RFQ">
                    <FilterSelect
                      value={linkedRfqId}
                      onChange={applyLinkedRfq}
                      width="w-full"
                      ariaLabel="RFQ"
                      options={[
                        { value: "", label: isEdit ? parentRfq?.number ?? "Linked RFQ" : "No linked RFQ" },
                        ...rfqs.map((r) => ({ value: r.id, label: `${r.number} — ${r.title}` })),
                      ]}
                    />
                  </Field>
                  <Field label="Valid until">
                    <Input
                      type="date"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                      className="rounded-none"
                    />
                  </Field>
                  <Field label="Lead time (days)">
                    <Input
                      type="number"
                      min={0}
                      value={leadTimeDays}
                      onChange={(e) => setLeadTimeDays(e.target.value)}
                      className="rounded-none"
                    />
                  </Field>
                  <Field label="MOQ">
                    <Input
                      type="number"
                      min={1}
                      value={moq}
                      onChange={(e) => setMoq(e.target.value)}
                      className="rounded-none"
                    />
                  </Field>
                </div>
              ) : null}
            </div>

            <div className="-mx-4">
              <AgainFormNotebook
                tabs={[{ id: "lines" as const, label: "Quote Lines" }]}
                active="lines"
                onChange={() => undefined}
                className="border-t-0"
                contentClassName="bg-transparent px-4 py-4 dark:bg-transparent sm:px-4"
              >
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
                <div className="relative">
                  <div className="overflow-x-auto">
                    <table
                      className="w-full border-collapse text-[13px]"
                      style={{
                        tableLayout: "fixed",
                        minWidth: lineColOrder.reduce((sum, col) => sum + lineColWidths[col], 0),
                      }}
                    >
                      <colgroup>
                        {lineColOrder.map((col) => (
                          <col key={col} style={{ width: lineColWidths[col] }} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr className={cn(LINE_HEAD_H, "border-b border-border/80 text-left text-muted-foreground")}>
                          {lineColOrder.map((col) => (
                            <ResizableLineHeaderCell
                              key={col}
                              col={col}
                              label={QUOTE_LINE_LABELS[col]}
                              width={lineColWidths[col]}
                              alignRight={col !== "product"}
                              dragCol={dragCol}
                              onDragColChange={setDragCol}
                              onMoveColumn={moveColumn}
                              onResizeStart={startResize}
                            />
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => (
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
                                  col === "product" ? "align-top" : "text-right",
                                )}
                                style={{
                                  width: lineColWidths[col],
                                  minWidth: lineColWidths[col],
                                  maxWidth: lineColWidths[col],
                                }}
                              >
                                {col === "product" ? (
                                  <div className="flex min-w-0 items-center gap-0.5 border-b border-border/50">
                                    <p
                                      className="h-8 min-w-0 flex-1 overflow-hidden truncate text-[13px] leading-8"
                                      title={line.name || undefined}
                                    >
                                      {line.name || <span className="text-muted-foreground/50">&nbsp;</span>}
                                    </p>
                                    {line.sku || line.name ? (
                                      <button
                                        type="button"
                                        className="inline-flex h-7 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                        aria-label="Edit product"
                                        title="Edit product"
                                        onClick={() => {
                                          const match =
                                            line.productId ||
                                            items.find((item) => item.sku === line.sku)?.id;
                                          if (match) {
                                            setViewProductId(match);
                                            setQuickAddOpen(false);
                                          } else {
                                            setViewProductId(null);
                                            setQuickAddOpen(true);
                                          }
                                        }}
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                                {col === "quantity" ? (
                                  <LineNumericInput
                                    value={line.quantity || 1}
                                    min={1}
                                    steppers
                                    onChange={(value) =>
                                      setLines((rows) =>
                                        rows.map((row) =>
                                          row.key === line.key ? { ...row, quantity: value } : row,
                                        ),
                                      )
                                    }
                                    className={CELL_INPUT}
                                  />
                                ) : null}
                                {col === "unitPrice" ? (
                                  <LineNumericInput
                                    value={line.unitPrice}
                                    min={0}
                                    onChange={(value) =>
                                      setLines((rows) =>
                                        rows.map((row) =>
                                          row.key === line.key ? { ...row, unitPrice: value } : row,
                                        ),
                                      )
                                    }
                                    className={CELL_INPUT}
                                  />
                                ) : null}
                                {col === "amount" ? (
                                  <p className="h-8 overflow-hidden border-b border-border/50 text-right text-[13px] leading-8 tabular-nums">
                                    {formatCurrency(line.quantity * line.unitPrice)}
                                  </p>
                                ) : null}
                              </td>
                            ))}
                          </tr>
                        ))}
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
                            setLines((rows) => rows.filter((row) => row.key !== line.key))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <p className="mt-3 text-right text-[13px] font-medium tabular-nums">
                  Total {formatCurrency(totalAmount)}
                </p>
              </AgainFormNotebook>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <SupplierFormDrawer
        open={supplierFormOpen}
        onOpenChange={setSupplierFormOpen}
        supplier={null}
        draftName={supplierDraftName}
        onSaved={(saved) => {
          setExtraSuppliers((rows) =>
            rows.some((row) => row.id === saved.id) ? rows : [...rows, saved],
          );
          setSelectedSupplier(saved.id);
          setSupplierQuery("");
          setSupplierOpen(false);
        }}
      />
      <InventoryProductQuickAdd
        nested
        open={quickAddOpen || Boolean(viewProductId)}
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
              purchasePrice: product.purchasePrice ?? 0,
              brand: product.brand || undefined,
              category: product.category || undefined,
              model: product.model || undefined,
              stock: product.stock,
              imageUrl: product.thumbnail || undefined,
            },
          ]);
          void loadItems();
          toast.success(`${product.name} added to the quotation`);
        }}
      />
    </>
  );
}
