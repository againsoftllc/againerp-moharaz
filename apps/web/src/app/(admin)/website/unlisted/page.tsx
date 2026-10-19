"use client";

import { ProductListPage } from "@/components/products/product-list-page";

/** Website -> Catalog -> Unlisted: the same datatable as Products (columns, filters, live edit, Import / Export, AI column, Source),
    for the products whose status is unlisted. No Price Compare columns or bulk checks here. */
export default function Page() {
  return <ProductListPage basePath="/website/unlisted" title="Unlisted" unlistedOnly />;
}
