"use client";

import { useEffect, useState } from "react";
import { Eye, Link2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { InventoryProductQuickAdd } from "@/components/inventory/inventory-product-quick-add";
import {
  ProductSearchAdd,
  type ProductSearchItem,
} from "@/components/products/product-search-add";
import {
  AGAIN_DRAWER_ACTION_BTN,
  AGAIN_DRAWER_PRIMARY_BTN,
  AGAIN_DRAWER_PRIMARY_COLOR,
  AgainDrawerControlBar,
} from "@/components/again/again-drawer";
import { AgainFormNotebook } from "@/components/again/again-form-sheet-layout";
import { LineNumericInput } from "@/components/sales/sales-order-line-row-cells";
import {
  ResizableLineHeaderCell,
  useResizableLineColumns,
} from "@/components/shared/resizable-line-table";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { mapSupplierToItem } from "@/lib/api/supplier-catalog";
import { apiFetch } from "@/lib/api/client";
import {
  apiProductToProduct,
  type ApiProductListResponse,
} from "@/lib/api/catalog-products";
import {
  SUPPLIER_STOCK_STATUS_LABELS,
  type SupplierStockStatus,
} from "@/lib/mock-data/vendor-product-mapping";
import { cn } from "@/lib/utils";

type CatalogItem = ProductSearchItem & {
  id: string;
  purchasePrice: number;
};

type MapLine = {
  key: string;
  productId: string;
  name: string;
  sku: string;
  supplierSku: string;
  supplierTitle: string;
  supplierPrice: string;
  supplierStock: string;
  stockStatus: SupplierStockStatus;
  leadTimeDays: string;
  minOrderQty: string;
  warranty: string;
  isPreferred: boolean;
};

const MAP_LINE_COLS = [
  "product",
  "sku",
  "title",
  "price",
  "stock",
  "status",
  "leadTime",
  "moq",
  "warranty",
  "preferred",
] as const;
type MapLineCol = (typeof MAP_LINE_COLS)[number];

const MAP_LINE_LABELS: Record<MapLineCol, string> = {
  product: "Product",
  sku: "SKU",
  title: "Title",
  price: "Price",
  stock: "Stock",
  status: "Status",
  leadTime: "Lead",
  moq: "MOQ",
  warranty: "Warranty",
  preferred: "Pref",
};

const MAP_DEFAULT_WIDTHS: Record<MapLineCol, number> = {
  product: 240,
  sku: 120,
  title: 160,
  price: 100,
  stock: 72,
  status: 118,
  leadTime: 64,
  moq: 64,
  warranty: 110,
  preferred: 48,
};

const MAP_MIN_WIDTHS: Record<MapLineCol, number> = {
  product: 80,
  sku: 64,
  title: 72,
  price: 56,
  stock: 48,
  status: 88,
  leadTime: 44,
  moq: 44,
  warranty: 64,
  preferred: 40,
};

const CELL_TEXT =
  "h-8 min-w-0 w-full overflow-hidden border-b border-border/50 bg-transparent text-[13px] outline-none focus:border-[#00a09d]";
const CELL_NUM =
  "h-8 min-w-0 w-full overflow-hidden border-b border-border/50 bg-transparent text-right text-[13px] outline-none focus:border-[#00a09d]";

const LINE_HEAD_H = "h-10";
const LINE_ROW_H = "h-11";
const STOCK_STATUSES = Object.keys(SUPPLIER_STOCK_STATUS_LABELS) as SupplierStockStatus[];
const RIGHT_COLS = new Set<MapLineCol>(["price", "stock", "leadTime", "moq"]);

function num(value: string) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function newMapLine(
  item?: CatalogItem,
  extras?: Partial<Omit<MapLine, "key" | "productId" | "name" | "sku">>,
): MapLine {
  return {
    key: Math.random().toString(36).slice(2),
    productId: item?.id ?? "",
    name: item?.name ?? "",
    sku: item?.sku ?? "",
    supplierSku: extras?.supplierSku || item?.sku || "",
    supplierTitle: extras?.supplierTitle || item?.name || "",
    supplierPrice:
      extras?.supplierPrice || (item?.purchasePrice ? String(item.purchasePrice) : ""),
    supplierStock: extras?.supplierStock ?? "",
    stockStatus: extras?.stockStatus ?? "in_stock",
    leadTimeDays: extras?.leadTimeDays ?? "7",
    minOrderQty: extras?.minOrderQty ?? "1",
    warranty: extras?.warranty ?? "",
    isPreferred: extras?.isPreferred ?? false,
  };
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

/**
 * Map a supplier's product onto an inventory item. Upserts the supplier product
 * and the link in one call (`POST /api/v1/supplier/links/map`).
 */
export function MapItemDrawer({
  open,
  onOpenChange,
  supplierId,
  supplierName,
  initial,
  onMapped,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  supplierName?: string;
  initial?: {
    supplierSku?: string;
    supplierTitle?: string;
    supplierPrice?: number;
    leadTimeDays?: number;
    minOrderQty?: number;
  };
  onMapped?: () => void;
}) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [lines, setLines] = useState<MapLine[]>(() => [newMapLine()]);
  const [saving, setSaving] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [viewProductId, setViewProductId] = useState<string | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [hoveredLineKey, setHoveredLineKey] = useState<string | null>(null);
  const {
    order: lineColOrder,
    widths: lineColWidths,
    dragCol,
    setDragCol,
    moveColumn,
    startResize,
  } = useResizableLineColumns({
    cols: MAP_LINE_COLS,
    defaultWidths: MAP_DEFAULT_WIDTHS,
    minWidths: MAP_MIN_WIDTHS,
  });

  const loadItems = async () => {
    try {
      const catalog = await apiFetch<ApiProductListResponse>(
        "/api/v1/catalog/products?per_page=200",
      );
      const seen = new Set<string>();
      const options: CatalogItem[] = [];
      for (const product of catalog.data.map(apiProductToProduct)) {
        if (!product.id || !product.sku || seen.has(product.sku)) continue;
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
      setItems(options.sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    if (!open) return;
    setLines([
      newMapLine(undefined, {
        supplierSku: initial?.supplierSku,
        supplierTitle: initial?.supplierTitle,
        supplierPrice: initial?.supplierPrice != null ? String(initial.supplierPrice) : undefined,
        leadTimeDays: initial?.leadTimeDays != null ? String(initial.leadTimeDays) : undefined,
        minOrderQty: initial?.minOrderQty != null ? String(initial.minOrderQty) : undefined,
      }),
    ]);
    setQuickAddOpen(false);
    setViewProductId(null);
    void loadItems();
  }, [open, initial?.supplierSku, initial?.supplierTitle, initial?.supplierPrice, initial?.leadTimeDays, initial?.minOrderQty]);

  const productLines = lines.filter((line) => line.productId);
  const blocked =
    productLines.length === 0 ||
    productLines.some(
      (line) => !line.supplierSku.trim() || !line.supplierTitle.trim() || num(line.supplierPrice) < 0,
    );

  const addProducts = (picked: CatalogItem[]) => {
    setLines((rows) => {
      const next = rows.map((row) => ({ ...row }));
      for (const product of picked) {
        if (!product.sku) continue;
        if (next.some((row) => row.sku === product.sku && row.productId)) continue;
        const emptyIndex = next.findIndex((row) => !row.productId);
        const blank = emptyIndex >= 0 ? next[emptyIndex] : null;
        const filled = newMapLine(product, {
          supplierSku: blank?.supplierSku || product.sku,
          supplierTitle: blank?.supplierTitle || product.name,
          supplierPrice: blank?.supplierPrice || (product.purchasePrice ? String(product.purchasePrice) : ""),
          supplierStock: blank?.supplierStock,
          stockStatus: blank?.stockStatus,
          leadTimeDays: blank?.leadTimeDays,
          minOrderQty: blank?.minOrderQty,
          warranty: blank?.warranty,
          isPreferred: blank?.isPreferred,
        });
        if (emptyIndex >= 0) {
          filled.key = next[emptyIndex].key;
          next[emptyIndex] = filled;
        } else {
          next.push(filled);
        }
      }
      return next.length ? next : [newMapLine()];
    });
  };

  const patchLine = (key: string, patch: Partial<MapLine>) => {
    setLines((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const submit = async () => {
    if (blocked) return;
    setSaving(true);
    try {
      for (const line of productLines) {
        const stock = Number.parseInt(line.supplierStock, 10);
        await mapSupplierToItem({
          item_id: line.productId,
          supplier_id: supplierId,
          supplier_sku: line.supplierSku.trim() || line.sku,
          supplier_title: line.supplierTitle.trim() || line.name,
          supplier_price: num(line.supplierPrice),
          supplier_stock: Number.isFinite(stock) ? stock : undefined,
          stock_status: line.stockStatus,
          lead_time_days: Number.parseInt(line.leadTimeDays, 10) || undefined,
          min_order_qty: Math.max(1, Number.parseInt(line.minOrderQty, 10) || 1),
          warranty: line.warranty.trim() || undefined,
          is_preferred: line.isPreferred,
        });
      }
      toast.success(
        productLines.length === 1
          ? `${productLines[0].supplierSku} mapped to inventory item`
          : `${productLines.length} products mapped`,
      );
      onOpenChange(false);
      onMapped?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Mapping failed");
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
          title="Map item"
          resizable
          resizeMaxWidth={2400}
          className="z-[260] flex min-w-[160px] w-[60vw] max-w-[90vw] flex-col gap-0 p-0"
          onPointerDownOutside={(event) => {
            if (viewProductId || quickAddOpen) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (viewProductId || quickAddOpen) event.preventDefault();
          }}
          onFocusOutside={(event) => {
            if (viewProductId || quickAddOpen) event.preventDefault();
          }}
        >
          <AgainDrawerControlBar>
            <button
              type="button"
              className={cn(AGAIN_DRAWER_PRIMARY_BTN, "h-6 px-2 text-[11px]")}
              style={{ backgroundColor: AGAIN_DRAWER_PRIMARY_COLOR }}
              disabled={blocked || saving}
              onClick={() => void submit()}
            >
              {saving ? "Mapping…" : "Map item"}
            </button>
            <button
              type="button"
              className={cn(AGAIN_DRAWER_ACTION_BTN, "h-6 px-2 text-[11px]")}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <span className="ml-1 text-[13px] font-medium text-foreground">Map item</span>
          </AgainDrawerControlBar>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            <div className="-mx-4 -mt-3">
              <div className="border-b border-border bg-background px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div
                    className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-none border border-border/80 bg-[#00a09d] text-white"
                    aria-hidden
                  >
                    <Link2 className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="min-w-0 truncate text-[15px] font-semibold text-foreground">
                      {supplierName || "Supplier"}
                    </p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      Link a supplier product to an item you stock
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="-mx-4">
              <AgainFormNotebook
                tabs={[{ id: "line" as const, label: "Mapped item" }]}
                active="line"
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
                              label={MAP_LINE_LABELS[col]}
                              width={lineColWidths[col]}
                              alignRight={RIGHT_COLS.has(col)}
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
                                  col === "product" ? "align-top" : RIGHT_COLS.has(col) && "text-right",
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
                                    {line.productId ? (
                                      <button
                                        type="button"
                                        className="inline-flex h-7 w-6 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                        aria-label="Edit product"
                                        title="Edit product"
                                        onClick={() => {
                                          setQuickAddOpen(false);
                                          setViewProductId(line.productId);
                                        }}
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                                {col === "sku" ? (
                                  <input
                                    value={line.supplierSku}
                                    onChange={(e) => patchLine(line.key, { supplierSku: e.target.value })}
                                    placeholder="Supplier SKU"
                                    className={CELL_TEXT}
                                  />
                                ) : null}
                                {col === "title" ? (
                                  <input
                                    value={line.supplierTitle}
                                    onChange={(e) => patchLine(line.key, { supplierTitle: e.target.value })}
                                    placeholder="Supplier title"
                                    className={CELL_TEXT}
                                  />
                                ) : null}
                                {col === "price" ? (
                                  <LineNumericInput
                                    value={num(line.supplierPrice)}
                                    min={0}
                                    onChange={(value) =>
                                      patchLine(line.key, { supplierPrice: String(value) })
                                    }
                                    className={CELL_NUM}
                                  />
                                ) : null}
                                {col === "stock" ? (
                                  <LineNumericInput
                                    value={num(line.supplierStock)}
                                    min={0}
                                    onChange={(value) =>
                                      patchLine(line.key, { supplierStock: String(value) })
                                    }
                                    className={CELL_NUM}
                                  />
                                ) : null}
                                {col === "status" ? (
                                  <select
                                    value={line.stockStatus}
                                    onChange={(e) =>
                                      patchLine(line.key, {
                                        stockStatus: e.target.value as SupplierStockStatus,
                                      })
                                    }
                                    className={CELL_TEXT}
                                    aria-label="Stock status"
                                  >
                                    {STOCK_STATUSES.map((status) => (
                                      <option key={status} value={status}>
                                        {SUPPLIER_STOCK_STATUS_LABELS[status]}
                                      </option>
                                    ))}
                                  </select>
                                ) : null}
                                {col === "leadTime" ? (
                                  <LineNumericInput
                                    value={num(line.leadTimeDays) || 0}
                                    min={0}
                                    onChange={(value) =>
                                      patchLine(line.key, { leadTimeDays: String(value) })
                                    }
                                    className={CELL_NUM}
                                  />
                                ) : null}
                                {col === "moq" ? (
                                  <LineNumericInput
                                    value={num(line.minOrderQty) || 1}
                                    min={1}
                                    onChange={(value) =>
                                      patchLine(line.key, { minOrderQty: String(Math.max(1, value)) })
                                    }
                                    className={CELL_NUM}
                                  />
                                ) : null}
                                {col === "warranty" ? (
                                  <input
                                    value={line.warranty}
                                    onChange={(e) => patchLine(line.key, { warranty: e.target.value })}
                                    placeholder="Optional"
                                    className={CELL_TEXT}
                                  />
                                ) : null}
                                {col === "preferred" ? (
                                  <label className="flex h-8 items-center justify-center border-b border-border/50">
                                    <input
                                      type="checkbox"
                                      checked={line.isPreferred}
                                      onChange={(e) =>
                                        patchLine(line.key, { isPreferred: e.target.checked })
                                      }
                                      aria-label="Preferred supplier"
                                    />
                                  </label>
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
                            setLines((rows) => {
                              const next = rows.filter((row) => row.key !== line.key);
                              return next.length ? next : [newMapLine()];
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </AgainFormNotebook>
            </div>
          </div>
        </SheetContent>
      </Sheet>
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
        onSaved={(product) => {
          if (!product.id) {
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
        }}
      />
    </>
  );
}
