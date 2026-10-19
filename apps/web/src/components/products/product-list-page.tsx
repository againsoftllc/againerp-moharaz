"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, Globe, MousePointerClick, Plus, RefreshCw, Settings2, Download, Upload } from "lucide-react";
import { ProductGridOpenFallback } from "@/components/products/product-grid-open-fallback";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProductImportDialog } from "@/components/products/product-import-dialog";
import { SitemapImportDialog } from "@/components/products/sitemap-import-dialog";
import { downloadPdf, downloadXlsx, fileStamp } from "@/lib/list-io/spreadsheet";
import type { Product } from "@/lib/mock-data/products";
import type { ProductGridHandle } from "@/components/products/product-grid";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { useCatalogProducts, fetchCatalogProduct } from "@/lib/api/use-catalog-products";
import { useCatalogCategories } from "@/lib/api/use-catalog-categories";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { startProductAiFill } from "@/lib/start-product-ai";
import { addProductsToInventory } from "@/lib/api/catalog-products";

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

export type ProductListProps = {
  /** the page this list lives on (links, deep links and the ?view= dialog stay on it) */
  basePath?: string;
  title?: string;
  /** list only products whose status is draft */
  draftOnly?: boolean;
  /** the Unlisted page: only unlisted products - everything else (columns, filters, live edit, Import / Export, AI column) is the Products list */
  unlistedOnly?: boolean;
};

function ProductListContent({ basePath = "/website/products", title = "Products", draftOnly = false, unlistedOnly = false }: ProductListProps) {
  const buildProductsUrl = (params: URLSearchParams) => {
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  const router = useRouter();
  const searchParams = useSearchParams();
  const { products: allProducts, loading, error, refetch } = useCatalogProducts(
    unlistedOnly ? { channel: "catalog", status: "unlisted" } : { channel: "catalog", scope: "website", status: "!unlisted" },
  );
  const products = useMemo(() => (draftOnly ? allProducts.filter((p) => p.status === "draft") : allProducts), [allProducts, draftOnly]);
  const { categories } = useCatalogCategories({ channel: "catalog" });
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const productGridRef = useRef<ProductGridHandle>(null);
  const [advancedFilterCount, setAdvancedFilterCount] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [sitemapOpen, setSitemapOpen] = useState(false);

  const [formSheetOpen, setFormSheetOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [fetchedEditProduct, setFetchedEditProduct] = useState<Product | null>(null);

  const editProduct = useMemo(() => {
    if (!editProductId) return null;
    return allProducts.find((p) => p.id === editProductId) ?? fetchedEditProduct;
  }, [editProductId, allProducts, fetchedEditProduct]);

  // Deep-link / Aladin Open product: resolve product for edit drawer (list cache or API).
  useEffect(() => {
    if (!editProductId) {
      setFetchedEditProduct(null);
      return;
    }
    if (allProducts.some((p) => p.id === editProductId)) {
      setFetchedEditProduct(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      // Brief retry — product may have just been created by Aladin.
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
      // Keep drawer usable; detail fetch inside ProductForm will surface real errors.
      console.warn("Could not preload product for edit", lastError);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [editProductId, allProducts]);

  const pushParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.push(buildProductsUrl(params), { scroll: false });
  };

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
    router.replace(buildProductsUrl(params), { scroll: false });
  };

  // Deep links (?create=1 / ?edit=id): open drawer once, then clear URL.
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
    router.replace(buildProductsUrl(params), { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    if (error) {
      toast.error(`API: ${error}`, { id: "catalog-products-api" });
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
    if (searchParams.get("view")) {
      pushParams((params) => {
        params.delete("view");
        params.delete("create");
        params.delete("edit");
      });
    } else {
      stripFormParamsFromUrl();
    }
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

  // Do not toast/close when editProduct is briefly null — Aladin deep-links open the
  // drawer with only an id while list/detail preload; ProductForm loads via useCatalogProduct.

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  // Export: the columns visible in the table, for every row the search / filters leave - as Excel or PDF
  const exportList = async (format: "xlsx" | "pdf") => {
    const table = productGridRef.current?.getExportTable({ numbersAsText: format === "pdf" });
    if (!table || table.rows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    try {
      const name = `products-${fileStamp()}`;
      if (format === "xlsx") await downloadXlsx(table, name, "Products");
      else await downloadPdf(table, name, "Products");
      toast.success(`Exported ${table.rows.length} products, ${table.headers.length} columns`);
    } catch (err) {
      toast.error(err instanceof Error ? `Export failed: ${err.message}` : "Export failed");
    }
  };

  const headerLeftActions = (
    <ListGridHeaderStart title={title}>
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
          {canWrite ? (
            <DropdownMenuItem onClick={() => setImportOpen(true)}>
              <Upload className="mr-1.5 h-3 w-3" />
              Import
            </DropdownMenuItem>
          ) : null}
          {canWrite && unlistedOnly ? (
            <DropdownMenuItem onClick={() => setSitemapOpen(true)}>
              <Globe className="mr-1.5 h-3 w-3" />
              Import from sitemap
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Download className="mr-1.5 h-3 w-3" />
              Export
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => void exportList("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportList("pdf")}>PDF</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
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
          <p className="mt-2 text-xs text-muted-foreground">
            Ensure FastAPI is running:{" "}
            <code className="rounded-none bg-muted px-1">uvicorn main:app --port 8000</code>
          </p>
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
          onView={() => undefined}
          disableView
          onEdit={handleEdit}
          onProductsChanged={() => void refetch()}
          duplicateCheck={unlistedOnly}
          // the AI column (like Unlisted): fill the product from its source link in the Aladin drawer
          onAiImport={(product) => startProductAiFill(product, () => void refetch())}
          onAddToInventory={async (rows) => {
            try {
              const r = await addProductsToInventory(rows.map((p) => p.id));
              toast.success(
                r.added
                  ? `Added ${r.added} product${r.added > 1 ? "s" : ""} to Inventory`
                  : "Already in Inventory",
              );
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not add to Inventory");
            }
          }}
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

      {canWrite && unlistedOnly ? <SitemapImportDialog open={sitemapOpen} onOpenChange={setSitemapOpen} onDone={() => void refetch()} /> : null}

      {canWrite ? (
        <ProductImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          products={products}
          categories={categories}
          onDone={() => void refetch()}
        />
      ) : null}

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

export function ProductListPage(props: ProductListProps) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ProductGridOpenFallback />}>
        <ProductListContent {...props} />
      </Suspense>
    </div>
  );
}
