"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  ImagePlus,
  Layers,
  Package,
  Search,
  SlidersHorizontal,
  Tag,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { importCatalogImagesFromUrls } from "@/lib/catalog/import-catalog-images";
import type { Product, ProductStatus, ProductVisibility } from "@/lib/mock-data/products";
import { getPresetDimensions, type VariantDimension, type VariantMatrixRow } from "@/lib/mock-data/variants";
import {
  createCatalogProduct,
  checkCatalogProductSlug,
  replaceProductMedia,
  replaceProductVariants,
  updateCatalogProduct,
  upsertProductInventory,
  type VariantUpsertInput,
} from "@/lib/api/use-catalog-products";
import type { ProductSpecsDraft, CustomSpecGroup, CustomSpecAttr } from "@/components/specifications/product-spec-editor";
import { useCatalogProduct } from "@/lib/api/use-catalog-product";
import { useCatalogCategories, createCatalogCategory, deleteCatalogCategory, patchCatalogCategory } from "@/lib/api/use-catalog-categories";
import { useCatalogBrands, createCatalogBrand, deleteCatalogBrand, patchCatalogBrand } from "@/lib/api/use-catalog-brands";
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { CategoryCombobox } from "@/components/categories/category-combobox";
import { CategoryPickDrawer } from "@/components/categories/category-pick-drawer";
import { BrandFormDialog } from "@/components/brands/brand-form-dialog";
import { BrandCombobox } from "@/components/brands/brand-combobox";
import { BrandPickDrawer } from "@/components/brands/brand-pick-drawer";
import { WarrantyCombobox } from "@/components/products/warranty-combobox";
import { WarrantyFormDrawer } from "@/components/products/warranty-form-drawer";
import { WarrantyPickDrawer } from "@/components/products/warranty-pick-drawer";
import { OriginCombobox } from "@/components/products/origin-combobox";
import { OriginPickDrawer } from "@/components/products/origin-pick-drawer";
import {
  useCatalogWarranties,
  createCatalogWarranty,
  renameCatalogWarranty,
  deleteCatalogWarranty,
} from "@/lib/api/use-catalog-warranties";
import {
  addCustomOrigin,
  buildOriginOptions,
  removeCustomOrigin,
  renameCustomOrigin,
} from "@/lib/products/origin-options";
import type { Category } from "@/lib/mock-data/categories";
import { useCatalogMedia, uploadCatalogMediaFiles, createCatalogMediaBatch } from "@/lib/api/use-catalog-media";
import { slugHasError, validateSlug } from "@/lib/url-slug/validate-slug";
import { PRODUCT_FIELD_LIMITS, truncateToLimit } from "@/lib/catalog/product-field-limits";
import { cn, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { SlugInput } from "@/components/ui/slug-input";
import { RichTextEditor } from "@/components/products/rich-text-editor";
import { AgaincartClassicEditor } from "@/components/products/againcart-classic-editor";
import { MediaLibraryModal } from "@/components/media/media-library-modal";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { ProductSpecEditor } from "@/components/specifications/product-spec-editor";
import { plainTextToListHtml, plainTextToParagraphHtml } from "@/lib/editor/plain-text-html";
import { ProductVariantEditor } from "@/components/products/product-variant-editor";
import { MediaGallery } from "@/components/products/media-gallery";
import { DigitalFilesSection, flushPendingDigitalFiles } from "@/components/products/digital-files-section";
import type { PendingFile } from "@/components/products/digital-files-section";
import type { DigitalFile, ProductDetail } from "@/lib/api/catalog-products";
import { fetchDigitalFiles } from "@/lib/api/catalog-products";
import { ActivityTriggerButton } from "@/components/activity/activity-trigger-button";
import {
  DROPSHIPPING_MODULE_BASE,
  useCatalogModuleBasePath,
} from "@/lib/catalog/catalog-module-base-path";

const SECTIONS = [
  { id: "media", label: "Media", icon: ImagePlus },
  { id: "general", label: "General", icon: Package },
  { id: "pricing", label: "Pricing & Inventory", icon: Tag },
  { id: "variants", label: "Variants", icon: Layers },
  { id: "specifications", label: "Specifications", icon: SlidersHorizontal },
  { id: "digital", label: "Digital Files", icon: Download },
  { id: "seo", label: "SEO", icon: Search },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export type ProductFormValues = {
  name: string;
  sku: string;
  model: string;
  category: string;
  categoryId: string;
  categoryIds: string[];
  brand: string;
  brandId: string;
  status: ProductStatus;
  visibility: ProductVisibility;
  tags: string;
  shortDescription: string;
  description: string;
  price: string;
  compareAtPrice: string;
  lastSellingPrice: string;
  cost: string;
  stock: string;
  trackInventory: boolean;
  trackQuantity: boolean;
  warehouseId: string;
  lowStockAlert: string;
  productType: "simple" | "variable" | "digital";
  warranty: string;
  origin: string;
  stockStatus: "" | "in_stock" | "out_of_stock" | "pre_order" | "coming_soon";
  metaTitle: string;
  metaDescription: string;
  focusKeyphrase: string;
  slug: string;
};

export const PRODUCT_FORM_DEFAULT_VALUES: ProductFormValues = {
  name: "",
  sku: "",
  model: "",
  category: "",
  categoryId: "",
  categoryIds: [],
  brand: "",
  brandId: "",
  status: "draft",
  visibility: "public",
  tags: "",
  shortDescription: "",
  description: "",
  price: "",
  compareAtPrice: "",
  lastSellingPrice: "",
  cost: "",
  stock: "0",
  trackInventory: true,
  trackQuantity: true,
  warehouseId: "",
  lowStockAlert: "10",
  productType: "simple",
  warranty: "",
  origin: "",
  stockStatus: "",
  metaTitle: "",
  metaDescription: "",
  focusKeyphrase: "",
  slug: "",
};


type Props = {
  mode?: "create" | "edit";
  initialProduct?: Product;
  compact?: boolean;
  inDialog?: boolean;
  onClose?: () => void;
  /** Called after a successful save; receives the created/updated product when available. */
  onSaved?: (product?: Product) => void;
  /** Create mode only — seeds `values` from a restored draft (see product-form-dialog.tsx). */
  initialValuesOverride?: Partial<ProductFormValues>;
  /** Fires whenever `values` changes, so the dialog can keep a draft-save ref current. */
  onValuesChange?: (values: ProductFormValues) => void;
};

function slugifyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return truncateToLimit(slug, PRODUCT_FIELD_LIMITS.slug).replace(/-+$/g, "") || "product";
}

const FIELD_LABELS: Record<string, string> = {
  name: "Product name",
  slug: "URL slug",
  sku: "SKU",
  seo_title: "Meta title",
  brand: "Brand",
  category: "Category",
  thumbnail: "Thumbnail URL",
};

function validateProductFieldLengths(
  values: ProductFormValues,
  slug: string,
  variantRows: VariantMatrixRow[],
): { message: string; section: SectionId } | null {
  const checks: { key: keyof typeof FIELD_LABELS; value: string; section: SectionId; limit: number }[] = [
    { key: "name", value: values.name.trim(), section: "general", limit: PRODUCT_FIELD_LIMITS.name },
    { key: "slug", value: slug, section: "seo", limit: PRODUCT_FIELD_LIMITS.slug },
    { key: "sku", value: values.sku.trim(), section: "general", limit: PRODUCT_FIELD_LIMITS.sku },
    { key: "seo_title", value: values.metaTitle.trim(), section: "seo", limit: PRODUCT_FIELD_LIMITS.seoTitle },
    { key: "brand", value: values.brand.trim(), section: "general", limit: PRODUCT_FIELD_LIMITS.brand },
    { key: "category", value: values.category.trim(), section: "general", limit: PRODUCT_FIELD_LIMITS.category },
  ];

  for (const { key, value, section, limit } of checks) {
    if (!value) continue;
    if (value.length > limit) {
      return {
        message: `${FIELD_LABELS[key]} must be ${limit} characters or less (currently ${value.length})`,
        section,
      };
    }
  }

  for (const row of variantRows) {
    if (row.label.trim().length > PRODUCT_FIELD_LIMITS.variantName) {
      return {
        message: `Variant name must be ${PRODUCT_FIELD_LIMITS.variantName} characters or less`,
        section: "variants",
      };
    }
    if (row.sku.trim().length > PRODUCT_FIELD_LIMITS.variantSku) {
      return {
        message: `Variant SKU must be ${PRODUCT_FIELD_LIMITS.variantSku} characters or less`,
        section: "variants",
      };
    }
  }

  return null;
}

function parseVariantOptions(raw?: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function variantsToRows(
  variants: {
    id: string;
    sku: string;
    name: string;
    price: string;
    stock: number;
    status: ProductStatus;
    is_default: boolean;
    image_id?: string | null;
    image_url?: string | null;
    options_json?: string | null;
  }[],
): VariantMatrixRow[] {
  return variants.map((v) => ({
    id: v.id,
    label: v.name,
    sku: v.sku,
    price: parseFloat(v.price) || 0,
    stock: v.stock,
    isDefault: v.is_default,
    dimensions: parseVariantOptions(v.options_json),
    imageId: v.image_id ?? undefined,
    imageUrl: v.image_url ?? undefined,
    status: v.status === "draft" ? "draft" : "published",
  }));
}

function rowsToVariantUpserts(rows: VariantMatrixRow[]): VariantUpsertInput[] {
  return rows.map((row, idx) => ({
    id: row.id.startsWith("new_") ? undefined : row.id,
    sku: truncateToLimit(row.sku.trim(), PRODUCT_FIELD_LIMITS.variantSku),
    name: truncateToLimit(row.label.trim(), PRODUCT_FIELD_LIMITS.variantName),
    price: row.price,
    stock: row.stock,
    status: (row.status === "draft" ? "draft" : "published") as ProductStatus,
    is_default: row.isDefault,
    sort_order: idx,
    image_id: row.imageId ?? null,
    options_json: Object.keys(row.dimensions).length ? JSON.stringify(row.dimensions) : null,
  }));
}

function buildProductPayload(
  values: ProductFormValues,
  publish: boolean,
  specProfileId?: string,
  thumbnail?: string,
  customSpecsJson?: string,
  variantAttributesJson?: string | null,
) {
  const name = truncateToLimit(values.name.trim(), PRODUCT_FIELD_LIMITS.name);
  const slug = truncateToLimit(
    values.slug.trim() || slugifyName(values.name),
    PRODUCT_FIELD_LIMITS.slug,
  ).replace(/-+$/g, "") || "product";
  const sku = truncateToLimit(values.sku.trim(), PRODUCT_FIELD_LIMITS.sku);

  return {
    name,
    slug,
    sku,
    model: values.model.trim()
      ? truncateToLimit(values.model.trim(), PRODUCT_FIELD_LIMITS.model)
      : null,
    price: parseFloat(values.price) || 0,
    compare_at_price: values.compareAtPrice ? parseFloat(values.compareAtPrice) : undefined,
    last_selling_price: values.lastSellingPrice ? parseFloat(values.lastSellingPrice) : undefined,
    category: values.category
      ? truncateToLimit(values.category, PRODUCT_FIELD_LIMITS.category)
      : values.category,
    category_id: values.categoryIds[0] || values.categoryId || null,
    category_ids: values.categoryIds,
    brand: values.brand ? truncateToLimit(values.brand, PRODUCT_FIELD_LIMITS.brand) : values.brand,
    brand_id: values.brandId || null,
    attribute_profile_id: specProfileId || null,
    stock: parseInt(values.stock, 10) || 0,
    status: (publish ? "published" : values.status) as ProductStatus,
    product_type: values.productType,
    visibility: values.visibility,
    description: values.description.trim() || undefined,
    short_description: values.shortDescription.trim() || undefined,
    seo_title: values.metaTitle.trim()
      ? truncateToLimit(values.metaTitle.trim(), PRODUCT_FIELD_LIMITS.seoTitle)
      : undefined,
    seo_description: values.metaDescription.trim() || undefined,
    focus_keyphrase: values.focusKeyphrase.trim() || null,
    warranty: values.warranty.trim() || null,
    origin: values.origin.trim() || null,
    track_quantity: values.trackQuantity,
    stock_status: values.trackQuantity
      ? values.stockStatus || null
      : values.stockStatus || "in_stock",
    tags: values.tags.split(",").map((t) => t.trim()).filter(Boolean),
    thumbnail: thumbnail ? truncateToLimit(thumbnail, PRODUCT_FIELD_LIMITS.thumbnail) : thumbnail,
    custom_specs_json: customSpecsJson ?? null,
    variant_attributes_json: variantAttributesJson ?? null,
  };
}

export function ProductForm({
  mode = "create",
  initialProduct,
  compact,
  inDialog,
  onClose,
  onSaved,
  initialValuesOverride,
  onValuesChange,
}: Props) {
  const moduleBase = useCatalogModuleBasePath();
  const categoryChannel =
    moduleBase === DROPSHIPPING_MODULE_BASE ? "dropshipping" : "catalog";

  const router = useRouter();
  const visibleSections = SECTIONS;
  const { categories, refetch: refetchCategories } = useCatalogCategories({
    channel: categoryChannel,
  });
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addCategoryParentId, setAddCategoryParentId] = useState<string | null>(null);
  const [listCategoryOpen, setListCategoryOpen] = useState(false);
  const { brands, refetch: refetchBrands } = useCatalogBrands({
    channel: categoryChannel,
  });
  const [addBrandOpen, setAddBrandOpen] = useState(false);
  const [listBrandOpen, setListBrandOpen] = useState(false);
  const [addWarrantyOpen, setAddWarrantyOpen] = useState(false);
  const [listWarrantyOpen, setListWarrantyOpen] = useState(false);
  const [listOriginOpen, setListOriginOpen] = useState(false);
  const {
    rows: warrantyRows,
    warranties: warrantyNames,
    refetch: refetchWarranties,
  } = useCatalogWarranties();
  const [originOptions, setOriginOptions] = useState<string[]>(() => buildOriginOptions());
  const { items: mediaItems, refetch: refetchMedia } = useCatalogMedia();
  const editId = mode === "edit" ? initialProduct?.id : undefined;
  const { product: productDetail, loading: detailLoading } = useCatalogProduct(editId);
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<SectionId>("media");
  const [autosave, setAutosave] = useState("All changes saved");
  const [productMedia, setProductMedia] = useState<MediaLibraryItem[]>([]);
  const [variantRows, setVariantRows] = useState<VariantMatrixRow[]>([]);
  const [variantAttributes, setVariantAttributes] = useState<VariantDimension[]>(() =>
    mode === "create" ? getPresetDimensions(initialProduct?.category) : [],
  );
  const [specDraft, setSpecDraft] = useState<ProductSpecsDraft>({ profileId: "", valuesByAttributeId: {} });
  const [initialCustomGroups, setInitialCustomGroups] = useState<CustomSpecGroup[]>([]);
  const [initialCustomAttrs, setInitialCustomAttrs] = useState<CustomSpecAttr[]>([]);
  const [digitalFiles, setDigitalFiles] = useState<DigitalFile[]>([]);
  const [pendingDigitalFiles, setPendingDigitalFiles] = useState<PendingFile[]>([]);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [showSeoPanel, setShowSeoPanel] = useState(false);
  const [slugApiTaken, setSlugApiTaken] = useState(false);
  const [slugApiMessage, setSlugApiMessage] = useState<string | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  /* true once the user manually edits the slug field */
  const slugManuallyEdited = useRef(!!initialProduct?.slug);
  const [values, setValues] = useState<ProductFormValues>(() => ({
    ...PRODUCT_FORM_DEFAULT_VALUES,
    ...(initialProduct
      ? {
          name: initialProduct.name ?? PRODUCT_FORM_DEFAULT_VALUES.name,
          sku: initialProduct.sku ?? PRODUCT_FORM_DEFAULT_VALUES.sku,
          model: initialProduct.model ?? PRODUCT_FORM_DEFAULT_VALUES.model,
          category: initialProduct.category ?? PRODUCT_FORM_DEFAULT_VALUES.category,
          brand: initialProduct.brand ?? PRODUCT_FORM_DEFAULT_VALUES.brand,
          status: initialProduct.status ?? PRODUCT_FORM_DEFAULT_VALUES.status,
          tags: (initialProduct.tags ?? []).join(", "),
          description: initialProduct.description ?? "",
          price:
            initialProduct.price != null
              ? String(initialProduct.price)
              : PRODUCT_FORM_DEFAULT_VALUES.price,
          compareAtPrice: initialProduct.compareAtPrice
            ? String(initialProduct.compareAtPrice)
            : "",
          lastSellingPrice: initialProduct.lastSellingPrice
            ? String(initialProduct.lastSellingPrice)
            : "",
          stock:
            initialProduct.stock != null
              ? String(initialProduct.stock)
              : PRODUCT_FORM_DEFAULT_VALUES.stock,
          metaTitle: initialProduct.name ?? PRODUCT_FORM_DEFAULT_VALUES.metaTitle,
          slug: initialProduct.slug ?? PRODUCT_FORM_DEFAULT_VALUES.slug,
        }
      : {}),
    ...(initialValuesOverride ?? {}),
  }));

  useEffect(() => {
    onValuesChange?.(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report the latest values only; onValuesChange identity is stable enough per dialog instance
  }, [values]);

  const isDigital = values.productType === "digital";
  const visibleSectionsFiltered = visibleSections.filter((s) => {
    if (s.id === "variants" && isDigital) return false;
    if (s.id === "digital" && !isDigital) return false;
    if ((s.id as string) === "inventory") return false; // merged into pricing
    return true;
  });

  const set = useCallback(<K extends keyof ProductFormValues>(key: K, val: ProductFormValues[K]) => {
    setValues((v) => {
      const next = { ...v, [key]: val };
      /* auto-generate slug from name as long as user hasn't manually edited it */
      if (key === "name" && !slugManuallyEdited.current) {
        next.slug = slugifyName(String(val));
      }
      return next;
    });
    setAutosave("Saving draft…");
  }, []);

  const warrantyOptions = useMemo(() => {
    const current = values.warranty.trim();
    if (!current) return warrantyNames;
    return warrantyNames.some((n) => n.toLowerCase() === current.toLowerCase())
      ? warrantyNames
      : [...warrantyNames, current];
  }, [warrantyNames, values.warranty]);

  const handleWarrantyCreate = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        await createCatalogWarranty(trimmed);
        await refetchWarranties();
        set("warranty", trimmed);
        toast.success("Warranty added");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add warranty");
      }
    },
    [refetchWarranties, set],
  );

  const handleWarrantyRename = useCallback(
    async (from: string, to: string) => {
      const next = to.trim();
      if (!next) return;
      const row = warrantyRows.find((r) => r.name.toLowerCase() === from.toLowerCase());
      if (!row) return;
      try {
        await renameCatalogWarranty(row.id, next);
        await refetchWarranties();
        if (values.warranty === from) set("warranty", next);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to rename warranty");
      }
    },
    [warrantyRows, refetchWarranties, set, values.warranty],
  );

  const handleWarrantyDelete = useCallback(
    async (name: string) => {
      const row = warrantyRows.find((r) => r.name.toLowerCase() === name.toLowerCase());
      if (!row) return;
      try {
        await deleteCatalogWarranty(row.id);
        const remaining = warrantyRows.filter((r) => r.id !== row.id);
        await refetchWarranties();
        if (values.warranty === name) set("warranty", remaining[0]?.name ?? "");
        toast.success("Warranty deleted");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete warranty");
      }
    },
    [warrantyRows, refetchWarranties, set, values.warranty],
  );

  useEffect(() => {
    const t = setTimeout(() => setAutosave("Ready to save"), 800);
    return () => clearTimeout(t);
  }, [values]);

  useEffect(() => {
    if (!values.slug.trim()) {
      setSlugApiTaken(false);
      setSlugApiMessage(null);
      return;
    }
    const timer = setTimeout(() => {
      setSlugChecking(true);
      void checkCatalogProductSlug(values.slug, initialProduct?.id)
        .then((res) => {
          setSlugApiTaken(!res.available);
          setSlugApiMessage(res.message ?? null);
        })
        .catch(() => {
          setSlugApiTaken(false);
          setSlugApiMessage(null);
        })
        .finally(() => setSlugChecking(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [values.slug, initialProduct?.id]);

  // Scroll content to top after editors mount (they may autofocus causing scroll).
  // Only blur the rich-text/description editors themselves — never a plain
  // input/textarea, or this steals focus mid-keystroke from whatever the user
  // is actually typing into (e.g. the product name, right after the drawer opens).
  useEffect(() => {
    const scroll = () => {
      const container = contentRef.current;
      if (!container) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        container.contains(active) &&
        active.tagName !== "INPUT" &&
        active.tagName !== "TEXTAREA" &&
        active.isContentEditable
      ) {
        active.blur();
      }
      container.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    };
    const t1 = setTimeout(scroll, 150);
    const t2 = setTimeout(scroll, 500);
    const t3 = setTimeout(scroll, 1000);
    const t4 = setTimeout(scroll, 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  const selectSection = useCallback((id: SectionId) => {
    setSection(id);
    const container = contentRef.current;
    const el = container?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (container && el) {
      // Snap to current position first to cancel any in-progress smooth scroll
      container.scrollTo({ top: container.scrollTop, behavior: "instant" as ScrollBehavior });
      requestAnimationFrame(() => {
        const elTop = el.getBoundingClientRect().top;
        const cTop = container.getBoundingClientRect().top;
        container.scrollTo({ top: container.scrollTop + elTop - cTop - 8, behavior: "smooth" });
      });
    }
  }, []);

  // Scrollspy: update active section based on scroll position
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top that is intersecting
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = visible[0].target.getAttribute("data-section") as SectionId;
          if (id) setSection(id);
        }
      },
      { root: container, rootMargin: "-10% 0px -60% 0px", threshold: 0 },
    );
    const sections = container.querySelectorAll("[data-section]");
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [visibleSectionsFiltered]);

  useEffect(() => {
    if (!productDetail || mode !== "edit") return;
    setValues({
      ...PRODUCT_FORM_DEFAULT_VALUES,
      name: productDetail.name,
      sku: productDetail.sku,
      model: productDetail.model ?? "",
      category: productDetail.category,
      categoryId: productDetail.categoryId ?? "",
      categoryIds: productDetail.categoryIds?.length
        ? productDetail.categoryIds
        : productDetail.categoryId
          ? [productDetail.categoryId]
          : [],
      brand: productDetail.brand,
      brandId: productDetail.brandId ?? "",
      status: productDetail.status,
      visibility: productDetail.visibility ?? "public",
      tags: productDetail.tags.join(", "),
      // Older imports saved plain text; the editor needs HTML (bullets / paragraphs) to keep line breaks.
      shortDescription: plainTextToListHtml(productDetail.shortDescription),
      description: plainTextToParagraphHtml(productDetail.description),
      price: String(productDetail.price),
      compareAtPrice: productDetail.compareAtPrice ? String(productDetail.compareAtPrice) : "",
      lastSellingPrice: productDetail.lastSellingPrice ? String(productDetail.lastSellingPrice) : "",
      stock: String(productDetail.stock),
      metaTitle: productDetail.metaTitle || productDetail.name,
      metaDescription: productDetail.metaDescription ?? "",
      focusKeyphrase: productDetail.focusKeyphrase ?? "",
      slug: productDetail.slug,
      productType: productDetail.productType,
      warranty: productDetail.warranty?.trim() || "",
      origin: productDetail.origin?.trim() || "",
      trackQuantity: productDetail.trackQuantity ?? true,
      stockStatus: (productDetail.trackQuantity === false
        ? productDetail.stockStatus || "in_stock"
        : productDetail.stockStatus ?? "") as "" | "in_stock" | "out_of_stock" | "pre_order" | "coming_soon",
    });
    setOriginOptions(buildOriginOptions(productDetail.origin?.trim() || ""));
    setVariantRows(variantsToRows(productDetail.variants));
    setVariantAttributes(() => {
      if (!productDetail.variantAttributesJson) return [];
      try {
        const parsed = JSON.parse(productDetail.variantAttributesJson) as unknown;
        return Array.isArray(parsed) ? (parsed as VariantDimension[]) : [];
      } catch {
        return [];
      }
    });
    if (productDetail.productType === "digital" && productDetail.id) {
      void fetchDigitalFiles(productDetail.id).then(setDigitalFiles).catch(() => {});
    }
    setProductMedia(
      productDetail.mediaLinks.map((m) => ({
        id: m.media_id,
        name: m.name,
        title: m.name,
        folder: "Products",
        url: m.url,
        type: m.media_type === "video" ? "video" : "image",
        mimeType: m.media_type === "video" ? "video/mp4" : "image/jpeg",
        sizeKb: 0,
        alt: m.name,
        uploadedAt: new Date().toISOString(),
        uploadedBy: "API",
        provider: "direct" as const,
      })),
    );
  }, [productDetail, mode]);

  useEffect(() => {
    if (!productDetail?.id || mode !== "edit") return;
    /* load custom specs from product */
    let parsedCustomGroups: CustomSpecGroup[] = [];
    let parsedCustomAttrs: CustomSpecAttr[] = [];
    const elimValues: Record<string, string> = {};
    try {
      const raw = productDetail.customSpecsJson;
      if (raw) {
        const parsed = JSON.parse(raw) as {
          customGroups?: CustomSpecGroup[];
          customAttrs?: Array<CustomSpecAttr & { value?: string }>;
        };
        parsedCustomGroups = parsed.customGroups ?? [];
        parsedCustomAttrs = (parsed.customAttrs ?? []).map(({ id, groupId, name }) => ({ id, groupId, name }));
        for (const attr of parsed.customAttrs ?? []) {
          if (attr.value) elimValues[attr.id] = attr.value;
        }
        setInitialCustomGroups(parsedCustomGroups);
        setInitialCustomAttrs(parsedCustomAttrs);
      }
    } catch { /* ignore */ }
    void import("@/lib/api/catalog-products").then(({ fetchProductSpecs }) =>
      fetchProductSpecs(productDetail.id).then((specs) => {
        const vmap: Record<string, string> = { ...elimValues };
        for (const item of specs.values) vmap[item.attributeId] = item.value;
        setSpecDraft({
          profileId: specs.attributeProfileId ?? productDetail.attributeProfileId ?? "",
          valuesByAttributeId: vmap,
          customGroups: parsedCustomGroups,
          customAttrs: parsedCustomAttrs,
        });
      }),
    );
  }, [productDetail, mode]);

  const handleSpecChange = useCallback((draft: ProductSpecsDraft) => {
    setSpecDraft(draft);
  }, []);

  async function persistSpecs(productId: string) {
    const { replaceProductSpecs } = await import("@/lib/api/catalog-products");
    const ordered = specDraft.orderedAttributeIds ?? Object.keys(specDraft.valuesByAttributeId);
    const vals = ordered
      .filter((id) => !id.startsWith("custom-") && !id.startsWith("cgroup-"))
      .filter((id) => specDraft.valuesByAttributeId[id]?.trim())
      .map((attributeId, idx) => ({ attributeId, value: specDraft.valuesByAttributeId[attributeId].trim(), sortOrder: idx }));
    await replaceProductSpecs(productId, {
      attributeProfileId: specDraft.profileId || null,
      values: vals,
    });
  }

  const handleSave = async (publish = false) => {
    if (!values.name.trim()) {
      toast.error("Product name is required");
      setSection("general");
      return;
    }
    const slug = values.slug.trim() || slugifyName(values.name);
    const lengthError = validateProductFieldLengths(values, slug, variantRows);
    if (lengthError) {
      toast.error(lengthError.message);
      setSection(lengthError.section);
      return;
    }
    if (slugHasError(slug, initialProduct?.id ? { id: initialProduct.id } : undefined)) {
      toast.error(slugApiMessage ?? "Fix URL slug before saving");
      setSection("seo");
      return;
    }
    /* if slug is taken, find the next free variant: slug-1, slug-2 … */
    let finalSlug = slug;
    if (slugApiTaken) {
      let found = false;
      for (let i = 1; i <= 99; i++) {
        const candidate = `${slug}-${i}`;
        const res = await checkCatalogProductSlug(candidate, initialProduct?.id).catch(() => null);
        if (res?.available) { finalSlug = candidate; found = true; break; }
      }
      if (!found) { toast.error("Could not find a free URL slug"); return; }
      set("slug", finalSlug);
      toast.info(`URL slug changed to "${finalSlug}"`);
    }
    // Featured = first item in gallery; fall back to first image if first item is video
    const thumbnail = productMedia.find((m) => m.type === "image")?.url ?? undefined;
    // Preserve Elim dropship / seller keys when Specs UI rewrites custom_specs_json
    let customSpecsJson: string | null = null;
    if (specDraft.customGroups?.length || specDraft.customAttrs?.length) {
      let preserved: Record<string, unknown> = {};
      if (initialProduct && "customSpecsJson" in initialProduct && (initialProduct as ProductDetail).customSpecsJson) {
        try {
          preserved = JSON.parse((initialProduct as ProductDetail).customSpecsJson as string) as Record<string, unknown>;
        } catch {
          preserved = {};
        }
      }
      customSpecsJson = JSON.stringify({
        ...preserved,
        customGroups: specDraft.customGroups ?? [],
        customAttrs: (specDraft.customAttrs ?? []).map((a) => ({
          ...a,
          value: specDraft.valuesByAttributeId?.[a.id] ?? (a as CustomSpecAttr & { value?: string }).value ?? "",
        })),
      });
    }
    const variantAttributesJson =
      values.productType === "variable" && variantAttributes.length > 0
        ? JSON.stringify(variantAttributes)
        : null;
    const payload = buildProductPayload(
      values,
      publish,
      specDraft.profileId,
      thumbnail,
      customSpecsJson ?? undefined,
      variantAttributesJson,
    );
    setSaving(true);
    try {
      if (mode === "create") {
        const sku = payload.sku || `SKU-${Date.now().toString().slice(-6)}`;
        const isDropshippingModule = moduleBase === DROPSHIPPING_MODULE_BASE;
        const tags = Array.from(
          new Set([
            ...(payload.tags ?? []),
            ...(isDropshippingModule ? ["dropship"] : []),
          ]),
        );
        const created = await createCatalogProduct({
          ...payload,
          slug: finalSlug,
          sku,
          tags,
          dropship_meta_json: isDropshippingModule
            ? JSON.stringify({
                source: "manual",
                dropship: true,
                currency_sell: "BDT",
              })
            : null,
        });
        if (values.productType === "variable" && variantRows.length > 0) {
          await replaceProductVariants(created.id, rowsToVariantUpserts(variantRows));
        }
        if (productMedia.length > 0) {
          await replaceProductMedia(created.id, productMedia.map((m) => m.id));
        }
        if (specDraft.profileId || Object.values(specDraft.valuesByAttributeId).some((v) => v.trim())) {
          await persistSpecs(created.id);
        }
        if (values.productType === "digital" && pendingDigitalFiles.length > 0) {
          await flushPendingDigitalFiles(created.id, pendingDigitalFiles);
          setPendingDigitalFiles([]);
        }
        toast.success(publish ? "Product published" : "Product saved as draft");
        onSaved?.(created);
        if (onClose) onClose();
        else router.push(`${moduleBase}/products`);
        return;
      }

      if (mode === "edit" && initialProduct) {
        const updated = await updateCatalogProduct(initialProduct.id, {
          ...payload,
          slug: finalSlug,
        });
        if (values.productType === "variable") {
          await replaceProductVariants(initialProduct.id, rowsToVariantUpserts(variantRows));
        }
        await replaceProductMedia(initialProduct.id, productMedia.map((m) => m.id));
        await persistSpecs(initialProduct.id);
        toast.success(publish ? "Product published" : "Product updated");
        onSaved?.(updated);
        if (onClose) onClose();
        else router.push(`${moduleBase}/products`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  const title = mode === "create" ? "Add Product" : "Edit Product";

  const actionButtons = (
    <>
      <Button
        variant="outline"
        size="sm"
        className="flex-1 rounded-none sm:flex-none"
        onClick={() => (onClose ? onClose() : router.push(`${moduleBase}/products`))}
      >
        Discard
      </Button>
      <Button
        variant="secondary"
        size="sm"
        className="flex-1 rounded-none sm:flex-none"
        onClick={() => void handleSave(false)}
        disabled={saving || detailLoading}
      >
        {saving ? "Saving…" : "Save draft"}
      </Button>
      <Button
        size="sm"
        className="flex-1 rounded-none sm:flex-none"
        onClick={() => void handleSave(true)}
        disabled={saving || detailLoading}
      >
        {saving ? "Publishing…" : "Publish"}
      </Button>
    </>
  );

  return (
    <>
    <div
      className={
        inDialog
          ? "flex h-full min-h-0 flex-col"
          : compact
            ? "flex min-h-0 flex-col"
            : "flex min-h-0 flex-col pb-20 sm:min-h-[calc(100vh-2.75rem-1.5rem)] sm:pb-0 lg:min-h-[calc(100vh-2.75rem-2rem)]"
      }
    >
      {/* Header */}
      <div className="shrink-0 border-b border-input pb-2">
        {inDialog ? (
          <div className="pr-8">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  className="h-6 rounded-none px-2 text-[11px]"
                  onClick={() => void handleSave(true)}
                  disabled={saving}
                >
                  {saving ? "Publishing…" : "Publish"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 rounded-none px-2 text-[11px]"
                  onClick={() => void handleSave(false)}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save draft"}
                </Button>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[12px] font-semibold leading-none text-foreground">
                  {mode === "create" ? "Add Product" : values.name || "Edit Product"}
                </h2>
                {values.model.trim() ? (
                  <p className="mt-0.5 truncate text-[10px] leading-none text-muted-foreground">
                    Model: {values.model.trim()}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              {!compact && (
                <Button variant="ghost" size="icon" className="mt-0.5 shrink-0" asChild>
                  <Link href={`${moduleBase}/products`}>
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
              )}
              <div className="min-w-0 flex-1">
                <p className="page-subtitle hidden truncate sm:block">
                  AgainERP › Ecommerce › Catalog › Products › {title}
                </p>
                <p className="page-subtitle sm:hidden">
                  Catalog › Products › {mode === "create" ? "Add" : "Edit"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="page-title">{title}</h1>
                  <Badge
                    variant={
                      values.status === "published" ? "success" : values.status === "draft" ? "warning" : "muted"
                    }
                    className="capitalize"
                  >
                    {values.status}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{autosave}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {mode === "edit" && initialProduct?.id ? (
                <ActivityTriggerButton
                  entity={{
                    type: "product",
                    id: initialProduct.id,
                    label: values.name || initialProduct.name,
                    subtitle: values.sku ? `SKU ${values.sku}` : undefined,
                  }}
                  className="h-8 w-8 sm:hidden"
                />
              ) : null}
              <div className={`flex flex-wrap gap-1.5 ${compact ? "flex" : "hidden sm:flex"}`}>
                {actionButtons}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section pills — mobile only (not in dialog) */}
      <div
        className={`sticky top-0 z-10 shrink-0 border-b border-input bg-background py-1.5 ${inDialog ? "hidden" : "md:hidden"}`}
      >
        <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleSectionsFiltered.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              onClick={() => selectSection(id)}
              className={`flex shrink-0 items-center justify-center rounded-none border p-2 transition-colors ${
                section === id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>

      <div
        className={`flex min-h-0 flex-1 gap-3 ${inDialog ? "flex-row overflow-hidden pt-2" : "flex-col pt-2 md:flex-row md:pt-4"}`}
      >
        {/* Left section nav — icons only */}
        <nav
          className={`shrink-0 border-r border-input ${inDialog ? "block w-8 overflow-hidden pr-1" : "hidden w-12 pr-2 md:block"}`}
        >
          {visibleSectionsFiltered.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              onClick={() => selectSection(id)}
              className={`mb-0.5 flex w-full items-center justify-center rounded-none transition-colors ${
                inDialog ? "p-1.5" : "p-2"
              } ${
                section === id
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              }`}
            >
              <Icon className={inDialog ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0"} />
            </button>
          ))}
        </nav>

        {/* Content — only this area scrolls in dialog */}
        <div
          ref={contentRef}
          data-product-form-content
          className={`min-h-0 min-w-0 flex-1 ${inDialog ? "overflow-y-auto pr-1" : "overflow-y-auto pb-4 md:pb-8"}`}
        >
          <div className="divide-y divide-border [&>[data-section=general]]:border-t-0">
          <div data-section="media" className="pb-4 pt-0">
            <Section>
              <MediaGallery
                items={productMedia}
                onReorder={setProductMedia}
                onRemove={(id) => setProductMedia((prev) => prev.filter((m) => m.id !== id))}
                onAddMore={() => setMediaLibraryOpen(true)}
                onUploadFiles={async (files) => {
                  const uploaded = await uploadCatalogMediaFiles(files);
                  await refetchMedia();
                  setProductMedia((prev) => {
                    const map = new Map(prev.map((item) => [item.id, item]));
                    for (const item of uploaded) map.set(item.id, item);
                    return Array.from(map.values());
                  });
                  return uploaded;
                }}
              />
            </Section>
          </div>

          <div data-section="general" className="pb-6 pt-0">
            <Section>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Product name" required className="sm:col-span-2">
                  <Input
                    value={values.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Premium Cotton T-Shirt"
                    maxLength={PRODUCT_FIELD_LIMITS.name}
                  />
                </Field>
                <Field
                  label="URL slug"
                  className="sm:col-span-2"
                  labelEnd={(() => {
                    if (slugChecking) {
                      return (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          Checking slug availability…
                        </span>
                      );
                    }
                    if (slugApiTaken && slugApiMessage) {
                      return (
                        <span className="shrink-0 text-[10px] text-destructive">{slugApiMessage}</span>
                      );
                    }
                    const local = validateSlug(
                      values.slug,
                      initialProduct?.id ? { id: initialProduct.id } : undefined,
                    );
                    if (values.slug.trim() && !local.isValid && local.message) {
                      return (
                        <span className="shrink-0 text-[10px] text-destructive">{local.message}</span>
                      );
                    }
                    return null;
                  })()}
                >
                  <SlugInput
                    value={values.slug}
                    onChange={(v) => { slugManuallyEdited.current = true; set("slug", v); }}
                    excludeId={initialProduct?.id}
                    apiTaken={slugApiTaken}
                    apiMessage={slugApiMessage}
                    apiChecking={slugChecking}
                    showMessage={false}
                    className="pr-9"
                    urlPrefix={<span className="shrink-0 text-sm text-muted-foreground">/</span>}
                  />
                </Field>
                <Field label="SKU" required>
                  <Input
                    value={values.sku}
                    onChange={(e) => set("sku", e.target.value)}
                    placeholder="TSH-BLK-M"
                    maxLength={PRODUCT_FIELD_LIMITS.sku}
                  />
                </Field>
                <Field label="Model">
                  <Input
                    value={values.model}
                    onChange={(e) => set("model", e.target.value)}
                    placeholder="TD500 Mesh"
                    maxLength={PRODUCT_FIELD_LIMITS.model}
                  />
                </Field>
                <Field label="Category">
                  <CategoryCombobox
                    multiple
                    categories={categories}
                    values={values.categoryIds}
                    onChange={(ids) => {
                      const primary = categories.find((c) => c.id === ids[0]);
                      setValues((v) => ({
                        ...v,
                        categoryIds: ids,
                        categoryId: ids[0] || "",
                        category: primary?.name || "",
                      }));
                    }}
                    onList={() => setListCategoryOpen(true)}
                    className="w-full"
                  />
                </Field>
                <Field label="Brand">
                  <BrandCombobox
                    brands={brands}
                    value={values.brandId}
                    onChange={(id, name) => { set("brandId", id); set("brand", name); }}
                    onList={() => setListBrandOpen(true)}
                    className="w-full"
                  />
                </Field>
                <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Warranty">
                    <WarrantyCombobox
                      options={warrantyOptions}
                      value={values.warranty}
                      onChange={(v) => set("warranty", v)}
                      onList={() => setListWarrantyOpen(true)}
                      className="w-full"
                    />
                  </Field>
                  <Field label="Origin">
                    <OriginCombobox
                      options={originOptions}
                      value={values.origin}
                      onChange={(v) => set("origin", v)}
                      onList={() => setListOriginOpen(true)}
                      className="w-full"
                    />
                  </Field>
                </div>
                <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Status">
                    <Select
                      value={values.status}
                      onChange={(e) => set("status", e.target.value as ProductStatus)}
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="archived">Archived</option>
                    </Select>
                  </Field>
                  <Field label="Storefront visibility">
                    <Select
                      value={values.visibility}
                      onChange={(e) => set("visibility", e.target.value as ProductVisibility)}
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </Select>
                  </Field>
                </div>
                <Field label="Tags" hint="Comma separated" className="sm:col-span-2">
                    <Input
                    value={values.tags}
                    onChange={(e) => set("tags", e.target.value)}
                    placeholder="featured, bestseller"
                  />
                </Field>
              </div>

              <div data-section="pricing" className="mt-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Price (BDT)" required>
                    <Input
                      type="number"
                      value={values.price}
                      onChange={(e) => set("price", e.target.value)}
                      placeholder="899"
                    />
                  </Field>
                  <Field label="Compare at price">
                    <Input
                      type="number"
                      value={values.compareAtPrice}
                      onChange={(e) => set("compareAtPrice", e.target.value)}
                      placeholder="1299"
                    />
                  </Field>
                  <Field label="Last selling price">
                    <Input
                      type="number"
                      value={values.lastSellingPrice}
                      onChange={(e) => set("lastSellingPrice", e.target.value)}
                      placeholder="799"
                    />
                  </Field>
                  {values.price ? (
                    <Field label="Preview">
                      <div className="flex h-8 items-center gap-1.5 rounded-none border border-input bg-muted/30 px-2 text-[11px]">
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(Number(values.price) || 0)}
                        </span>
                        {values.compareAtPrice ? (
                          <span className="tabular-nums text-muted-foreground line-through">
                            {formatCurrency(Number(values.compareAtPrice))}
                          </span>
                        ) : null}
                      </div>
                    </Field>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap items-end gap-1.5">
                  <Field label="Stock Status" className="w-[180px] shrink-0">
                    <Select
                      value={values.trackQuantity ? values.stockStatus : values.stockStatus || "in_stock"}
                      onChange={(e) => set("stockStatus", e.target.value as typeof values.stockStatus)}
                    >
                      {values.trackQuantity ? (
                        <option value="">Auto (based on quantity)</option>
                      ) : null}
                      <option value="in_stock">In Stock</option>
                      <option value="out_of_stock">Out of Stock</option>
                      <option value="pre_order">Pre-order</option>
                      <option value="coming_soon">Coming Soon</option>
                    </Select>
                  </Field>
                  <Field label="Manage Stock" className="shrink-0">
                    <div className="flex h-7 w-[100px] items-center gap-1.5 rounded-none border border-input bg-background px-1.5 shadow-sm focus-within:ring-2 focus-within:ring-ring">
                      <input
                        type="checkbox"
                        checked={values.trackQuantity}
                        onChange={(e) => {
                          const next = e.target.checked;
                          set("trackQuantity", next);
                          if (!next && !values.stockStatus) {
                            set("stockStatus", "in_stock");
                          }
                          if (next && values.stockStatus === "in_stock") {
                            set("stockStatus", "");
                          }
                        }}
                        title={
                          values.trackQuantity
                            ? "Manage stock on"
                            : "Manage stock off"
                        }
                        aria-label="Manage stock"
                        className="h-3.5 w-3.5 shrink-0 cursor-pointer appearance-none rounded-none border border-border bg-background checked:border-[#00a09d] checked:bg-[#00a09d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a09d]/40"
                        style={{
                          backgroundImage: values.trackQuantity
                            ? `url("data:image/svg+xml,%3Csvg viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2 6.2 4.8 9 10 3' fill='none' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`
                            : undefined,
                          backgroundSize: "10px 10px",
                          backgroundPosition: "center",
                          backgroundRepeat: "no-repeat",
                        }}
                      />
                      <Input
                        type="number"
                        min={0}
                        value={values.stock}
                        onChange={(e) => set("stock", e.target.value)}
                        placeholder="0"
                        disabled={!values.trackQuantity}
                        className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-xs shadow-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                  </Field>
                </div>
              </div>

              <div className="mt-4">
                <RichTextEditor
                  value={values.shortDescription}
                  onChange={(v) => set("shortDescription", v)}
                  placeholder="Brief summary for listings and SEO…"
                  minRows={3}
                  fieldLabel="Short description"
                  aiVariables={{
                    product_name: values.name,
                    category: values.category,
                    brand: values.brand,
                  }}
                />
              </div>
              <div className="mt-4">
                <AgaincartClassicEditor
                  value={values.description}
                  onChange={(v) => set("description", v)}
                  placeholder="Full product description…"
                  fieldLabel="Description"
                  aiContext="product.description"
                  aiVariables={{
                    product_name: values.name,
                    category: values.category,
                    brand: values.brand,
                  }}
                />
              </div>
            </Section>
          </div>

          <div data-section="specifications" className="py-6">
            <Section title="Specifications">
              <ProductSpecEditor
                productId={initialProduct?.id}
                initialProfileId={specDraft.profileId}
                initialValues={specDraft.valuesByAttributeId}
                initialCustomGroups={initialCustomGroups}
                initialCustomAttrs={initialCustomAttrs}
                sourceUrl={productDetail?.sourceUrl ?? null}
                defaultHideEmpty={mode === "edit"}
                onChange={handleSpecChange}
              />
            </Section>
          </div>

          <div data-section="variants" className="py-6">
            {/* Product type tab switcher — always visible */}
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Product type</p>
              <div className="flex gap-1 rounded-none border border-input bg-muted/40 p-1">
                {(["simple", "variable", "digital"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("productType", t)}
                    className={cn(
                      "flex-1 rounded-none px-3 py-1.5 text-xs font-medium capitalize transition-all",
                      values.productType === t
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content — same frame, content switches */}
            {!isDigital ? (
              <ProductVariantEditor
                productType={values.productType}
                onProductTypeChange={(t) => set("productType", t)}
                baseSku={values.sku}
                basePrice={values.price}
                category={values.category}
                rows={variantRows}
                onRowsChange={setVariantRows}
                dimensions={variantAttributes}
                onDimensionsChange={setVariantAttributes}
                galleryMedia={productMedia.filter((m) => m.type === "image")}
              />
            ) : (
              <DigitalFilesSection
                productId={initialProduct?.id ?? null}
                files={digitalFiles}
                onFilesChange={setDigitalFiles}
                pendingFiles={pendingDigitalFiles}
                onPendingFilesChange={setPendingDigitalFiles}
              />
            )}
          </div>

          <div data-section="seo" className="py-6">
            <Section title="SEO">
              {(() => {
                const kp = values.focusKeyphrase.trim().toLowerCase();
                const title = (values.metaTitle || values.name || "").toLowerCase();
                const desc = values.metaDescription.toLowerCase();
                const slugVal = values.slug.toLowerCase();
                const body = ((values.description || "") + " " + (values.shortDescription || "")).replace(/<[^>]+>/g, "").toLowerCase();
                const titleLen = (values.metaTitle || "").length;
                const descLen = values.metaDescription.length;

                const checks = [
                  // Keyphrase group (30 pts)
                  { group: "Keyphrase", label: "Focus keyphrase is set", ok: kp.length > 0, pts: 5 },
                  { group: "Keyphrase", label: "Keyphrase in meta title", ok: kp.length > 0 && title.includes(kp), pts: 8 },
                  { group: "Keyphrase", label: "Keyphrase in meta description", ok: kp.length > 0 && desc.includes(kp), pts: 7 },
                  { group: "Keyphrase", label: "Keyphrase in URL slug", ok: kp.length > 0 && (slugVal.includes(kp.replace(/\s+/g, "-")) || slugVal.includes(kp)), pts: 5 },
                  { group: "Keyphrase", label: "Keyphrase in product description", ok: kp.length > 0 && body.includes(kp), pts: 5 },
                  // Meta group (30 pts)
                  { group: "Meta", label: "Meta title is set", ok: (values.metaTitle || "").trim().length > 0, pts: 5 },
                  { group: "Meta", label: "Meta title length (30–60 chars)", ok: titleLen >= 30 && titleLen <= 60, pts: 10 },
                  { group: "Meta", label: "Meta description is set", ok: values.metaDescription.trim().length > 0, pts: 5 },
                  { group: "Meta", label: "Meta description length (120–160 chars)", ok: descLen >= 120 && descLen <= 160, pts: 10 },
                  // Content group (25 pts)
                  { group: "Content", label: "Product description is set", ok: (values.description || "").replace(/<[^>]+>/g, "").trim().length > 30, pts: 10 },
                  { group: "Content", label: "Short description is set", ok: (values.shortDescription || "").replace(/<[^>]+>/g, "").trim().length > 0, pts: 5 },
                  { group: "Content", label: "Product has images", ok: productMedia.length > 0, pts: 10 },
                  // Technical group (15 pts)
                  { group: "Technical", label: "URL slug is set", ok: values.slug.trim().length > 0, pts: 5 },
                  { group: "Technical", label: "Slug is readable (lowercase, hyphens)", ok: /^[a-z0-9-]+$/.test(values.slug.trim()), pts: 5 },
                  { group: "Technical", label: "Product category is assigned", ok: !!(specDraft.profileId || values.name), pts: 5 },
                ];

                const totalScore = checks.filter((c) => c.ok).reduce((s, c) => s + c.pts, 0);
                const ringColor = totalScore >= 70 ? "#10b981" : totalScore >= 40 ? "#f59e0b" : "#ef4444";
                const label = totalScore >= 70 ? "Good" : totalScore >= 40 ? "Needs improvement" : "Poor";
                const circumference = 2 * Math.PI * 16;
                const dash = (totalScore / 100) * circumference;

                const groups = ["Keyphrase", "Meta", "Content", "Technical"] as const;

                return (
                  <>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSeoPanel(true)}
                        className="flex items-center gap-2"
                      >
                        <svg width="20" height="20" viewBox="0 0 36 36" className="shrink-0 -rotate-90">
                          <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted-foreground/20" />
                          <circle
                            cx="18" cy="18" r="16" fill="none"
                            stroke={ringColor} strokeWidth="4"
                            strokeDasharray={`${dash} ${circumference}`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="text-xs font-semibold" style={{ color: ringColor }}>{totalScore}</span>
                        <span className="text-xs text-muted-foreground">SEO Analysis</span>
                      </Button>
                    </div>

                    {/* SEO Analysis Drawer */}
                    <Sheet open={showSeoPanel} onOpenChange={setShowSeoPanel}>
                      <SheetContent
                        side="right"
                        title="SEO Analysis"
                        resizable
                        closeButton="chevron"
                        className="w-[280px] min-w-[240px] max-w-[520px] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0"
                        aria-describedby={undefined}
                      >
                        <div className="flex h-full flex-col">
                          {/* Header */}
                          <div className="flex shrink-0 items-center border-b border-border px-4 py-3 pr-10">
                            <p className="text-sm font-semibold">SEO Analysis</p>
                          </div>

                          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
                            {/* Score ring */}
                            <div className="flex items-center gap-4 rounded-none border border-input bg-card p-4">
                              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
                                <svg width="80" height="80" viewBox="0 0 36 36" className="-rotate-90">
                                  <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3.5" className="text-muted-foreground/15" />
                                  <circle
                                    cx="18" cy="18" r="14" fill="none"
                                    stroke={ringColor} strokeWidth="3.5"
                                    strokeDasharray={`${(totalScore / 100) * 2 * Math.PI * 14} ${2 * Math.PI * 14}`}
                                    strokeLinecap="round"
                                  />
                                </svg>
                                <span className="absolute text-lg font-bold" style={{ color: ringColor }}>{totalScore}</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-lg font-semibold" style={{ color: ringColor }}>{label} SEO</p>
                                <p className="text-xs text-muted-foreground">Score out of 100</p>
                                <div className="mt-2 h-2 w-full overflow-hidden rounded-none bg-muted">
                                  <div className="h-full rounded-none transition-all duration-500" style={{ width: `${totalScore}%`, background: ringColor }} />
                                </div>
                              </div>
                            </div>

                            {/* Grouped checks */}
                            <div className="space-y-4">
                              {groups.map((g) => {
                                const gc = checks.filter((c) => c.group === g);
                                const gScore = gc.filter((c) => c.ok).reduce((s, c) => s + c.pts, 0);
                                const gMax = gc.reduce((s, c) => s + c.pts, 0);
                                const gColor = gScore === gMax ? "text-emerald-500" : gScore > 0 ? "text-amber-500" : "text-red-400";
                                return (
                                  <div key={g} className="rounded-none border border-input bg-card p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</span>
                                      <span className={`text-xs font-semibold ${gColor}`}>{gScore}/{gMax} pts</span>
                                    </div>
                                    <div className="space-y-1.5">
                                      {gc.map((c) => (
                                        <div key={c.label} className="flex items-center gap-2 text-xs">
                                          <span className={c.ok ? "text-emerald-500" : "text-muted-foreground/40"}>
                                            {c.ok ? "●" : "○"}
                                          </span>
                                          <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
                                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/50">+{c.pts}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </SheetContent>
                    </Sheet>

                    <div className="grid gap-4">
                      {/* Focus Keyphrase */}
                      <div className="rounded-none border border-input bg-card p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Focus Keyphrase</span>
                        </div>
                        <input
                          type="text"
                          value={values.focusKeyphrase}
                          onChange={(e) => set("focusKeyphrase", e.target.value)}
                          placeholder="e.g. wireless headphones"
                          className="w-full rounded-none border border-input bg-background px-3 py-1.5 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        />
                      </div>

                      <Field label="Meta title">
                        <Input
                          value={values.metaTitle}
                          onChange={(e) => set("metaTitle", e.target.value)}
                          maxLength={PRODUCT_FIELD_LIMITS.seoTitle}
                        />
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {values.metaTitle.length}/{PRODUCT_FIELD_LIMITS.seoTitle}
                        </p>
                      </Field>
                      <Field label="Meta description">
                        <Textarea
                          value={values.metaDescription}
                          onChange={(e) => set("metaDescription", e.target.value)}
                          rows={3}
                          maxLength={160}
                        />
                        <p className="mt-1 text-[10px] text-muted-foreground">{values.metaDescription.length}/160</p>
                      </Field>
                      <div className="rounded-none border border-input bg-muted/20 p-3">
                        <p className="text-sm font-medium text-primary">{values.metaTitle || values.name || "Product title"}</p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          againerp.com/{values.slug || "product-slug"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {values.metaDescription || "Meta description preview…"}
                        </p>
                      </div>
                    </div>
                  </>
                );
              })()}
            </Section>
          </div>

          </div>{/* end divide-y wrapper */}
        </div>
      </div>

      {/* Mobile sticky action bar — full page only */}
      {!compact && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-input bg-background/95 p-3 backdrop-blur sm:hidden">
          <div className="flex gap-2">{actionButtons}</div>
        </div>
      )}
    </div>

      <MediaLibraryModal
        open={mediaLibraryOpen}
        onOpenChange={(open) => {
          setMediaLibraryOpen(open);
          if (open) void refetchMedia();
        }}
        items={mediaItems}
        mode="multiple"
        title="Add Media"
        accept={["image", "video"]}
        initialSelectedIds={productMedia.map((item) => item.id)}
        onSelect={(items) => {
          setProductMedia((prev) => {
            const map = new Map(prev.map((item) => [item.id, item]));
            for (const item of items) map.set(item.id, item);
            return Array.from(map.values());
          });
        }}
        onUploadFiles={async (files) => {
          const uploaded = await uploadCatalogMediaFiles(files);
          await refetchMedia();
          return uploaded;
        }}
        onImportItems={async (items) => {
          const saved = await createCatalogMediaBatch(items);
          await refetchMedia();
          return saved;
        }}
      />

      <CategoryPickDrawer
        open={listCategoryOpen}
        onOpenChange={setListCategoryOpen}
        categories={categories}
        multiple
        selectedIds={values.categoryIds}
        selectedId={values.categoryId}
        onSelect={(id, name) => {
          setValues((v) => {
            const ids = v.categoryIds.includes(id)
              ? v.categoryIds.filter((x) => x !== id)
              : [...v.categoryIds, id];
            const primary = categories.find((c) => c.id === ids[0]);
            return {
              ...v,
              categoryIds: ids,
              categoryId: ids[0] || "",
              category: primary?.name || (ids[0] === id ? name : ""),
            };
          });
        }}
        onCreate={async (parentId, name) => {
          try {
            const created = await createCatalogCategory({
              name,
              caption: name,
              parentId,
              active: true,
              channel: categoryChannel,
            });
            await refetchCategories();
            setValues((v) => {
              const ids = v.categoryIds.includes(created.id)
                ? v.categoryIds
                : [...v.categoryIds, created.id];
              const primary = categories.find((c) => c.id === ids[0]) ?? created;
              return {
                ...v,
                categoryIds: ids,
                categoryId: ids[0] || "",
                category: primary.name,
              };
            });
            toast.success("Category created");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to create category");
            throw err;
          }
        }}
        onDelete={async (node) => {
          try {
            await deleteCatalogCategory(node.id);
            const removed = new Set<string>();
            const walk = (n: typeof node) => {
              removed.add(n.id);
              n.children.forEach(walk);
            };
            walk(node);
            await refetchCategories();
            setValues((v) => {
              const ids = v.categoryIds.filter((id) => !removed.has(id));
              const primary = categories.find((c) => c.id === ids[0]);
              return {
                ...v,
                categoryIds: ids,
                categoryId: ids[0] || "",
                category: primary?.name || "",
              };
            });
            toast.success("Category deleted");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to delete category");
          }
        }}
        onRename={async (node, name) => {
          try {
            await patchCatalogCategory(node.id, { name, caption: name });
            await refetchCategories();
            setValues((v) => {
              if (!v.categoryIds.includes(node.id)) return v;
              return {
                ...v,
                category: v.categoryId === node.id ? name : v.category,
              };
            });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to rename category");
          }
        }}
      />
      <BrandPickDrawer
        open={listBrandOpen}
        onOpenChange={setListBrandOpen}
        brands={brands}
        selectedId={values.brandId}
        onSelect={(id, name) => {
          set("brandId", id);
          set("brand", name);
        }}
        onCreate={async (name) => {
          try {
            const created = await createCatalogBrand({
              name,
              slug: crypto.randomUUID(),
              active: true,
              channel: categoryChannel,
            });
            await refetchBrands();
            set("brandId", created.id);
            set("brand", created.name);
            toast.success("Brand created");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to create brand");
            throw err;
          }
        }}
        onDelete={async (brand) => {
          try {
            await deleteCatalogBrand(brand.id);
            await refetchBrands();
            setValues((v) =>
              v.brandId === brand.id ? { ...v, brandId: "", brand: "" } : v,
            );
            toast.success("Brand deleted");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to delete brand");
          }
        }}
        onRename={async (brand, name) => {
          try {
            await patchCatalogBrand(brand.id, { name });
            await refetchBrands();
            setValues((v) => (v.brandId === brand.id ? { ...v, brand: name } : v));
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to rename brand");
          }
        }}
      />
      <WarrantyPickDrawer
        open={listWarrantyOpen}
        onOpenChange={setListWarrantyOpen}
        warranties={warrantyOptions}
        selectedWarranty={values.warranty}
        onSelect={(warranty) => set("warranty", warranty)}
        onCreate={handleWarrantyCreate}
        onRename={handleWarrantyRename}
        onDelete={handleWarrantyDelete}
      />
      <OriginPickDrawer
        open={listOriginOpen}
        onOpenChange={setListOriginOpen}
        origins={originOptions}
        selectedOrigin={values.origin}
        onSelect={(origin) => set("origin", origin)}
        onCreate={(name) => {
          const trimmed = name.trim();
          if (!trimmed) return;
          addCustomOrigin(trimmed);
          setOriginOptions(buildOriginOptions(trimmed));
          set("origin", trimmed);
          toast.success("Origin added");
        }}
        onRename={(from, to) => {
          const next = to.trim();
          if (!next) return;
          renameCustomOrigin(from, next);
          setOriginOptions(buildOriginOptions(values.origin === from ? next : values.origin));
          if (values.origin === from) set("origin", next);
        }}
        onDelete={(name) => {
          const next = removeCustomOrigin(name);
          const resolved = values.origin === name ? "" : values.origin;
          setOriginOptions(next);
          if (values.origin === name) set("origin", resolved);
          toast.success("Origin deleted");
        }}
      />

      <CategoryFormDialog
        open={addCategoryOpen}
        onOpenChange={(next) => {
          setAddCategoryOpen(next);
          if (!next) setAddCategoryParentId(null);
        }}
        mode="create"
        defaultParentId={addCategoryParentId}
        categories={categories}
        onSave={async (data) => {
          try {
            const created = await createCatalogCategory({
              name: data.name ?? "",
              caption: data.caption ?? data.name ?? "",
              slug: data.slug ?? "",
              parentId: data.parentId ?? null,
              active: data.active ?? true,
              showInTopMenu: data.showInTopMenu ?? false,
              description: data.description,
              metaTitle: data.metaTitle,
              metaDescription: data.metaDescription,
              metaKeywords: data.metaKeywords,
              iconUrl: data.iconUrl,
              bannerUrl: data.bannerUrl,
              iconMediaId: data.iconMediaId,
              bannerMediaId: data.bannerMediaId,
              channel: categoryChannel,
            });
            await refetchCategories();
            setValues((v) => {
              const ids = v.categoryIds.includes(created.id)
                ? v.categoryIds
                : [...v.categoryIds, created.id];
              const primary = categories.find((c) => c.id === ids[0]) ?? created;
              return {
                ...v,
                categoryIds: ids,
                categoryId: ids[0] || "",
                category: primary.name,
              };
            });
            toast.success("Category created");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to create category");
          }
        }}
      />
      <BrandFormDialog
        open={addBrandOpen}
        onOpenChange={setAddBrandOpen}
        mode="create"
        onSave={async (data) => {
          try {
            const created = await createCatalogBrand({
              name: data.name ?? "",
              slug: data.slug ?? "",
              active: data.active ?? true,
              description: data.description,
              websiteUrl: data.websiteUrl,
              logoUrl: data.logoUrl,
              bannerUrl: data.bannerUrl,
              logoMediaId: data.logoMediaId,
              bannerMediaId: data.bannerMediaId,
              channel: categoryChannel,
            });
            await refetchBrands();
            set("brandId", created.id);
            set("brand", created.name);
            toast.success("Brand created");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to create brand");
          }
        }}
      />
      <WarrantyFormDrawer
        open={addWarrantyOpen}
        onOpenChange={setAddWarrantyOpen}
        warranties={warrantyOptions}
        selectedWarranty={values.warranty}
        onSelect={(warranty) => {
          set("warranty", warranty);
          setAddWarrantyOpen(false);
        }}
        onCreate={handleWarrantyCreate}
        onRename={handleWarrantyRename}
        onDelete={handleWarrantyDelete}
      />
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-3xl">
      {title ? <h2 className="mb-0.5 text-base font-semibold">{title}</h2> : null}
      {description ? <p className="mb-4 text-xs text-muted-foreground">{description}</p> : null}
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  labelEnd,
  className,
  children,
}: {
  label: React.ReactNode;
  required?: boolean;
  hint?: string;
  /** Status / helper text aligned to the right of the label */
  labelEnd?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[10px] font-medium text-muted-foreground">
          {label}
          {required && <span className="text-destructive"> *</span>}
          {hint && <span className="ml-1 font-normal text-muted-foreground/80">({hint})</span>}
        </Label>
        {labelEnd}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
