"use client";

import { useCallback, useEffect, useState } from "react";
import {
  bulkStagingAction,
  createStagingJob,
  getStagingItem,
  listStagingItems,
  listStagingJobs,
  reviewStagingItem,
  saveStagingDraft,
  type CreateStagingJobInput,
  type StagingItem,
  type StagingJob,
  type StagingQueueMeta,
} from "../api/staging";

export function useStagingQueue(initialStatus?: string) {
  const [jobs, setJobs] = useState<StagingJob[]>([]);
  const [items, setItems] = useState<StagingItem[]>([]);
  const [meta, setMeta] = useState<StagingQueueMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (status?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [jobsRes, itemsRes] = await Promise.all([
        listStagingJobs(status),
        listStagingItems(status ? { status } : undefined),
      ]);
      setJobs(jobsRes.data);
      setItems(itemsRes.data);
      setMeta(itemsRes.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load staging queue");
      setJobs([]);
      setItems([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch(initialStatus);
  }, [refetch, initialStatus]);

  return { jobs, items, meta, loading, error, refetch };
}

export function useStagingItem(itemId: string | null) {
  const [item, setItem] = useState<StagingItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getStagingItem(itemId);
      setItem(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load item");
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { item, loading, error, refetch };
}

export async function submitStagingJob(input: CreateStagingJobInput) {
  return createStagingJob(input);
}

export async function approveStagingItem(id: string, notes?: string) {
  return reviewStagingItem(id, "approved", notes);
}

export async function rejectStagingItem(id: string, notes?: string) {
  return reviewStagingItem(id, "rejected", notes);
}

export { saveStagingDraft, bulkStagingAction };
