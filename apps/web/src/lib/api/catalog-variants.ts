import type { CatalogVariantRow } from "@/lib/mock-data/variants";
import type { ProductStatus } from "@/lib/mock-data/products";

export type ApiCatalogVariant = {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  variant_label: string;
  variant_sku: string;
  price: string;
  stock: number;
  status: ProductStatus;
  category: string;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ApiVariantListResponse = {
  data: ApiCatalogVariant[];
  meta: { count: number };
  errors: string[];
};

export function apiVariantToRow(row: ApiCatalogVariant): CatalogVariantRow {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productSku: row.product_sku,
    variantLabel: row.variant_label,
    variantSku: row.variant_sku,
    price: parseFloat(row.price) || 0,
    stock: row.stock,
    status: row.status,
    category: row.category,
    isDefault: row.is_default,
  };
}
