"use client";

import { useEffect } from "react";
import type { ElimPlatform } from "../../types";
import { useProductDetail } from "../../hooks/use-products";
import {
  Card,
  SkeletonGrid,
  StateBlock,
  FieldTable,
  RawJsonViewer,
  buttonClassName,
} from "../../components";
import { formatMoney } from "../../utils";

export function ProductDetailsPage({
  productId,
  platform,
  onBack,
  onOpenRaw,
}: {
  productId: string;
  platform: ElimPlatform;
  onBack: () => void;
  onOpenRaw: (raw: unknown) => void;
}) {
  const { loading, error, product, load } = useProductDetail();

  useEffect(() => {
    void load(productId, platform);
  }, [productId, platform, load]);

  if (loading) {
    return <SkeletonGrid count={4} />;
  }

  if (error) {
    return (
      <div className="space-y-3">
        <button type="button" className={buttonClassName("secondary")} onClick={onBack}>
          Back
        </button>
        <StateBlock tone="error" title="Failed to load product" description={error} />
      </div>
    );
  }

  if (!product) {
    return <StateBlock title="No product loaded" />;
  }

  const currency = typeof product.currency === "string" ? product.currency : "CNY";
  const images = product.img_urls?.length
    ? product.img_urls
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClassName("secondary")} onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className={buttonClassName("secondary")}
          onClick={() => onOpenRaw(product)}
        >
          Open Raw JSON
        </button>
      </div>

      <Card className="overflow-hidden">
        <div className="grid gap-4 p-4 md:grid-cols-[220px_1fr]">
          <div className="aspect-square overflow-hidden rounded-lg bg-muted">
            {images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={images[0]} alt={product.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                No image
              </div>
            )}
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">{product.title}</h2>
            {product.titleEn ? (
              <p className="text-sm text-muted-foreground">{product.titleEn}</p>
            ) : null}
            <p className="text-base font-semibold text-foreground">
              {formatMoney(product.promotion_price ?? product.price, currency)}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>ID {product.id}</span>
              <span>{product.shop_name || "—"}</span>
              <span>{platform}</span>
              <span>{product.category_name || "—"}</span>
            </div>
            {product.description ? (
              <p className="line-clamp-6 text-sm text-muted-foreground">{product.description}</p>
            ) : null}
          </div>
        </div>
      </Card>

      <FieldTable data={product as Record<string, unknown>} />
      <RawJsonViewer value={product} title="Pretty JSON" />
    </div>
  );
}
