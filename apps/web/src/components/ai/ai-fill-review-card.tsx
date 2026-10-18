"use client";

import * as React from "react";
import { Check, Loader2, X } from "lucide-react";
import { BrandCombobox } from "@/components/brands/brand-combobox";
import { CategoryCombobox } from "@/components/categories/category-combobox";
import { Button } from "@/components/ui/button";
import type { FillApproval, FillReview } from "@/lib/api/catalog-ai-import";
import { useCatalogAttributeProfiles } from "@/lib/api/use-catalog-attribute-profiles";
import { useCatalogBrands } from "@/lib/api/use-catalog-brands";
import { useCatalogCategories } from "@/lib/api/use-catalog-categories";
import { cn } from "@/lib/utils";

const money = (n: number | null) => (n == null ? "not found" : `৳${n.toLocaleString("en-US")}`);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/**
 * The AI's review of a draft product, shown in the product drawer BEFORE anything is saved: what it scraped from the
 * source page (title, image gallery, price and old price, ...) and what it selected for category, brand and
 * specification profile. The admin can change those three here, then approve - only then is the product filled.
 */
export function AiFillReviewCard({
  review,
  busy,
  onApprove,
  onDeny,
}: {
  review: FillReview;
  busy: boolean;
  onApprove: (a: FillApproval) => void;
  onDeny: () => void;
}) {
  const { categories } = useCatalogCategories({ channel: "catalog" });
  const { brands } = useCatalogBrands({ channel: "catalog" });
  const { profiles } = useCatalogAttributeProfiles();

  const [categoryIds, setCategoryIds] = React.useState<string[]>(review.categories.matched_ids);
  const [brandId, setBrandId] = React.useState<string>(review.brand.matched_id ?? "");
  const [profileId, setProfileId] = React.useState<string>(
    review.profile.matched_id ?? (review.profile.status === "new" ? "new" : "none"),
  );
  const [zoom, setZoom] = React.useState<string | null>(null);

  const { title, profile } = review;
  const newBrandName = !brandId && review.brand.name ? review.brand.name : null;
  const newCategoryName = categoryIds.length === 0 && review.categories.name ? review.categories.name : null;

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-border bg-card p-3 text-sm">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Review before updating</p>
        {title.current.trim() !== title.new.trim() ? (
          <p className="mt-1">
            <span className="text-muted-foreground line-through">{title.current}</span>
            <span className="mx-1.5 text-muted-foreground">→</span>
            <span className="font-semibold">{title.new}</span>
          </p>
        ) : (
          <p className="mt-1 font-semibold">{title.new}</p>
        )}
      </div>

      {review.images.length ? (
        <Row label={`Images scraped from the source (${review.images.length})`}>
          <div className="grid grid-cols-4 gap-1.5">
            {review.images.map((src, i) => (
              <button
                key={`${src}-${i}`}
                type="button"
                onClick={() => setZoom(src)}
                className={cn("relative aspect-square overflow-hidden rounded-md border bg-white", i === 0 ? "border-primary" : "border-border")}
                title={i === 0 ? "Main image" : `Image ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Source image ${i + 1}`} loading="lazy" className="h-full w-full object-contain" />
                {i === 0 ? <span className="absolute left-0.5 top-0.5 rounded bg-primary px-1 text-[9px] text-primary-foreground">main</span> : null}
              </button>
            ))}
          </div>
        </Row>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Row label="Price">
          <p className="font-semibold">
            {money(review.price)}
            {review.overrides?.price != null ? <span className="ml-1.5 text-[10px] font-normal text-emerald-600 dark:text-emerald-400">set by you</span> : null}
          </p>
        </Row>
        <Row label="Compare-at price (old price)">
          <p className={review.compare_at_price ? "font-semibold" : "text-muted-foreground"}>
            {review.compare_at_price ? <span className="line-through">{money(review.compare_at_price)}</span> : "none on the page"}
          </p>
        </Row>
        <Row label="Stock status">
          <p>{review.stock_status.replace(/_/g, " ")}</p>
        </Row>
        <Row label="Warranty · Origin">
          <p>
            {review.warranty || "—"} · {review.origin || "—"}
          </p>
        </Row>
      </div>

      <Row label="Category">
        <CategoryCombobox multiple categories={categories} values={categoryIds} onChange={setCategoryIds} className="w-full" />
        <p className="text-[11px] text-muted-foreground">
          {newCategoryName ? (
            <span className="text-amber-600 dark:text-amber-400">AI suggested “{newCategoryName}”, which does not exist - pick one above, or it will be created.</span>
          ) : review.categories.new_level && categoryIds.join() === review.categories.matched_ids.join() ? (
            <span className="text-amber-600 dark:text-amber-400">{review.categories.new_level.replace(/ on import\.$/, "")} when you approve.</span>
          ) : review.categories.matched_ids.length ? (
            "Selected by AI from your category list - change it if it is wrong."
          ) : (
            "Pick the category."
          )}
        </p>
      </Row>

      <Row label="Brand">
        <BrandCombobox brands={brands} value={brandId} onChange={(id) => setBrandId(id)} className="w-full" />
        <p className="text-[11px] text-muted-foreground">
          {newBrandName ? (
            <span className="text-amber-600 dark:text-amber-400">AI found “{newBrandName}”, which is not in your brands - pick one above, or it will be created.</span>
          ) : brandId ? (
            "Selected from your brand list."
          ) : (
            "No brand found on the page."
          )}
        </p>
      </Row>

      <Row label="Specification profile">
        <select
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="none">No profile - keep the specifications on this product only</option>
          {profile.attributes > 0 ? <option value="new">Create a new profile from the source ({profile.attributes} attributes)</option> : null}
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.id === profile.matched_id ? "  (AI choice)" : ""}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground">
          {profile.attributes
            ? `${profile.attributes} specification rows were found on the source page.`
            : "No specification table was found on the source page."}
          {profile.key_feature_filters.length ? (
            <span className="block text-amber-600 dark:text-amber-400">
              Source filters with no attribute in the profile will be added to its “Others” group: {profile.key_feature_filters.join(", ")}.
            </span>
          ) : null}
        </p>
      </Row>

      {review.short_description.length ? (
        <Row label="Short description">
          <ul className="list-disc space-y-0.5 pl-5">
            {review.short_description.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Row>
      ) : null}

      {review.description_excerpt ? (
        <Row label={`Description (${review.description_words} words)`}>
          <p className="text-xs text-muted-foreground">{review.description_excerpt}…</p>
        </Row>
      ) : null}

      {review.tags.length ? (
        <Row label="Tags">
          <p className="text-xs text-muted-foreground">{review.tags.join(", ")}</p>
        </Row>
      ) : null}

      {review.warnings.length ? (
        <ul className="space-y-0.5 text-xs text-amber-600 dark:text-amber-400">
          {review.warnings.map((w, i) => (
            <li key={i}>⚠️ {w}</li>
          ))}
        </ul>
      ) : null}

      <p className="text-[11px] text-muted-foreground">Nothing is saved yet. The product stays a draft; its slug and SKU do not change.</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-8 rounded-full px-3"
          disabled={busy}
          onClick={() => onApprove({ brandId: brandId || undefined, categoryIds, profileId })}
        >
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} Accept
        </Button>
        <Button size="sm" variant="outline" className="h-8 rounded-full px-3" disabled={busy} onClick={onDeny}>
          <X className="mr-1 h-3.5 w-3.5" /> Deny
        </Button>
      </div>

      {zoom ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="Source image" className="max-h-full max-w-full rounded-lg bg-white object-contain" />
        </div>
      ) : null}
    </div>
  );
}
