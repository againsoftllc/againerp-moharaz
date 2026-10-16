"use client";

import { useEffect, useState } from "react";
import { AGAIN_LIST_PAGE_SIZE } from "@/components/shared/again-list-grid";

export type PagedLoader<TRow, TMeta> = (
  page: number,
  pageSize: number,
) => Promise<{ data: TRow[]; meta: TMeta }>;

/**
 * Server-paged list state for one drawer tab. `load` must be memoized by the
 * caller (itemId + filters); a new `load` identity refetches, so callers reset
 * `page` to 0 in the same handler that changes a filter to avoid a stale-page
 * request.
 */
export function usePagedHistory<TRow, TMeta>(load: PagedLoader<TRow, TMeta> | null) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(AGAIN_LIST_PAGE_SIZE);
  const [rows, setRows] = useState<TRow[]>([]);
  const [meta, setMeta] = useState<TMeta | null>(null);
  const [loading, setLoading] = useState(Boolean(load));
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `loading` starts true and is only cleared, so the skeleton shows for the
  // first fetch; later pages keep the previous rows visible while they load.
  useEffect(() => {
    if (!load) return;
    let cancelled = false;
    load(page, pageSize)
      .then((res) => {
        if (cancelled) return;
        setRows(res.data);
        setMeta(res.meta);
        setError(null);
        setLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, page, pageSize]);

  return {
    rows,
    meta,
    loading,
    loaded,
    error,
    page,
    pageSize,
    setPage,
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(0);
    },
  };
}
