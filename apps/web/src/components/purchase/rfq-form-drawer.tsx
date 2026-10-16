"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Eye, FileText, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { RfqQuoteComparison } from "@/components/purchase/rfq-quote-comparison";
import {
  ResizableLineHeaderCell,
  useResizableLineColumns,
} from "@/components/shared/resizable-line-table";
import { LineNumericInput } from "@/components/sales/sales-order-line-row-cells";
import { apiFetch } from "@/lib/api/client";
import { apiProductToProduct, type ApiProductListResponse } from "@/lib/api/catalog-products";
import { apiStockToStockItem, type ApiStockListResponse } from "@/lib/api/inventory";
import {
  createPurchaseRfq,
  sendPurchaseRfq,
  updatePurchaseRfq,
  type PurchaseRfqInput,
} from "@/lib/api/purchase-rfq";
import type { Product } from "@/lib/mock-data/products";
import type { Supplier } from "@/lib/mock-data/suppliers";
import { RFQ_STATUS_LABELS, type PurchaseRfq, type RfqLine } from "@/lib/mock-data/purchase-rfq";
import { cn } from "@/lib/utils";

const CELL_INPUT =
  "h-8 min-w-0 w-full overflow-hidden border-b border-border/50 bg-transparent text-right text-[13px] outline-none focus:border-[#00a09d]";

const LINE_HEAD_H = "h-10";
const LINE_ROW_H = "h-11";

const RFQ_LINE_COLS = ["product", "quantity"] as const;
type RfqLineCol = (typeof RFQ_LINE_COLS)[number];

const RFQ_LINE_LABELS: Record<RfqLineCol, string> = {
  product: "Product",
  quantity: "Qty",
};

const RFQ_DEFAULT_WIDTHS: Record<RfqLineCol, number> = {
  product: 420,
  quantity: 120,
};

const RFQ_MIN_WIDTHS: Record<RfqLineCol, number> = {
  product: 180,
  quantity: 80,
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
  id: string;
  sku: string;
  name: string;
  quantity: number;
  productId?: string;
};

type NotebookTab = "lines" | "compare" | "notes";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function newLineKey() {
  return `rfl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function toDraftLines(lines: RfqLine[]): LineDraft[] {
  return lines.map((line) => ({
    key: line.id || newLineKey(),
    id: line.id || newLineKey(),
    sku: line.sku,
    name: line.name,
    quantity: line.quantity || 1,
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

export function RfqFormDrawer({
  open,
  onOpenChange,
  rfq,
  suppliers,
  onSaved,
  onAward,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfq?: PurchaseRfq | null;
  suppliers: Supplier[];
  onSaved?: () => void;
  /** Threaded down from the parent page's award→create-PO→confirm→link-PO workflow (the
   * same function `purchase/rfq/page.tsx` already uses for the grid's row-action Award) —
   * the Compare Bids tab's Award button calls this instead of duplicating that flow. */
  onAward?: (rfq: PurchaseRfq, quoteId: string, supplierId: string) => void | Promise<void>;
}) {
  const isEdit = Boolean(rfq);
  const formTitle = isEdit ? rfq?.number ?? "RFQ" : "New RFQ";

  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [buyer, setBuyer] = useState("");
  const [notes, setNotes] = useState("");
  const [invited, setInvited] = useState<string[]>([]);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [tab, setTab] = useState<NotebookTab>("lines");
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
    cols: RFQ_LINE_COLS,
    defaultWidths: RFQ_DEFAULT_WIDTHS,
    minWidths: RFQ_MIN_WIDTHS,
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
    setTitle(rfq?.title ?? "");
    setDeadline(rfq?.deadline ?? todayIso());
    setBuyer(rfq?.buyer ?? "");
    setNotes(rfq?.notes ?? "");
    setInvited(rfq?.invitedSupplierIds ?? []);
    setLines(rfq?.lines?.length ? toDraftLines(rfq.lines) : []);
    setTab("lines");
    setDetailsOpen(false);
    setQuickAddOpen(false);
    setViewProductId(null);
    setSupplierOpen(false);
    setSupplierQuery("");
    setSupplierFormOpen(false);
    setHoveredLineKey(null);
    void loadItems();
  }, [open, rfq]);

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
        next.push({
          key: newLineKey(),
          id: newLineKey(),
          sku: product.sku,
          name: product.name,
          quantity: 1,
          productId: product.id,
        });
      }
      return next;
    });
  };

  const productLines = lines.filter((line) => line.sku.trim() && line.name.trim());
  const blocked = !title.trim() || productLines.length === 0;

  const persist = async (statusSend?: boolean): Promise<boolean> => {
    if (blocked) {
      toast.error("Add a title and at least one product");
      return false;
    }
    if (statusSend && invited.length === 0) {
      toast.error("Invite at least one supplier before sending");
      return false;
    }
    const input: PurchaseRfqInput = {
      title: title.trim(),
      deadline: deadline || todayIso(),
      buyer_name: buyer.trim() || undefined,
      notes: notes.trim() || undefined,
      invited_supplier_ids: invited,
      lines: productLines.map((line) => ({
        item_id: line.productId,
        sku: line.sku,
        quantity: line.quantity || 1,
      })),
    };
    try {
      if (rfq) {
        const saved = await updatePurchaseRfq(rfq.id, input);
        if (statusSend && rfq.status === "draft") {
          await sendPurchaseRfq(rfq.id);
          toast.success(`${rfq.number} sent to suppliers`);
        } else {
          toast.success(`${saved.rfq_number} saved`);
        }
      } else {
        const created = await createPurchaseRfq(input);
        if (statusSend) {
          await sendPurchaseRfq(created.id);
          toast.success(`${created.rfq_number} sent to suppliers`);
        } else {
          toast.success(`${created.rfq_number} saved as draft`);
        }
      }
      onSaved?.();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save RFQ");
      return false;
    }
  };

  const submit = async (statusSend = false) => {
    setSaving(true);
    try {
      if (await persist(statusSend)) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const inviteMatches = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    return allSuppliers
      .filter((s) => !invited.includes(s.id))
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
  }, [allSuppliers, invited, supplierQuery]);

  const detailsSummary = [deadline || null, buyer || null, invited.length ? `${invited.length} invited` : null]
    .filter(Boolean)
    .join(" · ");

  const nestedOpen = viewProductId || quickAddOpen || supplierFormOpen;

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
            {(!isEdit || rfq?.status === "draft") && (
              <button
                type="button"
                className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
                disabled={blocked || saving}
                onClick={() => void submit(true)}
              >
                Send
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
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="What are you requesting?"
                      className="h-7 w-full bg-transparent text-[13px] font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
                    />
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {isEdit ? rfq?.number : "Draft RFQ"}
                      {rfq?.status ? ` · ${RFQ_STATUS_LABELS[rfq.status]}` : ""}
                    </p>
                    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
                      {invited.map((id) => (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 border border-border px-1.5 py-0.5 text-[11px]"
                        >
                          {supplierName(id)}
                          <button
                            type="button"
                            className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
                            aria-label={`Remove ${supplierName(id)}`}
                            onClick={() => setInvited((ids) => ids.filter((x) => x !== id))}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <div className="flex min-w-[160px] flex-1 items-center gap-0.5">
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
                        <input
                          value={supplierQuery}
                          onChange={(event) => {
                            setSupplierQuery(event.target.value);
                            setSupplierOpen(true);
                          }}
                          onFocus={() => setSupplierOpen(true)}
                          placeholder="Invite supplier…"
                          className="h-6 min-w-0 flex-1 bg-transparent text-[12px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
                        />
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
                    </div>
                    <SearchDropdown
                      open={supplierOpen}
                      items={inviteMatches}
                      getAnchor={() => supplierAnchorRef.current}
                      portalContainer={portalHost}
                      onSelect={(id) => {
                        setInvited((ids) => (ids.includes(id) ? ids : [...ids, id]));
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
                <span className="shrink-0 text-xs font-medium text-foreground">RFQ details</span>
                {!detailsOpen ? (
                  <span className="min-w-0 truncate text-[11px] font-normal text-muted-foreground">
                    {detailsSummary}
                  </span>
                ) : null}
              </button>
              {detailsOpen ? (
                <div className="grid grid-cols-2 gap-3 border-t border-border px-2 py-3">
                  <Field label="Deadline">
                    <Input
                      type="date"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      className="rounded-none"
                    />
                  </Field>
                  <Field label="Buyer">
                    <Input
                      value={buyer}
                      onChange={(e) => setBuyer(e.target.value)}
                      placeholder="Who is raising this RFQ"
                      className="rounded-none"
                    />
                  </Field>
                </div>
              ) : null}
            </div>

            <div className="-mx-4">
              <AgainFormNotebook
                tabs={[
                  { id: "lines" as const, label: "Request Lines" },
                  ...(isEdit && (rfq?.invitedSupplierIds.length ?? 0) > 0
                    ? [{ id: "compare" as const, label: "Compare Bids" }]
                    : []),
                  { id: "notes" as const, label: "Notes" },
                ]}
                active={tab}
                onChange={setTab}
                className="border-t-0"
                contentClassName="bg-transparent px-4 py-4 dark:bg-transparent sm:px-4"
              >
                {tab === "compare" && rfq ? (
                  <RfqQuoteComparison
                    rfq={rfq}
                    suppliers={allSuppliers}
                    onAward={(quoteId, supplierId) => {
                      if (onAward) void onAward(rfq, quoteId, supplierId);
                    }}
                  />
                ) : tab === "lines" ? (
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
                            <tr
                              className={cn(
                                LINE_HEAD_H,
                                "border-b border-border/80 text-left text-muted-foreground",
                              )}
                            >
                              {lineColOrder.map((col) => (
                                <ResizableLineHeaderCell
                                  key={col}
                                  col={col}
                                  label={RFQ_LINE_LABELS[col]}
                                  width={lineColWidths[col]}
                                  alignRight={col === "quantity"}
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
                                  setHoveredLineKey((current) =>
                                    current === line.key ? null : current,
                                  );
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
                                          {line.name || (
                                            <span className="text-muted-foreground/50">&nbsp;</span>
                                          )}
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
                                              row.key === line.key
                                                ? { ...row, quantity: value }
                                                : row,
                                            ),
                                          )
                                        }
                                        className={CELL_INPUT}
                                      />
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
                                setHoveredLineKey((current) =>
                                  current === line.key ? null : current,
                                )
                              }
                              onRemove={() =>
                                setLines((rows) => rows.filter((row) => row.key !== line.key))
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Internal notes for this RFQ"
                    className="min-h-[160px] rounded-none"
                  />
                )}
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
          setInvited((ids) => (ids.includes(saved.id) ? ids : [...ids, saved.id]));
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
          toast.success(`${product.name} added to the RFQ`);
        }}
      />
    </>
  );
}
