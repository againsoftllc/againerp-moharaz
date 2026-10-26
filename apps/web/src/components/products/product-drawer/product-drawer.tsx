"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AgainDrawerButton,
  AgainDrawerCloseButton,
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
} from "@/components/again/again-drawer";
import { AgainFormNotebook, type AgainNotebookTab } from "@/components/again/again-form-sheet-layout";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { fetchCatalogProductDetail, type ProductDetail } from "@/lib/api/catalog-products";
import { fetchProductReport, type ApiProductReport } from "@/lib/api/inventory";
import { usePermission } from "@/lib/auth/permissions";
import type { Product, ProductStatus } from "@/lib/mock-data/products";
import { cn, formatCurrency, formatQuantity } from "@/lib/utils";
import { PanelMessage } from "./drawer-shared";
import { ProductLedgerPanel } from "./product-ledger-panel";
import { ProductOverviewPanel } from "./product-overview-panel";
import { ProductPriceHistoryPanel } from "./product-price-history-panel";
import { ProductPurchasePanel } from "./product-purchase-panel";
import { ProductRmaPanel } from "./product-rma-panel";
import { ProductSalesPanel } from "./product-sales-panel";
import { ProductSerialPanel } from "./product-serial-panel";
import { ProductStockPanel } from "./product-stock-panel";

export type ProductDrawerTab =
  | "overview"
  | "stock"
  | "sales"
  | "purchase"
  | "ledger"
  | "serial"
  | "rma"
  | "price";

const STATUS_LABEL: Record<ProductStatus, string> = {
  draft: "Draft",
  published: "Published",
  unlisted: "Unlisted",
  archived: "Archived",
};

const STATUS_TONE: Record<ProductStatus, string> = {
  draft: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  published: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  unlisted: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  archived: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string | null;
  onEdit?: (product: Product) => void;
  /** Opened over another drawer (an order, a purchase): stacks above it, whatever its own level. */
  nested?: boolean;
};

/**
 * Product Drawer — current state (header + Overview) loads on open; every
 * other tab fetches only when first activated, so opening a product costs two
 * requests (detail + lifetime report) regardless of how much history it has.
 */
export function ProductDrawer({ open, onOpenChange, productId, nested, ...actions }: Props) {
  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Product"
      contentClassName={nested ? "z-[300]" : undefined}
      resizable
      defaultWidth={820}
      minWidth={420}
      widthStorageKey="again-product-drawer-width"
    >
      <AgainDrawerLayout>
        {productId ? (
          // Keyed so switching product remounts the body: fresh tab + data state, no reset effects.
          <ProductDrawerBody key={productId} productId={productId} onClose={() => onOpenChange(false)} {...actions} />
        ) : null}
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}

function ProductDrawerBody({
  productId,
  onClose,
  onEdit,
}: Omit<Props, "open" | "onOpenChange" | "productId"> & { productId: string; onClose: () => void }) {
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [report, setReport] = useState<ApiProductReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestedTab, setRequestedTab] = useState<ProductDrawerTab>("overview");

  const canInventory = usePermission("inventory");
  const canSales = usePermission("sales");
  const canPurchase = usePermission("purchase");
  const canRma = usePermission("rma");
  const canCatalog = usePermission("catalog");

  useEffect(() => {
    let cancelled = false;
    fetchCatalogProductDetail(productId)
      .then((detail) => {
        if (cancelled) return;
        setProduct(detail);
        setLoading(false);
        if (!detail.itemId) {
          setReportLoading(false);
          return;
        }
        return fetchProductReport({ itemId: detail.itemId })
          .then((r) => {
            if (!cancelled) setReport(r);
          })
          .catch(() => {
            // Header falls back to the catalog stock figure; Overview shows "—".
          })
          .finally(() => {
            if (!cancelled) setReportLoading(false);
          });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Product not found");
        setLoading(false);
        setReportLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const serialTracked = Boolean(product && (product.trackSerial || product.trackingType === "serial"));
  const hasWarranty = Boolean(product?.warranty?.trim());
  const itemId = product?.itemId ?? null;

  const tabs = useMemo<AgainNotebookTab<ProductDrawerTab>[]>(() => {
    const all: [ProductDrawerTab, string, boolean][] = [
      ["overview", "Overview", true],
      ["stock", "Stock", canInventory],
      ["sales", "Sales", canSales],
      ["purchase", "Purchase", canPurchase],
      ["ledger", "Ledger", canInventory],
      ["serial", "Serial / IMEI", canInventory && serialTracked],
      ["rma", "Warranty / RMA", canRma && (serialTracked || hasWarranty)],
      ["price", "Price History", canCatalog],
    ];
    return all.filter(([, , show]) => show).map(([id, label]) => ({ id, label }));
  }, [canInventory, canSales, canPurchase, canRma, canCatalog, serialTracked, hasWarranty]);

  // A tab hidden by permissions/tracking falls back to Overview without an effect.
  const tab: ProductDrawerTab = tabs.some((t) => t.id === requestedTab) ? requestedTab : "overview";
  const gridTab = tab !== "overview";
  const onHand = report?.stock.on_hand ?? product?.stock ?? 0;

  const renderTab = () => {
    if (!product) return null;
    if (tab === "overview") {
      return <ProductOverviewPanel product={product} report={report} reportLoading={reportLoading} />;
    }
    if (!itemId) {
      return (
        <PanelMessage
          title="No inventory item linked"
          hint="Stock and history are tracked once this product has an inventory item."
        />
      );
    }
    switch (tab) {
      case "stock":
        return <ProductStockPanel itemId={itemId} report={report} price={product.price} cost={product.purchasePrice} />;
      case "sales":
        return <ProductSalesPanel itemId={itemId} />;
      case "purchase":
        return <ProductPurchasePanel itemId={itemId} cost={product.purchasePrice} />;
      case "ledger":
        return <ProductLedgerPanel itemId={itemId} />;
      case "serial":
        return <ProductSerialPanel itemId={itemId} />;
      case "rma":
        return <ProductRmaPanel itemId={itemId} />;
      case "price":
        return <ProductPriceHistoryPanel itemId={itemId} />;
      default:
        return null;
    }
  };

  return (
    <div data-testid="product-drawer" className="flex h-full min-h-0 flex-col">
      <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={onClose} />}>
        {onEdit && product ? (
          <AgainDrawerButton variant="primary" onClick={() => onEdit(product)} data-testid="product-drawer-edit">
            Edit
          </AgainDrawerButton>
        ) : null}
      </AgainDrawerControlBar>

      <div className="shrink-0 border-b border-border px-4 py-3" data-testid="product-drawer-header">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading product…</p>
        ) : error || !product ? (
          <p className="text-sm text-destructive">{error ?? "Product not found"}</p>
        ) : (
          <>
            {/* Same header anatomy as the customer profile sheet: avatar square,
                name + record-type pill, then the identity line underneath. */}
            <div className="flex items-start gap-3">
              {/* Sized to span the full 3-line text block beside it (title, SKU,
                  On hand/Price) rather than a fixed small square that falls short
                  once the header grew from 2 lines to 3. */}
              <div
                className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-none border border-border/80 bg-[#00a09d] text-[22px] font-bold text-white"
                aria-hidden="true"
              >
                {product.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  (product.name.trim() || "P").charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h2
                    className="min-w-0 truncate text-[20px] font-bold leading-tight tracking-tight text-foreground"
                    title={product.name}
                    data-testid="product-drawer-name"
                  >
                    {product.name}
                  </h2>
                  <GridChipBadge
                    className="shrink-0 border-sky-500/30 bg-sky-500/10 uppercase tracking-wide text-sky-600 dark:text-sky-400"
                    title="Product"
                  >
                    Product
                  </GridChipBadge>
                </div>
                {/* SKU sits on its own line right under the title, styled as a small
                    tag so it reads as an identifier rather than blending into plain
                    text — the On hand/Price stats sit on a separate, clearly labeled
                    line below. */}
                <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="shrink-0 uppercase tracking-wide">SKU</span>
                  <span
                    className="truncate rounded-none border border-border/70 bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] leading-none text-foreground"
                    data-testid="product-drawer-sku"
                  >
                    {product.sku || "—"}
                  </span>
                </p>
                {/* Odoo smart-stat boxes: the figure on top, what it is underneath. */}
                <div className="mt-2 flex flex-wrap items-stretch gap-2">
                  <div className="min-w-[5.5rem] border border-border/80 bg-background px-3 py-1">
                    <p className="text-[15px] font-semibold leading-tight tabular-nums text-foreground" data-testid="product-drawer-stock">
                      {formatQuantity(onHand)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">On hand</p>
                  </div>
                  <div className="min-w-[5.5rem] border border-border/80 bg-background px-3 py-1">
                    <p className="text-[15px] font-semibold leading-tight tabular-nums text-foreground" data-testid="product-drawer-price">
                      {formatCurrency(product.price)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Price</p>
                  </div>
                </div>
              </div>
              <GridChipBadge className={STATUS_TONE[product.status]} title={STATUS_LABEL[product.status]}>
                {STATUS_LABEL[product.status]}
              </GridChipBadge>
            </div>
          </>
        )}
      </div>

      <AgainDrawerScrollBody className="flex flex-col overflow-hidden">
        {product ? (
          <AgainFormNotebook<ProductDrawerTab>
            tabs={tabs}
            active={tab}
            onChange={setRequestedTab}
            className="min-h-0 flex-1 border-t-0"
            contentClassName={cn(
              "flex min-h-0 flex-1 flex-col",
              gridTab ? "overflow-hidden p-0 sm:px-0" : "overflow-y-auto",
            )}
          >
            {renderTab()}
          </AgainFormNotebook>
        ) : null}
      </AgainDrawerScrollBody>
    </div>
  );
}
