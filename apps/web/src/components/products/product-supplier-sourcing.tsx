"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Globe,
  Plus,
  Star,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { getProductById } from "@/lib/mock-data/products";
import {
  SUPPLIER_STOCK_STATUS_LABELS,
  formatBdt,
  getMappingsForProduct,
  stockStatusVariant,
} from "@/lib/mock-data/vendor-product-mapping";
import { useItemSupplierLinks } from "@/lib/api/use-supplier-catalog";
import { cn, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapSupplierSheet } from "@/components/products/map-supplier-sheet";

type Props = {
  productId: string;
  productName?: string;
  productSku?: string;
  variantId?: string | null;
  compact?: boolean;
  /** Under product title in drawer — tighter, scrollable table */
  embedded?: boolean;
};

export function ProductSupplierSourcing({
  productId,
  productName,
  productSku,
  variantId,
  compact,
  embedded,
}: Props) {
  const [mapOpen, setMapOpen] = useState(false);
  const mockProduct = getProductById(productId);
  const resolvedName = productName ?? mockProduct?.name ?? "Product";
  const resolvedSku = productSku ?? mockProduct?.sku ?? productId;
  const {
    mappings,
    enriched,
    loading,
    error,
    setPreferred,
    togglePublished,
    refetch,
  } = useItemSupplierLinks(productId);

  const rows = useMemo(() => {
    return getMappingsForProduct(enriched, productId, variantId).sort((a, b) => {
      if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
      return a.vendorPrice - b.vendorPrice;
    });
  }, [enriched, productId, variantId]);

  const mapButton = (
    <Button
      variant={rows.length === 0 ? "outline" : "ghost"}
      size="sm"
      className={cn(
        "gap-1 text-xs",
        rows.length === 0 ? (embedded ? "h-7" : "mt-3") : "h-7",
      )}
      onClick={() => setMapOpen(true)}
    >
      <Plus className="h-3.5 w-3.5" />
      Map supplier
    </Button>
  );

  if (loading) {
    return (
      <section
        className={cn(
          "rounded-lg border border-input text-xs text-muted-foreground",
          embedded ? "bg-muted/25 p-2.5" : "p-4",
        )}
      >
        Loading supplier links…
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-input p-4 text-xs text-destructive">
        {error}
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <>
        <section
          className={cn(
            "rounded-lg border border-input",
            embedded ? "bg-muted/25 p-2.5" : "p-4",
            compact && !embedded && "text-xs",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className={cn("font-semibold", embedded ? "text-xs" : "text-sm")}>
                Supplier sourcing
              </h3>
            </div>
            {embedded && mapButton}
          </div>
          {!embedded && (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                No supplier linked yet. Click <span className="font-medium">Map supplier</span> to
                connect a vendor&apos;s SKU, cost, stock, and warranty to this product.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
                <li>One product can have 2–3+ suppliers with different prices.</li>
                <li>Supplier stock is separate from your warehouse stock.</li>
                <li>Website publish is optional — internal sourcing only is fine.</li>
              </ul>
              {mapButton}
            </>
          )}
          {embedded && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              No supplier linked — map a vendor for cost and stock.
            </p>
          )}
        </section>

        <MapSupplierSheet
          open={mapOpen}
          onOpenChange={setMapOpen}
          productId={productId}
          productName={resolvedName}
          productSku={resolvedSku}
          defaultVariantId={variantId}
          existingSupplierIds={mappings.map((m) => m.supplierId)}
          onMapped={() => void refetch()}
        />
      </>
    );
  }

  const publishedCount = rows.filter((r) => r.isPublishedOnWeb).length;
  const lowestCost = Math.min(...rows.map((r) => r.vendorPrice));

  return (
    <>
      <section
        className={cn(
          "rounded-lg border border-input",
          embedded ? "bg-muted/25" : "",
          compact && !embedded ? "text-xs" : embedded ? "text-xs" : "text-sm",
        )}
      >
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-2 border-b border-input",
            embedded ? "px-2.5 py-2" : "px-4 py-3",
          )}
        >
          <div className="flex items-center gap-2">
            <Truck className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className={cn("font-semibold", embedded ? "text-xs" : "text-sm")}>
              Supplier sourcing
            </h3>
            <Badge variant="secondary" className="text-[10px]">
              {rows.length} supplier{rows.length > 1 ? "s" : ""}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-muted-foreground">
              Best {formatBdt(lowestCost)}
              {publishedCount > 0 && ` · ${publishedCount} live`}
            </p>
            {mapButton}
          </div>
        </div>

        <div
          className={cn(
            "overflow-x-auto",
            embedded && "max-h-36 overflow-y-auto",
          )}
        >
          <table className="w-full min-w-[520px] text-xs">
            <thead className="border-b bg-muted/40 text-left text-[11px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Supplier</th>
                <th className="px-3 py-2 font-medium">Vendor SKU</th>
                <th className="px-3 py-2 font-medium">Cost</th>
                <th className="px-3 py-2 font-medium">Supplier stock</th>
                <th className="px-3 py-2 font-medium">Warranty</th>
                <th className="px-3 py-2 font-medium">Lead</th>
                <th className="px-3 py-2 font-medium">Web</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <Link
                      href={`/suppliers/${row.supplierId}`}
                      className="group inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      {row.supplierName}
                      {row.isPreferred && (
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-label="Preferred" />
                      )}
                      <ArrowRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
                    </Link>
                    {row.marginPct != null && (
                      <p className="text-[10px] text-muted-foreground">
                        Margin {row.marginPct}% vs retail{" "}
                        {row.retailPrice != null ? formatCurrency(row.retailPrice) : "—"}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{row.vendorSku}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "font-semibold",
                        row.vendorPrice === lowestCost && rows.length > 1 && "text-emerald-600",
                      )}
                    >
                      {formatBdt(row.vendorPrice)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{row.supplierStock}</span>
                      <Badge variant={stockStatusVariant(row.stockStatus)} className="text-[10px]">
                        {SUPPLIER_STOCK_STATUS_LABELS[row.stockStatus]}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-3 py-2">{row.warranty ?? "—"}</td>
                  <td className="px-3 py-2">{row.leadTimeDays}d</td>
                  <td className="px-3 py-2">
                    {row.isPublishedOnWeb ? (
                      <Badge variant="success" className="gap-0.5 text-[10px]">
                        <Globe className="h-2.5 w-2.5" />
                        Live
                      </Badge>
                    ) : (
                      <Badge variant="muted" className="text-[10px]">
                        Internal
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!embedded && (
          <>
            <div className="flex flex-wrap gap-2 border-t border-input px-4 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => toast.info("Create PO from preferred supplier — prototype")}
              >
                Create PO
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px]"
                onClick={async () => {
                  const preferred = rows.find((r) => r.isPreferred) ?? rows[0];
                  if (!preferred) return;
                  try {
                    await setPreferred(preferred.id);
                    toast.success("Preferred supplier updated");
                  } catch {
                    toast.error("Failed to update preferred supplier");
                  }
                }}
              >
                Set preferred
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px]"
                onClick={async () => {
                  const target = rows.find((r) => !r.isPublishedOnWeb);
                  if (!target) return;
                  try {
                    await togglePublished(target.id);
                    toast.success("Website visibility updated");
                  } catch {
                    toast.error("Failed to update publish status");
                  }
                }}
              >
                Toggle web publish
              </Button>
            </div>

            <p className="border-t border-input px-4 py-2 text-[10px] text-muted-foreground">
              Synced across product drawer and supplier catalog ·{" "}
              {mappings.filter((m) => m.productId === productId).length} mapping
              {mappings.filter((m) => m.productId === productId).length !== 1 ? "s" : ""}
              {variantId ? ` for variant ${variantId}` : ""}
            </p>
          </>
        )}
      </section>

      <MapSupplierSheet
        open={mapOpen}
        onOpenChange={setMapOpen}
        productId={productId}
        productName={resolvedName}
        productSku={resolvedSku}
        defaultVariantId={variantId}
        existingSupplierIds={mappings.map((m) => m.supplierId)}
        onMapped={() => void refetch()}
      />
    </>
  );
}
