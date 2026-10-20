"use client";

import dynamic from "next/dynamic";
import { toast } from "sonner";
import type { Category } from "@/lib/mock-data/categories";
import type { Brand } from "@/lib/mock-data/brands";
import { updateCatalogCategory } from "@/lib/api/use-catalog-categories";
import { updateCatalogBrand, useCatalogBrands } from "@/lib/api/use-catalog-brands";
import { useCatalogAttributeProfiles } from "@/lib/api/use-catalog-attribute-profiles";

const CategoryFormDialog = dynamic(() => import("@/components/categories/category-form-dialog").then((m) => m.CategoryFormDialog), { ssr: false });
const BrandFormDialog = dynamic(() => import("@/components/brands/brand-form-dialog").then((m) => m.BrandFormDialog), { ssr: false });
const AttributeProfileFormDialog = dynamic(
  () => import("@/components/attributes/attribute-profile-form-dialog").then((m) => m.AttributeProfileFormDialog),
  { ssr: false },
);

/** A record behind a table cell: clicking a category chip, the brand or the specification profile opens that record's own edit drawer. */
export type LinkedTarget =
  | { kind: "category"; key: string } // the category's name
  | { kind: "brand"; key: string } // the brand's name
  | { kind: "profile"; key: string }; // the profile's id

function BrandEditor({ name, onClose, onSaved }: { name: string; onClose: () => void; onSaved: () => void }) {
  const { brands, loading } = useCatalogBrands({ channel: "catalog" });
  const brand: Brand | undefined = brands.find((b) => b.name === name);
  if (!brand) {
    if (!loading) {
      toast.error(`Brand "${name}" was not found`);
      queueMicrotask(onClose);
    }
    return null;
  }
  return (
    <BrandFormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      mode="edit"
      brand={brand}
      onSave={(data) => {
        void updateCatalogBrand(brand.id, {
          name: data.name,
          slug: data.slug,
          active: data.active,
          status: data.status,
          description: data.description,
          websiteUrl: data.websiteUrl,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          metaKeywords: data.metaKeywords,
          logoUrl: data.logoUrl,
          bannerUrl: data.bannerUrl,
          logoMediaId: data.logoMediaId,
          bannerMediaId: data.bannerMediaId,
        }).then(
          () => {
            toast.success("Brand updated");
            onSaved();
            onClose();
          },
          (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
        );
      }}
    />
  );
}

function ProfileEditor({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const { profiles, groups, attributes, loading, refetch } = useCatalogAttributeProfiles();
  const profile = profiles.find((p) => p.id === id) ?? null;
  if (!profile) {
    if (!loading) {
      toast.error("Specification profile not found");
      queueMicrotask(onClose);
    }
    return null;
  }
  return (
    <AttributeProfileFormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      mode="edit"
      profile={profile}
      groups={groups}
      attributes={attributes}
      onSaved={() => {
        void refetch();
        onSaved();
        onClose();
      }}
    />
  );
}

export function LinkedRecordEditors({
  target,
  categories,
  onClose,
  onChanged,
}: {
  target: LinkedTarget | null;
  categories: Category[];
  onClose: () => void;
  /** something was saved: the table reloads (names / profiles shown in the rows may have changed) */
  onChanged?: () => void;
}) {
  if (!target) return null;
  const changed = () => onChanged?.();
  if (target.kind === "brand") return <BrandEditor name={target.key} onClose={onClose} onSaved={changed} />;
  if (target.kind === "profile") return <ProfileEditor id={target.key} onClose={onClose} onSaved={changed} />;
  const category = categories.find((c) => c.name === target.key);
  if (!category) return null;
  return (
    <CategoryFormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      mode="edit"
      category={category}
      categories={categories}
      defaultParentId={null}
      onSave={(data) => {
        void updateCatalogCategory(category.id, {
          name: data.name,
          caption: data.caption,
          slug: data.slug,
          parentId: data.parentId,
          active: data.active,
          status: data.status,
          showInTopMenu: data.showInTopMenu,
          description: data.description,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          metaKeywords: data.metaKeywords,
          iconUrl: data.iconUrl,
          bannerUrl: data.bannerUrl,
          iconMediaId: data.iconMediaId,
          bannerMediaId: data.bannerMediaId,
        }).then(
          () => {
            toast.success("Category updated");
            changed();
            onClose();
          },
          (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
        );
      }}
    />
  );
}
