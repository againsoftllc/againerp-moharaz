"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, MousePointerClick, Plus, RefreshCw, Settings2, Download, Upload } from "lucide-react";
import { ProductGridOpenFallback } from "@/components/products/product-grid-open-fallback";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Product } from "@/lib/mock-data/products";
import type { ProductGridHandle } from "@/components/products/product-grid";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { VendorAccessDrawer } from "@/components/vendors/vendor-access-drawer";
import { useCatalogProducts, fetchCatalogProduct } from "@/lib/api/use-catalog-products";
import { useCatalogCategories } from "@/lib/api/use-catalog-categories";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Vendors module catalog browser — same product grid, filters, and
 * create/edit/view flow as /catalog/products, kept in sync intentionally so
 * staff can browse or map the shared catalog without leaving the Vendors
 * module. Only the deep-link base path differs.
 */

const ProductGrid = dynamic(
  () => import("@/components/products/product-grid").then((module) => module.ProductGrid),
  {
    ssr: false,
    loading: () => <ProductGridOpenFallback />,
  },
);

const ProductFormDialog = dynamic(
  () =>
    import("@/components/products/product-form-dialog").then(
      (module) => module.ProductFormDialog,
    ),
  { ssr: false },
);

function buildVendorCatalogUrl(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/vendors/catalog?${query}` : "/vendors/catalog";
}

function VendorCatalogContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { products, loading, error, refetch } = useCatalogProducts({ channel: "catalog" });

  const exportCatalogCsv = () => {
    if (!products.length) {
      toast.error("Nothing to export");
      return;
    }
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["SKU", "Name", "Price", "Stock", "Stock status"];
    const body = products.map((p) => [p.sku, p.name, p.price, p.stock, p.stockStatus].map(escape).join(","));
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendor-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${products.length} product${products.length === 1 ? "" : "s"}`);
  };
  const { categories } = useCatalogCategories({ channel: "catalog" });
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const productGridRef = useRef<ProductGridHandle>(null);
  const [advancedFilterCount, setAdvancedFilterCount] = useState(0);

  const [vendorAccessProduct, setVendorAccessProduct] = useState<Product | null>(null);
  const [vendorAccessOpen, setVendorAccessOpen] = useState(false);
  const [formSheetOpen, setFormSheetOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [fetchedEditProduct, setFetchedEditProduct] = useState<Product | null>(null);

  const editProduct = useMemo(() => {
    if (!editProductId) return null;
    return products.find((p) => p.id === editProductId) ?? fetchedEditProduct;
  }, [editProductId, products, fetchedEditProduct]);

  useEffect(() => {
    if (!editProductId) {
      setFetchedEditProduct(null);
      return;
    }
    if (products.some((p) => p.id === editProductId)) {
      setFetchedEditProduct(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
        try {
          const product = await fetchCatalogProduct(editProductId);
          if (!cancelled) setFetchedEditProduct(product);
          return;
        } catch (err) {
          lastError = err;
        }
      }
      if (cancelled) return;
      setFetchedEditProduct({ id: editProductId } as Product);
      console.warn("Could not preload product for edit", lastError);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [editProductId, products]);

  const stripFormParamsFromUrl = () => {
    if (
      !searchParams.get("create") &&
      !searchParams.get("edit") &&
      !searchParams.get("aiImport")
    ) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("create");
    params.delete("edit");
    params.delete("aiImport");
    router.replace(buildVendorCatalogUrl(params), { scroll: false });
  };

  useEffect(() => {
    const create = searchParams.get("create") === "1";
    const edit = searchParams.get("edit");
    if (!create && !edit) return;

    if (create) {
      setFormMode("create");
      setEditProductId(null);
      setFormSheetOpen(true);
    } else if (edit) {
      setFormMode("edit");
      setEditProductId(edit);
      setFormSheetOpen(true);
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("create");
    params.delete("edit");
    params.delete("aiImport");
    router.replace(buildVendorCatalogUrl(params), { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    if (error) {
      toast.error(`API: ${error}`, { id: "vendors-catalog-api" });
    }
  }, [error]);

  const openCreate = () => {
    setFormMode("create");
    setEditProductId(null);
    setFormSheetOpen(true);
    stripFormParamsFromUrl();
  };

  const handleEdit = (product: Product) => {
    setFormMode("edit");
    setEditProductId(product.id);
    setFormSheetOpen(true);
    stripFormParamsFromUrl();
  };

  const handleView = (product: Product) => {
    setVendorAccessProduct(product);
    setVendorAccessOpen(true);
  };

  const closeForm = () => {
    setFormSheetOpen(false);
    setFormMode(null);
    setEditProductId(null);
    stripFormParamsFromUrl();
  };

  useViewerWriteUrlGuard(formSheetOpen && (formMode === "create" || formMode === "edit"), closeForm);

  const handleSaved = () => {
    void refetch();
  };

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Catalog">
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={openCreate}>
          New
        </Button>
      ) : null}
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
            {advancedFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-none bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
                {advancedFilterCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          <DropdownMenuItem
            onClick={() => {
              void refetch();
              apiHealth.recheck();
            }}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => productGridRef.current?.openFilters()}>
            <Filter className="mr-1.5 h-3 w-3" />
            Filters
            {advancedFilterCount > 0 ? (
              <span className="ml-auto text-[10px] text-muted-foreground">{advancedFilterCount}</span>
            ) : null}
          </DropdownMenuItem>
          {canWrite ? (
            <DropdownMenuItem onClick={() => productGridRef.current?.openLiveEdit()}>
              <MousePointerClick className="mr-1.5 h-3 w-3" />
              Live edit
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => toast.info("Import — prototype")}>
            <Upload className="mr-1.5 h-3 w-3" />
            Import
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportCatalogCsv}>
            <Download className="mr-1.5 h-3 w-3" />
            Export
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {error && !loading ? (
        <div className="rounded-none border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">Could not load products from API</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3 rounded-none" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <ProductGrid
          ref={productGridRef}
          products={products}
          categories={categories}
          loading={loading && products.length === 0}
          onView={handleView}
          onEdit={handleEdit}
          nameClickAction="view"
          onProductsChanged={() => void refetch()}
          onAdvancedFilterCountChange={setAdvancedFilterCount}
          headerLeftActions={headerLeftActions}
          className="min-h-0 flex-1"
        />
      )}

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full p-0 shadow-lg md:hidden"
          onClick={openCreate}
          aria-label="Add product"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}

      <VendorAccessDrawer
        open={vendorAccessOpen}
        onOpenChange={(open) => {
          setVendorAccessOpen(open);
          if (!open) setVendorAccessProduct(null);
        }}
        product={vendorAccessProduct}
      />

      {canWrite &&
        formSheetOpen &&
        (formMode === "create" || (formMode === "edit" && !!editProductId)) && (
          <ProductFormDialog
            open={formSheetOpen}
            onOpenChange={(open) => {
              if (!open) closeForm();
              else setFormSheetOpen(true);
            }}
            mode={formMode === "create" ? "create" : "edit"}
            product={
              formMode === "edit"
                ? (editProduct ?? ({ id: editProductId } as Product))
                : null
            }
            onSaved={handleSaved}
          />
        )}
    </div>
  );
}

export default function VendorCatalogPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ProductGridOpenFallback />}>
        <VendorCatalogContent />
      </Suspense>
    </div>
  );
}
