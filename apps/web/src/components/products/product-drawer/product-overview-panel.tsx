"use client";

import { useEffect, useState } from "react";
import type { ProductDetail } from "@/lib/api/catalog-products";
import { fetchProductReport, type ApiProductReport } from "@/lib/api/inventory";
import { fetchProductPurchases, type ProductPurchaseMeta } from "@/lib/api/product-history";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import { formatCurrency, formatQuantity } from "@/lib/utils";
import {
  DateRangeFilter,
  EMPTY_DATE_RANGE,
  FactList,
  StatBox,
  StatSection,
  type DateRange,
} from "./drawer-shared";

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  simple: "Simple",
  variable: "Variable",
  digital: "Digital",
  combo: "Combo",
};

const TRACKING_LABEL: Record<string, string> = {
  none: "Not tracked",
  serial: "Serial / IMEI",
  batch: "Batch",
};

/** What the period picker asks the server for, once it has answered. */
type PeriodData = {
  key: string;
  report: ApiProductReport | null;
  purchases: ProductPurchaseMeta | null;
};

/**
 * The product at a glance. The top is the money story over a period you pick (empty = all time): profit, sales, purchases
 * and the warranty of the units sold - the figures the Sales, Purchase and Serial tabs go into in detail. Stock is as of
 * now (stock has no period). Below are the product's own facts: identity, inventory settings, prices.
 * Mirrors every field captured on intake (inventory-product-quick-add.tsx) so nothing entered at creation is invisible here.
 */
export function ProductOverviewPanel({
  product,
  report,
  reportLoading,
}: {
  product: ProductDetail;
  /** The all-time report the drawer loaded for its header and Stock tab (stock now comes from it). */
  report: ApiProductReport | null;
  reportLoading: boolean;
}) {
  const itemId = product.itemId ?? null;
  const [range, setRange] = useState<DateRange>(EMPTY_DATE_RANGE);
  const [period, setPeriod] = useState<PeriodData | null>(null);
  const periodKey = `${itemId ?? ""}|${range.dateFrom}|${range.dateTo}`;

  // the figures for the period: the product report (sales, profit, warranty) and the purchase totals
  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    const dateFrom = range.dateFrom || undefined;
    const dateTo = range.dateTo || undefined;
    void Promise.allSettled([
      fetchProductReport({ itemId, dateFrom, dateTo }),
      fetchProductPurchases(itemId, { page: 0, perPage: 1, dateFrom, dateTo }),
    ]).then(([periodReport, purchases]) => {
      if (cancelled) return;
      setPeriod({
        key: `${itemId}|${range.dateFrom}|${range.dateTo}`,
        report: periodReport.status === "fulfilled" ? periodReport.value : null,
        purchases: purchases.status === "fulfilled" ? purchases.value.meta : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [itemId, range.dateFrom, range.dateTo]);

  const stock = report?.stock;
  const stockPending = reportLoading && !report;
  const periodPending = Boolean(itemId) && period?.key !== periodKey;
  // keep the last figures on screen while a new period loads, dimmed
  const totals = period?.report?.totals;
  const purchases = period?.purchases;
  const dash = "—";
  const qty = (value: number | undefined) => (totals ? formatQuantity(value ?? 0) : dash);
  const money = (value: string | number | null | undefined) =>
    value == null || value === "" ? dash : formatCurrency(Number(value));

  const stockQty = (value: number | undefined) => (stockPending ? "…" : formatQuantity(value ?? 0));
  const stockMoney = (value: string | number | undefined) => (stockPending ? "…" : formatCurrency(Number(value ?? 0)));

  const profit = totals ? Number(totals.profit) : null;
  const margin = totals?.margin_pct != null ? Number(totals.margin_pct) : null;
  const soldQty = totals?.sold_qty ?? 0;
  const avgSelling = totals && soldQty > 0 ? Number(totals.sales_revenue) / soldQty : null;
  const serialTracked = Boolean(product.trackSerial || product.trackingType === "serial");

  const { warehouses } = useInventoryWarehouses(true);
  const locationNames = (product.locationIds ?? [])
    .map((id) => warehouses.find((w) => w.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  const trackingLabel = product.trackingType
    ? TRACKING_LABEL[product.trackingType] ?? product.trackingType
    : product.trackSerial
      ? TRACKING_LABEL.serial
      : TRACKING_LABEL.none;

  return (
    <div className="@container space-y-6" data-testid="product-drawer-overview">
      {itemId ? (
        <div className={periodPending && period ? "space-y-6 opacity-60 transition-opacity" : "space-y-6"} data-testid="product-drawer-period">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-muted-foreground">
              {range.dateFrom || range.dateTo ? "Figures for the period picked" : "Figures for all time"}
            </p>
            <DateRangeFilter value={range} onChange={setRange} />
          </div>

          <StatSection
            title="Profit"
            note="Net sales − cost (net sold qty × the product's cost price)"
          >
            <StatBox label="Net sales" value={money(totals?.net_revenue)} hint="Sales after discounts, less customer returns" />
            <StatBox label="Cost of goods sold" value={money(totals?.cogs)} />
            <StatBox
              label="Profit"
              value={profit == null ? dash : formatCurrency(profit)}
              tone={profit == null || profit === 0 ? undefined : profit > 0 ? "good" : "bad"}
            />
            <StatBox
              label="Margin"
              value={margin == null ? dash : `${margin.toFixed(1)}%`}
              tone={margin == null || margin === 0 ? undefined : margin > 0 ? "good" : "bad"}
              hint="Profit ÷ net sales"
            />
          </StatSection>

          <StatSection title="Sales">
            <StatBox label="Sold qty" value={qty(totals?.sold_qty)} />
            <StatBox label="Sales amount" value={money(totals?.sales_revenue)} />
            <StatBox label="Customer returns" value={qty(totals?.customer_return_qty)} hint="Pieces returned by customers" />
            <StatBox label="Net sold qty" value={qty(totals?.net_sold_qty)} />
            <StatBox label="Average selling price" value={avgSelling == null ? dash : formatCurrency(avgSelling)} />
          </StatSection>

          <StatSection title="Purchase">
            <StatBox
              label="Cost"
              value={product.purchasePrice != null ? formatCurrency(product.purchasePrice) : dash}
              hint="The product's current cost price"
            />
            <StatBox label="Lowest purchase price" value={money(purchases?.min_cost)} hint="Cheapest unit cost paid (free lines ignored)" />
            <StatBox label="Highest purchase price" value={money(purchases?.max_cost)} />
            <StatBox
              label="Average purchase price"
              value={money(purchases?.avg_cost)}
              hint="Total purchase amount ÷ total purchased quantity"
            />
            <StatBox label="Total purchased qty" value={purchases ? formatQuantity(purchases.sum_qty) : dash} />
            <StatBox label="Total purchase amount" value={purchases ? formatCurrency(Number(purchases.sum_total ?? 0)) : dash} />
            <StatBox label="Returned to supplier" value={qty(totals?.purchase_return_qty)} hint="Pieces sent back to suppliers" />
          </StatSection>

          <StatSection
            title="Warranty"
            note={product.warranty?.trim() ? `Product warranty: ${product.warranty.trim()}` : undefined}
          >
            {serialTracked ? (
              <>
                <StatBox
                  label="Pieces under warranty"
                  value={totals ? formatQuantity(totals.warranty_active_qty ?? 0) : dash}
                  tone={totals && (totals.warranty_active_qty ?? 0) > 0 ? "good" : undefined}
                  hint="Sold serial units whose warranty is still running today"
                />
                <StatBox
                  label="Warranty expired"
                  value={totals ? formatQuantity(totals.warranty_expired_qty ?? 0) : dash}
                  hint="Sold serial units whose warranty has run out"
                />
                {totals && (totals.warranty_unknown_qty ?? 0) > 0 ? (
                  <StatBox
                    label="No expiry set"
                    value={formatQuantity(totals.warranty_unknown_qty ?? 0)}
                    hint="Sold when the product's warranty could not be read"
                  />
                ) : null}
              </>
            ) : (
              <p className="py-1 text-[12px] text-muted-foreground">
                Warranty is counted per unit, so it needs Serial / IMEI tracking on this product. The Serial / IMEI tab then
                shows each unit&apos;s warranty.
              </p>
            )}
          </StatSection>
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          Sales, purchase and warranty figures appear once this product has an inventory item.
        </p>
      )}

      <StatSection title="Stock now" note="As of today, not part of the period">
        <StatBox label="On hand" value={stockQty(stock?.on_hand)} />
        <StatBox label="Reserved" value={stockQty(stock?.reserved)} />
        <StatBox label="Available" value={stockQty(stock?.available)} />
        <StatBox label="Stock value" value={stockMoney(stock?.cost_value)} hint="On hand × cost price" />
      </StatSection>

      <div className="grid gap-x-10 gap-y-6 @xl:grid-cols-2">
        <FactList
          title="Product"
          facts={[
            { label: "Name", value: product.name },
            { label: "SKU", value: <span className="font-mono text-[12px]">{product.sku || "—"}</span> },
            { label: "Model", value: product.model || "—" },
            { label: "Category", value: product.category || "—" },
            { label: "Brand", value: product.brand || "—" },
            { label: "Unit", value: product.unitType || "—" },
            {
              label: "Product type",
              value: product.productType ? PRODUCT_TYPE_LABEL[product.productType] ?? product.productType : "—",
            },
            { label: "Barcode type", value: product.barcodeType || "—" },
            {
              label: "Warranty",
              value: product.lifetimeWarranty
                ? "Lifetime"
                : product.warrantyDays != null
                  ? `${product.warrantyDays} days`
                  : product.warranty || "—",
            },
            { label: "Service warranty", value: product.serviceWarrantyDays != null ? `${product.serviceWarrantyDays} days` : "—" },
            { label: "Return within", value: product.returnDays != null ? `${product.returnDays} days` : "—" },
            { label: "HS code", value: product.hsCode || "—" },
            { label: "Origin", value: product.origin || "—" },
            { label: "Weight", value: product.weight || "—" },
          ]}
        />
        <FactList
          title="Inventory settings"
          testId="product-drawer-inventory"
          facts={[
            { label: "Manage stock", value: product.trackQuantity ? "Yes" : "No" },
            { label: "Tracking", value: trackingLabel },
            { label: "Alert quantity", value: formatQuantity(product.alertQuantity ?? 0), numeric: true },
            { label: "Not for selling", value: product.notForSelling ? "Yes" : "No" },
            { label: "Negative sales", value: product.allowNegativeSales ? "Allowed" : "No" },
            {
              label: "Business locations",
              value: locationNames.length > 0 ? locationNames.join(", ") : "—",
            },
          ]}
        />
        <FactList
          title="Current price"
          facts={[
            { label: "Selling", value: formatCurrency(product.price), numeric: true },
            {
              label: "Cost",
              value: product.purchasePrice != null ? formatCurrency(product.purchasePrice) : "—",
              numeric: true,
            },
            {
              label: "Last selling price",
              value: product.lastSellingPrice != null ? formatCurrency(product.lastSellingPrice) : "—",
              numeric: true,
            },
            { label: "Tax rate", value: product.taxRate != null ? `${product.taxRate}%` : "—", numeric: true },
            { label: "Tax type", value: product.taxType === "inclusive" ? "Inclusive" : "Exclusive" },
          ]}
        />
        {product.shortDescription ? (
          <FactList
            title="Description"
            facts={[{ label: "Short description", value: product.shortDescription }]}
          />
        ) : null}
      </div>
    </div>
  );
}
