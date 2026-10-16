"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Order } from "@/lib/mock-data/orders";
import type { OrderStatus } from "@/lib/mock-data/orders";
import {
  bulkDeleteSalesOrders,
  bulkUpdateSalesOrderStatus,
  fetchSalesRecordsPage,
  persistSalesOrder,
  uiStatusToApiStatus,
  type SalesFetchOptions,
  type SalesListParams,
  type SalesRecordKind,
  type SalesRecordMeta,
} from "@/lib/api/sales";
import { AGAIN_LIST_PAGE_SIZE } from "@/components/shared/again-list-grid";

export type SalesListSort = { by: string; dir: "asc" | "desc" };

/** Server-side list query. `page` is 0-based to match the grid pager. */
export type SalesListQuery = {
  kind: SalesRecordKind;
  search: string;
  page: number;
  pageSize: number;
  sort: SalesListSort | null;
};

const DEFAULT_QUERY: SalesListQuery = {
  kind: "order",
  search: "",
  page: 0,
  pageSize: AGAIN_LIST_PAGE_SIZE,
  sort: null,
};

type QueryPatch = Partial<SalesListQuery> | ((prev: SalesListQuery) => SalesListQuery);

type UseSalesOrdersState = {
  orders: (Order & SalesRecordMeta)[];
  /** Server total for the current query — drives the pager, not `orders.length`. */
  total: number;
  query: SalesListQuery;
  setQuery: (patch: QueryPatch) => void;
  /** True only until the first page has arrived (skeleton); later loads keep the grid mounted. */
  loading: boolean;
  /** Any request in flight, including background refetches. */
  fetching: boolean;
  error: string | null;
  /** Reload the current query. Defaults to `fresh` (bypasses the GET cache). Resolves to success. */
  refetch: (opts?: SalesFetchOptions) => Promise<boolean>;
  saveOrder: (
    order: Order & Partial<SalesRecordMeta>,
    action?: "save" | "confirm" | "cancel" | "duplicate" | "delete",
  ) => Promise<Order & SalesRecordMeta>;
  updateStatus: (id: string, status: OrderStatus) => Promise<void>;
  /** Resolves to the number the server actually deleted (only draft/cancelled qualify). */
  bulkDelete: (ids: string[]) => Promise<number>;
  bulkStatus: (ids: string[], status: OrderStatus) => Promise<number>;
};

function sameSort(a: SalesListSort | null, b: SalesListSort | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.by === b.by && a.dir === b.dir;
}

function sameQuery(a: SalesListQuery, b: SalesListQuery): boolean {
  return (
    a.kind === b.kind &&
    a.search === b.search &&
    a.page === b.page &&
    a.pageSize === b.pageSize &&
    sameSort(a.sort, b.sort)
  );
}

function toListParams(q: SalesListQuery): SalesListParams {
  return {
    search: q.search.trim() || undefined,
    page: q.page + 1,
    per_page: q.pageSize,
    sort_by: q.sort?.by,
    sort_dir: q.sort?.dir,
  };
}

export function useSalesOrders(initial?: Partial<SalesListQuery>): UseSalesOrdersState {
  const [query, setQueryState] = useState<SalesListQuery>(() => ({ ...DEFAULT_QUERY, ...initial }));
  const [orders, setOrders] = useState<(Order & SalesRecordMeta)[]>([]);
  const [total, setTotal] = useState(0);
  // The query whose result is on screen. `setQuery` keeps identity when nothing
  // changed, so `loaded !== query` means a page for a newer query is in flight.
  const [loaded, setLoaded] = useState<SalesListQuery | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryRef = useRef(query);
  // Monotonic request id: a slow earlier response must not overwrite a newer page.
  const seqRef = useRef(0);

  const load = useCallback((q: SalesListQuery, opts?: SalesFetchOptions): Promise<boolean> => {
    const seq = ++seqRef.current;
    return fetchSalesRecordsPage(q.kind, toListParams(q), opts).then(
      (page) => {
        if (seq !== seqRef.current) return false;
        setOrders(page.rows);
        setTotal(page.total);
        setError(null);
        setLoaded(q);
        return true;
      },
      (err: unknown) => {
        if (seq !== seqRef.current) return false;
        setError(err instanceof Error ? err.message : "Failed to load sales records");
        setOrders([]);
        setTotal(0);
        setLoaded(q);
        return false;
      },
    );
  }, []);

  useEffect(() => {
    queryRef.current = query;
    void load(query);
  }, [query, load]);

  const setQuery = useCallback((patch: QueryPatch) => {
    setQueryState((prev) => {
      const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
      return sameQuery(prev, next) ? prev : next;
    });
  }, []);

  const refetch = useCallback(
    (opts?: SalesFetchOptions) => {
      setRefreshing(true);
      return load(queryRef.current, opts ?? { fresh: true }).finally(() => setRefreshing(false));
    },
    [load],
  );

  const saveOrder = useCallback(
    async (
      order: Order & Partial<SalesRecordMeta>,
      action: "save" | "confirm" | "cancel" | "duplicate" | "delete" = "save",
    ) => {
      const saved = await persistSalesOrder(order, action);
      setOrders((rows) => {
        if (action === "delete") {
          return rows.filter((row) => row.id !== order.id);
        }
        const idx = rows.findIndex((row) => row.id === order.id);
        if (idx === -1) return [saved, ...rows];
        const next = [...rows];
        next[idx] = saved;
        return next;
      });
      return saved;
    },
    [],
  );

  const updateStatus = useCallback(async (id: string, status: OrderStatus) => {
    const current = orders.find((row) => row.id === id);
    if (!current) return;
    const apiStatus = uiStatusToApiStatus(current, status);
    await bulkUpdateSalesOrderStatus([id], apiStatus);
    await refetch();
  }, [orders, refetch]);

  const bulkDelete = useCallback(async (ids: string[]) => {
    const deleted = await bulkDeleteSalesOrders(ids);
    await refetch();
    return deleted;
  }, [refetch]);

  const bulkStatus = useCallback(
    async (ids: string[], status: OrderStatus) => {
      const sample = orders.find((row) => ids.includes(row.id));
      const apiStatus = sample ? uiStatusToApiStatus(sample, status) : status;
      const updated = await bulkUpdateSalesOrderStatus(ids, apiStatus);
      await refetch();
      return updated;
    },
    [orders, refetch],
  );

  return {
    orders,
    total,
    query,
    setQuery,
    loading: loaded === null,
    fetching: loaded !== query || refreshing,
    error,
    refetch,
    saveOrder,
    updateStatus,
    bulkDelete,
    bulkStatus,
  };
}
