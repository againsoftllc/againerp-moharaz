"use client";

import { useEffect, useState } from "react";
import type { SupplierDetail } from "@/lib/mock-data/suppliers";
import { fetchCommerceSupplier } from "@/lib/api/use-commerce-suppliers";

/** The full supplier record (PO counts, spend, performance, recent activity) for a supplier id; null while there is none. */
export function useCommerceSupplierDetail(supplierId: string | null | undefined) {
  const id = supplierId?.trim() || null;
  // keyed by id, so a result that arrives for a supplier the drawer has since left is never shown
  const [result, setResult] = useState<{ id: string; detail: SupplierDetail | null } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void fetchCommerceSupplier(id)
      .then((detail) => {
        if (!cancelled) setResult({ id, detail });
      })
      .catch(() => {
        if (!cancelled) setResult({ id, detail: null });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const current = id && result?.id === id ? result : null;
  return { detail: current?.detail ?? null, loading: Boolean(id) && !current };
}
