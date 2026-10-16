"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { ItemWorkspace } from "@/components/item-workspace/item-workspace";
import { ApiConnectionBadge } from "@/components/products/api-connection-badge";
import { Button } from "@/components/ui/button";
import { useCatalogProduct } from "@/lib/api/use-catalog-product";
import { cn } from "@/lib/utils";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";

type Props = {
  productId: string;
};

export function ProductDetailPageClient({ productId }: Props) {
  const moduleBase = useCatalogModuleBasePath();

  const router = useRouter();
  const { product, loading, error, refetch } = useCatalogProduct(productId);

  const handleEdit = () => {
    router.push(`${moduleBase}/products?edit=${productId}`);
  };

  if (loading) {
    return (
      <p className="flex flex-1 items-center text-sm text-muted-foreground">
        Loading product from database…
      </p>
    );
  }

  if (error || !product) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${moduleBase}/products`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to products
          </Link>
        </Button>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">Product not found</p>
          <p className="mt-1 text-muted-foreground">{error ?? "Invalid product ID"}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0">
        <ApiConnectionBadge loading={loading} error={error} productCount={1} />
      </div>
      <ItemWorkspace
        product={product}
        onBack={() => router.push(`${moduleBase}/products`)}
        onEdit={handleEdit}
      />
    </div>
  );
}
