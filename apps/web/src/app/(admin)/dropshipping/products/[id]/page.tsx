import { Suspense } from "react";
import { ProductDetailPageClient } from "@/components/products/product-detail-page-client";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ProductDetailsPage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="flex min-h-[calc(100vh-2.75rem-1.5rem)] flex-1 flex-col lg:min-h-[calc(100vh-2.75rem-2rem)]">
      <Suspense fallback={<ContentDataSkeleton label="Loading product…" />}>
        <ProductDetailPageClient productId={id} />
      </Suspense>
    </div>
  );
}
