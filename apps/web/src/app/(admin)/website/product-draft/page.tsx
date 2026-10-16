"use client";

import { PriceComparePage } from "@/components/products/price-compare-page";

/** Website → Catalog → Product Draft: draft products with the Price Compare columns — save a product's source link
    per competitor site and sync it to see the source's price and stock status. */
export default function Page() {
  return (
    <PriceComparePage
      basePath="/website/product-draft"
      title="Product Draft"
      draftOnly
      columnStateKey="product-draft-grid:columnState"
    />
  );
}
