"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { fetchSupplierStockReport } from "@/lib/api/purchase-orders";
import { fetchSupplierLinksBySupplier, fetchSupplierProducts } from "@/lib/api/supplier-catalog";
import { cn, formatCurrency, formatQuantity } from "@/lib/utils";

type CatalogSource = "mapped" | "listed" | "purchased";

type CatalogRow = {
  id: string;
  name: string;
  /** Our own SKU; blank for a supplier-feed item that is not mapped to a product of ours. */
  sku: string;
  supplierSku: string;
  price: number | null;
  leadTimeDays: number | null;
  minOrderQty: number | null;
  /** Units bought from this supplier, and what is left of the product in stock. */
  purchasedQty: number | null;
  currentStock: number | null;
  source: CatalogSource;
  preferred: boolean;
};

const SOURCE_LABEL: Record<CatalogSource, string> = {
  mapped: "Mapped",
  listed: "Not mapped",
  purchased: "On a PO",
};

const SOURCE_TONE: Record<CatalogSource, string> = {
  mapped: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  listed: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  purchased: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

const optional = (value: number | null | undefined) => (value == null ? null : value);

/**
 * "Catalog" tab of a party that is also a supplier: every product this supplier has. That is what is mapped to our products
 * (with the supplier's own SKU, price, lead time and minimum order), what the supplier lists that is not mapped yet, and
 * what we have bought from them that is in neither - each row says which, so the list is the supplier's full range.
 */
export function PartnerCatalogPanel({
  supplierId,
  fillHeight,
}: {
  supplierId: string;
  fillHeight?: boolean;
}) {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // each source stands alone: one failing must not blank the others
    Promise.all([
      fetchSupplierLinksBySupplier(supplierId).catch(() => []),
      fetchSupplierProducts({ supplier_id: supplierId, per_page: 200 })
        .then((res) => res.data)
        .catch(() => []),
      fetchSupplierStockReport(supplierId).catch(() => []),
    ])
      .then(([links, listed, purchased]) => {
        if (cancelled) return;
        const bought = new Map(purchased.map((p) => [p.itemId, p]));
        const out: CatalogRow[] = links.map((link) => {
          const buy = bought.get(link.item_id);
          return {
            id: `link-${link.id}`,
            name: link.item_name || link.supplier_title || link.supplier_sku || "—",
            sku: link.item_sku ?? "",
            supplierSku: link.supplier_sku ?? "",
            price: link.supplier_price != null ? Number(link.supplier_price) : null,
            leadTimeDays: optional(link.lead_time_days),
            minOrderQty: optional(link.min_order_qty),
            purchasedQty: buy ? buy.purchasedQty : null,
            currentStock: buy ? buy.currentStock : null,
            source: "mapped",
            preferred: link.is_preferred,
          };
        });
        const linkedProductIds = new Set(links.map((l) => l.supplier_product_id).filter(Boolean));
        for (const product of listed) {
          if (linkedProductIds.has(product.id)) continue;
          out.push({
            id: `listed-${product.id}`,
            name: product.supplier_title,
            sku: "",
            supplierSku: product.supplier_sku,
            price: Number(product.supplier_price),
            leadTimeDays: product.lead_time_days,
            minOrderQty: product.min_order_qty,
            purchasedQty: null,
            currentStock: null,
            source: "listed",
            preferred: false,
          });
        }
        const linkedItemIds = new Set(links.map((l) => l.item_id));
        for (const buy of purchased) {
          if (linkedItemIds.has(buy.itemId)) continue;
          out.push({
            id: `bought-${buy.itemId}`,
            name: buy.name,
            sku: buy.sku,
            supplierSku: "",
            price: null,
            leadTimeDays: null,
            minOrderQty: null,
            purchasedQty: buy.purchasedQty,
            currentStock: buy.currentStock,
            source: "purchased",
            preferred: false,
          });
        }
        setRows(out);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supplierId]);

  const columnDefs = useMemo<ColDef<CatalogRow>[]>(() => {
    const numeric = (colId: string, headerName: string, field: keyof CatalogRow, width: number, format: (n: number) => string): ColDef<CatalogRow> => ({
      colId,
      headerName,
      field,
      width,
      minWidth: 80,
      type: "numericColumn",
      headerClass: NUMERIC_HEADER,
      cellClass: NUMERIC_CELL,
      valueFormatter: (p) => (p.value == null ? "—" : format(Number(p.value))),
    });
    return [
      {
        colId: "product",
        headerName: "Product",
        field: "name",
        flex: 2,
        minWidth: 200,
        tooltipField: "name",
      },
      { colId: "sku", headerName: "SKU", field: "sku", width: 120, minWidth: 90, cellClass: "font-mono text-[11px]", valueFormatter: (p) => p.value || "—" },
      { colId: "supplierSku", headerName: "Supplier SKU", field: "supplierSku", width: 130, minWidth: 100, cellClass: "font-mono text-[11px]", valueFormatter: (p) => p.value || "—" },
      numeric("price", "Supplier price", "price", 120, formatCurrency),
      numeric("leadTimeDays", "Lead time", "leadTimeDays", 100, (n) => `${n} day${n === 1 ? "" : "s"}`),
      numeric("minOrderQty", "Min order", "minOrderQty", 100, formatQuantity),
      numeric("purchasedQty", "Purchased", "purchasedQty", 100, formatQuantity),
      {
        ...numeric("currentStock", "In stock", "currentStock", 100, formatQuantity),
        cellClass: `${NUMERIC_CELL} font-medium`,
      },
      {
        colId: "source",
        headerName: "Status",
        field: "source",
        width: 120,
        minWidth: 100,
        cellRenderer: (p: ICellRendererParams<CatalogRow>) =>
          p.data ? (
            <GridChipBadge
              className={cn("shrink-0", SOURCE_TONE[p.data.source])}
              title={p.data.preferred ? "Mapped · the preferred supplier for this product" : SOURCE_LABEL[p.data.source]}
            >
              {p.data.preferred ? "Preferred" : SOURCE_LABEL[p.data.source]}
            </GridChipBadge>
          ) : null,
      },
    ];
  }, []);

  return (
    <AgainListGrid<CatalogRow>
      embedded
      className={fillHeight ? "min-h-0 flex-1" : "h-[360px]"}
      rowData={rows}
      columnDefs={columnDefs}
      loading={loading}
      getRowId={(p) => p.data.id}
      emptyTitle="No products in this supplier's catalog yet"
      emptyHint="Products this supplier sells appear here once they are mapped to your products (Purchase › Products) or bought on a PO."
    />
  );
}
