"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Filter, RefreshCw, Settings2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { MapItemDrawer } from "@/components/suppliers/map-item-drawer";
import type { PurchaseProductGridHandle } from "@/components/purchase/purchase-product-grid";
import { useCommerceSuppliers } from "@/lib/api/use-commerce-suppliers";
import { useApiHealth } from "@/lib/api/use-api-health";
import {
  fetchSupplierProducts,
  fetchSupplierLinksBySupplier,
  type ApiSupplierLink,
  type ApiSupplierProduct,
} from "@/lib/api/supplier-catalog";
import { cn } from "@/lib/utils";

const PurchaseProductGrid = dynamic(
  () =>
    import("@/components/purchase/purchase-product-grid").then((m) => m.PurchaseProductGrid),
  { ssr: false, loading: () => <ListGridOpenFallback label="Opening supplier products…" /> },
);

export default function SupplierProductsPage() {
  const { suppliers } = useCommerceSuppliers();
  const apiHealth = useApiHealth();
  const gridRef = useRef<PurchaseProductGridHandle>(null);
  const [filterCount, setFilterCount] = useState(0);
  const [products, setProducts] = useState<ApiSupplierProduct[]>([]);
  const [links, setLinks] = useState<ApiSupplierLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapInitial, setMapInitial] = useState<{
    supplierId: string;
    supplierSku: string;
    supplierTitle: string;
    supplierPrice: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSupplierProducts({ per_page: 500 });
      setProducts(res.data);
      if (suppliers.length === 0) {
        setLinks([]);
      } else {
        const all = await Promise.all(
          suppliers.map((s) => fetchSupplierLinksBySupplier(s.id).catch(() => [])),
        );
        setLinks(all.flat());
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load supplier products");
      setProducts([]);
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [suppliers]);

  useEffect(() => {
    void load();
  }, [load]);

  const supplierNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of suppliers) map.set(s.id, s.name);
    return map;
  }, [suppliers]);

  const mappedCount = useMemo(() => {
    const ids = new Set(
      links.map((l) => l.supplier_product_id).filter((id): id is string => Boolean(id)),
    );
    return products.filter((p) => ids.has(p.id)).length;
  }, [links, products]);

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Supplier products">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "relative h-[26px] w-[26px] shrink-0 rounded-none",
              apiHealth.status === "connected" &&
                "border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400",
              apiHealth.status === "partial" &&
                "border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400",
              apiHealth.status === "disconnected" &&
                "border-red-500/50 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400",
              apiHealth.status === "checking" && "text-muted-foreground",
            )}
            aria-label={`Settings (${healthTitle})`}
            title={healthTitle}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {filterCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-none bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
                {filterCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          <DropdownMenuItem
            onClick={() => {
              void load();
              apiHealth.recheck();
            }}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openFilters()}>
            <Filter className="mr-1.5 h-3 w-3" />
            Filters
            {filterCount > 0 ? (
              <span className="ml-auto text-[10px] text-muted-foreground">{filterCount}</span>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openColumns()}>
            <SlidersHorizontal className="mr-1.5 h-3 w-3" />
            Columns
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => gridRef.current?.exportCsv()}>
            <Download className="mr-1.5 h-3.5 w-3" />
            Export
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.resetFilters()}>
            Reset filters
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <PurchaseProductGrid
        ref={gridRef}
        products={products}
        links={links}
        suppliers={suppliers}
        loading={loading && products.length === 0}
        onMap={(product) => {
          setMapInitial({
            supplierId: product.supplier_id,
            supplierSku: product.supplier_sku,
            supplierTitle: product.supplier_title,
            supplierPrice: Number(product.supplier_price),
          });
          setMapOpen(true);
        }}
        onFilterCountChange={setFilterCount}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading
              ? "Loading…"
              : `${products.length} product${products.length === 1 ? "" : "s"} · ${mappedCount} mapped`}
          </span>
        }
        className="min-h-0 flex-1"
      />

      {mapInitial && (
        <MapItemDrawer
          key={`${mapInitial.supplierSku}:${mapOpen}`}
          open={mapOpen}
          onOpenChange={setMapOpen}
          supplierId={mapInitial.supplierId}
          supplierName={supplierNameById.get(mapInitial.supplierId)}
          initial={{
            supplierSku: mapInitial.supplierSku,
            supplierTitle: mapInitial.supplierTitle,
            supplierPrice: mapInitial.supplierPrice,
          }}
          onMapped={load}
        />
      )}
    </div>
  );
}
