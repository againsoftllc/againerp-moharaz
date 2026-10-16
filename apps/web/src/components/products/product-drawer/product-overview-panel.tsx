"use client";

import type { ProductDetail } from "@/lib/api/catalog-products";
import type { ApiProductReport } from "@/lib/api/inventory";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import { formatCurrency, formatQuantity } from "@/lib/utils";
import { FactList } from "./drawer-shared";

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

/**
 * Current state only — no history here. Stock and totals come straight from
 * the lifetime product report so the drawer never re-derives stock itself.
 * Mirrors every field captured on intake (inventory-product-quick-add.tsx) so
 * nothing entered at creation is invisible here.
 */
export function ProductOverviewPanel({
  product,
  report,
  reportLoading,
}: {
  product: ProductDetail;
  report: ApiProductReport | null;
  reportLoading: boolean;
}) {
  const stock = report?.stock;
  const totals = report?.totals;
  const pending = reportLoading && !report;
  const qty = (value: number | undefined) => (pending ? "…" : formatQuantity(value ?? 0));
  const money = (value: string | number | undefined) => (pending ? "…" : formatCurrency(Number(value ?? 0)));

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
    <div className="grid gap-4 lg:grid-cols-2" data-testid="product-drawer-overview">
      <FactList
        title="Product"
        facts={[
          { label: "Name", value: product.name },
          { label: "SKU", value: <span className="font-mono text-[11px]">{product.sku || "—"}</span> },
          { label: "Model", value: product.model || "—" },
          { label: "Category", value: product.category || "—" },
          { label: "Brand", value: product.brand || "—" },
          { label: "Unit", value: product.unitType || "—" },
          {
            label: "Product type",
            value: product.productType ? PRODUCT_TYPE_LABEL[product.productType] ?? product.productType : "—",
          },
          { label: "Barcode type", value: product.barcodeType || "—" },
          { label: "Warranty", value: product.warranty || "—" },
          { label: "Origin", value: product.origin || "—" },
        ]}
      />
      <FactList
        title="Current inventory"
        testId="product-drawer-inventory"
        facts={[
          { label: "On hand", value: qty(stock?.on_hand), numeric: true },
          { label: "Reserved", value: qty(stock?.reserved), numeric: true },
          { label: "Available", value: qty(stock?.available), numeric: true },
          { label: "Manage stock", value: product.trackQuantity ? "Yes" : "No" },
          { label: "Tracking", value: trackingLabel },
          { label: "Alert quantity", value: qty(product.alertQuantity), numeric: true },
          { label: "Not for selling", value: product.notForSelling ? "Yes" : "No" },
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
      <FactList
        title="Quick summary"
        testId="product-drawer-summary"
        facts={[
          { label: "Total sold qty", value: qty(totals?.sold_qty), numeric: true },
          { label: "Total purchased qty", value: qty(totals?.purchased_qty), numeric: true },
          { label: "Stock value", value: money(stock?.cost_value), numeric: true },
          { label: "Weight", value: product.weight || "—" },
        ]}
      />
      {product.shortDescription ? (
        <FactList
          title="Description"
          facts={[{ label: "Short description", value: product.shortDescription }]}
        />
      ) : null}
    </div>
  );
}
