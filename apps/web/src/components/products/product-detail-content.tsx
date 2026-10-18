"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ExternalLink, X } from "lucide-react";
import {
  demoVariants,
  getAllVariantMedia,
  getVariantFirstMediaIndex,
  type Product,
  type ProductMedia,
} from "@/lib/mock-data/products";
import type { ApiProductMediaLink, ProductDetail } from "@/lib/api/catalog-products";
import { useCatalogAttributeProfiles } from "@/lib/api/use-catalog-attribute-profiles";
import { cn, formatCurrency, formatQuantity } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductMediaGallery } from "@/components/products/product-media-gallery";
import { ProductSupplierSourcing } from "@/components/products/product-supplier-sourcing";
import { DropshipProductViewPanel } from "@/components/products/dropship-product-view-panel";
import { StorefrontProductPreview } from "@/components/products/storefront-product-preview";
import {
  dropshipSourceLinkLabel,
  isDropshipProduct,
  parseDropshipMeta,
} from "@/lib/dropship/parse-dropship-meta";

const DESCRIPTION_HTML_CLASS =
  "product-description-body mt-2 max-w-full min-w-0 overflow-x-hidden text-sm leading-relaxed text-muted-foreground " +
  "[&_*]:max-w-full " +
  "[&_img]:!mx-auto [&_img]:!my-3 [&_img]:!block [&_img]:!h-auto [&_img]:!w-auto [&_img]:!max-w-full [&_img]:rounded-lg " +
  "[&_table]:!my-3 [&_table]:!w-full [&_table]:!max-w-full [&_table]:border-collapse " +
  "[&_td]:break-words [&_th]:break-words " +
  "[&_video]:!h-auto [&_video]:!max-w-full " +
  "[&_iframe]:!max-w-full " +
  "[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-0.5 " +
  "[&_p]:mb-2 [&_strong]:font-semibold [&_em]:italic " +
  "[&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-bold " +
  "[&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold " +
  "[&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold " +
  "[&_a]:text-primary [&_a]:underline";

type SpecRow = { label: string; value: string };
type SpecGroup = { label: string; items: SpecRow[] };

/** Labels that belong on variant pickers, not the product specifications table. */
function collectVariantAxisNames(product: Product): Set<string> {
  const names = new Set<string>();
  const detail = product as unknown as ProductDetail;
  for (const v of detail.variants ?? []) {
    if (!v.options_json) continue;
    try {
      const parsed = JSON.parse(v.options_json) as unknown;
      if (!Array.isArray(parsed)) continue;
      for (const opt of parsed) {
        if (!opt || typeof opt !== "object") continue;
        const o = opt as Record<string, unknown>;
        const name = String(o.name || o.nameEn || "").trim().toLowerCase();
        if (name) names.add(name);
      }
    } catch {
      /* ignore */
    }
  }
  return names;
}

function isVariantSpecLabel(label: string, variantAxes: Set<string>): boolean {
  const n = label.toLowerCase().trim();
  if (!n) return false;
  if (variantAxes.has(n)) return true;
  // Taobao / 1688 / Amazon SKU axes commonly dumped into attributes
  if (
    /color\s*classification|colour\s*classification|颜色分类|规格型号|网络类型/.test(n)
  ) {
    return true;
  }
  // Generic colour / network axes only — keep physical "Size" (e.g. 58×36×23cm) unless it is a SKU axis
  if (/^(color|colour|颜色|capacity|storage|ram|memory|style\s*name)$/.test(n)) {
    return true;
  }
  return false;
}

function collectProductSpecGroups(
  product: Product,
  attrGroups: { id: string; name: string }[],
  attrSpecs: { id: string; groupId: string }[],
): SpecGroup[] {
  const detail = product as unknown as ProductDetail;
  const specs = detail.specs;
  const variantAxes = collectVariantAxisNames(product);
  let customGroups: { id: string; name: string }[] = [];
  let customAttrs: { id: string; groupId: string; name: string; value?: string }[] = [];
  try {
    if (detail.customSpecsJson) {
      const p = JSON.parse(detail.customSpecsJson) as {
        customGroups?: typeof customGroups;
        customAttrs?: typeof customAttrs;
      };
      customGroups = p.customGroups ?? [];
      customAttrs = p.customAttrs ?? [];
    }
  } catch {
    /* ignore */
  }

  const groups: SpecGroup[] = [];

  if (specs?.values?.length) {
    const byGroup = new Map<string, SpecRow[]>();
    const ungrouped: SpecRow[] = [];
    for (const v of specs.values) {
      if (isVariantSpecLabel(v.attributeName, variantAxes)) continue;
      const attr = attrSpecs.find((a) => a.id === v.attributeId);
      const grp = attr ? attrGroups.find((g) => g.id === attr.groupId) : null;
      const row = { label: v.attributeName, value: v.value };
      if (grp) {
        const list = byGroup.get(grp.id) ?? [];
        list.push(row);
        byGroup.set(grp.id, list);
      } else {
        ungrouped.push(row);
      }
    }
    for (const [id, items] of byGroup) {
      const name = attrGroups.find((g) => g.id === id)?.name ?? "Specs";
      if (items.length) groups.push({ label: name, items });
    }
    if (ungrouped.length) groups.push({ label: "Other", items: ungrouped });
  }

  for (const cg of customGroups) {
    const items = customAttrs
      .filter((a) => a.groupId === cg.id)
      .map((a) => ({
        label: a.name,
        value:
          a.value ??
          specs?.values?.find((v) => v.attributeId === a.id)?.value ??
          "—",
      }))
      .filter((r) => r.label.trim() && !isVariantSpecLabel(r.label, variantAxes));
    if (items.length) groups.push({ label: cg.name || "Specifications", items });
  }

  const orphanAttrs = customAttrs.filter(
    (a) =>
      !customGroups.some((cg) => cg.id === a.groupId) &&
      !isVariantSpecLabel(a.name, variantAxes),
  );
  if (orphanAttrs.length) {
    groups.push({
      label: "Additional",
      items: orphanAttrs.map((a) => ({
        label: a.name,
        value:
          a.value ??
          specs?.values?.find((v) => v.attributeId === a.id)?.value ??
          "—",
      })),
    });
  }

  return groups.filter((g) => g.items.length > 0);
}

/** Frontstore-style product specs table (no variants). */
function ProductSpecificationsSection({ groups }: { groups: SpecGroup[] }) {
  if (!groups.length) {
    return (
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-5">
        <h3 className="mb-1 text-[17px] font-bold text-gray-900">
          Product <strong>Specifications</strong>
        </h3>
        <p className="text-sm text-muted-foreground">No specifications yet.</p>
      </section>
    );
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 md:p-6">
      <h3 className="mb-1 text-[17px] font-bold text-gray-900">
        Product <strong>Specifications</strong>
      </h3>
      {groups.map((group) => (
        <div key={group.label} className="mt-4">
          <span className="block pb-2 pt-1 text-[13px] font-bold text-[#d92128]">
            {group.label}
          </span>
          <div className="overflow-hidden rounded-2xl border border-gray-100">
            <table className="w-full border-collapse">
              <tbody>
                {group.items.map((row, i) => (
                  <tr
                    key={`${row.label}-${i}`}
                    className="border-b border-gray-100 odd:bg-[#fafbfc] last:border-none"
                  >
                    <td className="w-[38%] px-4 py-2.5 align-top text-[13px] font-semibold text-gray-800">
                      {row.label || "—"}
                    </td>
                    <td className="break-words px-4 py-2.5 text-[13px] text-gray-600">
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

type Props = {
  product: Product;
  compact?: boolean;
  inDialog?: boolean;
  /** API-backed catalog product — use product fields, not demo variants */
  simpleCatalog?: boolean;
  /** Hide page header when embedded in Item Workspace shell */
  embedded?: boolean;
  onBack?: () => void;
  onEdit?: (product: Product) => void;
  onOpenFullPage?: (product: Product) => void;
  onClose?: () => void;
};

type SimpleVariant = {
  id: string;
  price: number;
  stock: number;
  sku: string;
  color: string;
  storage?: string;
  ram?: string;
};

export function ProductDetailContent({
  product,
  compact,
  inDialog,
  simpleCatalog = false,
  embedded = false,
  onBack,
  onEdit,
  onOpenFullPage,
  onClose,
}: Props) {
  const { groups: attrGroups, attributes: attrSpecs } = useCatalogAttributeProfiles();

  const catalogVariants = useMemo(() => {
    if (!simpleCatalog) return [];
    const detail = product as unknown as ProductDetail;
    return detail.variants ?? [];
  }, [product, simpleCatalog]);

  const dropshipMeta = useMemo(() => {
    if (!simpleCatalog) return null;
    const detail = product as unknown as ProductDetail;
    return parseDropshipMeta(detail.dropshipMetaJson);
  }, [product, simpleCatalog]);

  const isDropshipView = isDropshipProduct(dropshipMeta);

  const productSpecGroups = useMemo(
    () => (simpleCatalog ? collectProductSpecGroups(product, attrGroups, attrSpecs) : []),
    [simpleCatalog, product, attrGroups, attrSpecs],
  );

  const simpleVariant: SimpleVariant = useMemo(
    () => ({
      id: "default",
      price: product.price,
      stock: product.stock,
      sku: product.sku,
      color: "Default",
    }),
    [product],
  );

  const [variantId, setVariantId] = useState(
    simpleCatalog
      ? ((product as unknown as ProductDetail).variants?.[0]?.id ?? "default")
      : demoVariants[0].id,
  );
  const [galleryIndex, setGalleryIndex] = useState(0);

  const allMedia = useMemo(() => {
    if (simpleCatalog) {
      const links: ApiProductMediaLink[] = (product as Product & { mediaLinks?: ApiProductMediaLink[] }).mediaLinks ?? [];
      if (links.length > 0) {
        return links
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((m): ProductMedia & { variantId: string } => ({
            id: m.media_id,
            type: m.media_type === "video" ? "video" : "image",
            url: m.url,
            isPrimary: m.is_primary,
            variantId: "default",
          }));
      }
      if (!product.thumbnail) return [];
      return [{ id: product.id, type: "image" as const, url: product.thumbnail, variantId: "default" }];
    }
    return getAllVariantMedia(product.id);
  }, [product, simpleCatalog]);
  const variantFirstIndex = useMemo(
    () => (simpleCatalog ? { default: 0 } : getVariantFirstMediaIndex(allMedia)),
    [allMedia, simpleCatalog],
  );

  useEffect(() => {
    const first =
      simpleCatalog
        ? ((product as unknown as ProductDetail).variants?.[0]?.id ?? "default")
        : demoVariants[0].id;
    setVariantId(first);
    setGalleryIndex(0);
  }, [product.id, simpleCatalog, product]);

  const variant = useMemo(() => {
    if (simpleCatalog) {
      const match = catalogVariants.find((v) => v.id === variantId);
      if (match) {
        return {
          id: match.id,
          price: parseFloat(match.price) || product.price,
          stock: match.stock,
          sku: match.sku,
          color: match.name,
        } satisfies SimpleVariant;
      }
      return simpleVariant;
    }
    return demoVariants.find((v) => v.id === variantId) ?? demoVariants[0];
  }, [simpleCatalog, simpleVariant, variantId, catalogVariants, product.price]);

  const selectVariant = (nextVariantId: string) => {
    setVariantId(nextVariantId);
    const nextIndex = variantFirstIndex[nextVariantId];
    if (nextIndex !== undefined) setGalleryIndex(nextIndex);
    // Prefer variant image in gallery when present
    if (simpleCatalog) {
      const match = catalogVariants.find((v) => v.id === nextVariantId);
      if (match?.image_url) {
        const idx = allMedia.findIndex((m) => m.url === match.image_url);
        if (idx >= 0) setGalleryIndex(idx);
      }
    }
  };

  const summaryStrip = (
    <div className="flex flex-wrap gap-x-2 gap-y-1 rounded-md border border-input bg-muted/40 px-2.5 py-1.5 text-xs">
      <span>
        <span className="text-muted-foreground">Price </span>
        <span className="font-semibold">{formatCurrency(variant.price)}</span>
      </span>
      <span className="text-muted-foreground">·</span>
      <span>
        <span className="text-muted-foreground">Stock </span>
        <span className={variant.stock === 0 ? "font-semibold text-red-500" : "font-semibold"}>
          {formatQuantity(variant.stock)}
        </span>
      </span>
      <span className="text-muted-foreground">·</span>
      <span>
        <span className="text-muted-foreground">Category </span>
        <span className="font-medium">{product.category}</span>
      </span>
      <span className="text-muted-foreground">·</span>
      <span>
        <span className="text-muted-foreground">Brand </span>
        <span className="font-medium">{product.brand}</span>
      </span>
    </div>
  );

  const variantSelector =
    simpleCatalog && catalogVariants.length > 1 ? (
      <div className="flex flex-wrap gap-1.5">
        {catalogVariants.map((v) => (
          <Button
            key={v.id}
            size="sm"
            variant={v.id === variantId ? "default" : "outline"}
            className={inDialog || compact ? "h-8 px-2.5 text-xs" : undefined}
            onClick={() => selectVariant(v.id)}
          >
            {v.name}
          </Button>
        ))}
      </div>
    ) : simpleCatalog ? null : (
    <div className="flex flex-wrap gap-1.5">
      {demoVariants.map((v) => (
        <Button
          key={v.id}
          size="sm"
          variant={v.id === variantId ? "default" : "outline"}
          className={inDialog || compact ? "h-8 px-2.5 text-xs" : undefined}
          onClick={() => selectVariant(v.id)}
        >
          {v.color}
          {v.storage ? ` / ${v.storage}` : ""}
        </Button>
      ))}
    </div>
  );

  const variantQuickInfo = (
    <div className={cn("grid grid-cols-2 gap-3 rounded-lg border border-input p-3 sm:grid-cols-4", inDialog || compact ? "text-xs" : "text-sm")}>
      <div>
        <p className="text-muted-foreground">Price</p>
        <p className="font-semibold">{formatCurrency(variant.price)}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Stock</p>
        <p className={cn("font-semibold", variant.stock === 0 && "text-red-500")}>
          {formatQuantity(variant.stock)}
        </p>
      </div>
      <div>
        <p className="text-muted-foreground">SKU</p>
        <p className="font-mono text-[11px]">{variant.sku}</p>
      </div>
      <div>
        <p className="text-muted-foreground">{simpleCatalog ? "Slug" : "RAM"}</p>
        <p className={simpleCatalog ? "truncate font-mono text-[11px]" : undefined}>
          {simpleCatalog ? product.slug : (variant.ram ?? "—")}
        </p>
      </div>
    </div>
  );

  const dialogPricePanel = (
    <div className="flex min-h-0 flex-col gap-3 rounded-lg border border-input bg-card p-4">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Price</p>
        <p className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">
          {formatCurrency(variant.price)}
        </p>
        {product.compareAtPrice != null && product.compareAtPrice > variant.price && (
          <p className="text-sm text-muted-foreground line-through">
            {formatCurrency(product.compareAtPrice)}
          </p>
        )}
        {product.offerPrice != null && (
          <p className="text-xs font-medium text-emerald-600">
            Offer {formatCurrency(product.offerPrice)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(!simpleCatalog || (product as Product & { hasInventory?: boolean }).hasInventory) && (
          <div className="rounded-md border border-input bg-muted/30 px-2.5 py-2">
            <p className="text-[10px] text-muted-foreground">Warehouse stock</p>
            <p className={cn("text-sm font-semibold", variant.stock === 0 && "text-red-500")}>
              {formatQuantity(variant.stock)}
            </p>
          </div>
        )}
        <div className="rounded-md border border-input bg-muted/30 px-2.5 py-2">
          <p className="text-[10px] text-muted-foreground">Status</p>
          <Badge variant="secondary" className="mt-0.5 text-[10px]">
            {({ in_stock: "In Stock", out_of_stock: "Out of Stock", pre_order: "Pre-order", coming_soon: "Coming Soon" } as Record<string, string>)[product.stockStatus ?? ""] ?? product.stockStatus}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-[10px] text-muted-foreground">Variant SKU</p>
          <p className="font-mono font-medium">{variant.sku}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">{simpleCatalog ? "Slug" : "RAM / Storage"}</p>
          <p className={cn("font-medium", simpleCatalog && "truncate font-mono text-[11px]")}>
            {simpleCatalog
              ? product.slug
              : `${variant.ram ?? "—"}${variant.storage ? ` · ${variant.storage}` : ""}`}
          </p>
        </div>
      </div>

      {(!simpleCatalog || catalogVariants.length > 1) && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Variants</p>
          {variantSelector}
        </div>
      )}

      {product.keyFeatures && product.keyFeatures.length > 0 && (
        <div className="border-t border-input pt-3">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">Key features</p>
          <ul className="space-y-1.5">
            {product.keyFeatures.slice(0, 5).map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-[11px] leading-snug">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto border-t border-input pt-3 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{product.category}</span>
        <span> · {product.brand}</span>
      </div>
    </div>
  );

  if (inDialog) {
    return (
      <div className="h-full min-h-0 space-y-4 overflow-y-auto pr-1">
        <div className="space-y-3 border-b border-input pb-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="capitalize">{product.status}</Badge>
                <p className="font-mono text-[11px] text-muted-foreground">{product.sku}</p>
                {product.model?.trim() ? (
                  <p className="text-[11px] text-muted-foreground">
                    Model: <span className="font-medium text-foreground">{product.model.trim()}</span>
                  </p>
                ) : null}
                {product.remarks?.trim() ? (
                  <p className="w-full text-[11px] text-muted-foreground">
                    Remarks: <span className="font-medium text-foreground">{product.remarks.trim()}</span>
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {onOpenFullPage && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => onOpenFullPage(product)}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open page
                  </Button>
                )}
                {onEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onEdit(product)}
                  >
                    Edit
                  </Button>
                )}
                {onClose && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Close product view"
                    onClick={onClose}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {!isDropshipView && (
              <>
                <h2 className="w-full text-base font-semibold leading-snug text-foreground sm:text-lg">
                  {product.name}
                </h2>
                {product.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {product.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px] font-normal capitalize">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                {simpleCatalog && (() => {
                  const detail = product as unknown as ProductDetail;
                  const sourceUrl =
                    detail.sourceUrl ||
                    (typeof dropshipMeta?.supplier_link === "string" ? dropshipMeta.supplier_link : null);
                  if (!sourceUrl) return null;
                  return (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {dropshipMeta ? dropshipSourceLinkLabel(dropshipMeta) : "Open source"}
                    </a>
                  );
                })()}
              </>
            )}
          </div>

          {!simpleCatalog && (
            <ProductSupplierSourcing
              productId={product.id}
              variantId={variantId}
              compact
              embedded
            />
          )}
        </div>

        {isDropshipView && dropshipMeta ? (
          <StorefrontProductPreview
            product={product as unknown as ProductDetail}
            meta={dropshipMeta}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
            <ProductMediaGallery
              media={allMedia}
              productName={product.name}
              compact
              square
              activeIndex={galleryIndex}
              onActiveIndexChange={setGalleryIndex}
            />
            {dialogPricePanel}
          </div>
        )}

        {isDropshipView && dropshipMeta ? (
          <DropshipProductViewPanel
            product={product as unknown as ProductDetail}
            meta={dropshipMeta}
          />
        ) : (
          simpleCatalog && (() => {
          const detail = product as unknown as ProductDetail;
          const seller = detail.sellerInfo;
          if (!seller || (!seller.id && !seller.store_name && !seller.name)) return null;
          return (
            <section className="rounded-lg border border-input p-4">
              <h3 className="text-sm font-semibold">Seller Info</h3>
              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
                {seller.id && (
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-muted-foreground">ID</dt>
                    <dd className="font-medium break-all">{seller.id}</dd>
                  </div>
                )}
                {(seller.name || seller.store_name) && (
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-muted-foreground">Store name</dt>
                    <dd className="font-medium">{seller.store_name || seller.name}</dd>
                  </div>
                )}
                {seller.level != null && (
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-muted-foreground">Level</dt>
                    <dd className="font-medium">{seller.level}</dd>
                  </div>
                )}
                {seller.delivery_score != null && (
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-muted-foreground">Delivery score</dt>
                    <dd className="font-medium">{seller.delivery_score}</dd>
                  </div>
                )}
                {seller.item_score != null && (
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-muted-foreground">Item score</dt>
                    <dd className="font-medium">{seller.item_score}</dd>
                  </div>
                )}
                {seller.service_score != null && (
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-muted-foreground">Service score</dt>
                    <dd className="font-medium">{seller.service_score}</dd>
                  </div>
                )}
              </dl>
            </section>
          );
        })()
        )}

        {simpleCatalog && <ProductSpecificationsSection groups={productSpecGroups} />}

        {product.shortDescription && (
          <section className="min-w-0 overflow-hidden rounded-lg border border-input p-4">
            <h3 className="text-sm font-semibold">Short Description</h3>
            <div
              className={DESCRIPTION_HTML_CLASS}
              dangerouslySetInnerHTML={{ __html: product.shortDescription }}
            />
          </section>
        )}

        <section className="min-w-0 overflow-hidden rounded-lg border border-input p-4">
          <h3 className="text-sm font-semibold">Description</h3>
          <div
            className={DESCRIPTION_HTML_CLASS}
            dangerouslySetInnerHTML={{
              __html: product.description ?? product.shortDescription ?? "No description provided.",
            }}
          />
        </section>
      </div>
    );
  }

  const fullBody = (
    <div className="space-y-4">
      {summaryStrip}

      <div className="grid gap-4 lg:grid-cols-2">
        <ProductMediaGallery
          media={allMedia}
          productName={product.name}
          compact={compact}
          activeIndex={galleryIndex}
          onActiveIndexChange={setGalleryIndex}
        />

        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            {(!simpleCatalog || catalogVariants.length > 1) && (
              <>
                <p className="text-xs text-muted-foreground">Variant</p>
                <div className="mt-1.5">{variantSelector}</div>
              </>
            )}
            <div className={simpleCatalog && catalogVariants.length <= 1 ? undefined : "mt-3"}>{variantQuickInfo}</div>
            {simpleCatalog && (() => {
              const detail = product as unknown as ProductDetail;
              const sourceUrl =
                detail.sourceUrl ||
                (typeof dropshipMeta?.supplier_link === "string" ? dropshipMeta.supplier_link : null);
              if (!sourceUrl) return null;
              return (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {dropshipMeta ? dropshipSourceLinkLabel(dropshipMeta) : "Open source"}
                </a>
              );
            })()}
          </div>
          {isDropshipView && dropshipMeta ? null : (
            simpleCatalog && (() => {
            const detail = product as unknown as ProductDetail;
            const seller = detail.sellerInfo;
            if (!seller || (!seller.id && !seller.store_name && !seller.name)) return null;
            return (
              <div className="rounded-lg border p-4 text-sm">
                <h3 className="font-medium">Seller Info</h3>
                <dl className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {seller.id && (
                    <div>
                      <dt className="text-xs text-muted-foreground">ID</dt>
                      <dd className="break-all font-medium">{seller.id}</dd>
                    </div>
                  )}
                  {(seller.store_name || seller.name) && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Store name</dt>
                      <dd className="font-medium">{seller.store_name || seller.name}</dd>
                    </div>
                  )}
                  {seller.level != null && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Level</dt>
                      <dd className="font-medium">{seller.level}</dd>
                    </div>
                  )}
                  {seller.delivery_score != null && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Delivery score</dt>
                      <dd className="font-medium">{seller.delivery_score}</dd>
                    </div>
                  )}
                  {seller.item_score != null && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Item score</dt>
                      <dd className="font-medium">{seller.item_score}</dd>
                    </div>
                  )}
                  {seller.service_score != null && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Service score</dt>
                      <dd className="font-medium">{seller.service_score}</dd>
                    </div>
                  )}
                </dl>
              </div>
            );
          })()
          )}
        </div>
      </div>

      {simpleCatalog && <ProductSpecificationsSection groups={productSpecGroups} />}

      <div className="min-w-0 overflow-hidden rounded-lg border p-4 text-sm">
        <h3 className="font-medium">Description</h3>
        <div
          className={DESCRIPTION_HTML_CLASS}
          dangerouslySetInnerHTML={{
            __html: product.description ?? product.shortDescription ?? "No description provided.",
          }}
        />
      </div>

      {isDropshipView && dropshipMeta ? (
        <DropshipProductViewPanel
          product={product as unknown as ProductDetail}
          meta={dropshipMeta}
        />
      ) : null}

      {!simpleCatalog && (
        <ProductSupplierSourcing productId={product.id} variantId={variantId} compact={compact} />
      )}
    </div>
  );

  if (embedded) {
    return fullBody;
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      <div className="flex flex-wrap items-start gap-2">
        {!compact && onBack && (
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          {!compact && <p className="page-subtitle">AgainERP › Ecommerce › Catalog › Products</p>}
          <h1 className={compact ? "text-sm font-semibold leading-snug" : "page-title"}>
            {product.name}
          </h1>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{product.sku}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {compact && onOpenFullPage && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => onOpenFullPage(product)}
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </Button>
          )}
          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              className={compact ? "h-7 px-2 text-xs" : undefined}
              onClick={() => onEdit(product)}
            >
              Edit
            </Button>
          )}
          <Badge className={cn("capitalize", compact && "text-[10px]")}>{product.status}</Badge>
        </div>
      </div>

      {fullBody}
    </div>
  );
}
