"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

export type InvoiceItemRecord = {
  id: string;
  description: string;
  quantity: number;
  unit: string | null;
  rate: number;
};

export type InvoiceItemInput = {
  description: string;
  quantity: number;
  unit?: string | null;
  rate: number;
};

export type InvoiceRecord = {
  id: string;
  company_id: string;
  invoice_number: string;
  customer_id: string;
  bill_date: string;
  due_date: string;
  status: string;
  discount: number;
  created_at: string;
  updated_at: string;
  items: InvoiceItemRecord[];
  customer_name: string | null;
  subtotal: number;
  balance_due: number;
};

export type InvoiceListResponse = {
  data: InvoiceRecord[];
  meta: { count: number; page: number; per_page: number };
};

export type ListInvoicesParams = {
  status?: string;
  q?: string;
  page?: number;
  per_page?: number;
};

export type InvoiceInput = {
  customer_id: string;
  bill_date: string;
  due_date: string;
  status?: string;
  discount?: number;
  items: InvoiceItemInput[];
};

function toQuery(params: ListInvoicesParams) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  if (params.page) qs.set("page", String(params.page));
  if (params.per_page) qs.set("per_page", String(params.per_page));
  const query = qs.toString();
  return query ? `?${query}` : "";
}

export async function fetchInvoices(params: ListInvoicesParams = {}): Promise<InvoiceListResponse> {
  return apiFetch<InvoiceListResponse>(`/api/v1/invoices${toQuery(params)}`);
}

export async function fetchInvoice(id: string): Promise<InvoiceRecord> {
  const res = await apiFetch<{ data: InvoiceRecord }>(`/api/v1/invoices/${id}`);
  return res.data;
}

export async function createInvoice(input: InvoiceInput): Promise<InvoiceRecord> {
  const res = await apiFetch<{ data: InvoiceRecord }>("/api/v1/invoices", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function updateInvoice(id: string, input: Partial<InvoiceInput>): Promise<InvoiceRecord> {
  const res = await apiFetch<{ data: InvoiceRecord }>(`/api/v1/invoices/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.data;
}

export function useInvoices(search = "", status = "") {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchInvoices({
        q: search.trim() || undefined,
        status: status || undefined,
        per_page: 200,
      });
      setInvoices(res.data);
      setTotal(res.meta.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoices");
      setInvoices([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { invoices, total, loading, error, refetch };
}
