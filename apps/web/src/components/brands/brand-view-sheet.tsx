"use client";

import { Edit2, Globe, Tag, X } from "lucide-react";
import type { Brand } from "@/lib/mock-data/brands";
import { resolveMediaUrl } from "@/lib/media/resolve-media";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { formatQuantity } from "@/lib/utils";

function BrandDetailContent({
  brand,
  onEdit,
  onClose,
}: {
  brand: Brand;
  onEdit?: (b: Brand) => void;
  onClose: () => void;
}) {
  const logoUrl = resolveMediaUrl(brand.logoMediaId, brand.logoUrl);
  const bannerUrl = resolveMediaUrl(brand.bannerMediaId, brand.bannerUrl);

  const websiteDisplay = (() => {
    if (!brand.websiteUrl) return null;
    try {
      return new URL(brand.websiteUrl).hostname;
    } catch {
      return brand.websiteUrl;
    }
  })();

  return (
    <div className="flex h-full min-h-0 flex-col">

      {/* Header — same structure as category-view-sheet */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-input px-5 py-4">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant={brand.active ? "default" : "secondary"} className="text-[10px]">
              {brand.active ? "Active" : "Inactive"}
            </Badge>
            <span className="font-mono text-[10px] text-muted-foreground">/{brand.slug}</span>
          </div>
          <button
            type="button"
            className="text-left text-base font-semibold leading-snug hover:underline focus-visible:outline-none"
            onClick={() => { if (onEdit) { onClose(); onEdit(brand); } }}
          >
            {brand.name}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              onClick={() => { onClose(); onEdit(brand); }}
            >
              <Edit2 className="h-3 w-3" />
              Edit
            </Button>
          )}
          <button
            type="button"
            className="rounded-md p-1 hover:bg-accent"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">

        {/* Media */}
        {(logoUrl || bannerUrl) && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Media
            </h3>
            <div className="flex gap-3">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-lg border border-input object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-input bg-muted">
                  <Globe className="h-6 w-6 text-muted-foreground/40" />
                </div>
              )}
              {bannerUrl && (
                <img
                  src={bannerUrl}
                  alt="Banner"
                  className="h-16 min-w-0 flex-1 rounded-lg border border-input object-cover"
                />
              )}
            </div>
          </section>
        )}

        {/* General info */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            General
          </h3>
          <dl className="divide-y divide-border/60 rounded-lg border border-input text-sm">
            <Row label="Name" value={brand.name} bold />
            <Row label="Slug" value={`/${brand.slug}`} mono />
            <Row
              label="Website"
              value={websiteDisplay ?? "—"}
              valueClass={websiteDisplay ? "" : "text-muted-foreground"}
            />
            <Row label="Products" value={formatQuantity(brand.productCount)} />
            <Row
              label="Status"
              value={brand.active ? "Active" : "Inactive"}
              valueClass={brand.active ? "text-emerald-600 font-medium" : "text-muted-foreground"}
            />
            <Row label="Updated" value={brand.updatedAt} />
          </dl>
        </section>

        {/* Description */}
        {brand.description && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </h3>
            <p
              className="text-sm leading-relaxed text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: brand.description }}
            />
          </section>
        )}

        {/* SEO */}
        {(brand.metaTitle || brand.metaDescription || brand.metaKeywords) && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              SEO
            </h3>
            <dl className="divide-y divide-border/60 rounded-lg border border-input text-sm">
              {brand.metaTitle && <Row label="Meta title" value={brand.metaTitle} />}
              {brand.metaDescription && <Row label="Meta description" value={brand.metaDescription} wrap />}
              {brand.metaKeywords && (
                <div className="flex flex-wrap items-start gap-3 px-3 py-2.5">
                  <dt className="w-28 shrink-0 text-xs text-muted-foreground">Keywords</dt>
                  <dd className="flex min-w-0 flex-wrap gap-1">
                    {brand.metaKeywords.split(",").map((k) => (
                      <span
                        key={k}
                        className="inline-flex items-center gap-0.5 rounded border border-input bg-muted/40 px-1.5 py-0.5 text-[11px]"
                      >
                        <Tag className="h-2.5 w-2.5" />
                        {k.trim()}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  mono,
  wrap,
  valueClass,
}: {
  label: string;
  value: string;
  bold?: boolean;
  mono?: boolean;
  wrap?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <dt className="w-28 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd
        className={[
          "min-w-0 flex-1 text-xs",
          bold ? "font-semibold" : "",
          mono ? "font-mono" : "",
          wrap ? "" : "truncate",
          valueClass ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

// ── Sheet wrapper ──────────────────────────────────────────────────────────────
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand: Brand | null;
  onEdit?: (brand: Brand) => void;
};

export function BrandViewSheet({ open, onOpenChange, brand, onEdit }: Props) {
  if (!brand) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-xl gap-0 overflow-hidden p-0 sm:max-w-xl [&>button.absolute]:hidden"
        aria-describedby={undefined}
      >
        <p className="sr-only">Brand details · {brand.name}</p>
        <BrandDetailContent
          brand={brand}
          onEdit={onEdit}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
