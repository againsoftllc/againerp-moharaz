"use client";

import { useCallback, useRef, useState } from "react";
import { apiFetch } from "@/lib/api/client";

export type DuplicateMatch = {
  id: string;
  name: string;
  sku: string;
  status: string;
  thumbnail?: string | null;
  reason: string;
  level: "confirmed" | "possible";
};
export type DuplicateInfo = {
  level: "confirmed" | "possible" | "unique";
  matches: DuplicateMatch[];
  checkedAt: string | null;
  /** a person looked at the matches and confirmed the result (the dot is blue) */
  verified: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
};

const BASE = "/api/v1/catalog/product-duplicates";

/**
 * The Unlisted list's Duplicate column. The server scans a product once and SAVES the result (red = confirmed duplicate,
 * yellow = possible, green = unique); a person can then verify it (blue) from the popup. Here: asked page by page for
 * the rows on screen, `rescan` scans one product again, `verify` marks / unmarks it. Nothing is requested unless `enabled`.
 */
export function useDuplicateCheck(enabled: boolean) {
  const [info, setInfo] = useState<Record<string, DuplicateInfo>>({});
  const asked = useRef(new Set<string>());

  const loadIds = useCallback(
    async (ids: string[]) => {
      if (!enabled) return;
      const need = ids.filter((id) => !asked.current.has(id));
      if (need.length === 0) return;
      need.forEach((id) => asked.current.add(id));
      try {
        const res = await apiFetch<{ data: Record<string, DuplicateInfo> }>(BASE, {
          method: "POST",
          body: JSON.stringify({ product_ids: need.slice(0, 200) }),
        });
        setInfo((cur) => ({ ...cur, ...res.data }));
      } catch {
        need.forEach((id) => asked.current.delete(id)); // asked again on the next page change
      }
    },
    [enabled],
  );

  const rescan = useCallback(async (id: string) => {
    const res = await apiFetch<{ data: Record<string, DuplicateInfo> }>(BASE, {
      method: "POST",
      body: JSON.stringify({ product_ids: [id], refresh: true }),
    });
    setInfo((cur) => ({ ...cur, ...res.data }));
    return res.data[id];
  }, []);

  const verify = useCallback(async (id: string, verified: boolean) => {
    const res = await apiFetch<{ data: DuplicateInfo }>(`${BASE}/verify`, {
      method: "POST",
      body: JSON.stringify({ product_id: id, verified }),
    });
    setInfo((cur) => ({ ...cur, [id]: res.data }));
    return res.data;
  }, []);

  return { info, loadIds, rescan, verify };
}
