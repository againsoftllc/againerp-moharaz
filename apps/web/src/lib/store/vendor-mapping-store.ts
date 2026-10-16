/**
 * Canonical vendor ↔ catalog mapping (`purchase_vendor_items`).
 * Business Partners catalog UI reads via `business-partner-catalog-store.ts` (M3 facade).
 */
import { create } from "zustand";
import {
  enrichMapping,
  getMappedCountForSupplier,
  getMappingsForProduct,
  getMappingsForSupplier,
  getUnmappedCountForSupplier,
  hasProductSupplierMapping,
  createProductSupplierMapping,
  vendorMappingSeed,
  type EnrichedVendorMapping,
  type MapSupplierInput,
  type VendorProductMapping,
} from "@/lib/mock-data/vendor-product-mapping";

type VendorMappingState = {
  mappings: VendorProductMapping[];
  patchMapping: (id: string, patch: Partial<VendorProductMapping>) => void;
  upsertMapping: (data: Partial<VendorProductMapping> & { id?: string }) => void;
  mapSupplierToProduct: (input: MapSupplierInput) => { ok: true } | { ok: false; error: string };
  setPreferred: (productId: string, mappingId: string) => void;
  togglePublished: (id: string) => void;
  linkToProduct: (
    id: string,
    productId: string,
    variantId: string | null,
  ) => void;
  getForProduct: (productId: string, variantId?: string | null) => EnrichedVendorMapping[];
  getForSupplier: (supplierId: string) => EnrichedVendorMapping[];
  getMappedForSupplier: (supplierId: string) => EnrichedVendorMapping[];
  getUnmappedForSupplier: (supplierId: string) => EnrichedVendorMapping[];
  getSupplierCatalogCount: (supplierId: string) => number;
};

const today = () => new Date().toISOString().slice(0, 10);

export const useVendorMappingStore = create<VendorMappingState>()((set, get) => ({
  mappings: vendorMappingSeed,

  patchMapping: (id, patch) => {
    set((state) => ({
      mappings: state.mappings.map((m) =>
        m.id === id ? { ...m, ...patch, updatedAt: today() } : m,
      ),
    }));
  },

  upsertMapping: (data) => {
    set((state) => {
      if (data.id) {
        return {
          mappings: state.mappings.map((m) =>
            m.id === data.id ? { ...m, ...data, updatedAt: today() } : m,
          ),
        };
      }
      const created: VendorProductMapping = {
        id: `vpm_${Date.now()}`,
        supplierId: data.supplierId ?? "",
        productId: data.productId ?? null,
        variantId: data.variantId ?? null,
        vendorSku: data.vendorSku ?? "",
        vendorTitle: data.vendorTitle ?? "New vendor item",
        vendorPrice: data.vendorPrice ?? 0,
        supplierStock: data.supplierStock ?? 0,
        stockStatus: data.stockStatus ?? "unknown",
        leadTimeDays: data.leadTimeDays ?? 7,
        minOrderQty: data.minOrderQty ?? 1,
        warranty: data.warranty,
        isPreferred: data.isPreferred ?? false,
        isPublishedOnWeb: data.isPublishedOnWeb ?? false,
        isMapped: data.isMapped ?? Boolean(data.productId),
        lastSyncedAt: data.lastSyncedAt ?? null,
        updatedAt: today(),
      };
      return { mappings: [...state.mappings, created] };
    });
  },

  mapSupplierToProduct: (input) => {
    const state = get();
    if (hasProductSupplierMapping(state.mappings, input.supplierId, input.productId, input.variantId)) {
      return { ok: false, error: "This supplier is already mapped to this product variant." };
    }
    if (!input.vendorSku.trim()) {
      return { ok: false, error: "Vendor SKU is required." };
    }
    if (input.vendorPrice <= 0) {
      return { ok: false, error: "Cost price must be greater than zero." };
    }

    const hasExisting = state.mappings.some(
      (m) => m.isMapped && m.productId === input.productId,
    );
    const prefer = input.isPreferred ?? !hasExisting;
    const created = createProductSupplierMapping({ ...input, isPreferred: prefer });

    set({ mappings: [...state.mappings, created] });

    if (prefer) {
      get().setPreferred(input.productId, created.id);
    }

    return { ok: true };
  },

  setPreferred: (productId, mappingId) => {
    set((state) => ({
      mappings: state.mappings.map((m) => {
        if (m.productId !== productId || !m.isMapped) return m;
        return { ...m, isPreferred: m.id === mappingId, updatedAt: today() };
      }),
    }));
  },

  togglePublished: (id) => {
    const m = get().mappings.find((x) => x.id === id);
    if (!m?.isMapped) return;
    get().patchMapping(id, { isPublishedOnWeb: !m.isPublishedOnWeb });
  },

  linkToProduct: (id, productId, variantId) => {
    get().patchMapping(id, {
      productId,
      variantId,
      isMapped: true,
      isPublishedOnWeb: false,
    });
  },

  getForProduct: (productId, variantId) => {
    const rows = getMappingsForProduct(get().mappings, productId, variantId);
    return rows.map(enrichMapping).sort((a, b) => {
      if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
      return a.vendorPrice - b.vendorPrice;
    });
  },

  getForSupplier: (supplierId) => {
    return getMappingsForSupplier(get().mappings, supplierId).map(enrichMapping);
  },

  getMappedForSupplier: (supplierId) => {
    return get().getForSupplier(supplierId).filter((m) => m.isMapped);
  },

  getUnmappedForSupplier: (supplierId) => {
    return get().getForSupplier(supplierId).filter((m) => !m.isMapped);
  },

  getSupplierCatalogCount: (supplierId) => {
    return getMappedCountForSupplier(get().mappings, supplierId);
  },
}));

export function useUnmappedSupplierCount(supplierId: string) {
  return useVendorMappingStore((s) => getUnmappedCountForSupplier(s.mappings, supplierId));
}
