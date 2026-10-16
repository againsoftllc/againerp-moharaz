"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import type { ProductDetail } from "@/lib/api/catalog-products";
import type { DropshipMeta } from "@/lib/dropship/parse-dropship-meta";
import {
  isAliCdnUrl,
  mapProductToStorefrontPreview,
  type StorefrontPreviewMedia,
  type StorefrontPreviewVariant,
  unitPriceForQty,
} from "@/lib/dropship/map-storefront-preview";
import { cn, formatCurrency, formatQuantity } from "@/lib/utils";

type Props = {
  product: ProductDetail;
  meta: DropshipMeta | null;
};

function formatSoldCount(n: number): string {
  const value = Math.max(0, Math.round(n));
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (value >= 1000) {
    const k = value / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return String(value);
}

function formatScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return n <= 5 ? n.toFixed(1) : (Math.round((n / 20) * 10) / 10).toFixed(1);
}

function buildMedia(
  images: { large: string; thumb: string }[],
  videos: string[],
  highlightImageUrl?: string | null,
): StorefrontPreviewMedia[] {
  const poster = images[0]?.thumb || images[0]?.large || "";
  const videoItems: StorefrontPreviewMedia[] = videos
    .filter(Boolean)
    .map((url) => ({ type: "video", url, thumb: poster || url }));

  let imageItems: StorefrontPreviewMedia[] = images.map((img) => ({
    type: "image",
    url: img.large,
    thumb: img.thumb || img.large,
  }));

  if (highlightImageUrl) {
    const existing = imageItems.findIndex(
      (img) => img.url === highlightImageUrl || img.thumb === highlightImageUrl,
    );
    if (existing < 0) {
      imageItems = [
        { type: "image", url: highlightImageUrl, thumb: highlightImageUrl },
        ...imageItems,
      ];
    }
  }

  return [...videoItems, ...imageItems];
}

function isColorAxis(name: string) {
  const n = name.toLowerCase();
  return n.includes("color") || n.includes("colour") || n.includes("颜色");
}

function isSizeAxis(name: string) {
  const n = name.toLowerCase();
  return n.includes("size") || n.includes("尺码") || n.includes("规格");
}

function buildAxes(variants: StorefrontPreviewVariant[]) {
  const order: string[] = [];
  const values = new Map<string, { value: string; imageUrl?: string | null }[]>();
  for (const variant of variants) {
    for (const opt of variant.options) {
      if (!values.has(opt.name)) {
        order.push(opt.name);
        values.set(opt.name, []);
      }
      const list = values.get(opt.name)!;
      if (!list.some((x) => x.value === opt.value)) {
        list.push({ value: opt.value, imageUrl: opt.imageUrl });
      }
    }
  }
  return order.map((name) => ({ name, options: values.get(name) || [] }));
}

function optionImage(
  variants: StorefrontPreviewVariant[],
  axisName: string,
  value: string,
): string | null {
  for (const v of variants) {
    const opt = v.options.find((o) => o.name === axisName && o.value === value);
    if (opt?.imageUrl) return opt.imageUrl;
    if (v.options.some((o) => o.name === axisName && o.value === value) && v.imageUrl) {
      return v.imageUrl;
    }
  }
  return null;
}

function variantsForPrimary(
  variants: StorefrontPreviewVariant[],
  primaryName: string,
  primaryValue: string,
) {
  return variants.filter((v) =>
    v.options.some((o) => o.name === primaryName && o.value === primaryValue),
  );
}

function PreviewGallery({
  media,
  name,
  active,
  onActiveChange,
}: {
  media: StorefrontPreviewMedia[];
  name: string;
  active: number;
  onActiveChange: (index: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  if (!media.length) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-[20px] border border-gray-100 bg-white text-sm text-gray-400">
        No media
      </div>
    );
  }

  const activeItem = media[active] || media[0];
  const isVideo = activeItem.type === "video";

  const scrollThumbs = (dir: number) => {
    trackRef.current?.scrollBy({ left: dir * 100, behavior: "smooth" });
  };

  return (
    <div className="p-1">
      <div
        onClick={() => {
          if (!isVideo) {
            setLightboxIndex(active);
            setLightboxOpen(true);
          }
        }}
        className={cn(
          "relative flex h-[280px] items-center justify-center overflow-hidden rounded-[20px] border border-gray-100 bg-white md:h-[320px]",
          !isVideo && "cursor-zoom-in",
        )}
      >
        {isVideo ? (
          <video
            key={activeItem.url}
            src={activeItem.url}
            controls
            playsInline
            preload="metadata"
            poster={activeItem.thumb !== activeItem.url ? activeItem.thumb : undefined}
            className="h-full w-full bg-black object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeItem.url}
            alt={name}
            referrerPolicy={isAliCdnUrl(activeItem.url) ? "no-referrer" : undefined}
            className="max-h-full max-w-full object-contain p-2.5"
          />
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => scrollThumbs(-1)}
          aria-label="Previous thumbnail"
          className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-gray-200 bg-[#f5f5f7] text-[#d92128] transition-colors hover:bg-[#d92128] hover:text-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div
          ref={trackRef}
          className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {media.map((item, i) => (
            <button
              key={`${item.type}-${item.url}-${i}`}
              type="button"
              onClick={() => onActiveChange(i)}
              className={cn(
                "relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 bg-[#fafbfe] transition-colors",
                i === active ? "border-[#d92128]" : "border-gray-200 hover:border-[#d92128]",
              )}
            >
              {item.type === "video" ? (
                <>
                  {item.thumb && item.thumb !== item.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumb}
                      alt=""
                      referrerPolicy={isAliCdnUrl(item.thumb) ? "no-referrer" : undefined}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#111]">
                      <Play className="h-6 w-6 fill-white text-white" />
                    </div>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                    <Play className="h-6 w-6 fill-white text-white drop-shadow" />
                  </span>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumb}
                  alt=""
                  referrerPolicy={isAliCdnUrl(item.thumb) ? "no-referrer" : undefined}
                  className="h-full w-full object-contain p-1"
                />
              )}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => scrollThumbs(1)}
          aria-label="Next thumbnail"
          className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-gray-200 bg-[#f5f5f7] text-[#d92128] transition-colors hover:bg-[#d92128] hover:text-white"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {lightboxOpen ? (
        <div
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0d1828]/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#f3f4f6] text-[#d32f2f] transition-colors hover:bg-[#d32f2f] hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="relative flex aspect-square items-center justify-center bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={media[lightboxIndex]?.url}
                alt={name}
                referrerPolicy={
                  media[lightboxIndex]?.url && isAliCdnUrl(media[lightboxIndex].url)
                    ? "no-referrer"
                    : undefined
                }
                className="max-h-full max-w-full bg-white object-contain p-4"
              />
            </div>
            <div className="flex items-center justify-between gap-3 bg-[#0d1828] px-4 py-3 text-[13px] text-white">
              <span className="truncate">{name}</span>
              <span className="shrink-0 text-[#f3f4f6]">
                {lightboxIndex + 1} of {media.length}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PreviewAttributes({
  variants,
  priceTiers,
  onVariantImage,
}: {
  variants: StorefrontPreviewVariant[];
  priceTiers: { minQty: number; price: number }[];
  onVariantImage?: (url: string | null) => void;
}) {
  const axes = useMemo(() => buildAxes(variants), [variants]);
  const primary = useMemo(() => {
    const color = axes.find((a) => isColorAxis(a.name));
    return color || axes[0] || null;
  }, [axes]);
  const secondary = useMemo(() => {
    const rest = axes.filter((a) => a.name !== primary?.name);
    if (!rest.length) return null;
    return rest.find((a) => isSizeAxis(a.name)) || rest[0];
  }, [axes, primary?.name]);

  const multiSku = Boolean(primary && (secondary || (primary && !isColorAxis(primary.name))));
  const useSimpleChips =
    !multiSku || Boolean(primary && isColorAxis(primary.name) && !secondary);

  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const preferred = variants.find((v) => v.isDefault) || variants[0];
    if (!preferred) return {};
    const sel: Record<string, string> = {};
    for (const opt of preferred.options) sel[opt.name] = opt.value;
    return sel;
  });

  const [primaryValue, setPrimaryValue] = useState(() => {
    const preferred = variants.find((v) => v.isDefault) || variants[0];
    if (!preferred || !primary) return "";
    return preferred.options.find((o) => o.name === primary.name)?.value || primary.options[0]?.value || "";
  });

  const matched = useMemo(() => {
    const keys = Object.keys(selected);
    if (!keys.length) return null;
    return (
      variants.find((v) =>
        keys.every((name) => v.options.some((o) => o.name === name && o.value === selected[name])),
      ) || null
    );
  }, [variants, selected]);

  const rows = useMemo(() => {
    if (!primary || !primaryValue) return variants;
    if (secondary) return variantsForPrimary(variants, primary.name, primaryValue);
    if (!isColorAxis(primary.name)) return variants;
    return variantsForPrimary(variants, primary.name, primaryValue);
  }, [variants, primary, primaryValue, secondary]);

  const selectValue = (axis: string, value: string) => {
    setSelected((prev) => {
      const attempted = { ...prev, [axis]: value };
      const exact = variants.find((v) =>
        Object.keys(attempted).every((name) =>
          v.options.some((o) => o.name === name && o.value === attempted[name]),
        ),
      );
      if (exact) {
        const sel: Record<string, string> = {};
        for (const opt of exact.options) sel[opt.name] = opt.value;
        return sel;
      }
      const candidate =
        variants.find((v) => v.options.some((o) => o.name === axis && o.value === value)) || null;
      if (!candidate) return attempted;
      const sel: Record<string, string> = {};
      for (const opt of candidate.options) sel[opt.name] = opt.value;
      return sel;
    });
  };

  useEffect(() => {
    if (!onVariantImage) return;
    if (useSimpleChips) {
      if (matched?.imageUrl) {
        onVariantImage(matched.imageUrl);
        return;
      }
      for (const [axisName, axisValue] of Object.entries(selected)) {
        const img = optionImage(variants, axisName, axisValue);
        if (img) {
          onVariantImage(img);
          return;
        }
      }
      onVariantImage(null);
      return;
    }
    if (!primaryValue || !primary) return;
    onVariantImage(optionImage(variants, primary.name, primaryValue));
  }, [useSimpleChips, matched, selected, variants, onVariantImage, primaryValue, primary]);

  if (!variants.length || !axes.length) return null;

  if (useSimpleChips) {
    return (
      <div className="mb-3 space-y-3">
        {axes.map((axis) => {
          const current = selected[axis.name];
          const colorMode = isColorAxis(axis.name) || axis.options.some((o) => Boolean(o.imageUrl));
          return (
            <div key={axis.name}>
              <div className="mb-1.5 flex items-baseline gap-1.5 text-[12px]">
                <span className="font-bold text-gray-800">{axis.name}:</span>
                <span className="font-semibold text-[#d92128]">{current || "Select"}</span>
              </div>
              {colorMode ? (
                <div className="flex flex-wrap gap-2.5">
                  {axis.options.map((opt) => {
                    const active = current === opt.value;
                    const img = optionImage(variants, axis.name, opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        title={opt.value}
                        onClick={() => selectValue(axis.name, opt.value)}
                        className={cn(
                          "relative h-12 w-12 cursor-pointer overflow-hidden rounded-xl border-2 bg-[#f7f7f8] transition-all",
                          active
                            ? "border-[#d92128] shadow-[0_0_0_2px_rgba(217,33,40,0.15)]"
                            : "border-transparent hover:border-gray-300",
                        )}
                      >
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={img}
                            alt={opt.value}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full items-center justify-center px-1 text-center text-[9px] font-semibold leading-tight text-gray-600">
                            {opt.value}
                          </span>
                        )}
                        {active ? (
                          <span className="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#d92128] text-white">
                            <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" aria-hidden>
                              <path
                                fill="currentColor"
                                d="M6.2 11.4 2.8 8l1.1-1.1 2.3 2.3 5-5L12.3 5.3z"
                              />
                            </svg>
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {axis.options.map((opt) => {
                    const active = current === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => selectValue(axis.name, opt.value)}
                        className={cn(
                          "max-w-full cursor-pointer rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-snug transition-colors",
                          active
                            ? "border-[#d92128] bg-[#d92128] text-white"
                            : "border-gray-200 bg-white text-gray-700 hover:border-[#d92128] hover:text-[#d92128]",
                        )}
                      >
                        {opt.value}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {primary ? (
        <div>
          <div className="mb-1.5 flex items-baseline gap-1.5 text-[12px]">
            <span className="font-bold text-gray-800">{primary.name}:</span>
            <span className="font-semibold text-[#d92128]">{primaryValue || "Select"}</span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {primary.options.map((opt) => {
              const active = primaryValue === opt.value;
              const img = optionImage(variants, primary.name, opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.value}
                  onClick={() => setPrimaryValue(opt.value)}
                  className={cn(
                    "relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-xl border-2 bg-[#f7f7f8] transition-all",
                    active
                      ? "border-[#d92128] shadow-[0_0_0_2px_rgba(217,33,40,0.15)]"
                      : "border-transparent hover:border-gray-300",
                  )}
                >
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={opt.value}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center px-1 text-center text-[9px] font-semibold leading-tight text-gray-600">
                      {opt.value}
                    </span>
                  )}
                  {active ? (
                    <span className="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#d92128] text-white">
                      <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" aria-hidden>
                        <path
                          fill="currentColor"
                          d="M6.2 11.4 2.8 8l1.1-1.1 2.3 2.3 5-5L12.3 5.3z"
                        />
                      </svg>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-1 text-[11px] font-bold text-gray-800">
          {secondary?.name || "Options"}
        </div>
        <div className="overflow-hidden rounded-lg border border-[#eee]">
          {rows.slice(0, 8).map((variant, idx) => {
            const stock = Math.max(0, variant.stock);
            const unitPrice = unitPriceForQty(1, priceTiers, variant.price);
            const label =
              secondary?.name
                ? variant.options.find((o) => o.name === secondary.name)?.value || variant.name
                : variant.name;
            const oos = stock <= 0;
            return (
              <div
                key={variant.id}
                className={cn(
                  "flex items-center gap-2 bg-white px-2 py-1.5",
                  idx > 0 && "border-t border-[#f0f0f0]",
                  oos && "opacity-55",
                )}
              >
                <span
                  className="min-w-0 flex-1 truncate text-[12px] font-bold text-gray-900"
                  title={label}
                >
                  {label}
                </span>
                <span className="shrink-0 text-right text-[11px] font-bold tabular-nums text-[#d92128]">
                  {formatCurrency(unitPrice)}
                  <span className="ml-1 font-normal text-gray-400">
                    {oos ? "OOS" : formatQuantity(stock)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PreviewInfo({
  product,
  preview,
  displayPrice,
  displayCompare,
  displayDiscount,
  onVariantImage,
}: {
  product: ProductDetail;
  preview: ReturnType<typeof mapProductToStorefrontPreview>;
  displayPrice: number;
  displayCompare: number;
  displayDiscount: number;
  onVariantImage?: (url: string | null) => void;
}) {
  const tiers = preview.priceTiers;
  const activeTierMinQty = tiers[0]?.minQty ?? null;

  return (
    <div className="min-w-0 px-1 py-1 md:px-2">
      <div className="mb-3 rounded-lg border border-[#f5c6c8] bg-[#fff5f5] px-2.5 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <p className="m-0 text-[11px] font-bold text-[#d92128]">5% Special Offer</p>
          <p className="m-0 text-[10px] text-gray-500">On product price</p>
        </div>
      </div>

      {tiers.length >= 2 ? (
        <div
          className={cn(
            "mb-3 grid gap-1.5 sm:gap-2",
            tiers.length === 2 ? "grid-cols-2" : "grid-cols-3",
          )}
        >
          {tiers.slice(0, 3).map((tier) => {
            const isActive = tier.minQty === activeTierMinQty;
            return (
              <div
                key={tier.minQty}
                className={cn(
                  "min-w-0 rounded-lg px-1.5 py-2 text-center sm:px-2",
                  isActive ? "bg-[#fdecea] ring-1 ring-[#d92128]" : "bg-white ring-1 ring-gray-200",
                )}
              >
                <p className="m-0 text-[10px] font-medium text-gray-500">
                  {formatQuantity(tier.minQty)}+
                </p>
                <p className="mb-0 mt-0.5 text-[14px] font-bold tabular-nums leading-tight text-[#d32f2f] sm:text-[15px]">
                  {formatCurrency(tier.price)}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mb-3 inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 sm:gap-2">
        <span className="text-[11px] text-gray-500 sm:text-[12px]">Selected</span>
        <span className="text-[16px] font-bold tabular-nums text-[#d32f2f] sm:text-[18px]">
          {formatCurrency(displayPrice)}
        </span>
        <del className="text-[11px] tabular-nums text-gray-400">{formatCurrency(displayCompare)}</del>
        {displayDiscount > 0 ? (
          <span className="text-[10px] font-bold text-[#00b87a]">{displayDiscount}% OFF</span>
        ) : null}
      </div>

      {preview.variants.length > 0 ? (
        <div className="mb-3 min-w-0">
          <PreviewAttributes
            variants={preview.variants}
            priceTiers={tiers}
            onVariantImage={onVariantImage}
          />
        </div>
      ) : null}

      <p className="m-0 text-[11px] text-gray-500">
        {product.category} · {product.brand}
      </p>
    </div>
  );
}

/** Build external seller-shop URL from platform + seller/shop id. */
function resolveSellerStoreUrl(opts: {
  sellerId?: string | null;
  shopId?: string | null;
  sourceUrl?: string | null;
  platform?: string | null;
  source?: string | null;
}): string | null {
  const id = String(opts.sellerId || opts.shopId || "").trim();
  if (!id) return null;
  if (/^https?:\/\//i.test(id)) return id;

  const sourceUrl = (opts.sourceUrl || "").toLowerCase();
  const platform = `${opts.platform || ""} ${opts.source || ""}`.toLowerCase();
  const is1688 =
    platform.includes("alibaba") ||
    platform.includes("1688") ||
    sourceUrl.includes("1688.com");
  const isTaobao =
    platform.includes("taobao") ||
    platform.includes("tmall") ||
    sourceUrl.includes("taobao.com") ||
    sourceUrl.includes("tmall.com");
  const isAmazon =
    platform.includes("amazon") ||
    sourceUrl.includes("amazon.") ||
    sourceUrl.includes("amzn.");

  if (is1688) {
    if (/^\d+$/.test(id)) return `https://shop${id}.1688.com/`;
    return `https://${encodeURIComponent(id)}.1688.com/`;
  }
  if (isTaobao) {
    if (/^\d+$/.test(id)) return `https://shop${id}.taobao.com/`;
    return `https://store.taobao.com/shop/view_shop.htm?user_number_id=${encodeURIComponent(id)}`;
  }
  if (isAmazon) {
    return `https://www.amazon.com/sp?seller=${encodeURIComponent(id)}`;
  }
  return null;
}

function PreviewSellerRow({
  product,
  preview,
  stockLabel,
  canOrder,
  meta,
}: {
  product: ProductDetail;
  preview: ReturnType<typeof mapProductToStorefrontPreview>;
  stockLabel: string;
  canOrder: boolean;
  meta: DropshipMeta | null;
}) {
  const seller = product.sellerInfo;
  const hasScores =
    seller?.item_score != null ||
    seller?.level != null ||
    seller?.service_score != null ||
    seller?.delivery_score != null;
  const hasSeller = Boolean(seller?.id || seller?.name || seller?.store_name || hasScores);

  const productHref =
    product.sourceUrl?.trim() ||
    (typeof meta?.supplier_link === "string" ? meta.supplier_link.trim() : "") ||
    null;
  const storeHref = resolveSellerStoreUrl({
    sellerId: seller?.id,
    shopId: meta?.shop_id != null ? String(meta.shop_id) : null,
    sourceUrl: productHref,
    platform: meta?.platform,
    source: meta?.source,
  });

  const scores = [
    { label: "Product", value: formatScore(seller?.item_score) },
    { label: "Level", value: formatScore(seller?.level) },
    { label: "Service", value: formatScore(seller?.service_score) },
    { label: "Delivery", value: formatScore(seller?.delivery_score) },
  ];

  return (
    <div className="border-b border-gray-100 px-3 py-2.5 md:px-4">
      <h2 className="m-0 line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900 md:text-[14px]">
        {product.name}
      </h2>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-[12px]">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <span className="font-semibold text-gray-800">
            {formatSoldCount(preview.soldCount)} Sold
          </span>
          <span className="inline-flex items-center gap-0.5 font-bold text-gray-800">
            <span className="text-[12px] leading-none text-[#ffc107]">★</span>
            {preview.rating.toFixed(1)}
          </span>
          <span className={cn("font-semibold", canOrder ? "text-[#00b87a]" : "text-[#d92128]")}>
            {canOrder ? stockLabel : "Out of Stock"}
          </span>
          {productHref ? (
            <a
              href={productHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#d92128] no-underline hover:underline"
            >
              Visit Product
            </a>
          ) : null}
        </div>
        {hasSeller ? (
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
              Seller store
            </span>
            {scores.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1 text-gray-600">
                <span>{s.label}</span>
                <strong className="font-bold text-gray-900">{s.value}</strong>
              </span>
            ))}
            {storeHref ? (
              <a
                href={storeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#d92128] no-underline hover:underline"
              >
                Visit Store
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function StorefrontProductPreview({ product, meta }: Props) {
  const preview = useMemo(() => mapProductToStorefrontPreview(product, meta), [product, meta]);
  const [activeMedia, setActiveMedia] = useState(0);
  const [highlightImageUrl, setHighlightImageUrl] = useState<string | null>(null);

  const media = useMemo(
    () => buildMedia(preview.images, preview.videos, highlightImageUrl),
    [preview.images, preview.videos, highlightImageUrl],
  );

  useEffect(() => {
    if (highlightImageUrl) {
      const idx = media.findIndex(
        (item) =>
          item.type === "image" &&
          (item.url === highlightImageUrl || item.thumb === highlightImageUrl),
      );
      if (idx >= 0) setActiveMedia(idx);
    }
  }, [highlightImageUrl, media]);

  const basePrice = product.price;
  const displayPrice = unitPriceForQty(1, preview.priceTiers, basePrice);
  const displayCompare = preview.compareAtPrice;
  const displayDiscount = Math.max(0, Math.round(100 - (displayPrice / displayCompare) * 100));

  const stockLabel =
    (
      {
        in_stock: "In Stock",
        out_of_stock: "Out of Stock",
        pre_order: "Pre-order",
        coming_soon: "Coming Soon",
      } as Record<string, string>
    )[product.stockStatus ?? ""] ?? product.stockStatus ?? "In Stock";

  const canOrder = product.stockStatus !== "out_of_stock" && product.stockStatus !== "coming_soon";

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
      <PreviewSellerRow
        product={product}
        preview={preview}
        stockLabel={stockLabel}
        canOrder={canOrder}
        meta={meta}
      />
      <div className="grid grid-cols-1 gap-2 p-3 md:grid-cols-2 md:gap-4 md:p-4">
        <PreviewGallery
          media={media}
          name={product.name}
          active={activeMedia}
          onActiveChange={setActiveMedia}
        />
        <PreviewInfo
          product={product}
          preview={preview}
          displayPrice={displayPrice}
          displayCompare={displayCompare}
          displayDiscount={displayDiscount}
          onVariantImage={setHighlightImageUrl}
        />
      </div>
    </div>
  );
}
