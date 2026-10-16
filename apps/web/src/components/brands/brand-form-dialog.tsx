"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AgaincartClassicEditor } from "@/components/products/againcart-classic-editor";
import { MediaField } from "@/components/media/media-field";
import { SlugInput } from "@/components/ui/slug-input";
import type { Brand } from "@/lib/mock-data/brands";
import { validateSlug } from "@/lib/url-slug/validate-slug";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  brand?: Brand | null;
  onSave: (data: Partial<Brand>) => void;
  onLiveChange?: (data: Partial<Brand> & { id: string }) => void;
};

function slugifyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "brand";
}

export function BrandFormDialog({
  open,
  onOpenChange,
  mode = "create",
  brand,
  onSave,
  onLiveChange,
}: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | undefined>();
  const [bannerUrl, setBannerUrl] = useState<string | undefined>();
  const [logoMediaId, setLogoMediaId] = useState<string | undefined>();
  const [bannerMediaId, setBannerMediaId] = useState<string | undefined>();
  /* true once the user manually edits the slug field */
  const slugManuallyEdited = useRef(false);

  useEffect(() => {
    if (open) {
      setName(brand?.name ?? "");
      setSlug(brand?.slug ?? "");
      setWebsiteUrl(brand?.websiteUrl ?? "");
      setDescription(brand?.description ?? "");
      setActive(brand?.active ?? true);
      setLogoUrl(brand?.logoUrl);
      setBannerUrl(brand?.bannerUrl);
      setLogoMediaId(brand?.logoMediaId);
      setBannerMediaId(brand?.bannerMediaId);
      slugManuallyEdited.current = !!brand?.slug;
    }
  }, [open, brand]);

  const pushLiveChange = useCallback(
    (next: { active?: boolean }) => {
      if (mode === "edit" && brand?.id && onLiveChange) {
        onLiveChange({
          id: brand.id,
          active: next.active ?? active,
        });
      }
    },
    [brand, active, mode, onLiveChange],
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

  const handleActiveChange = (value: boolean) => {
    setActive(value);
    pushLiveChange({ active: value });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const finalSlug = slug.trim() || slugifyName(name);
    const slugValidation = validateSlug(finalSlug, brand?.id ? { id: brand.id } : undefined);
    if (finalSlug && !slugValidation.isValid) {
      toast.error(slugValidation.message ?? "Invalid slug");
      return;
    }
    const fd = new FormData(e.currentTarget);
    onSave({
      name: name.trim() || String(fd.get("name") ?? ""),
      slug: finalSlug,
      websiteUrl: websiteUrl.trim() || undefined,
      active,
      description,
      metaTitle: String(fd.get("metaTitle") ?? ""),
      metaDescription: String(fd.get("metaDescription") ?? ""),
      metaKeywords: String(fd.get("metaKeywords") ?? ""),
      logoUrl,
      bannerUrl,
      logoMediaId,
      bannerMediaId,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={mode === "create" ? "Add Brand" : "Edit Brand"}
        resizable
        resizeMaxWidth={900}
        closeButton="none"
        className="w-full max-w-[100vw] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0 sm:w-[min(100%,36rem)] sm:min-w-[320px] sm:max-w-[900px]"
        aria-describedby={undefined}
      >
        <div className="flex h-full min-h-0 flex-col">
          <form id="brand-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-input px-5 py-3">
              <p className="text-base font-semibold">
                {mode === "create" ? "Add Brand" : "Edit Brand"}
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
                  <Field label="Name" required>
                    <Input
                      name="name"
                      required
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="UrbanWear"
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
                  <Field label="Slug" hint="SEO URL" required className="sm:col-span-2">
                    <SlugInput
                      value={slug}
                      onChange={handleSlugChange}
                      excludeId={brand?.id}
                      urlPrefix={<span className="shrink-0 text-muted-foreground">/</span>}
                      required
                      placeholder="urbanwear"
                    />
                  </Field>
                  <Field label="Website" className="sm:col-span-2">
                    <Input
                      name="websiteUrl"
                      type="url"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="https://urbanwear.example"
                    />
                  </Field>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Media
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Logo">
                    <MediaField
                      value={logoUrl}
                      mediaId={logoMediaId}
                      onChange={(item) => {
                        setLogoMediaId(item?.id);
                        setLogoUrl(item?.url);
                      }}
                      aspect="square"
                      emptyLabel="Add logo"
                      modalTitle="Select brand logo"
                    />
                  </Field>
                  <Field label="Banner">
                    <MediaField
                      value={bannerUrl}
                      mediaId={bannerMediaId}
                      onChange={(item) => {
                        setBannerMediaId(item?.id);
                        setBannerUrl(item?.url);
                      }}
                      aspect="banner"
                      emptyLabel="Add banner"
                      modalTitle="Select brand banner"
                    />
                  </Field>
                </div>
              </section>

              <section>
                <AgaincartClassicEditor
                  fieldLabel="Description"
                  value={description}
                  onChange={setDescription}
                  placeholder="Brand page description…"
                  minRows={5}
                  aiContext="brand.description"
                  aiVariables={{ brand_name: name }}
                />
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  SEO
                </h3>
                <div className="space-y-3">
                  <Field label="Meta title">
                    <Input name="metaTitle" defaultValue={brand?.metaTitle} placeholder="UrbanWear — Shop Online" />
                  </Field>
                  <Field label="Meta description">
                    <Textarea
                      name="metaDescription"
                      rows={2}
                      defaultValue={brand?.metaDescription}
                      placeholder="Shop UrbanWear products…"
                    />
                  </Field>
                  <Field label="Meta keywords">
                    <Input
                      name="metaKeywords"
                      defaultValue={brand?.metaKeywords}
                      placeholder="urbanwear, fashion, clothing"
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
