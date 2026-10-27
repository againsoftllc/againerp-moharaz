"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { Product, ProductStatus } from "@/lib/mock-data/products";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import type { DigitalFile, ProductDetail, VariantUpsertInput } from "@/lib/api/catalog-products";
import { fetchDigitalFiles } from "@/lib/api/catalog-products";
import {
  createCatalogProduct,
  fetchCatalogProductDetail,
  fetchProductInventory,
  replaceProductMedia,
  replaceProductVariants,
  updateCatalogProduct,
  upsertProductInventory,
} from "@/lib/api/use-catalog-products";
import type { VariantDimension, VariantMatrixRow } from "@/lib/mock-data/variants";
import { useCatalogCategories, createCatalogCategory, deleteCatalogCategory, patchCatalogCategory } from "@/lib/api/use-catalog-categories";
import { useCatalogBrands, createCatalogBrand, deleteCatalogBrand, patchCatalogBrand } from "@/lib/api/use-catalog-brands";
import { useCatalogMedia, uploadCatalogMediaFiles, createCatalogMediaBatch } from "@/lib/api/use-catalog-media";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import { marginFromSelling, sellingFromMargin } from "@/lib/pricing/margin";
import { ALL_PRODUCT_FIELDS_VISIBLE, fetchProductFieldVisibility } from "@/lib/inventory/use-product-field-visibility";
import { CategoryCombobox } from "@/components/categories/category-combobox";
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { CategoryPickDrawer } from "@/components/categories/category-pick-drawer";
import { BrandCombobox } from "@/components/brands/brand-combobox";
import { BrandFormDialog } from "@/components/brands/brand-form-dialog";
import { BrandPickDrawer } from "@/components/brands/brand-pick-drawer";
import { WarrantyCombobox } from "@/components/products/warranty-combobox";
import { WarrantyFormDrawer } from "@/components/products/warranty-form-drawer";
import { WarrantyPickDrawer } from "@/components/products/warranty-pick-drawer";
import { OriginCombobox } from "@/components/products/origin-combobox";
import { OriginPickDrawer } from "@/components/products/origin-pick-drawer";
import { MediaGallery } from "@/components/products/media-gallery";
import { ProductVariantEditor } from "@/components/products/product-variant-editor";
import {
  DigitalFilesSection,
  flushPendingDigitalFiles,
  type PendingFile,
} from "@/components/products/digital-files-section";
import {
  ComboComponentsSection,
  dumpComboComponents,
  loadComboComponents,
  type ComboComponent,
} from "@/components/products/combo-components-section";
import { MediaLibraryModal } from "@/components/media/media-library-modal";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { UnitTypeCombobox } from "@/components/inventory/unit-type-combobox";
import { UnitTypePickDrawer } from "@/components/inventory/unit-type-pick-drawer";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  addUnitType,
  buildUnitTypeOptions,
  findAddedUnit,
  readDefaultUnitType,
  removeUnitType,
  renameUnitType,
  setDefaultUnitType,
} from "@/lib/inventory/unit-types";
import { cn } from "@/lib/utils";
import { ChevronDown, X } from "lucide-react";
import { clearDraft, draftAgeLabel, readDraft, writeDraft } from "@/lib/hooks/use-drawer-draft";
import { SearchDropdown } from "@/components/again/again-search-dropdown";
import { AgainFormField, AgainFormGroupTitle } from "@/components/again/again-form-sheet";
import { mapSupplierToItem, fetchSupplierLinksByItem } from "@/lib/api/supplier-catalog";
import {
  SUPPLIER_STOCK_STATUS_LABELS,
  type SupplierStockStatus,
} from "@/lib/mock-data/vendor-product-mapping";

const STOCK_STATUSES = Object.keys(SUPPLIER_STOCK_STATUS_LABELS) as SupplierStockStatus[];

/**
 * Products get created from Inventory with only the fields warehouse staff
 * actually need at intake time — no slug, tags, storefront visibility,
 * stock tracking, description, specs, or SEO. Those belong to Catalog and
 * get filled in later there; this form and the full catalog ProductForm
 * write the same underlying record (same /catalog/products create call),
 * so anything created here already shows up in Catalog and Vendors.
 */

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "product"
  );
}

const PRODUCT_TYPES = ["simple", "variable", "combo"] as const;

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
  variants: ProductDetail["variants"],
): VariantMatrixRow[] {
  return variants.map((v) => ({
    id: v.id,
    label: v.name,
    sku: v.sku,
    price: parseFloat(v.price) || 0,
    purchasePrice: v.purchase_price ? parseFloat(v.purchase_price) || 0 : 0,
    stock: v.stock,
    isDefault: v.is_default,
    dimensions: parseVariantOptions(v.options_json),
    imageId: v.image_id ?? undefined,
    imageUrl: v.image_url ?? undefined,
    status: v.status === "draft" ? "draft" : "published",
  }));
}

function mediaLinksToGallery(links: ProductDetail["mediaLinks"]): MediaLibraryItem[] {
  return links.map((m) => ({
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
  }));
}

function rowsToVariantUpserts(rows: VariantMatrixRow[]): VariantUpsertInput[] {
  return rows.map((row, idx) => ({
    id: row.id.startsWith("new_") ? undefined : row.id,
    sku: row.sku.trim(),
    name: row.label.trim(),
    price: row.price,
    purchase_price: row.purchasePrice || null,
    stock: row.stock,
    status: (row.status === "draft" ? "draft" : "published") as ProductStatus,
    is_default: row.isDefault,
    sort_order: idx,
    image_id: row.imageId ?? null,
    options_json: Object.keys(row.dimensions).length ? JSON.stringify(row.dimensions) : null,
  }));
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the same drawer edits this product with the inventory field set. */
  productId?: string | null;
  /** Raise z-index when opened over another sheet (e.g. purchase order drawer). */
  nested?: boolean;
  onSaved?: (product: Product) => void;
  /** Create from a supplier catalog — lock mapping to this supplier. */
  supplierLink?: {
    supplierId: string;
    supplierName?: string;
    leadTimeDays?: number;
  };
};

// Create mode only — see docs/ERP-UI-COMMON.md #10. Scoped to the core fields
// (not media/variants/digital files — not JSON-safe or low accidental-loss risk).
const DRAFT_KEY = "product-quick-add";

type QuickAddDraftPayload = {
  name: string;
  sku: string;
  model: string;
  categoryId: string;
  categoryIds: string[];
  categoryName: string;
  brandId: string;
  brandName: string;
  warranty: string;
  origin: string;
  trackingType: "none" | "serial" | "batch";
  alertQuantity: string;
  unitType: string;
  productType: (typeof PRODUCT_TYPES)[number] | "digital";
  purchasePrice: string;
  price: string;
  lastSellingPrice: string;
  shortDescription: string;
  barcodeType: string;
  locationIds: string[];
  trackQuantity: boolean;
  notForSelling: boolean;
  weight: string;
  taxRate: string;
  taxType: string;
};

export function InventoryProductQuickAdd({
  open,
  onOpenChange,
  productId,
  nested = false,
  onSaved,
  supplierLink,
}: Props) {
  const { categories, refetch: refetchCategories } = useCatalogCategories({ channel: "catalog" });
  const { brands, refetch: refetchBrands } = useCatalogBrands({ channel: "catalog" });
  const { items: mediaItems, refetch: refetchMedia } = useCatalogMedia();
  const { warehouses } = useInventoryWarehouses(open);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [model, setModel] = useState("");
  const [remarks, setRemarks] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [brandName, setBrandName] = useState("");
  const [warranty, setWarranty] = useState("");
  const [origin, setOrigin] = useState("");
  const [trackingType, setTrackingType] = useState<"none" | "serial" | "batch">("none");
  const [alertQuantity, setAlertQuantity] = useState("");
  const [unitType, setUnitType] = useState("");
  const [barcodeType, setBarcodeType] = useState("C128");
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [trackQuantity, setTrackQuantity] = useState(true);
  const [notForSelling, setNotForSelling] = useState(false);
  const [weight, setWeight] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [taxType, setTaxType] = useState("exclusive");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationOpen, setLocationOpen] = useState(false);
  const locationAnchorRef = useRef<HTMLDivElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [unitTypeOptions, setUnitTypeOptions] = useState(() => buildUnitTypeOptions());
  const [defaultUnitType, setDefaultUnitTypeState] = useState(() => readDefaultUnitType());
  const [productType, setProductType] = useState<(typeof PRODUCT_TYPES)[number] | "digital">("simple");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [price, setPrice] = useState("");
  const [margin, setMargin] = useState("");
  const [lastSellingPrice, setLastSellingPrice] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [productMedia, setProductMedia] = useState<MediaLibraryItem[]>([]);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [variantRows, setVariantRows] = useState<VariantMatrixRow[]>([]);
  const [variantAttributes, setVariantAttributes] = useState<VariantDimension[]>([]);
  const [digitalFiles, setDigitalFiles] = useState<DigitalFile[]>([]);
  const [pendingDigitalFiles, setPendingDigitalFiles] = useState<PendingFile[]>([]);
  const [comboComponents, setComboComponents] = useState<ComboComponent[]>([]);

  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addCategoryParentId, setAddCategoryParentId] = useState<string | null>(null);
  const [addBrandOpen, setAddBrandOpen] = useState(false);
  const [addWarrantyOpen, setAddWarrantyOpen] = useState(false);
  const [listCategoryOpen, setListCategoryOpen] = useState(false);
  const [listBrandOpen, setListBrandOpen] = useState(false);
  const [listWarrantyOpen, setListWarrantyOpen] = useState(false);
  const [warrantyListTarget, setWarrantyListTarget] = useState<"product" | "supplier">("product");
  const [listOriginOpen, setListOriginOpen] = useState(false);
  const [listUnitTypeOpen, setListUnitTypeOpen] = useState(false);
  const [openingStockOpen, setOpeningStockOpen] = useState(false);
  const [openingStockQty, setOpeningStockQty] = useState("");
  // Serial-tracked items: opening stock is a list of units, one serial per line.
  const [openingSerialsText, setOpeningSerialsText] = useState("");
  const [openingGenerateCount, setOpeningGenerateCount] = useState("");
  const [openingWarehouseId, setOpeningWarehouseId] = useState("");
  const openingStockRef = useRef<HTMLDivElement>(null);
  const {
    rows: warrantyRows,
    warranties: warrantyNames,
    refetch: refetchWarranties,
  } = useCatalogWarranties();
  const [originOptions, setOriginOptions] = useState<string[]>(() => buildOriginOptions());
  const [saving, setSaving] = useState(false);
  /** Set right after "Save & Add opening stock" — the drawer stays open on the
   * just-created product so more stock can be added, but the main form is
   * locked (it's no longer a draft-in-progress; further edits belong in a
   * real edit flow) until "Done" is clicked. */
  const [savedProductId, setSavedProductId] = useState<string | null>(null);
  const [existingSlug, setExistingSlug] = useState("");
  const [supplierSku, setSupplierSku] = useState("");
  const [supplierTitle, setSupplierTitle] = useState("");
  const [supplierPrice, setSupplierPrice] = useState("");
  const [supplierStock, setSupplierStock] = useState("");
  const [supplierStockStatus, setSupplierStockStatus] = useState<SupplierStockStatus>("in_stock");
  const [supplierLeadDays, setSupplierLeadDays] = useState("7");
  const [supplierMoq, setSupplierMoq] = useState("1");
  const [supplierWarranty, setSupplierWarranty] = useState("");
  const [supplierPreferred, setSupplierPreferred] = useState(false);
  const [restoredDraftAt, setRestoredDraftAt] = useState<string | null>(null);
  const [fieldVisibility, setFieldVisibility] = useState(ALL_PRODUCT_FIELDS_VISIBLE);
  const isEdit = Boolean(productId);

  const locationMatches = useMemo(() => {
    const q = locationQuery.trim().toLowerCase();
    return warehouses
      .filter((w) => !locationIds.includes(w.id))
      .filter((w) => !q || w.name.toLowerCase().includes(q))
      .slice(0, 20)
      .map((w) => ({ id: w.id, primary: w.name }));
  }, [warehouses, locationIds, locationQuery]);

  const warrantyOptions = useMemo(() => {
    const current = warranty.trim();
    if (!current) return warrantyNames;
    return warrantyNames.some((n) => n.toLowerCase() === current.toLowerCase())
      ? warrantyNames
      : [...warrantyNames, current];
  }, [warrantyNames, warranty]);

  const handleWarrantyCreate = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        await createCatalogWarranty(trimmed);
        await refetchWarranties();
        setWarranty(trimmed);
        toast.success("Warranty added");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add warranty");
      }
    },
    [refetchWarranties],
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
        setWarranty((current) => (current === from ? next : current));
        setSupplierWarranty((current) => (current === from ? next : current));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to rename warranty");
      }
    },
    [warrantyRows, refetchWarranties],
  );

  const handleWarrantyDelete = useCallback(
    async (name: string) => {
      const row = warrantyRows.find((r) => r.name.toLowerCase() === name.toLowerCase());
      if (!row) return;
      try {
        await deleteCatalogWarranty(row.id);
        const remaining = warrantyRows.filter((r) => r.id !== row.id);
        await refetchWarranties();
        setWarranty((current) => (current === name ? remaining[0]?.name ?? "" : current));
        setSupplierWarranty((current) => (current === name ? "" : current));
        toast.success("Warranty deleted");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete warranty");
      }
    },
    [warrantyRows, refetchWarranties],
  );

  function reset() {
    setSavedProductId(null);
    setName("");
    setSku("");
    setModel("");
    setCategoryId("");
    setCategoryIds([]);
    setCategoryName("");
    setBrandId("");
    setBrandName("");
    setWarranty("");
    setOrigin("");
    setTrackingType("none");
    setAlertQuantity("");
    setBarcodeType("C128");
    setLocationIds([]);
    setLocationQuery("");
    setLocationOpen(false);
    setTrackQuantity(true);
    setNotForSelling(false);
    setWeight("");
    setTaxRate("");
    setTaxType("exclusive");
    setUnitType(readDefaultUnitType());
    setUnitTypeOptions(buildUnitTypeOptions());
    setDefaultUnitTypeState(readDefaultUnitType());
    setOriginOptions(buildOriginOptions());
    setProductType("simple");
    setPurchasePrice("");
    setPrice("");
    setMargin("");
    setLastSellingPrice("");
    setShortDescription("");
    setProductMedia([]);
    setVariantRows([]);
    setVariantAttributes([]);
    setDigitalFiles([]);
    setPendingDigitalFiles([]);
    setComboComponents([]);
    setExistingSlug("");
    setOpeningStockOpen(false);
    setOpeningStockQty("");
    setOpeningWarehouseId("");
    setSupplierSku("");
    setSupplierTitle("");
    setSupplierPrice("");
    setSupplierStock("");
    setSupplierStockStatus("in_stock");
    setSupplierLeadDays(String(supplierLink?.leadTimeDays ?? 7));
    setSupplierMoq("1");
    setSupplierWarranty("");
    setSupplierPreferred(false);
  }

  useEffect(() => {
    if (!open) return;
    void fetchProductFieldVisibility().then(setFieldVisibility);
    if (!productId) {
      reset();
      const draft = readDraft<QuickAddDraftPayload>(DRAFT_KEY);
      if (draft) {
        const v = draft.values;
        setName(v.name);
        setSku(v.sku);
        setModel(v.model);
        setCategoryId(v.categoryId);
        setCategoryIds(v.categoryIds);
        setCategoryName(v.categoryName);
        setBrandId(v.brandId);
        setBrandName(v.brandName);
        setWarranty(v.warranty);
        setOrigin(v.origin);
        setTrackingType(v.trackingType);
        setAlertQuantity(v.alertQuantity);
        setUnitType(v.unitType);
        setProductType(v.productType);
        setPurchasePrice(v.purchasePrice);
        setPrice(v.price);
        setMargin(
          Number(v.purchasePrice) > 0 && Number(v.price) > 0
            ? String(marginFromSelling(Number(v.purchasePrice), Number(v.price)))
            : "",
        );
        setLastSellingPrice(v.lastSellingPrice);
        setShortDescription(v.shortDescription);
        setBarcodeType(v.barcodeType || "C128");
        setLocationIds(v.locationIds ?? []);
        setTrackQuantity(v.trackQuantity ?? true);
        setNotForSelling(v.notForSelling ?? false);
        setWeight(v.weight ?? "");
        setTaxRate(v.taxRate ?? "");
        setTaxType(v.taxType || "exclusive");
        setRestoredDraftAt(draft.savedAt);
      } else {
        setRestoredDraftAt(null);
      }
      return;
    }
    reset();
    let cancelled = false;
    void (async () => {
      try {
        const detail = await fetchCatalogProductDetail(productId);
        if (cancelled) return;
        setName(detail.name ?? "");
        setSku(detail.sku ?? "");
        setModel(detail.model ?? "");
        setRemarks(detail.remarks ?? "");
        const loadedIds =
          detail.categoryIds?.length
            ? detail.categoryIds
            : detail.categoryId
              ? [detail.categoryId]
              : [];
        setCategoryIds(loadedIds);
        setCategoryId(loadedIds[0] ?? "");
        setCategoryName(
          categories.find((c) => c.id === loadedIds[0])?.name ?? detail.category ?? "",
        );
        setBrandId(detail.brandId ?? "");
        setBrandName(detail.brand ?? "");
        const loadedWarranty = detail.warranty?.trim() ?? "";
        setWarranty(loadedWarranty);
        const loadedOrigin = detail.origin?.trim() ?? "";
        setOrigin(loadedOrigin);
        setOriginOptions(buildOriginOptions(loadedOrigin));
        setTrackingType(detail.trackingType ?? (detail.trackSerial ? "serial" : "none"));
        setAlertQuantity(detail.alertQuantity ? String(detail.alertQuantity) : "");
        setBarcodeType(detail.barcodeType || "C128");
        setLocationIds(detail.locationIds ?? []);
        setTrackQuantity(detail.trackQuantity ?? true);
        setNotForSelling(detail.notForSelling ?? false);
        setWeight(detail.weight ?? "");
        setTaxRate(detail.taxRate != null ? String(detail.taxRate) : "");
        setTaxType(detail.taxType || "exclusive");
        const loadedUnit = detail.unitType?.trim() || readDefaultUnitType();
        setUnitType(loadedUnit);
        setUnitTypeOptions(buildUnitTypeOptions(loadedUnit));
        setDefaultUnitTypeState(readDefaultUnitType());
        setProductType(detail.productType ?? "simple");
        setPurchasePrice(detail.purchasePrice != null ? String(detail.purchasePrice) : "");
        setPrice(detail.price != null ? String(detail.price) : "");
        setMargin(
          detail.purchasePrice && detail.price
            ? String(marginFromSelling(Number(detail.purchasePrice), Number(detail.price)))
            : "",
        );
        setLastSellingPrice(detail.lastSellingPrice != null ? String(detail.lastSellingPrice) : "");
        setShortDescription(detail.shortDescription ?? "");
        setProductMedia(mediaLinksToGallery(detail.mediaLinks ?? []));
        setVariantRows(variantsToRows(detail.variants ?? []));
        setExistingSlug(detail.slug ?? "");
        try {
          const parsed = detail.variantAttributesJson
            ? (JSON.parse(detail.variantAttributesJson) as unknown)
            : [];
          setVariantAttributes(Array.isArray(parsed) ? (parsed as VariantDimension[]) : []);
        } catch {
          setVariantAttributes([]);
        }
        if (detail.productType === "digital") {
          const files = await fetchDigitalFiles(detail.id).catch(() => []);
          if (!cancelled) setDigitalFiles(files);
        } else {
          setDigitalFiles([]);
        }
        setComboComponents(loadComboComponents(detail.comboComponentsJson));
        const inv = await fetchProductInventory(productId).catch(() => null);
        if (!cancelled && inv) {
          setOpeningStockQty(String(inv.onHand));
          setOpeningWarehouseId(inv.warehouseId);
        }
        if (supplierLink?.supplierId) {
          const links = await fetchSupplierLinksByItem(productId).catch(() => []);
          const link = links.find((row) => row.supplier_id === supplierLink.supplierId);
          if (!cancelled && link) {
            setSupplierSku(link.supplier_sku ?? "");
            setSupplierTitle(link.supplier_title ?? "");
            setSupplierPrice(link.supplier_price != null ? String(link.supplier_price) : "");
            setSupplierStock(link.supplier_stock != null ? String(link.supplier_stock) : "");
            const status = link.stock_status;
            setSupplierStockStatus(
              status === "in_stock" || status === "low" || status === "out" || status === "unknown"
                ? status
                : "in_stock",
            );
            setSupplierLeadDays(
              link.lead_time_days != null
                ? String(link.lead_time_days)
                : String(supplierLink.leadTimeDays ?? 7),
            );
            setSupplierMoq(link.min_order_qty != null ? String(link.min_order_qty) : "1");
            setSupplierWarranty(link.warranty ?? "");
            setSupplierPreferred(Boolean(link.is_preferred));
          }
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Could not load product");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, productId, supplierLink?.supplierId]);

  const toastedDraftRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !restoredDraftAt || toastedDraftRef.current === restoredDraftAt) return;
    toastedDraftRef.current = restoredDraftAt;
    toast.info(`Restored unsaved product draft from ${draftAgeLabel(restoredDraftAt)}`, {
      action: {
        label: "Discard",
        onClick: () => {
          clearDraft(DRAFT_KEY);
          reset();
        },
      },
    });
  }, [open, restoredDraftAt]);

  const saveDraftIfDirty = () => {
    if (isEdit || savedProductId) return;
    const dirty =
      name.trim() ||
      sku.trim() ||
      model.trim() ||
      categoryId ||
      brandId ||
      warranty.trim() ||
      origin.trim() ||
      alertQuantity.trim() ||
      purchasePrice.trim() ||
      price.trim() ||
      lastSellingPrice.trim() ||
      shortDescription.trim() ||
      weight.trim() ||
      taxRate.trim() ||
      locationIds.length > 0;
    if (!dirty) return;
    writeDraft<QuickAddDraftPayload>(DRAFT_KEY, {
      name,
      sku,
      model,
      categoryId,
      categoryIds,
      categoryName,
      brandId,
      brandName,
      warranty,
      origin,
      trackingType,
      alertQuantity,
      unitType,
      productType,
      purchasePrice,
      price,
      lastSellingPrice,
      shortDescription,
      barcodeType,
      locationIds,
      trackQuantity,
      notForSelling,
      weight,
      taxRate,
      taxType,
    });
  };

  const blocked = !name.trim();
  const serialOpening = trackingType === "serial";
  // One serial per line; blanks and repeats within the paste are dropped (case-insensitive).
  const openingSerials = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of openingSerialsText.split(/\r?\n/)) {
      const sn = raw.trim();
      if (!sn) continue;
      const key = sn.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(sn);
    }
    return out;
  }, [openingSerialsText]);
  const openingSerialDuplicates =
    openingSerialsText.split(/\r?\n/).filter((l) => l.trim()).length - openingSerials.length;
  const parsedOpeningQty = serialOpening ? openingSerials.length : Number(openingStockQty);
  const openingStockReady = serialOpening
    ? openingSerials.length > 0
    : openingStockQty.trim() !== "" && Number.isFinite(parsedOpeningQty) && parsedOpeningQty >= 0;

  /** Mint placeholder serials (`auto-xxxxxxxx-n`) for shops that label units later. */
  const generateOpeningSerials = () => {
    const count = Math.floor(Number(openingGenerateCount));
    if (!Number.isFinite(count) || count <= 0) return;
    const batch = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
    const minted = Array.from({ length: Math.min(count, 500) }, (_, i) => `auto-${batch}-${i + 1}`);
    setOpeningSerialsText((prev) => (prev.trim() ? `${prev.trimEnd()}\n` : "") + minted.join("\n"));
    setOpeningGenerateCount("");
  };

  useEffect(() => {
    if (openingWarehouseId) return;
    const def =
      warehouses.find((w) => w.isDefault && w.active) ??
      warehouses.find((w) => w.active) ??
      warehouses[0];
    if (def) setOpeningWarehouseId(def.id);
  }, [warehouses, openingWarehouseId]);

  useEffect(() => {
    if (!openingStockOpen) return;
    function handleClick(e: MouseEvent) {
      if (!openingStockRef.current?.contains(e.target as Node)) setOpeningStockOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openingStockOpen]);

  useEffect(() => {
    if (!locationOpen) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (locationAnchorRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-again-search-dropdown]")) return;
      setLocationOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [locationOpen]);

  async function persistOpeningStock(targetProductId: string) {
    if (!openingStockReady) return;
    const warehouseId =
      openingWarehouseId ||
      warehouses.find((w) => w.isDefault && w.active)?.id ||
      warehouses.find((w) => w.active)?.id ||
      warehouses[0]?.id;
    if (!warehouseId) {
      toast.error("Add a warehouse first to set opening stock");
      return;
    }
    const parsedAlert = Number(alertQuantity);
    await upsertProductInventory(targetProductId, {
      warehouse_id: warehouseId,
      on_hand: Math.floor(parsedOpeningQty),
      min_qty: Number.isFinite(parsedAlert) && parsedAlert >= 0 ? Math.floor(parsedAlert) : 0,
      unit_cost: purchasePrice.trim() ? Number(purchasePrice) : 0,
      ...(serialOpening ? { serial_numbers: openingSerials } : {}),
    });
    if (serialOpening) setOpeningSerialsText("");
  }

  async function submit(publish: boolean, then: "close" | "stock" | "another" = "close") {
    if (blocked) {
      toast.error("Product name is required");
      return;
    }
    const status: ProductStatus = publish ? "published" : "draft";
    setSaving(true);
    try {
      const finalSku = sku.trim() || `SKU-${Date.now().toString().slice(-6)}`;
      const thumbnail = productMedia.find((m) => m.type === "image")?.url;
      const parsedAlert = Number(alertQuantity);
      const payload = {
        name: name.trim(),
        sku: finalSku,
        model: model.trim() || null,
        remarks: remarks.trim() ? remarks.trim().slice(0, 2000) : isEdit ? null : undefined,
        price: Number(price) || 0,
        purchase_price: purchasePrice.trim() ? Number(purchasePrice) : undefined,
        last_selling_price: lastSellingPrice.trim() ? Number(lastSellingPrice) : undefined,
        category: categoryName || undefined,
        category_id: categoryIds[0] || categoryId || null,
        category_ids: categoryIds,
        brand: brandName || undefined,
        brand_id: brandId || null,
        warranty: warranty.trim() || null,
        origin: origin.trim() || null,
        alert_quantity: Number.isFinite(parsedAlert) && parsedAlert >= 0 ? Math.floor(parsedAlert) : 0,
        unit_type: unitType.trim() || readDefaultUnitType(),
        tracking_type: trackingType,
        barcode_type: barcodeType,
        track_quantity: trackQuantity,
        not_for_selling: notForSelling,
        weight: weight.trim() || null,
        tax_rate: taxRate.trim() ? Number(taxRate) : undefined,
        tax_type: taxType,
        location_ids: locationIds,
        status,
        product_type: productType,
        short_description: shortDescription.trim() || undefined,
        thumbnail,
        variant_attributes_json:
          productType === "variable" && variantAttributes.length > 0
            ? JSON.stringify(variantAttributes)
            : null,
        combo_components_json:
          productType === "combo" && comboComponents.length > 0
            ? dumpComboComponents(comboComponents)
            : null,
      };
      const saved = isEdit && productId
        ? await updateCatalogProduct(productId, payload)
        : await createCatalogProduct({
            ...payload,
            // Inventory-created products stay in Inventory; they reach the website only when added there.
            in_inventory: true,
            on_website: false,
            slug: existingSlug || slugify(name),
          });
      if (productType === "variable") {
        await replaceProductVariants(saved.id, rowsToVariantUpserts(variantRows));
      }
      await replaceProductMedia(
        saved.id,
        productMedia.map((m) => m.id),
      );
      if (productType === "digital" && pendingDigitalFiles.length > 0) {
        await flushPendingDigitalFiles(saved.id, pendingDigitalFiles);
        setPendingDigitalFiles([]);
      }
      await persistOpeningStock(saved.id);
      if (supplierLink?.supplierId) {
        const mappedPrice = supplierPrice.trim()
          ? Number(supplierPrice)
          : purchasePrice.trim()
            ? Number(purchasePrice)
            : 0;
        await mapSupplierToItem({
          item_id: saved.id,
          supplier_id: supplierLink.supplierId,
          supplier_sku: supplierSku.trim() || finalSku,
          supplier_title: supplierTitle.trim() || name.trim(),
          supplier_price: Number.isFinite(mappedPrice) ? mappedPrice : 0,
          supplier_stock: supplierStock.trim() ? Number(supplierStock) : undefined,
          stock_status: supplierStockStatus,
          lead_time_days: supplierLeadDays.trim()
            ? Number(supplierLeadDays)
            : (supplierLink.leadTimeDays ?? 7),
          min_order_qty: Math.max(1, Number.parseInt(supplierMoq, 10) || 1),
          warranty: supplierWarranty.trim() || warranty.trim() || undefined,
          is_preferred: supplierPreferred,
        });
      }
      onSaved?.(saved);
      if (!isEdit) clearDraft(DRAFT_KEY);
      if (then === "stock") {
        toast.success("Product saved — add opening stock");
        setSavedProductId(saved.id);
        setOpeningStockQty("");
        setOpeningStockOpen(true);
      } else if (then === "another") {
        toast.success("Product saved — add another");
        reset();
      } else {
        toast.success(
          supplierLink?.supplierId
            ? isEdit
              ? "Product saved"
              : "Product saved and mapped"
            : publish
              ? "Product published"
              : isEdit
                ? "Product saved"
                : "Product saved as draft",
        );
        reset();
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          if (!next) reset();
        }}
      >
        <SheetContent
          ref={(el) => setPortalHost(el)}
          side="right"
          title={isEdit ? "Edit product" : supplierLink ? "Add supplier product" : "Add product"}
          resizable
          resizeMaxWidth={typeof window !== "undefined" ? Math.round(window.innerWidth * 0.85) : 1400}
          closeButton="inside"
          onPointerDownOutside={() => saveDraftIfDirty()}
          onInteractOutside={() => saveDraftIfDirty()}
          onEscapeKeyDown={() => saveDraftIfDirty()}
          className={
            nested
              ? "z-[260] w-full min-w-[320px] max-w-none gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0 md:w-1/2 md:min-w-[420px]"
              : "w-full min-w-[320px] max-w-none gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0 md:w-1/2 md:min-w-[420px]"
          }
          aria-describedby={undefined}
        >
          <div className="flex h-full min-h-0 flex-col px-4 pb-4 pt-3">
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-input pb-2">
                <div className="pr-8">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex shrink-0 items-center gap-1">
                      {savedProductId ? (
                        <>
                          <span className="text-[11px] text-muted-foreground">
                            Product saved — add opening stock, then:
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 rounded-none px-2 text-[11px]"
                            onClick={() => {
                              reset();
                              onOpenChange(false);
                            }}
                          >
                            Done
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            className="h-6 rounded-none px-2 text-[11px]"
                            onClick={() => void submit(false, "close")}
                            disabled={saving}
                          >
                            {saving ? "Saving…" : "Save"}
                          </Button>
                          {!isEdit ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 rounded-none px-2 text-[11px]"
                              onClick={() => void submit(false, "another")}
                              disabled={saving}
                            >
                              Save &amp; Add Another
                            </Button>
                          ) : null}
                          {fieldVisibility.openingStock && productType !== "combo" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 rounded-none px-2 text-[11px]"
                              onClick={() => void submit(false, "stock")}
                              disabled={saving}
                            >
                              Save &amp; Add Opening Stock
                            </Button>
                          ) : null}
                        </>
                      )}
                      <div
                        ref={openingStockRef}
                        className={cn(
                          "relative",
                          (!fieldVisibility.openingStock || productType === "combo") && "hidden",
                        )}
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 rounded-none px-2 text-[11px]"
                          onClick={() => setOpeningStockOpen((v) => !v)}
                          disabled={saving}
                        >
                          Opening stock
                          {openingStockReady ? (
                            <span className="tabular-nums text-muted-foreground">
                              {Math.floor(parsedOpeningQty)}
                            </span>
                          ) : null}
                          <ChevronDown
                            className={cn(
                              "h-3 w-3 text-muted-foreground transition",
                              openingStockOpen && "rotate-180",
                            )}
                          />
                        </Button>
                        {openingStockOpen ? (
                          <div
                            className={cn(
                              "absolute left-0 top-full z-[80] mt-1 rounded-none border border-input bg-popover p-2 shadow-md",
                              serialOpening ? "w-[340px]" : "w-[220px]",
                            )}
                          >
                            {serialOpening ? (
                              <>
                                <Label className="text-[10px] font-medium text-muted-foreground">
                                  Serial numbers — one per line (scan or paste)
                                  {isEdit || savedProductId ? " · adds to current stock" : ""}
                                </Label>
                                <Textarea
                                  className="mt-1 min-h-[104px] font-mono text-[12px]"
                                  autoFocus
                                  value={openingSerialsText}
                                  onChange={(e) => setOpeningSerialsText(e.target.value)}
                                  placeholder={"auto-muh71iez-1\nauto-muh71iez-2"}
                                  spellCheck={false}
                                  data-testid="opening-serials"
                                />
                                <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                                  <span className="tabular-nums text-muted-foreground">
                                    {openingSerials.length
                                      ? `${openingSerials.length} serial${openingSerials.length === 1 ? "" : "s"} → ${openingSerials.length} unit${openingSerials.length === 1 ? "" : "s"}`
                                      : "Each line becomes one unit in stock"}
                                    {openingSerialDuplicates > 0 ? (
                                      <span className="ml-1 text-amber-600 dark:text-amber-400">
                                        · {openingSerialDuplicates} repeated line{openingSerialDuplicates === 1 ? "" : "s"} ignored
                                      </span>
                                    ) : null}
                                  </span>
                                </div>
                                <div className="mt-2 flex items-center gap-1">
                                  <Input
                                    className="h-7 w-[88px]"
                                    type="number"
                                    min={1}
                                    inputMode="numeric"
                                    value={openingGenerateCount}
                                    onChange={(e) => setOpeningGenerateCount(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        generateOpeningSerials();
                                      }
                                    }}
                                    placeholder="Qty"
                                    aria-label="Number of serials to generate"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 rounded-none px-2 text-[11px]"
                                    onClick={generateOpeningSerials}
                                    disabled={!Number(openingGenerateCount)}
                                  >
                                    Generate serials
                                  </Button>
                                  <span className="text-[10px] text-muted-foreground">no printed serial? label later</span>
                                </div>
                              </>
                            ) : (
                              <>
                                <Label className="text-[10px] font-medium text-muted-foreground">
                                  Add qty {isEdit || savedProductId ? "(adds to current stock)" : ""}
                                </Label>
                                <Input
                                  className="mt-1"
                                  type="number"
                                  min={0}
                                  inputMode="numeric"
                                  autoFocus
                                  value={openingStockQty}
                                  onChange={(e) => setOpeningStockQty(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void (async () => {
                                        if (productId) {
                                          try {
                                            await persistOpeningStock(productId);
                                            toast.success("Opening stock saved");
                                          } catch (err) {
                                            toast.error(
                                              err instanceof Error ? err.message : "Failed to save opening stock",
                                            );
                                            return;
                                          }
                                        }
                                        setOpeningStockOpen(false);
                                      })();
                                    }
                                  }}
                                  placeholder="0"
                                />
                              </>
                            )}
                            {warehouses.length > 1 ? (
                              <div className="mt-2">
                                <Label className="text-[10px] font-medium text-muted-foreground">
                                  Warehouse
                                </Label>
                                <Select
                                  className="mt-1 w-full"
                                  value={openingWarehouseId}
                                  onChange={(e) => setOpeningWarehouseId(e.target.value)}
                                >
                                  {warehouses
                                    .filter((w) => w.active)
                                    .map((w) => (
                                      <option key={w.id} value={w.id}>
                                        {w.name}
                                      </option>
                                    ))}
                                </Select>
                              </div>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              className="mt-2 h-6 w-full rounded-none px-2 text-[11px]"
                              onClick={() => {
                                void (async () => {
                                  const targetId = savedProductId ?? productId;
                                  if (targetId) {
                                    try {
                                      await persistOpeningStock(targetId);
                                      toast.success("Opening stock saved");
                                      setOpeningStockQty("");
                                    } catch (err) {
                                      toast.error(
                                        err instanceof Error ? err.message : "Failed to save opening stock",
                                      );
                                      return;
                                    }
                                  }
                                  setOpeningStockOpen(false);
                                })();
                              }}
                            >
                              {(savedProductId ?? productId)
                                ? serialOpening && openingSerials.length
                                  ? `Save stock (${openingSerials.length} unit${openingSerials.length === 1 ? "" : "s"})`
                                  : "Save stock"
                                : "Add"}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      {!savedProductId ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 rounded-none px-2 text-[11px]"
                          onClick={() => {
                            if (!isEdit) clearDraft(DRAFT_KEY);
                            reset();
                            onOpenChange(false);
                          }}
                          disabled={saving}
                        >
                          Discard
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pt-3 pr-1">
                <div className="again-odoo-form @container w-full max-w-4xl space-y-5">
                  {fieldVisibility.media ? (
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
                  ) : null}

                  <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                    <AgainFormGroupTitle className="@xl:col-span-2">Product</AgainFormGroupTitle>
                    <AgainFormField label="Product name" required className="@xl:col-span-2">
                      <Input
                        id="qa-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Premium Cotton T-Shirt"
                      />
                    </AgainFormField>
                    <AgainFormField label="SKU">
                      <Input
                        id="qa-sku"
                        value={sku}
                        onChange={(e) => setSku(e.target.value)}
                        placeholder="Auto-generated if blank"
                      />
                    </AgainFormField>
                    <AgainFormField label="Model">
                      <Input id="qa-model" value={model} onChange={(e) => setModel(e.target.value)} />
                    </AgainFormField>
                    {fieldVisibility.barcodeType ? (
                      <AgainFormField label="Barcode type">
                        <FilterSelect
                          value={barcodeType}
                          onChange={setBarcodeType}
                          width="w-full"
                          ariaLabel="Barcode type"
                          options={[
                            { value: "C128", label: "Code 128 (C128)" },
                            { value: "C39", label: "Code 39 (C39)" },
                            { value: "EAN13", label: "EAN-13" },
                            { value: "EAN8", label: "EAN-8" },
                            { value: "UPCA", label: "UPC-A" },
                            { value: "UPCE", label: "UPC-E" },
                          ]}
                        />
                      </AgainFormField>
                    ) : null}
                    {fieldVisibility.category ? (
                      <AgainFormField label="Category">
                        <CategoryCombobox
                          multiple
                          categories={categories}
                          values={categoryIds}
                          onChange={(ids) => {
                            const primary = categories.find((c) => c.id === ids[0]);
                            setCategoryIds(ids);
                            setCategoryId(ids[0] || "");
                            setCategoryName(primary?.name || "");
                          }}
                          onList={() => setListCategoryOpen(true)}
                          className="w-full"
                        />
                      </AgainFormField>
                    ) : null}
                    {fieldVisibility.brand ? (
                      <AgainFormField label="Brand">
                        <BrandCombobox
                          brands={brands}
                          value={brandId}
                          onChange={(id, bName) => {
                            setBrandId(id);
                            setBrandName(bName);
                          }}
                          onList={() => setListBrandOpen(true)}
                          className="w-full"
                        />
                      </AgainFormField>
                    ) : null}
                    {fieldVisibility.warranty ? (
                      <AgainFormField label="Warranty">
                        <WarrantyCombobox
                          options={warrantyOptions}
                          value={warranty}
                          onChange={setWarranty}
                          onList={() => {
                            setWarrantyListTarget("product");
                            setListWarrantyOpen(true);
                          }}
                          className="w-full"
                        />
                      </AgainFormField>
                    ) : null}
                    {fieldVisibility.origin ? (
                      <AgainFormField label="Origin">
                        <OriginCombobox
                          options={originOptions}
                          value={origin}
                          onChange={setOrigin}
                          onList={() => setListOriginOpen(true)}
                          className="w-full"
                        />
                      </AgainFormField>
                    ) : null}
                    <AgainFormGroupTitle className="@xl:col-span-2">Inventory</AgainFormGroupTitle>
                    {fieldVisibility.manageStock ? (
                      <AgainFormField label="Manage stock">
                        <label className="flex h-8 items-center gap-2 border-b border-border/50 px-0.5 text-xs">
                          <input
                            type="checkbox"
                            checked={trackQuantity}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setTrackQuantity(checked);
                              if (!checked) setAlertQuantity("0");
                            }}
                            aria-label="Manage stock"
                          />
                          Track quantity
                        </label>
                      </AgainFormField>
                    ) : null}
                    {fieldVisibility.notForSelling ? (
                      <AgainFormField label="Not for selling">
                        <label className="flex h-8 items-center gap-2 border-b border-border/50 px-0.5 text-xs">
                          <input
                            type="checkbox"
                            checked={notForSelling}
                            onChange={(e) => setNotForSelling(e.target.checked)}
                            aria-label="Not for selling"
                          />
                          Hide from POS
                        </label>
                      </AgainFormField>
                    ) : null}
                    {fieldVisibility.alertQuantity && trackQuantity ? (
                      <AgainFormField label="Alert quantity">
                        <Input
                          id="qa-alert-qty"
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={alertQuantity}
                          onChange={(e) => setAlertQuantity(e.target.value)}
                          placeholder="0"
                        />
                      </AgainFormField>
                    ) : null}
                    {fieldVisibility.unitType ? (
                      <AgainFormField label="Unit type">
                        <UnitTypeCombobox
                          options={unitTypeOptions}
                          value={unitType}
                          defaultValue={defaultUnitType}
                          onChange={setUnitType}
                          onList={() => setListUnitTypeOpen(true)}
                          className="w-full"
                        />
                      </AgainFormField>
                    ) : null}
                    {fieldVisibility.tracking ? (
                      <AgainFormField label="Tracking">
                        <FilterSelect
                          value={trackingType}
                          onChange={(v) => setTrackingType(v as "none" | "serial" | "batch")}
                          width="w-full"
                          ariaLabel="Inventory tracking"
                          options={[
                            { value: "none", label: "None" },
                            { value: "serial", label: "Serial" },
                            { value: "batch", label: "Batch" },
                          ]}
                        />
                      </AgainFormField>
                    ) : null}
                    {fieldVisibility.businessLocations ? (
                      <AgainFormField label="Business locations" className="@xl:col-span-2">
                        <div className="relative" ref={locationAnchorRef}>
                          <div className="flex min-h-8 w-full flex-wrap items-center gap-1 border-b border-input bg-background px-1 py-1">
                            {locationIds.map((id) => {
                              const w = warehouses.find((wh) => wh.id === id);
                              return (
                                <span
                                  key={id}
                                  className="inline-flex items-center gap-1 border border-border px-1.5 py-0.5 text-[11px]"
                                >
                                  {w?.name ?? id}
                                  <button
                                    type="button"
                                    className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
                                    aria-label={`Remove ${w?.name ?? "location"}`}
                                    onClick={() =>
                                      setLocationIds((ids) => ids.filter((x) => x !== id))
                                    }
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              );
                            })}
                            <input
                              value={locationQuery}
                              onChange={(e) => {
                                setLocationQuery(e.target.value);
                                setLocationOpen(true);
                              }}
                              onFocus={() => setLocationOpen(true)}
                              placeholder="Add location…"
                              className="h-6 min-w-[120px] flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
                            />
                          </div>
                          <SearchDropdown
                            open={locationOpen}
                            items={locationMatches}
                            getAnchor={() => locationAnchorRef.current}
                            portalContainer={portalHost}
                            onSelect={(id) => {
                              setLocationIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
                              setLocationQuery("");
                              setLocationOpen(false);
                            }}
                          />
                        </div>
                      </AgainFormField>
                    ) : null}
                  </div>

                  <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                    <AgainFormGroupTitle className="@xl:col-span-2">Pricing</AgainFormGroupTitle>
                    {fieldVisibility.costPrice ? (
                      <AgainFormField label="Cost price">
                        <Input
                          id="qa-cost-price"
                          type="number"
                          min="0"
                          value={purchasePrice}
                          onChange={(e) => setPurchasePrice(e.target.value)}
                        />
                      </AgainFormField>
                    ) : null}
                    <AgainFormField label="Sales price">
                      <Input
                        id="qa-sales-price"
                        type="number"
                        min="0"
                        value={price}
                        onChange={(e) => {
                          const next = e.target.value;
                          setPrice(next);
                          const cost = Number(purchasePrice);
                          const selling = Number(next);
                          if (cost > 0 && selling > 0) {
                            setMargin(String(marginFromSelling(cost, selling)));
                          }
                        }}
                        placeholder="899"
                      />
                    </AgainFormField>
                    <AgainFormField label="Margin (%)">
                      <Input
                        id="qa-margin"
                        type="number"
                        value={margin}
                        onChange={(e) => {
                          const next = e.target.value;
                          setMargin(next);
                          const cost = Number(purchasePrice);
                          const marginPct = Number(next);
                          if (cost > 0 && next.trim() !== "") {
                            setPrice(String(sellingFromMargin(cost, marginPct)));
                          }
                        }}
                        placeholder={purchasePrice ? "0" : "Set cost price first"}
                        disabled={!purchasePrice}
                      />
                    </AgainFormField>
                    {fieldVisibility.lastSellingPrice ? (
                      <AgainFormField label="Last selling price">
                        <Input
                          id="qa-last-selling-price"
                          type="number"
                          min="0"
                          value={lastSellingPrice}
                          onChange={(e) => setLastSellingPrice(e.target.value)}
                        />
                      </AgainFormField>
                    ) : null}
                    {fieldVisibility.weight ? (
                      <AgainFormField label="Weight">
                        <Input
                          id="qa-weight"
                          value={weight}
                          onChange={(e) => setWeight(e.target.value)}
                          placeholder="e.g. 1.5 kg"
                        />
                      </AgainFormField>
                    ) : null}
                    {fieldVisibility.applicableTax ? (
                      <AgainFormField label="Applicable tax">
                        <Input
                          id="qa-tax-rate"
                          type="number"
                          min="0"
                          max="100"
                          value={taxRate}
                          onChange={(e) => setTaxRate(e.target.value)}
                          placeholder="0"
                        />
                      </AgainFormField>
                    ) : null}
                    {fieldVisibility.taxType ? (
                      <AgainFormField label="Selling price tax type">
                        <FilterSelect
                          value={taxType}
                          onChange={setTaxType}
                          width="w-full"
                          ariaLabel="Selling price tax type"
                          options={[
                            { value: "exclusive", label: "Exclusive" },
                            { value: "inclusive", label: "Inclusive" },
                          ]}
                        />
                      </AgainFormField>
                    ) : null}
                  </div>

                  {supplierLink && fieldVisibility.supplierMapping ? (
                    <div className="space-y-3 border border-border p-3">
                      <p className="text-xs font-semibold">Supplier</p>
                      <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                        <AgainFormField label="Supplier">
                          <Input
                            value={supplierLink.supplierName || "Supplier"}
                            disabled
                            readOnly
                          />
                        </AgainFormField>
                        <AgainFormField label="SKU">
                          <Input
                            value={supplierSku}
                            onChange={(e) => setSupplierSku(e.target.value)}
                            placeholder={sku.trim() || "From product SKU"}
                            className="font-mono"
                          />
                        </AgainFormField>
                        <AgainFormField label="Title" className="@xl:col-span-2">
                          <Input
                            value={supplierTitle}
                            onChange={(e) => setSupplierTitle(e.target.value)}
                            placeholder={name.trim() || "From product name"}
                          />
                        </AgainFormField>
                        <AgainFormField label="Price">
                          <Input
                            type="number"
                            min={0}
                            value={supplierPrice}
                            onChange={(e) => setSupplierPrice(e.target.value)}
                            placeholder={purchasePrice.trim() || "0"}
                          />
                        </AgainFormField>
                        <AgainFormField label="Stock">
                          <Input
                            type="number"
                            min={0}
                            value={supplierStock}
                            onChange={(e) => setSupplierStock(e.target.value)}
                            placeholder="0"
                          />
                        </AgainFormField>
                        <AgainFormField label="Status">
                          <Select
                            value={supplierStockStatus}
                            onChange={(e) =>
                              setSupplierStockStatus(e.target.value as SupplierStockStatus)
                            }
                            className="w-full"
                            aria-label="Supplier stock status"
                          >
                            {STOCK_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {SUPPLIER_STOCK_STATUS_LABELS[status]}
                              </option>
                            ))}
                          </Select>
                        </AgainFormField>
                        <AgainFormField label="Lead (days)">
                          <Input
                            type="number"
                            min={0}
                            value={supplierLeadDays}
                            onChange={(e) => setSupplierLeadDays(e.target.value)}
                          />
                        </AgainFormField>
                        <AgainFormField label="MOQ">
                          <Input
                            type="number"
                            min={1}
                            value={supplierMoq}
                            onChange={(e) => setSupplierMoq(e.target.value)}
                          />
                        </AgainFormField>
                        <AgainFormField label="Warranty">
                          <WarrantyCombobox
                            options={warrantyOptions}
                            value={supplierWarranty}
                            onChange={setSupplierWarranty}
                            onList={() => {
                              setWarrantyListTarget("supplier");
                              setListWarrantyOpen(true);
                            }}
                            placeholder={warranty.trim() || "Optional"}
                          />
                        </AgainFormField>
                        <AgainFormField label="Preferred">
                          <label className="flex h-8 items-center gap-2 border-b border-border/50 px-0.5 text-xs">
                            <input
                              type="checkbox"
                              checked={supplierPreferred}
                              onChange={(e) => setSupplierPreferred(e.target.checked)}
                              aria-label="Preferred supplier"
                            />
                            Default for new POs
                          </label>
                        </AgainFormField>
                      </div>
                    </div>
                  ) : null}

                  <AgainFormGroupTitle>Type</AgainFormGroupTitle>
                  <AgainFormField label="Product type">
                    <div className="odoo-keep-border flex h-8 w-full rounded-none border border-input bg-background shadow-sm">
                      {PRODUCT_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setProductType(t)}
                          className={cn(
                            "h-full flex-1 rounded-none px-2.5 text-xs font-medium capitalize",
                            productType === t
                              ? "bg-accent text-foreground"
                              : "text-muted-foreground hover:bg-accent/30",
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </AgainFormField>
                  {productType === "variable" && fieldVisibility.variants ? (
                    <div className="mt-4">
                      <ProductVariantEditor
                        productType={productType}
                        onProductTypeChange={setProductType}
                        baseSku={sku}
                        basePrice={price}
                        basePurchasePrice={purchasePrice}
                        category={categoryName}
                        rows={variantRows}
                        onRowsChange={setVariantRows}
                        dimensions={variantAttributes}
                        onDimensionsChange={setVariantAttributes}
                        galleryMedia={productMedia.filter((m) => m.type === "image")}
                      />
                    </div>
                  ) : productType === "digital" && fieldVisibility.digitalFiles ? (
                    <div className="mt-4">
                      <DigitalFilesSection
                        productId={productId ?? null}
                        files={digitalFiles}
                        onFilesChange={setDigitalFiles}
                        pendingFiles={pendingDigitalFiles}
                        onPendingFilesChange={setPendingDigitalFiles}
                      />
                    </div>
                  ) : productType === "combo" ? (
                    <div className="mt-4">
                      <ComboComponentsSection
                        components={comboComponents}
                        onComponentsChange={setComboComponents}
                        onApplyCostPrice={(total) => setPurchasePrice(total ? String(total) : "")}
                      />
                    </div>
                  ) : null}

                  <AgainFormGroupTitle>Description</AgainFormGroupTitle>
                  {fieldVisibility.shortDescription ? (
                    <div className="grid gap-x-8 gap-y-0 @xl:grid-cols-2">
                      <AgainFormField label="Short description" className="@xl:col-span-2">
                        <Textarea
                          id="qa-short-desc"
                          rows={3}
                          value={shortDescription}
                          onChange={(e) => setShortDescription(e.target.value)}
                        />
                      </AgainFormField>
                    </div>
                  ) : null}

                  <AgainFormField label="Remarks" hint="Internal note — staff only, not shown on the website.">
                    <Textarea
                      id="qa-remarks"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="e.g. Box damaged on arrival, check before sale"
                      rows={2}
                      maxLength={2000}
                    />
                  </AgainFormField>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <MediaLibraryModal
        open={mediaLibraryOpen}
        onOpenChange={(next) => {
          setMediaLibraryOpen(next);
          if (next) void refetchMedia();
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
        selectedIds={categoryIds}
        selectedId={categoryIds[0] || categoryId}
        onSelect={(id, catName) => {
          setCategoryIds((prev) => {
            const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
            const primary = categories.find((c) => c.id === next[0]);
            setCategoryId(next[0] || "");
            setCategoryName(primary?.name || (next[0] === id ? catName : ""));
            return next;
          });
        }}
        onCreate={async (parentId, name) => {
          try {
            const created = await createCatalogCategory({
              name,
              caption: name,
              parentId,
              active: true,
              channel: "catalog",
            });
            await refetchCategories();
            setCategoryIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
            setCategoryId((prev) => prev || created.id);
            setCategoryName((prev) => prev || created.name);
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
            setCategoryIds((prev) => {
              const next = prev.filter((id) => !removed.has(id));
              const primary = categories.find((c) => c.id === next[0]);
              setCategoryId(next[0] || "");
              setCategoryName(primary?.name || "");
              return next;
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
            if (categoryId === node.id) setCategoryName(name);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to rename category");
          }
        }}
      />
      <BrandPickDrawer
        open={listBrandOpen}
        onOpenChange={setListBrandOpen}
        brands={brands}
        selectedId={brandId}
        onSelect={(id, bName) => {
          setBrandId(id);
          setBrandName(bName);
        }}
        onCreate={async (name) => {
          try {
            const created = await createCatalogBrand({
              name,
              slug: crypto.randomUUID(),
              active: true,
              channel: "catalog",
            });
            await refetchBrands();
            setBrandId(created.id);
            setBrandName(created.name);
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
            if (brandId === brand.id) {
              setBrandId("");
              setBrandName("");
            }
            toast.success("Brand deleted");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to delete brand");
          }
        }}
        onRename={async (brand, name) => {
          try {
            await patchCatalogBrand(brand.id, { name });
            await refetchBrands();
            if (brandId === brand.id) setBrandName(name);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to rename brand");
          }
        }}
      />
      <WarrantyPickDrawer
        open={listWarrantyOpen}
        onOpenChange={setListWarrantyOpen}
        warranties={warrantyOptions}
        selectedWarranty={warrantyListTarget === "supplier" ? supplierWarranty : warranty}
        onSelect={warrantyListTarget === "supplier" ? setSupplierWarranty : setWarranty}
        onCreate={handleWarrantyCreate}
        onRename={handleWarrantyRename}
        onDelete={handleWarrantyDelete}
      />
      <OriginPickDrawer
        open={listOriginOpen}
        onOpenChange={setListOriginOpen}
        origins={originOptions}
        selectedOrigin={origin}
        onSelect={setOrigin}
        onCreate={(name) => {
          const trimmed = name.trim();
          if (!trimmed) return;
          addCustomOrigin(trimmed);
          setOriginOptions(buildOriginOptions(trimmed));
          setOrigin(trimmed);
          toast.success("Origin added");
        }}
        onRename={(from, to) => {
          const next = to.trim();
          if (!next) return;
          renameCustomOrigin(from, next);
          setOriginOptions(buildOriginOptions(origin === from ? next : origin));
          if (origin === from) setOrigin(next);
        }}
        onDelete={(name) => {
          const next = removeCustomOrigin(name);
          const resolved = origin === name ? "" : origin;
          setOriginOptions(next);
          if (origin === name) setOrigin(resolved);
          toast.success("Origin deleted");
        }}
      />
      <UnitTypePickDrawer
        open={listUnitTypeOpen}
        onOpenChange={setListUnitTypeOpen}
        units={unitTypeOptions}
        selectedValue={unitType}
        defaultValue={defaultUnitType}
        onSelect={setUnitType}
        onSetDefault={(value) => {
          const next = setDefaultUnitType(value);
          setDefaultUnitTypeState(next);
          toast.success("Default unit updated");
        }}
        onCreate={(name) => {
          const trimmed = name.trim();
          if (!trimmed) return;
          addUnitType(trimmed);
          const created = findAddedUnit(trimmed);
          const options = buildUnitTypeOptions(created?.value ?? unitType);
          setUnitTypeOptions(options);
          setDefaultUnitTypeState(readDefaultUnitType());
          if (created) setUnitType(created.value);
          toast.success("Unit type added");
        }}
        onRename={(value, label) => {
          const next = label.trim();
          if (!next) return;
          renameUnitType(value, next);
          setUnitTypeOptions(buildUnitTypeOptions(unitType));
        }}
        onDelete={(value) => {
          const before = unitTypeOptions.length;
          const nextList = removeUnitType(value);
          if (nextList.length === before) {
            toast.error("Keep at least one unit type");
            return;
          }
          const resolved =
            unitType === value ? readDefaultUnitType() : unitType;
          setUnitTypeOptions(buildUnitTypeOptions(resolved));
          setDefaultUnitTypeState(readDefaultUnitType());
          if (unitType === value) setUnitType(resolved);
          toast.success("Unit type deleted");
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
              channel: "catalog",
            });
            await refetchCategories();
            setCategoryIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
            setCategoryId((prev) => prev || created.id);
            setCategoryName((prev) => prev || created.name);
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
              status: data.status,
              description: data.description,
              websiteUrl: data.websiteUrl,
              logoUrl: data.logoUrl,
              bannerUrl: data.bannerUrl,
              logoMediaId: data.logoMediaId,
              bannerMediaId: data.bannerMediaId,
              channel: "catalog",
            });
            await refetchBrands();
            setBrandId(created.id);
            setBrandName(created.name);
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
        selectedWarranty={warranty}
        onSelect={(next) => {
          setWarranty(next);
          setAddWarrantyOpen(false);
        }}
        onCreate={handleWarrantyCreate}
        onRename={handleWarrantyRename}
        onDelete={handleWarrantyDelete}
      />
    </>
  );
}
