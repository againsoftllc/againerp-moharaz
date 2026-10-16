import type { ApiProductMediaLink, ApiProductVariant, ProductDetail } from "@/lib/api/catalog-products";
import type { DropshipMeta, DropshipPriceTier } from "@/lib/dropship/parse-dropship-meta";

export type StorefrontPreviewMedia = {
  type: "image" | "video";
  url: string;
  thumb: string;
};

export type StorefrontPreviewVariant = {
  id: string;
  sku: string;
  name: string;
  price: number;
  stock: number;
  isDefault: boolean;
  imageUrl: string | null;
  options: { name: string; value: string; imageUrl?: string | null }[];
};

export type StorefrontPreviewData = {
  images: { large: string; thumb: string }[];
  videos: string[];
  variants: StorefrontPreviewVariant[];
  priceTiers: { minQty: number; price: number }[];
  soldCount: number;
  rating: number;
  weightKg: number | null;
  compareAtPrice: number;
};

function parseVariantOptions(raw?: string | null): StorefrontPreviewVariant["options"] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((opt) => {
        if (!opt || typeof opt !== "object") return null;
        const o = opt as Record<string, unknown>;
        const name = String(o.name || o.nameEn || "").trim();
        const value = String(o.value || o.valueEn || "").trim();
        if (!name && !value) return null;
        const img = typeof o.img_url === "string" ? o.img_url : null;
        return { name: name || "Option", value: value || name, imageUrl: img };
      })
      .filter(Boolean) as StorefrontPreviewVariant["options"];
  } catch {
    return [];
  }
}

function mapVariants(rows: ApiProductVariant[]): StorefrontPreviewVariant[] {
  return rows.map((v) => ({
    id: v.id,
    sku: v.sku,
    name: v.name,
    price: parseFloat(v.price) || 0,
    stock: v.stock,
    isDefault: v.is_default,
    imageUrl: v.image_url,
    options: parseVariantOptions(v.options_json),
  }));
}

function mapPriceTiers(meta: DropshipMeta | null): { minQty: number; price: number }[] {
  const tiers = meta?.price_tiers;
  if (!Array.isArray(tiers)) return [];
  return (tiers as DropshipPriceTier[])
    .map((t) => ({
      minQty: Number(t.min_qty) || 0,
      price: Number(t.price_bdt) || 0,
    }))
    .filter((t) => t.minQty > 0 && t.price > 0)
    .sort((a, b) => a.minQty - b.minQty);
}

function buildMedia(
  product: ProductDetail,
  meta: DropshipMeta | null,
): { images: StorefrontPreviewData["images"]; videos: string[] } {
  const links: ApiProductMediaLink[] = product.mediaLinks ?? [];
  const images: StorefrontPreviewData["images"] = [];
  const seen = new Set<string>();

  const addImage = (url: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ large: url, thumb: url });
  };

  if (links.length > 0) {
    for (const m of [...links].sort((a, b) => a.sort_order - b.sort_order)) {
      if (m.media_type === "video") continue;
      addImage(m.url);
    }
  } else if (product.thumbnail) {
    addImage(product.thumbnail);
  }

  const videos = [...(product.videoUrls ?? [])];
  if (!videos.length && meta?.video_count) {
    try {
      const payload = meta.source_payload as Record<string, unknown> | undefined;
      const raw = payload?.video_urls ?? payload?.videos;
      if (Array.isArray(raw)) {
        for (const v of raw) {
          if (typeof v === "string" && v) videos.push(v);
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { images, videos };
}

export function mapProductToStorefrontPreview(
  product: ProductDetail,
  meta: DropshipMeta | null,
): StorefrontPreviewData {
  const { images, videos } = buildMedia(product, meta);
  const basePrice = product.price;
  const compareAtPrice =
    product.compareAtPrice && product.compareAtPrice > basePrice
      ? product.compareAtPrice
      : Math.round(basePrice * 1.12 * 100) / 100;

  const soldRaw = meta?.sales_volume;
  const soldCount =
    typeof soldRaw === "number"
      ? soldRaw
      : typeof soldRaw === "string"
        ? parseInt(soldRaw.replace(/\D/g, ""), 10) || 0
        : 0;

  const reviewScore = product.sellerInfo?.review?.total_score;
  const rating =
    reviewScore != null && Number.isFinite(Number(reviewScore))
      ? Number(reviewScore) <= 5
        ? Number(reviewScore)
        : Math.round((Number(reviewScore) / 20) * 10) / 10
      : 4.5;

  return {
    images,
    videos,
    variants: mapVariants(product.variants ?? []),
    priceTiers: mapPriceTiers(meta),
    soldCount,
    rating,
    weightKg: meta?.weight_kg != null ? Number(meta.weight_kg) : null,
    compareAtPrice,
  };
}

export function unitPriceForQty(
  qty: number,
  tiers: { minQty: number; price: number }[],
  basePrice: number,
): number {
  if (!tiers.length) return basePrice;
  let price = tiers[0]?.price ?? basePrice;
  for (const tier of tiers) {
    if (qty >= tier.minQty) price = tier.price;
    else break;
  }
  return price;
}

export function isAliCdnUrl(url: string): boolean {
  return /alicdn\.com|alibaba\.com|tbcdn\.cn|1688\.com/i.test(url);
}
