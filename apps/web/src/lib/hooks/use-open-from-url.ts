"use client";

import { useEffect, useRef } from "react";

/**
 * Deep link into a list page's detail drawer: `/purchase/orders?open=<id>` opens that
 * record as soon as it is in `rows`, then strips the param so a reload doesn't re-open it.
 * Used by Aladin's "created PO-2026-0273 — open it" links, notifications, etc.
 *
 * Reads `window.location` directly (not useSearchParams) so it needs no Suspense boundary
 * and works in pages that don't otherwise use search params.
 */
export function useOpenFromUrl<T>(rows: T[], getId: (row: T) => string, open: (row: T) => void, param = "open"): void {
  const pendingRef = useRef<string | null | undefined>(undefined);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (pendingRef.current !== undefined) return;
    try {
      pendingRef.current = new URLSearchParams(window.location.search).get(param);
    } catch {
      pendingRef.current = null;
    }
  }, [param]);

  useEffect(() => {
    const id = pendingRef.current;
    if (!id || rows.length === 0) return;
    const row = rows.find((r) => getId(r) === id);
    if (!row) return;
    pendingRef.current = null;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(param);
      window.history.replaceState(window.history.state, "", url.pathname + (url.search || "") + url.hash);
    } catch {
      /* ignore */
    }
    // Defer so the page's own state (filters, drawers) has settled after the rows landed.
    const t = setTimeout(() => openRef.current(row), 0);
    return () => clearTimeout(t);
  }, [rows, getId, param]);
}
