"use client";

import { useCallback, useEffect, useState } from "react";
import type { EnrichedVendorMapping, VendorProductMapping } from "@/lib/mock-data/vendor-product-mapping";
import {
  apiLinkToVendorMapping,
  apiProductToUnmappedMapping,
  deleteSupplierLink,
  enrichApiLink,
  fetchSupplierLinksByItem,
  fetchSupplierLinksBySupplier,
  fetchSupplierProducts,
  mapSupplierToItem,
  updateSupplierLink,
  updateSupplierProduct,
  type ApiSupplierLink,
  type MapSupplierInput,
} from "@/lib/api/supplier-catalog";

type UseItemSupplierLinksState = {
  mappings: VendorProductMapping[];
  enriched: EnrichedVendorMapping[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  setPreferred: (linkId: string) => Promise<void>;
  togglePublished: (linkId: string, next?: boolean) => Promise<void>;
  mapSupplier: (input: MapSupplierInput) => Promise<void>;
};

export function useItemSupplierLinks(itemId: string): UseItemSupplierLinksState {
  const [links, setLinks] = useState<ApiSupplierLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchSupplierLinksByItem(itemId);
      setLinks(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load supplier links");
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const setPreferred = useCallback(
    async (linkId: string) => {
      await updateSupplierLink(linkId, { is_preferred: true });
      await refetch();
    },
    [refetch],
  );

  const togglePublished = useCallback(
    async (linkId: string, next?: boolean) => {
      const current = links.find((l) => l.id === linkId);
      const isPublished = next ?? !current?.is_published;
      await updateSupplierLink(linkId, { is_published: isPublished });
      await refetch();
    },
    [links, refetch],
  );

  const mapSupplier = useCallback(
    async (input: MapSupplierInput) => {
      await mapSupplierToItem(input);
      await refetch();
    },
    [refetch],
  );

  const mappings = links.map(apiLinkToVendorMapping);
  const enriched = links.map(enrichApiLink);

  return { mappings, enriched, loading, error, refetch, setPreferred, togglePublished, mapSupplier };
}

type UseSupplierCatalogState = {
  mappedCatalog: EnrichedVendorMapping[];
  unmappedCatalog: VendorProductMapping[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  togglePublished: (linkId: string) => Promise<void>;
  setPreferred: (linkId: string) => Promise<void>;
  unlink: (linkId: string) => Promise<void>;
  mapToCatalog: (input: MapSupplierInput) => Promise<void>;
  updateCost: (supplierProductId: string, price: number) => Promise<void>;
};

export function useSupplierCatalog(supplierId: string): UseSupplierCatalogState {
  const [mappedCatalog, setMappedCatalog] = useState<EnrichedVendorMapping[]>([]);
  const [unmappedCatalog, setUnmappedCatalog] = useState<VendorProductMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!supplierId) return;
    setLoading(true);
    setError(null);
    try {
      const [linkRows, productsRes] = await Promise.all([
        fetchSupplierLinksBySupplier(supplierId),
        fetchSupplierProducts({ supplier_id: supplierId, per_page: 200 }),
      ]);
      const linkedProductIds = new Set(
        linkRows.map((l) => l.supplier_product_id).filter(Boolean) as string[],
      );
      setMappedCatalog(linkRows.map(enrichApiLink));
      setUnmappedCatalog(
        productsRes.data
          .filter((p) => p.is_active && !linkedProductIds.has(p.id))
          .map(apiProductToUnmappedMapping),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load supplier catalog");
      setMappedCatalog([]);
      setUnmappedCatalog([]);
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const togglePublished = useCallback(
    async (linkId: string) => {
      const row = mappedCatalog.find((m) => m.id === linkId);
      await updateSupplierLink(linkId, { is_published: !(row?.isPublishedOnWeb ?? false) });
      await refetch();
    },
    [mappedCatalog, refetch],
  );

  const setPreferred = useCallback(
    async (linkId: string) => {
      await updateSupplierLink(linkId, { is_preferred: true });
      await refetch();
    },
    [refetch],
  );

  const unlink = useCallback(
    async (linkId: string) => {
      await deleteSupplierLink(linkId);
      await refetch();
    },
    [refetch],
  );

  const mapToCatalog = useCallback(
    async (input: MapSupplierInput) => {
      await mapSupplierToItem(input);
      await refetch();
    },
    [refetch],
  );

  const updateCost = useCallback(
    async (supplierProductId: string, price: number) => {
      await updateSupplierProduct(supplierProductId, { supplier_price: price });
      await refetch();
    },
    [refetch],
  );

  return {
    mappedCatalog,
    unmappedCatalog,
    loading,
    error,
    refetch,
    togglePublished,
    setPreferred,
    unlink,
    mapToCatalog,
    updateCost,
  };
}
