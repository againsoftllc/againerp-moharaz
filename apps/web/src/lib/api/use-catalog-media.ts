"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaLibraryItem } from "@/lib/mock-data/media-library";
import { apiFetch, getApiBaseUrl, ApiError, invalidateApiGetCache } from "@/lib/api/client";
import { getStoredAuthToken } from "@/lib/store/admin-auth-store";
import {
  apiMediaToItem,
  mediaItemToApiCreate,
  mediaPatchToApi,
  type ApiMediaListResponse,
  type ApiMediaResponse,
} from "@/lib/api/catalog-media";
import { getMediaFileStorage } from "@/lib/mock-data/media-library";

type MediaListParams = { query?: string; type?: string; soft?: boolean };

type UseCatalogMediaState = {
  items: MediaLibraryItem[];
  /** every file that matches on the server; `items` holds the pages loaded so far */
  total: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  refetch: (params?: MediaListParams) => Promise<void>;
  /** the next page of the same list (the grid calls it as it scrolls to the end) */
  loadMore: () => Promise<void>;
  mergeItems: (items: MediaLibraryItem[]) => void;
};

/* The library is tens of thousands of files (~35 MB as one list), which froze the browser; it loads a page at a
   time instead, newest first. */
export const MEDIA_PAGE_SIZE = 60;

function mediaListUrl(params: MediaListParams | undefined, offset: number) {
  const query = new URLSearchParams();
  if (params?.query?.trim()) query.set("query", params.query.trim());
  if (params?.type) query.set("type", params.type);
  query.set("limit", String(MEDIA_PAGE_SIZE));
  query.set("offset", String(offset));
  return `/api/v1/media?${query.toString()}`;
}

export function useCatalogMedia(): UseCatalogMediaState {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paramsRef = useRef<MediaListParams | undefined>(undefined);
  /** bumped by every refetch, so a page that arrives after a new search is dropped */
  const generationRef = useRef(0);
  const loadedRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const refetch = useCallback(async (params?: MediaListParams) => {
    const generation = ++generationRef.current;
    paramsRef.current = params;
    if (!params?.soft) setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ApiMediaListResponse>(mediaListUrl(params, 0), { cache: "no-store" });
      if (generation !== generationRef.current) return;
      const rows = data.data.map(apiMediaToItem);
      loadedRef.current = rows.length;
      setItems(rows);
      setTotal(data.meta.count);
    } catch (err) {
      if (generation !== generationRef.current) return;
      const message = err instanceof Error ? err.message : "Failed to load media";
      setError(message);
      if (!params?.soft) {
        loadedRef.current = 0;
        setItems([]);
        setTotal(0);
      }
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    const generation = generationRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const data = await apiFetch<ApiMediaListResponse>(mediaListUrl(paramsRef.current, loadedRef.current), {
        cache: "no-store",
      });
      if (generation !== generationRef.current) return;
      loadedRef.current += data.data.length;
      setTotal(data.meta.count);
      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...data.data.map(apiMediaToItem).filter((item) => !seen.has(item.id))];
      });
    } catch {
      /* the next scroll to the end tries again */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  const mergeItems = useCallback((incoming: MediaLibraryItem[]) => {
    if (!incoming.length) return;
    setItems((prev) => {
      const known = new Set(prev.map((item) => item.id));
      const added = incoming.filter((item) => !known.has(item.id)).length;
      if (added) setTotal((t) => t + added);
      const seen = new Set(incoming.map((item) => item.id));
      return [...incoming, ...prev.filter((item) => !seen.has(item.id))];
    });
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const hasMore = !loading && loadedRef.current < total;
  return { items, total, loading, loadingMore, hasMore, error, refetch, loadMore, mergeItems };
}

export async function patchCatalogMediaItem(
  id: string,
  patch: Partial<Pick<MediaLibraryItem, "name" | "title" | "alt">>,
): Promise<MediaLibraryItem> {
  const data = await apiFetch<ApiMediaResponse>(`/api/v1/media/${id}`, {
    method: "PATCH",
    body: JSON.stringify(mediaPatchToApi(patch)),
  });
  return apiMediaToItem(data.data);
}

export async function createCatalogMediaBatch(
  items: MediaLibraryItem[],
): Promise<MediaLibraryItem[]> {
  const data = await apiFetch<ApiMediaListResponse>(`/api/v1/media/batch`, {
    method: "POST",
    body: JSON.stringify({ items: items.map(mediaItemToApiCreate) }),
  });
  return data.data.map(apiMediaToItem);
}

/** Serverless hosting caps a single request body at ~4.5 MB. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function uploadCatalogMediaFiles(files: File[]): Promise<MediaLibraryItem[]> {
  const token = getStoredAuthToken();
  const uploaded: MediaLibraryItem[] = [];

  // One request per file, so a multi-image batch never exceeds the body limit.
  for (const file of files) {
    const form = new FormData();
    form.append("files", file);

    const res = await fetch(`${getApiBaseUrl()}/api/v1/media/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });

    if (!res.ok) {
      let detail = `${file.name}: upload failed`;
      try {
        const body = (await res.json()) as { detail?: string };
        if (body.detail) detail = `${file.name}: ${body.detail}`;
      } catch { /* keep the generic message */ }
      if (res.status === 413 || file.size > MAX_UPLOAD_BYTES) {
        const mb = (file.size / 1024 / 1024).toFixed(1);
        detail = `${file.name} is ${mb} MB — too large to upload. Please compress it under 4 MB.`;
      }
      throw new ApiError(detail, res.status);
    }

    const data = (await res.json()) as ApiMediaListResponse;
    uploaded.push(...data.data.map(apiMediaToItem));
  }

  invalidateApiGetCache();
  return uploaded;
}

export async function deleteCatalogMediaItem(id: string): Promise<void> {
  await apiFetch(`/api/v1/media/${id}`, { method: "DELETE" });
}

export async function deleteCatalogMediaBulk(ids: string[]): Promise<void> {
  await apiFetch(`/api/v1/media/bulk`, {
    method: "DELETE",
    body: JSON.stringify(ids),
  });
}

export type MediaMigrateTarget = "local" | "r2";

export type MediaMigrateResult = {
  moved: number;
  skipped: number;
  failed: number;
  errors: string[];
};

type MigrateRow = {
  id: string;
  ok: boolean;
  skipped: boolean;
  message: string;
};

function isCdnDownloadFailure(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes("could not download") ||
    m.includes("cdn blocked") ||
    m.includes("no-response") ||
    m.includes("local file missing") ||
    m.includes("420") ||
    m.includes("403") ||
    m.includes("502")
  );
}

async function fetchRemoteMediaBlob(
  item: MediaLibraryItem,
): Promise<{ blob: Blob; filename: string }> {
  const token = getStoredAuthToken();
  const url = item.sourceUrl || item.url;
  const names = [item.name, item.url, item.sourceUrl || ""].filter(Boolean);
  const res = await fetch("/api/cdn-fetch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ url, names }),
  });
  if (!res.ok) {
    let detail = "CDN fetch failed";
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  const blob = await res.blob();
  const filename = item.name || `media-${item.id}.bin`;
  return { blob, filename };
}

export async function migrateCatalogMediaWithBytes(
  id: string,
  target: MediaMigrateTarget,
  blob: Blob,
  filename: string,
): Promise<MigrateRow> {
  const token = getStoredAuthToken();
  const form = new FormData();
  form.append("media_id", id);
  form.append("target", target);
  form.append("file", blob, filename);

  const res = await fetch(`${getApiBaseUrl()}/api/v1/media/migrate-bytes`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    let detail = "Migrate upload failed";
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  invalidateApiGetCache();
  const data = (await res.json()) as {
    data: MigrateRow[];
  };
  return data.data[0] ?? { id, ok: false, skipped: false, message: "No result" };
}

/**
 * Move media to R2/local. For CDN-hotlinked items Railway cannot download,
 * falls back to Vercel CDN proxy + migrate-bytes.
 */
export async function migrateCatalogMedia(
  ids: string[],
  target: MediaMigrateTarget,
  items?: MediaLibraryItem[],
): Promise<MediaMigrateResult> {
  const byId = new Map((items || []).map((item) => [item.id, item]));

  // Prefer proxy path first for known-remote items when moving to R2
  let moved = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];
  const remaining: string[] = [];

  if (target === "r2" && items?.length) {
    for (const id of ids) {
      const item = byId.get(id);
      if (!item) {
        remaining.push(id);
        continue;
      }
      const storage = getMediaFileStorage(item);
      if (storage !== "remote") {
        remaining.push(id);
        continue;
      }
      try {
        const { blob, filename } = await fetchRemoteMediaBlob(item);
        const row = await migrateCatalogMediaWithBytes(id, "r2", blob, filename);
        if (row.ok && !row.skipped) moved += 1;
        else if (row.skipped) skipped += 1;
        else {
          failed += 1;
          errors.push(row.message || id);
        }
      } catch (err) {
        // Fall through to server migrate (may still fail) then surface error
        remaining.push(id);
        if (err instanceof Error && !errors.includes(err.message)) {
          // keep for final message if server also fails
          byId.set(id, item);
        }
      }
    }
  } else {
    remaining.push(...ids);
  }

  if (remaining.length) {
    const data = await apiFetch<{
      data: MigrateRow[];
      meta: { moved: number; skipped: number; failed: number };
    }>(`/api/v1/media/migrate`, {
      method: "POST",
      body: JSON.stringify({ ids: remaining, target }),
    });

    for (const row of data.data) {
      if (row.ok && !row.skipped) {
        moved += 1;
        continue;
      }
      if (row.skipped) {
        skipped += 1;
        continue;
      }

      const item = byId.get(row.id);
      if (target === "r2" && item && isCdnDownloadFailure(row.message || "")) {
        try {
          const { blob, filename } = await fetchRemoteMediaBlob(item);
          const retry = await migrateCatalogMediaWithBytes(row.id, "r2", blob, filename);
          if (retry.ok && !retry.skipped) {
            moved += 1;
            continue;
          }
          failed += 1;
          errors.push(retry.message || row.message || row.id);
          continue;
        } catch (err) {
          failed += 1;
          errors.push(err instanceof Error ? err.message : row.message || row.id);
          continue;
        }
      }

      failed += 1;
      errors.push(row.message || row.id);
    }
  }

  return { moved, skipped, failed, errors };
}
