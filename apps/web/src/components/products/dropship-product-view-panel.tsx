"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { ApiProductVariant, ProductDetail, ProductSellerInfo } from "@/lib/api/catalog-products";
import {
  asRecord,
  dropshipMetaWithoutPayload,
  dropshipSourceLabel,
  dropshipSourceLinkLabel,
  flattenPayloadEntries,
  formatMetaNumber,
  type DropshipMeta,
  type DropshipPriceTier,
  type DropshipShippingSku,
} from "@/lib/dropship/parse-dropship-meta";
import { cn, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = {
  product: ProductDetail;
  meta: DropshipMeta;
  className?: string;
};

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-input bg-card", className)}>
      <div className="border-b border-input px-3 py-2">
        <h3 className="text-xs font-semibold tracking-wide text-foreground">{title}</h3>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function MetaGrid({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  const visible = rows.filter((r) => r.value != null && r.value !== "" && r.value !== "—");
  if (!visible.length) return <p className="text-xs text-muted-foreground">No data</p>;
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
      {visible.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{row.label}</dt>
          <dd className="mt-0.5 break-words text-xs font-medium text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function parseVariantOptions(optionsJson?: string | null): string {
  if (!optionsJson) return "";
  try {
    const parsed = JSON.parse(optionsJson) as unknown;
    if (!Array.isArray(parsed)) return "";
    return parsed
      .map((opt) => {
        if (!opt || typeof opt !== "object") return "";
        const o = opt as Record<string, unknown>;
        return String(o.valueEn || o.value || o.nameEn || o.name || "").trim();
      })
      .filter(Boolean)
      .join(" · ");
  } catch {
    return "";
  }
}

function shippingRows(meta: DropshipMeta): DropshipShippingSku[] {
  const raw = meta.shipping_by_sku;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as DropshipShippingSku[];
  if (typeof raw === "object") {
    return Object.entries(raw).map(([sku_id, value]) => {
      const row = asRecord(value) ?? {};
      return { sku_id, ...row } as DropshipShippingSku;
    });
  }
  return [];
}

function JsonBlock({ title, data }: { title: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  const text = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  return (
    <div className="rounded-md border border-input">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-muted/40"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open && (
        <pre className="max-h-72 overflow-auto border-t border-input bg-muted/20 p-3 text-[10px] leading-relaxed text-muted-foreground">
          {text}
        </pre>
      )}
    </div>
  );
}

function SellerSection({ seller }: { seller: ProductSellerInfo }) {
  const review = seller.review;
  const rows = [
    { label: "Seller ID", value: seller.id ?? "—" },
    { label: "Store", value: seller.store_name || seller.name || "—" },
    { label: "Type", value: seller.seller_type ?? "—" },
    { label: "Level", value: seller.level != null ? String(seller.level) : "—" },
    { label: "Delivery", value: seller.delivery_score != null ? String(seller.delivery_score) : "—" },
    { label: "Item", value: seller.item_score != null ? String(seller.item_score) : "—" },
    { label: "Service", value: seller.service_score != null ? String(seller.service_score) : "—" },
    { label: "Medal", value: review?.medal_level != null ? String(review.medal_level) : "—" },
    { label: "Retention", value: review?.retention_rate != null ? String(review.retention_rate) : "—" },
    { label: "Complaint", value: review?.complaint_score != null ? String(review.complaint_score) : "—" },
    { label: "Consulting", value: review?.consulting_score != null ? String(review.consulting_score) : "—" },
    { label: "Aftersale", value: review?.aftersale_score != null ? String(review.aftersale_score) : "—" },
    { label: "Total score", value: review?.total_score != null ? String(review.total_score) : "—" },
  ];
  return (
    <Section title="Seller">
      <MetaGrid rows={rows} />
    </Section>
  );
}

function VariantsTable({
  variants,
  selectedId,
  onSelect,
}: {
  variants: ApiProductVariant[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (!variants.length) return null;
  return (
    <Section title={`Variants (${variants.length})`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-input text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="px-1.5 py-1.5 font-medium">Variant</th>
              <th className="px-1.5 py-1.5 font-medium">Options</th>
              <th className="px-1.5 py-1.5 font-medium">Ext. SKU</th>
              <th className="px-1.5 py-1.5 font-medium">Price</th>
              <th className="px-1.5 py-1.5 font-medium">Stock</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => {
              const options = parseVariantOptions(v.options_json);
              const active = v.id === selectedId;
              return (
                <tr
                  key={v.id}
                  className={cn(
                    "border-b border-input/70 last:border-0",
                    active && "bg-muted/40",
                  )}
                >
                  <td className="px-1.5 py-1.5">
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={() => onSelect(v.id)}
                    >
                      {v.name}
                    </button>
                  </td>
                  <td className="max-w-[160px] truncate px-1.5 py-1.5 text-muted-foreground">
                    {options || "—"}
                  </td>
                  <td className="px-1.5 py-1.5 font-mono text-[10px] text-muted-foreground">
                    {v.external_sku_id || "—"}
                  </td>
                  <td className="px-1.5 py-1.5 font-medium">
                    {formatCurrency(parseFloat(v.price) || 0)}
                  </td>
                  <td className={cn("px-1.5 py-1.5", v.stock === 0 && "text-red-500")}>
                    {v.stock}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function DropshipProductViewPanel({ product, meta, className }: Props) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const sourceUrl = product.sourceUrl || (typeof meta.supplier_link === "string" ? meta.supplier_link : null);
  const tiers = Array.isArray(meta.price_tiers) ? (meta.price_tiers as DropshipPriceTier[]) : [];
  const shipping = shippingRows(meta);
  const payload = asRecord(meta.source_payload);
  const payloadFlat = flattenPayloadEntries(payload);
  const metaPreview = dropshipMetaWithoutPayload(meta);
  const seller = product.sellerInfo;
  const hasSeller =
    seller && (seller.id || seller.store_name || seller.name || seller.seller_type || seller.review);

  const identityRows = [
    { label: "Source", value: dropshipSourceLabel(meta) },
    { label: "Elim ID", value: meta.elim_id ? String(meta.elim_id) : "—" },
    { label: "Platform", value: meta.platform ? String(meta.platform) : "—" },
    { label: "ASIN", value: meta.asin ? String(meta.asin) : "—" },
    { label: "Marketplace", value: meta.marketplace_id ? String(meta.marketplace_id) : "—" },
    { label: "Title (ZH)", value: meta.title_zh ? String(meta.title_zh) : "—" },
    { label: "Source category", value: meta.category_name ? String(meta.category_name) : "—" },
    { label: "Mapped category", value: product.category || meta.mapped_category_slug || "—" },
    { label: "Sales volume", value: meta.sales_volume != null ? String(meta.sales_volume) : "—" },
    { label: "MOQ", value: meta.moq != null ? String(meta.moq) : "—" },
    { label: "Images", value: meta.image_count != null ? String(meta.image_count) : "—" },
    { label: "Videos", value: meta.video_count != null ? String(meta.video_count) : "—" },
    { label: "API variants", value: meta.variant_count != null ? String(meta.variant_count) : "—" },
    { label: "Cached from", value: meta.cached_from ? String(meta.cached_from) : "—" },
    {
      label: "Live Amazon",
      value:
        meta.live_amazon_data == null
          ? "—"
          : meta.live_amazon_data
            ? "Yes"
            : `Stub${meta.stub_reason ? `: ${meta.stub_reason}` : ""}`,
    },
  ];

  const pricingRows = [
    {
      label: "Cost (source)",
      value:
        meta.cost_cny != null
          ? `¥${formatMetaNumber(meta.cost_cny)}`
          : meta.cost_usd != null
            ? `$${formatMetaNumber(meta.cost_usd)}`
            : "—",
    },
    { label: "Cost (BDT)", value: meta.cost_bdt != null ? formatCurrency(Number(meta.cost_bdt)) : "—" },
    { label: "FX rate", value: meta.exchange_rate != null ? formatMetaNumber(meta.exchange_rate, 4) : "—" },
    {
      label: "Markup",
      value:
        meta.markup_percent != null || meta.markup_bdt != null
          ? `${meta.markup_percent != null ? `${formatMetaNumber(meta.markup_percent)}%` : ""}${
              meta.markup_bdt != null ? ` · ${formatCurrency(Number(meta.markup_bdt))}` : ""
            }`
          : "—",
    },
    { label: "Profit", value: meta.profit_bdt != null ? formatCurrency(Number(meta.profit_bdt)) : "—" },
    {
      label: "Server charge",
      value: meta.server_charge_bdt != null ? formatCurrency(Number(meta.server_charge_bdt)) : "—",
    },
    {
      label: "Sell price",
      value: meta.sell_price_bdt != null ? formatCurrency(Number(meta.sell_price_bdt)) : formatCurrency(product.price),
    },
    {
      label: "Currencies",
      value:
        meta.currency_source || meta.currency_sell
          ? `${meta.currency_source ?? "—"} → ${meta.currency_sell ?? "—"}`
          : "—",
    },
    { label: "Weight", value: meta.weight_kg != null ? `${formatMetaNumber(meta.weight_kg, 3)} kg` : "—" },
  ];

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="text-[10px]">
          {dropshipSourceLabel(meta)}
        </Badge>
        {meta.sandbox_stub && (
          <Badge variant="outline" className="border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-400">
            Sandbox stub
          </Badge>
        )}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            {dropshipSourceLinkLabel(meta)}
          </a>
        )}
      </div>

      <Section title="Source & identity">
        <MetaGrid rows={identityRows} />
      </Section>

      <Section title="Pricing economics">
        <MetaGrid rows={pricingRows} />
        {tiers.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Price tiers
            </p>
            <table className="w-full min-w-[360px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-input text-[10px] uppercase text-muted-foreground">
                  <th className="px-1.5 py-1 text-left font-medium">Min qty</th>
                  <th className="px-1.5 py-1 text-left font-medium">Cost CNY</th>
                  <th className="px-1.5 py-1 text-left font-medium">Price BDT</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier, i) => (
                  <tr key={i} className="border-b border-input/70 last:border-0">
                    <td className="px-1.5 py-1">{tier.min_qty ?? "—"}</td>
                    <td className="px-1.5 py-1">
                      {tier.cost_cny != null ? `¥${formatMetaNumber(tier.cost_cny)}` : "—"}
                    </td>
                    <td className="px-1.5 py-1">
                      {tier.price_bdt != null ? formatCurrency(Number(tier.price_bdt)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <VariantsTable
        variants={product.variants}
        selectedId={variantId}
        onSelect={setVariantId}
      />

      {shipping.length > 0 && (
        <Section title="Shipping / weight">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-input text-[10px] uppercase text-muted-foreground">
                  <th className="px-1.5 py-1 text-left font-medium">SKU</th>
                  <th className="px-1.5 py-1 text-left font-medium">Weight kg</th>
                  <th className="px-1.5 py-1 text-left font-medium">L × W × H</th>
                </tr>
              </thead>
              <tbody>
                {shipping.map((row, i) => (
                  <tr key={String(row.sku_id ?? i)} className="border-b border-input/70 last:border-0">
                    <td className="px-1.5 py-1 font-mono text-[10px]">{row.sku_id ?? "—"}</td>
                    <td className="px-1.5 py-1">
                      {row.weight_kg != null ? formatMetaNumber(row.weight_kg, 3) : "—"}
                    </td>
                    <td className="px-1.5 py-1 text-muted-foreground">
                      {[row.length_cm, row.width_cm, row.height_cm]
                        .map((n) => (n != null ? formatMetaNumber(n, 1) : "—"))
                        .join(" × ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {hasSeller && seller ? <SellerSection seller={seller} /> : null}

      {product.videoUrls && product.videoUrls.length > 0 && (
        <Section title="Videos">
          <ul className="space-y-1">
            {product.videoUrls.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-xs text-primary hover:underline"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {payloadFlat.length > 0 && (
        <Section title="API fields (summary)">
          <MetaGrid
            rows={payloadFlat.slice(0, 40).map((r) => ({
              label: r.key.replace(/_/g, " "),
              value: r.value,
            }))}
          />
          {payloadFlat.length > 40 && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              +{payloadFlat.length - 40} more fields in raw payload
            </p>
          )}
        </Section>
      )}

      <Section title="Raw API data">
        <div className="space-y-2">
          <JsonBlock title="Dropship meta" data={metaPreview} />
          {payload && <JsonBlock title="Full source_payload (API response)" data={payload} />}
          {seller && <JsonBlock title="Seller info JSON" data={seller} />}
          {product.customSpecsJson && (
            <JsonBlock
              title="Custom specs JSON"
              data={(() => {
                try {
                  return JSON.parse(product.customSpecsJson);
                } catch {
                  return product.customSpecsJson;
                }
              })()}
            />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  JSON.stringify({ dropship_meta: meta, seller, variants: product.variants }, null, 2),
                );
              } catch {
                /* ignore */
              }
            }}
          >
            Copy all JSON
          </Button>
        </div>
      </Section>
    </div>
  );
}
