"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchFinanceAccounts,
  fetchFinanceDashboard,
  fetchFinanceJournal,
  type ApiFinanceAccount,
  type ApiFinanceDashboard,
  type ApiFinanceJournalEntry,
} from "@/lib/api/finance";

export function useFinanceDashboard() {
  const [dashboard, setDashboard] = useState<ApiFinanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFinanceDashboard();
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load finance dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { dashboard, loading, error, refetch };
}

export function useFinanceAccounts() {
  const [accounts, setAccounts] = useState<ApiFinanceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchFinanceAccounts();
        if (!cancelled) setAccounts(res.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load accounts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { accounts, loading, error };
}

export function useFinanceJournal(limit = 20) {
  const [entries, setEntries] = useState<ApiFinanceJournalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchFinanceJournal(limit);
        if (!cancelled) {
          setEntries(res.data);
          setTotal(res.meta.total);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load journal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return { entries, total, loading, error };
}
