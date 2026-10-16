"use client";

import type { Product } from "@/lib/mock-data/products";
import { ProductDetailContent } from "@/components/products/product-detail-content";
import { useCatalogProduct } from "@/lib/api/use-catalog-product";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { storefrontProductUrl } from "@/lib/website/live-edit";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Load from FastAPI when set */
  productId?: string | null;
  /** Legacy mock product (used when productId omitted) */
  product?: Product | null;
  onEdit?: (product: Product) => void;
};

export function ProductViewDialog({
  open,
  onOpenChange,
  productId,
  product: mockProduct,
  onEdit,
}: Props) {
  const useApi = Boolean(productId);
  const { product: apiProduct, loading, error } = useCatalogProduct(
    open && useApi ? productId : null,
  );
  const product = useApi ? apiProduct : mockProduct;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={product ? `Product: ${product.name}` : "Product details"}
        resizable
        resizeMaxWidth={1100}
        closeButton="inside"
        className="z-[60] w-[min(100%,56rem)] min-w-[320px] max-w-[1100px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
        aria-describedby={undefined}
      >
        <div className="flex h-full min-h-0 flex-col px-4 pb-4 pt-3 pr-10">
          {useApi && loading && (
            <ContentDataSkeleton label="Loading product…" showFilters={false} rows={8} />
          )}
          {useApi && error && !loading && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {product && !(useApi && loading) && (
            <ProductDetailContent
              product={product}
              simpleCatalog={useApi}
              inDialog
              onEdit={onEdit}
              onClose={() => onOpenChange(false)}
              onOpenFullPage={
                useApi
                  ? (p) => {
                      window.open(storefrontProductUrl(p.slug), "_blank", "noopener,noreferrer");
                    }
                  : undefined
              }
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
