"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Customer } from "@/lib/mock-data/customers";
import { apiFetch } from "@/lib/api/client";
import {
  apiCustomerToCustomer,
  buildCustomerQuery,
  updateCommerceCustomer,
  updateCommerceCustomerStatus,
  type ApiCustomerListResponse,
  type ApiCustomerResponse,
  type CustomerListParams,
  type CustomerListRow,
} from "@/lib/api/commerce-customers";

export { updateCommerceCustomer, updateCommerceCustomerStatus };

const DEFAULT_LIST_LIMIT = 2000;

type RefetchOptions = {
  /** Bypass the same-session GET cache (explicit Refresh, post-mutation reloads). */
  fresh?: boolean;
};

type UseCommerceCustomersState = {
  customers: CustomerListRow[];
  total: number;
  totalSpend: number;
  totalDue: number;
  loading: boolean;
  error: string | null;
  refetch: (params?: CustomerListParams, opts?: RefetchOptions) => Promise<void>;
};

function mergeListParams(
  initial?: CustomerListParams,
  override?: CustomerListParams,
): CustomerListParams {
  return { limit: DEFAULT_LIST_LIMIT, offset: 0, ...initial, ...override };
}

function toQuery(params: CustomerListParams, offset: number, limit: number): CustomerListParams {
  return {
    search: params.search,
    status: params.status,
    group: params.group,
    city: params.city,
    hasDue: params.hasDue,
    sort: params.sort,
    order: params.order,
    limit,
    offset,
  };
}

export function useCommerceCustomers(initialParams?: CustomerListParams): UseCommerceCustomersState {
  const [customers, setCustomers] = useState<CustomerListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalSpend, setTotalSpend] = useState(0);
  const [totalDue, setTotalDue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasRowsRef = useRef(false);
  const fetchGenRef = useRef(0);
  const initialRef = useRef(initialParams);
  initialRef.current = initialParams;
  const merged = mergeListParams(initialParams);
  const paramsKey = buildCustomerQuery(toQuery(merged, merged.offset ?? 0, merged.limit ?? DEFAULT_LIST_LIMIT));

  const refetch = useCallback(async (params?: CustomerListParams, opts?: RefetchOptions) => {
    const gen = ++fetchGenRef.current;
    if (!hasRowsRef.current) setLoading(true);
    setError(null);
    try {
      const next = mergeListParams(initialRef.current, params);
      const res = await apiFetch<ApiCustomerListResponse>(
        `/api/v1/commerce/customers${buildCustomerQuery(toQuery(next, next.offset ?? 0, next.limit ?? DEFAULT_LIST_LIMIT))}`,
        opts?.fresh ? { cache: "no-store" } : undefined,
      );
      if (gen !== fetchGenRef.current) return;
      setCustomers(res.data.map(apiCustomerToCustomer));
      setTotal(res.meta.count);
      setTotalSpend(Number(res.meta.total_spend));
      setTotalDue(Number(res.meta.total_due ?? 0));
      hasRowsRef.current = res.data.length > 0 || res.meta.count === 0;
    } catch (err) {
      if (gen !== fetchGenRef.current) return;
      const message = err instanceof Error ? err.message : "Failed to load customers";
      setError(message);
      if (!hasRowsRef.current) {
        setCustomers([]);
        setTotal(0);
        setTotalSpend(0);
        setTotalDue(0);
      }
    } finally {
      if (gen === fetchGenRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [paramsKey, refetch]);

  return { customers, total, totalSpend, totalDue, loading, error, refetch };
}

export function useCommerceCustomer(customerId: string) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(Boolean(customerId));
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!customerId) {
      setCustomer(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiCustomerResponse>(`/api/v1/commerce/customers/${customerId}`);
      setCustomer(apiCustomerToCustomer(res.data));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load customer";
      setError(message);
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { customer, loading, error, refetch };
}
