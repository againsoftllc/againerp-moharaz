"use client";

import { PriceComparePage } from "@/components/products/price-compare-page";

/** Website → Catalog → Unlisted (route /website/product-draft): draft products with the Price Compare columns — save a product's source link
    per competitor site and sync it to see the source's price and stock status. */
export default function Page() {
  return (
    <PriceComparePage
      basePath="/website/product-draft"
      title="Unlisted"
      draftOnly
      columnStateKey="product-draft-grid:columnState"
    />
  );
}
