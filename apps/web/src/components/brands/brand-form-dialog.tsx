"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { SlugInput } from "@/components/ui/slug-input";
import { MediaField } from "@/components/media/media-field";
import { AgaincartClassicEditor } from "@/components/products/againcart-classic-editor";
import { ActivityTriggerButton } from "@/components/activity/activity-trigger-button";
import {
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AgainDrawerButton,
  AgainDrawerCloseButton,
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
} from "@/components/again/again-drawer";
import { AGAIN_FORM_RECORD_TITLE_CLASS } from "@/components/again/again-form-sheet";
import { brandStatusOf, type Brand, type BrandStatus } from "@/lib/mock-data/brands";
import { useDrawerDraft } from "@/lib/hooks/use-drawer-draft";
import { validateSlug } from "@/lib/url-slug/validate-slug";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  brand?: Brand | null;
  onSave: (data: Partial<Brand>) => void;
  /** Not used any more — the drawer saves with its Save button (kept so older callers still compile). */
  onLiveChange?: (data: Partial<Brand> & { id: string }) => void;
};

type Form = {
  name: string;
  slug: string;
  websiteUrl: string;
  status: BrandStatus;
  description: string;
  logoUrl?: string;
  bannerUrl?: string;
  logoMediaId?: string;
  bannerMediaId?: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
};

const EMPTY: Form = {
  name: "",
  slug: "",
  websiteUrl: "",
  status: "published",
  description: "",
  metaTitle: "",
  metaDescription: "",
  metaKeywords: "",
};

function toForm(brand?: Brand | null): Form {
  if (!brand) return EMPTY;
  return {
    name: brand.name ?? "",
    slug: brand.slug ?? "",
    websiteUrl: brand.websiteUrl ?? "",
    status: brandStatusOf(brand),
    description: brand.description ?? "",
    logoUrl: brand.logoUrl,
    bannerUrl: brand.bannerUrl,
    logoMediaId: brand.logoMediaId,
    bannerMediaId: brand.bannerMediaId,
    metaTitle: brand.metaTitle ?? "",
    metaDescription: brand.metaDescription ?? "",
    metaKeywords: brand.metaKeywords ?? "",
  };
}

function slugifyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "brand";
}

const STATUS_HINT: Record<BrandStatus, string> = {
  published: "Published — the brand shows on the website.",
  draft: "Draft — still being worked on. Not shown on the website.",
  unlisted: "Unlisted — kept in the catalog but hidden from the website.",
  archived: "Archived — switched off. Not shown on the website.",
};

/**
 * Add / edit a brand in the common drawer (docs/common/drawercommon.md): Save / Discard on top, drag the left edge to resize,
 * a half-typed form is kept as a draft when the drawer is closed by accident. Same fields and Status words as the product form.
 */
export function BrandFormDialog({ open, onOpenChange, mode = "create", brand, onSave }: Props) {
  const editing = mode === "edit" && !!brand?.id;
  const [form, setForm] = useState<Form>(() => toForm(brand));
  const [base, setBase] = useState<Form>(() => toForm(brand));
  /* true once the user edits the slug by hand — until then it follows the name */
  const slugManuallyEdited = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<number | null>(null);
  const patch = (changes: Partial<Form>) => setForm((current) => ({ ...current, ...changes }));

  // a fresh form every time it opens — declared before the draft hook so a saved draft is put back after this reset
  useEffect(() => {
    if (!open) return;
    const next = toForm(brand);
    setForm(next);
    setBase(next);
    slugManuallyEdited.current = !!brand?.slug;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when it opens or another brand is picked, not when the list reloads
  }, [open, brand?.id]);

  const dirty = JSON.stringify(form) !== JSON.stringify(base);
  const { saveDraftIfDirty, clear: clearDraft } = useDrawerDraft<{ form: Form; scrollTop: number }>({
    key: editing ? `brand:${brand!.id}` : "brand:new",
    ready: open,
    dirty,
    getValues: () => ({ form, scrollTop: scrollRef.current?.scrollTop ?? 0 }),
    restore: (values) => {
      setForm({ ...base, ...values.form });
      slugManuallyEdited.current = true;
      pendingScroll.current = values.scrollTop;
    },
    onDiscard: () => setForm(base),
    label: "brand",
  });

  // put the scroll position back after a draft is restored
  useEffect(() => {
    if (pendingScroll.current == null) return;
    const top = pendingScroll.current;
    pendingScroll.current = null;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top }));
  }, [form]);

  // every dismissal (outside click, Esc, the X) goes through here and keeps what was typed
  const handleOpenChange = (next: boolean) => {
    if (!next) saveDraftIfDirty();
    onOpenChange(next);
  };

  const handleNameChange = (value: string) => {
    patch({ name: value, ...(slugManuallyEdited.current ? {} : { slug: slugifyName(value) }) });
  };

  const handleSlugChange = (value: string) => {
    slugManuallyEdited.current = true;
    patch({ slug: value });
  };

  /** Discard: put the saved values back (a new brand goes back to empty) and forget the draft. */
  const discard = () => {
    clearDraft();
    setForm(base);
    slugManuallyEdited.current = !!brand?.slug;
  };

  const cancel = () => {
    clearDraft();
    onOpenChange(false);
  };

  const submit = () => {
    if (!form.name.trim()) {
      toast.error("Brand name is required");
      return;
    }
    const finalSlug = form.slug.trim() || slugifyName(form.name);
    const slugValidation = validateSlug(finalSlug, brand?.id ? { id: brand.id } : undefined);
    if (finalSlug && !slugValidation.isValid) {
      toast.error(slugValidation.message ?? "Invalid slug");
      return;
    }
    clearDraft();
    onSave({
      name: form.name.trim(),
      slug: finalSlug,
      websiteUrl: form.websiteUrl.trim() || undefined,
      status: form.status,
      active: form.status === "published",
      description: form.description,
      metaTitle: form.metaTitle,
      metaDescription: form.metaDescription,
      metaKeywords: form.metaKeywords,
      logoUrl: form.logoUrl,
      bannerUrl: form.bannerUrl,
      logoMediaId: form.logoMediaId,
      bannerMediaId: form.bannerMediaId,
    });
    onOpenChange(false);
  };

  const title = editing ? "Edit Brand" : "Add Brand";
  const statusVariant =
    form.status === "published" ? "success" : form.status === "draft" ? "warning" : form.status === "unlisted" ? "outline" : "muted";

  return (
    <AgainDrawerPanel
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      resizable
      defaultWidth={560}
      minWidth={380}
      widthStorageKey="again-brand-drawer-width"
      onPointerDownOutside={saveDraftIfDirty}
      onInteractOutside={saveDraftIfDirty}
      onEscapeKeyDown={saveDraftIfDirty}
    >
      <AgainDrawerLayout>
        <AgainDrawerControlBar
          trailing={
            <>
              {editing ? (
                <ActivityTriggerButton
                  entity={{ type: "brand", id: brand!.id, label: brand!.name, subtitle: `/${brand!.slug}` }}
                  className="h-6 w-6 rounded-none"
                />
              ) : null}
              <AgainDrawerCloseButton onClick={() => handleOpenChange(false)} />
            </>
          }
        >
          <AgainDrawerButton variant="primary" onClick={submit} disabled={!form.name.trim() || (editing && !dirty)}>
            {editing ? "Save" : "Create"}
          </AgainDrawerButton>
          {editing ? (
            <AgainDrawerButton onClick={discard} disabled={!dirty}>
              Discard
            </AgainDrawerButton>
          ) : (
            <AgainDrawerButton onClick={cancel}>Cancel</AgainDrawerButton>
          )}
        </AgainDrawerControlBar>

        <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS} scrollRef={scrollRef}>
          <div className="@container space-y-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={`${AGAIN_FORM_RECORD_TITLE_CLASS} min-w-0 truncate`}>{form.name.trim() || (editing ? brand!.name : "New brand")}</h2>
                <Badge variant={statusVariant} className="capitalize">
                  {form.status}
                </Badge>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {dirty
                  ? "Unsaved changes"
                  : editing
                    ? `${brand!.productCount} product${brand!.productCount === 1 ? "" : "s"} · /${brand!.slug}`
                    : "Fill in the name, then Create."}
              </p>
            </div>

            <Section title="General">
              <div className="grid gap-3 @md:grid-cols-2">
                <Field label="Name" required>
                  <Input
                    name="name"
                    value={form.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="UrbanWear"
                    className="h-8"
                  />
                </Field>
                <Field label="Status">
                  <Select
                    value={form.status}
                    onChange={(e) => patch({ status: e.target.value as BrandStatus })}
                    className="h-8 w-full"
                    aria-label="Status"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="archived">Archived</option>
                  </Select>
                </Field>
                <p className="-mt-1 text-[11px] text-muted-foreground @md:col-span-2">{STATUS_HINT[form.status]}</p>
                <Field label="Slug" hint="SEO URL" required className="@md:col-span-2">
                  <SlugInput
                    value={form.slug}
                    onChange={handleSlugChange}
                    excludeId={brand?.id}
                    urlPrefix={<span className="shrink-0 text-muted-foreground">/</span>}
                    required
                    placeholder="urbanwear"
                  />
                </Field>
                <Field label="Website" className="@md:col-span-2">
                  <Input
                    name="websiteUrl"
                    type="url"
                    value={form.websiteUrl}
                    onChange={(e) => patch({ websiteUrl: e.target.value })}
                    placeholder="https://urbanwear.example"
                    className="h-8"
                  />
                </Field>
              </div>
            </Section>

            <Section title="Media">
              <div className="grid gap-3 @md:grid-cols-2">
                <Field label="Logo">
                  <MediaField
                    value={form.logoUrl}
                    mediaId={form.logoMediaId}
                    onChange={(item) => patch({ logoMediaId: item?.id, logoUrl: item?.url })}
                    aspect="square"
                    emptyLabel="Add logo"
                    modalTitle="Select brand logo"
                  />
                </Field>
                <Field label="Banner">
                  <MediaField
                    value={form.bannerUrl}
                    mediaId={form.bannerMediaId}
                    onChange={(item) => patch({ bannerMediaId: item?.id, bannerUrl: item?.url })}
                    aspect="banner"
                    emptyLabel="Add banner"
                    modalTitle="Select brand banner"
                  />
                </Field>
              </div>
            </Section>

            <Section title="Description">
              <AgaincartClassicEditor
                fieldLabel="Brand page description"
                value={form.description}
                onChange={(value) => patch({ description: value })}
                placeholder="Brand page description…"
                minRows={5}
                aiContext="brand.description"
                aiVariables={{ brand_name: form.name }}
              />
            </Section>

            <Section title="SEO">
              <div className="space-y-3">
                <Field label="Meta title">
                  <Input
                    value={form.metaTitle}
                    onChange={(e) => patch({ metaTitle: e.target.value })}
                    placeholder="UrbanWear — Shop Online"
                    className="h-8"
                  />
                </Field>
                <Field label="Meta description">
                  <Textarea
                    rows={2}
                    value={form.metaDescription}
                    onChange={(e) => patch({ metaDescription: e.target.value })}
                    placeholder="Shop UrbanWear products…"
                  />
                </Field>
                <Field label="Meta keywords">
                  <Input
                    value={form.metaKeywords}
                    onChange={(e) => patch({ metaKeywords: e.target.value })}
                    placeholder="urbanwear, fashion, clothing"
                    className="h-8"
                  />
                </Field>
              </div>
            </Section>
          </div>
        </AgainDrawerScrollBody>
      </AgainDrawerLayout>
    </AgainDrawerPanel>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
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
