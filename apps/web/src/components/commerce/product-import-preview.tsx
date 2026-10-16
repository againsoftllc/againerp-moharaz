"use client";

import { ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type SpecGroup = {
  name?: string;
  group?: string;
  fields?: Array<{ name?: string; label?: string; value?: string }>;
  items?: Array<{ label?: string; name?: string; value?: string }>;
};

type CanonicalProduct = {
  name?: string;
  sku?: string;
  slug?: string;
  shortDescription?: string;
  description?: string;
  brand?: { name?: string };
  category?: { name?: string; path?: string[] };
  price?: { amount?: number; currency?: string };
  specialPrice?: { amount?: number; currency?: string };
  specifications?: SpecGroup[];
  attributes?: Array<{ name?: string; value?: string; group?: string }>;
  images?: Array<{ url?: string }>;
  gallery?: Array<{ url?: string }>;
  seo?: Record<string, string>;
  warranty?: { duration?: string; durationMonths?: number };
  metadata?: {
    sourceUrl?: string;
    extensions?: {
      compareAtPrice?: { amount?: number; currency?: string };
      regularPrice?: { amount?: number; currency?: string };
      stock?: { label?: string };
    };
  };
};

type Props = {
  canonical: CanonicalProduct;
  summary?: Record<string, unknown> | null;
};

function formatMoney(amount?: number, currency = "BDT") {
  if (amount == null) return "—";
  return formatCurrency(amount, currency);
}

function allImages(product: CanonicalProduct): string[] {
  const urls = [
    ...(product.images ?? []).map((i) => i.url),
    ...(product.gallery ?? []).map((i) => i.url),
  ].filter(Boolean) as string[];
  return [...new Set(urls)];
}

export function ProductImportPreview({ canonical, summary }: Props) {
  const images = allImages(canonical);
  const compareAt = canonical.metadata?.extensions?.compareAtPrice;
  const regular = canonical.metadata?.extensions?.regularPrice;
  const stock = canonical.metadata?.extensions?.stock;

  return (
    <div
      className="space-y-3 rounded-none border border-border bg-background p-3 text-xs"
      data-component="COMMERCE-IMPORT-PREVIEW"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm leading-snug">{canonical.name ?? "Untitled product"}</p>
          {canonical.sku ? (
            <p className="mt-0.5 text-muted-foreground">SKU / Code: {canonical.sku}</p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-none border border-border bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
          Preview only
        </span>
      </div>

      {images.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.slice(0, 6).map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              className="h-14 w-14 shrink-0 rounded-none border border-border object-cover"
            />
          ))}
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <div>
          <dt className="text-muted-foreground">Brand</dt>
          <dd className="font-medium">{canonical.brand?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Category</dt>
          <dd className="font-medium">
            {canonical.category?.path?.join(" › ") ?? canonical.category?.name ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Price</dt>
          <dd className="font-medium">{formatMoney(canonical.price?.amount, canonical.price?.currency)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Compare at</dt>
          <dd className="font-medium">{formatMoney(compareAt?.amount, compareAt?.currency)}</dd>
        </div>
        {regular?.amount != null ? (
          <div>
            <dt className="text-muted-foreground">Regular price</dt>
            <dd className="font-medium">{formatMoney(regular.amount, regular.currency)}</dd>
          </div>
        ) : null}
        {stock?.label ? (
          <div>
            <dt className="text-muted-foreground">Stock</dt>
            <dd className="font-medium">{stock.label}</dd>
          </div>
        ) : null}
      </dl>

      {canonical.shortDescription ? (
        <div>
          <p className="mb-1 font-medium text-muted-foreground">Short description</p>
          <p className="leading-relaxed">{canonical.shortDescription}</p>
        </div>
      ) : null}

      {(canonical.specifications ?? []).length > 0 ? (
        <div>
          <p className="mb-1.5 font-medium">Specifications</p>
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-none border border-border bg-muted/20 p-2">
            {(canonical.specifications ?? []).map((group, idx) => {
              const groupName = group.name ?? group.group ?? "General";
              const rows = group.fields ?? group.items ?? [];
              return (
              <div key={`${groupName}-${idx}`}>
                <p className="font-medium text-[11px]">{groupName}</p>
                <ul className="mt-0.5 space-y-0.5">
                  {rows.map((field, fidx) => (
                    <li key={`${field.name ?? field.label}-${fidx}`} className="flex gap-2 text-muted-foreground">
                      <span className="min-w-[7rem] shrink-0">{field.name ?? field.label}</span>
                      <span className="text-foreground">{field.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
            })}
          </div>
        </div>
      ) : null}

      {(canonical.attributes ?? []).length > 0 ? (
        <div>
          <p className="mb-1 font-medium">Attributes</p>
          <ul className="space-y-0.5 text-muted-foreground">
            {(canonical.attributes ?? []).slice(0, 12).map((attr, idx) => (
              <li key={`${attr.name}-${idx}`}>
                <span className="font-medium text-foreground">{attr.name}</span>: {attr.value}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canonical.metadata?.sourceUrl ? (
        <a
          href={canonical.metadata.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          Source page
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      ) : null}

      <details className="rounded-none border border-border bg-muted/10 p-2">
        <summary className="cursor-pointer font-medium">Full extracted JSON</summary>
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed">
          {JSON.stringify({ summary, canonicalProduct: canonical }, null, 2)}
        </pre>
      </details>
    </div>
  );
}
