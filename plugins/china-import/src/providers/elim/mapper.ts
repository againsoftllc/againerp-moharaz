import type {
  ProviderCategory,
  ProviderProduct,
  ProviderProductDetail,
  ProviderSearchResult,
} from "../../core/types";
import type { ElimCategoryItem, ElimProductDetail, ElimProductListItem, ElimProductListResponse } from "../../types";
import { mapProduct } from "../../mapper/ProductMapper";

/** Map Elim product list item → provider-agnostic product (STEP-02 layer). */
export function mapElimProduct(item: ElimProductListItem, platform?: string): ProviderProduct {
  return {
    id: String(item.id),
    title: item.title || item.titleEn || String(item.id),
    titleEn: item.titleEn,
    price: Number(item.promotion_price ?? item.price ?? 0),
    currency: typeof item.currency === "string" ? item.currency : "CNY",
    imageUrl: item.img_url,
    supplier: item.shop_name || (typeof item.seller_type === "string" ? item.seller_type : undefined),
    platform,
    link: item.link,
    raw: item as Record<string, unknown>,
  };
}

export function mapElimSearchResult(
  data: ElimProductListResponse,
  platform?: string,
): ProviderSearchResult {
  const items = (data.items ?? []).map((item) => mapElimProduct(item, platform));
  return {
    items,
    page: data.paginate?.current ?? 1,
    size: data.paginate?.size ?? items.length,
    total: data.paginate?.total ?? items.length,
    raw: data,
  };
}

export function mapElimProductDetail(
  data: ElimProductDetail,
  platform?: string,
): ProviderProductDetail {
  const universal = mapProduct("elim", data);
  const base = mapElimProduct(
    {
      id: data.id,
      title: data.title,
      titleEn: data.titleEn,
      price: data.price,
      promotion_price: data.promotion_price,
      img_url: data.img_urls?.[0],
      shop_name: data.shop_name,
      seller_type: data.seller_type,
      currency: data.currency,
      link: undefined,
    },
    platform,
  );

  return {
    ...base,
    description: universal.product.description,
    images: universal.product.images.map((i) => i.url),
    categoryId: universal.product.category?.providerCategoryId,
    categoryName: universal.product.category?.name,
    attributes: universal.product.attributes.map((a) => ({ name: a.name, value: a.value })),
    skus: universal.product.variants,
    moq: universal.product.minimumOrder,
    raw: { ...(data as Record<string, unknown>), _universal: universal.product },
  };
}

/** Map Elim detail → Universal Product (STEP-03). */
export function mapElimToUniversal(data: unknown) {
  return mapProduct("elim", data);
}

export function mapElimCategories(
  items: ElimCategoryItem[] | undefined,
): ProviderCategory[] {
  return (items ?? []).map((c) => ({
    id: String(c.id),
    name: c.name,
    parentId: c.parent_id != null ? String(c.parent_id) : null,
    raw: c as Record<string, unknown>,
  }));
}
