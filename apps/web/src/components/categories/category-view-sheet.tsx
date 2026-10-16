"use client";

import { Edit2, FolderOpen, Tag, X } from "lucide-react";
import type { Category } from "@/lib/mock-data/categories";
import { getCategoryBreadcrumb } from "@/lib/category-utils";
import { resolveMediaUrl } from "@/lib/media/resolve-media";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { formatQuantity } from "@/lib/utils";

function CategoryDetailContent({
  category,
  allCategories,
  onEdit,
  onClose,
}: {
  category: Category;
  allCategories: Category[];
  onEdit?: (c: Category) => void;
  onClose: () => void;
}) {
  const categories = allCategories;
  const parentLabel = getCategoryBreadcrumb(category, categories);
  const children = categories.filter((c) => c.parentId === category.id);
  const iconUrl = resolveMediaUrl(category.iconMediaId, category.iconUrl);
  const bannerUrl = resolveMediaUrl(category.bannerMediaId, category.bannerUrl);

  return (
    <div className="flex h-full min-h-0 flex-col">

      {/* Header — same structure as form header */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-input px-5 py-4">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant={category.active ? "default" : "secondary"} className="text-[10px]">
              {category.active ? "Active" : "Inactive"}
            </Badge>
            {category.showInTopMenu && (
              <Badge variant="outline" className="text-[10px]">Menu</Badge>
            )}
            <span className="font-mono text-[10px] text-muted-foreground">/{category.slug}</span>
          </div>
          <button
            type="button"
            className="text-left text-base font-semibold leading-snug hover:underline focus-visible:outline-none"
            onClick={() => { if (onEdit) { onClose(); onEdit(category); } }}
          >
            {category.name}
          </button>
          {category.caption && (
            <p className="mt-0.5 text-xs text-muted-foreground">{category.caption}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              onClick={() => { onClose(); onEdit(category); }}
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
        {(iconUrl || bannerUrl) && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Media
            </h3>
            <div className="flex gap-3">
              {iconUrl ? (
                <img
                  src={iconUrl}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-lg border border-input object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-input bg-muted">
                  <FolderOpen className="h-6 w-6 text-muted-foreground/40" />
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
            <Row label="Name" value={category.name} bold />
            {category.caption && <Row label="Caption" value={category.caption} />}
            <Row label="Slug" value={`/${category.slug}`} mono />
            <Row label="Parent" value={parentLabel || "— Root —"} />
            <Row label="Products" value={formatQuantity(category.productCount)} />
            <Row
              label="Status"
              value={category.active ? "Active" : "Inactive"}
              valueClass={category.active ? "text-emerald-600 font-medium" : "text-muted-foreground"}
            />
            <Row
              label="Menu"
              value={category.showInTopMenu ? "Yes" : "No"}
              valueClass={category.showInTopMenu ? "font-medium" : "text-muted-foreground"}
            />
            <Row label="Updated" value={category.updatedAt} />
          </dl>
        </section>

        {/* Subcategories */}
        {children.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Subcategories ({children.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {children.map((c) => (
                <span
                  key={c.id}
                  className="inline-block rounded border border-input bg-muted/40 px-2 py-0.5 text-xs"
                >
                  {c.name}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Description */}
        {category.description && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </h3>
            <p
              className="text-sm leading-relaxed text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: category.description }}
            />
          </section>
        )}

        {/* SEO */}
        {(category.metaTitle || category.metaDescription || category.metaKeywords) && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              SEO
            </h3>
            <dl className="divide-y divide-border/60 rounded-lg border border-input text-sm">
              {category.metaTitle && <Row label="Meta title" value={category.metaTitle} />}
              {category.metaDescription && <Row label="Meta description" value={category.metaDescription} wrap />}
              {category.metaKeywords && (
                <div className="flex flex-wrap items-start gap-3 px-3 py-2.5">
                  <dt className="w-28 shrink-0 text-xs text-muted-foreground">Keywords</dt>
                  <dd className="flex min-w-0 flex-wrap gap-1">
                    {category.metaKeywords.split(",").map((k) => (
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
  category: Category | null;
  allCategories?: Category[];
  onEdit?: (category: Category) => void;
};

export function CategoryViewSheet({ open, onOpenChange, category, allCategories = [], onEdit }: Props) {
  if (!category) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-xl gap-0 overflow-hidden p-0 sm:max-w-xl [&>button.absolute]:hidden"
        aria-describedby={undefined}
      >
        <p className="sr-only">Category details · {category.name}</p>
        <CategoryDetailContent
          category={category}
          allCategories={allCategories}
          onEdit={onEdit}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
