"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CategoryCombobox } from "@/components/categories/category-combobox";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AgaincartClassicEditor } from "@/components/products/againcart-classic-editor";
import { MediaField } from "@/components/media/media-field";
import { SlugInput } from "@/components/ui/slug-input";
import type { Category } from "@/lib/mock-data/categories";
import { validateSlug } from "@/lib/url-slug/validate-slug";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  category?: Category | null;
  /** Full list — the parent picker builds its searchable tree from this. */
  categories: Category[];
  defaultParentId?: string | null;
  onSave: (data: Partial<Category>) => void;
  /** Immediate store update while editing (grid sync live) */
  onLiveChange?: (data: Partial<Category> & { id: string }) => void;
};

function slugifyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "category";
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  mode = "create",
  category,
  categories,
  defaultParentId,
  onSave,
  onLiveChange,
}: Props) {
  const [name, setName] = useState("");
  const [caption, setCaption] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [showInTopMenu, setShowInTopMenu] = useState(false);
  const [showPriceComparison, setShowPriceComparison] = useState(true);
  const [parentId, setParentId] = useState<string | null>(null);
  const [iconUrl, setIconUrl] = useState<string | undefined>();
  const [bannerUrl, setBannerUrl] = useState<string | undefined>();
  const [iconMediaId, setIconMediaId] = useState<string | undefined>();
  const [bannerMediaId, setBannerMediaId] = useState<string | undefined>();
  /* true once the user manually edits the slug field */
  const slugManuallyEdited = useRef(false);

  /** A category cannot sit under itself or under one of its own descendants. */
  const parentCandidates = useMemo(() => {
    const editingId = category?.id;
    if (!editingId) return categories;
    const blocked = new Set([editingId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of categories) {
        if (!blocked.has(c.id) && c.parentId && blocked.has(c.parentId)) {
          blocked.add(c.id);
          grew = true;
        }
      }
    }
    return categories.filter((c) => !blocked.has(c.id));
  }, [categories, category?.id]);

  useEffect(() => {
    if (open) {
      setName(category?.name ?? "");
      setCaption(category?.caption ?? "");
      setSlug(category?.slug ?? "");
      setDescription(category?.description ?? "");
      setActive(category?.active ?? true);
      setShowInTopMenu(category?.showInTopMenu ?? false);
      setShowPriceComparison(category?.showPriceComparison !== false);
      setParentId(category?.parentId ?? defaultParentId ?? null);
      setIconUrl(category?.iconUrl);
      setBannerUrl(category?.bannerUrl);
      setIconMediaId(category?.iconMediaId);
      setBannerMediaId(category?.bannerMediaId);
      slugManuallyEdited.current = !!category?.slug;
    }
  }, [open, category, defaultParentId]);

  const pushLiveChange = useCallback(
    (next: {
      caption?: string;
      active?: boolean;
      parentId?: string | null;
    }) => {
      if (mode === "edit" && category?.id && onLiveChange) {
        onLiveChange({
          id: category.id,
          caption: next.caption ?? caption,
          active: next.active ?? active,
          parentId: (next.parentId !== undefined ? next.parentId : parentId) ?? null,
        });
      }
    },
    [category, caption, active, parentId, mode, onLiveChange],
  );

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugManuallyEdited.current) {
      setSlug(slugifyName(value));
    }
  };

  const handleSlugChange = (value: string) => {
    slugManuallyEdited.current = true;
    setSlug(value);
  };

  const handleCaptionChange = (value: string) => {
    setCaption(value);
    pushLiveChange({ caption: value });
  };

  const handleActiveChange = (value: boolean) => {
    setActive(value);
    pushLiveChange({ active: value });
  };

  const handleParentChange = (value: string) => {
    const next = value || null;
    setParentId(next);
    pushLiveChange({ parentId: next });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const finalSlug = slug.trim() || slugifyName(name);
    const slugValidation = validateSlug(finalSlug, category?.id ? { id: category.id } : undefined);
    if (finalSlug && !slugValidation.isValid) {
      toast.error(slugValidation.message ?? "Invalid slug");
      return;
    }
    const fd = new FormData(e.currentTarget);
    onSave({
      name: name.trim() || String(fd.get("name") ?? ""),
      caption,
      slug: finalSlug,
      parentId,
      active,
      showInTopMenu,
      showPriceComparison,
      description,
      metaTitle: String(fd.get("metaTitle") ?? ""),
      metaDescription: String(fd.get("metaDescription") ?? ""),
      metaKeywords: String(fd.get("metaKeywords") ?? ""),
      iconUrl,
      bannerUrl,
      iconMediaId,
      bannerMediaId,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={mode === "create" ? "Add Category" : "Edit Category"}
        resizable
        resizeMaxWidth={900}
        closeButton="none"
        className="w-full max-w-[100vw] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0 sm:w-[min(100%,36rem)] sm:min-w-[320px] sm:max-w-[900px]"
        aria-describedby={undefined}
      >
        <div className="flex h-full min-h-0 flex-col">
          <form id="category-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-input px-5 py-3">
              <p className="text-base font-semibold">
                {mode === "create" ? "Add Category" : "Edit Category"}
              </p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Save
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  General
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name" hint="Full category name" required>
                    <Input
                      name="name"
                      required
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="HP Laptop"
                    />
                  </Field>
                  <Field label="Caption" hint="Menu label — e.g. HP">
                    <Input
                      name="caption"
                      value={caption}
                      onChange={(e) => handleCaptionChange(e.target.value)}
                      placeholder="HP"
                    />
                  </Field>
                  <Field label="Slug" hint="SEO URL" required className="sm:col-span-2">
                    <SlugInput
                      value={slug}
                      onChange={handleSlugChange}
                      excludeId={category?.id}
                      urlPrefix={<span className="shrink-0 text-muted-foreground">/</span>}
                      required
                      placeholder="laptops"
                    />
                  </Field>
                  <Field label="Parent" hint="Search to pick — empty means root">
                    <CategoryCombobox
                      categories={parentCandidates}
                      value={parentId ?? ""}
                      onChange={(id) => handleParentChange(id)}
                      placeholder="— Root (no parent) —"
                    />
                  </Field>
                  <Field label="Status">
                    <div className="flex h-8 items-center justify-between gap-2 rounded-none border border-input bg-background px-2.5">
                      <span className="text-xs text-muted-foreground">
                        {active ? "Enabled" : "Disabled"}
                      </span>
                      <SwitchPrimitive.Root
                        checked={active}
                        onCheckedChange={handleActiveChange}
                        aria-label={active ? "Enabled" : "Disabled"}
                        className={cn(
                          "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=unchecked]:bg-input data-[state=checked]:bg-emerald-600",
                        )}
                      >
                        <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
                      </SwitchPrimitive.Root>
                    </div>
                  </Field>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Media
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Icon" hint="Category image">
                    <MediaField
                      value={iconUrl}
                      mediaId={iconMediaId}
                      onChange={(item) => {
                        setIconMediaId(item?.id);
                        setIconUrl(item?.url);
                      }}
                      aspect="square"
                      emptyLabel="Add icon"
                      modalTitle="Select category icon"
                    />
                  </Field>
                  <Field label="Banner" hint="Shown on category page if set">
                    <MediaField
                      value={bannerUrl}
                      mediaId={bannerMediaId}
                      onChange={(item) => {
                        setBannerMediaId(item?.id);
                        setBannerUrl(item?.url);
                      }}
                      aspect="banner"
                      emptyLabel="Add banner"
                      modalTitle="Select category banner"
                    />
                  </Field>
                </div>
              </section>

              <section>
                <AgaincartClassicEditor
                  value={description}
                  onChange={setDescription}
                  fieldLabel="Description"
                  placeholder="Category page description…"
                  minRows={5}
                  aiContext="category.description"
                  aiVariables={{ category_name: name || caption }}
                />
                <div className="mt-3 flex h-8 items-center justify-between gap-2 rounded-none border border-input bg-background px-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      Show price comparison
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Live price list + category-wise comparison on storefront
                    </p>
                  </div>
                  <SwitchPrimitive.Root
                    checked={showPriceComparison}
                    onCheckedChange={setShowPriceComparison}
                    aria-label="Show price comparison"
                    className={cn(
                      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=unchecked]:bg-input data-[state=checked]:bg-emerald-600",
                    )}
                  >
                    <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
                  </SwitchPrimitive.Root>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  SEO
                </h3>
                <div className="space-y-3">
                  <Field label="Meta title">
                    <Input name="metaTitle" defaultValue={category?.metaTitle} placeholder="HP Laptops — Shop Online" />
                  </Field>
                  <Field label="Meta description">
                    <Textarea
                      name="metaDescription"
                      rows={2}
                      defaultValue={category?.metaDescription}
                      placeholder="Buy HP laptops at best price…"
                    />
                  </Field>
                  <Field label="Meta keywords">
                    <Input
                      name="metaKeywords"
                      defaultValue={category?.metaKeywords}
                      placeholder="hp, laptop, notebook"
                    />
                  </Field>
                </div>
              </section>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-[10px] font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
        {hint && <span className="ml-1 font-normal text-muted-foreground/80">({hint})</span>}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
