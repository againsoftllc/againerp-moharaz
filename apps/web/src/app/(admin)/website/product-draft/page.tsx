"use client";

import { ProductListPage } from "@/components/products/product-list-page";

/** Website → Catalog → Product Draft: the products page, limited to draft products. */
export default function Page() {
  return <ProductListPage basePath="/website/product-draft" title="Product Draft" draftOnly />;
}
