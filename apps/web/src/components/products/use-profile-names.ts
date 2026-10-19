"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { ApiAttributeProfileListResponse } from "@/lib/api/catalog-attribute-profiles";

let cache: Record<string, string> | null = null;
let inflight: Promise<Record<string, string>> | null = null;

function loadNames(): Promise<Record<string, string>> {
  if (cache) return Promise.resolve(cache);
  inflight ??= apiFetch<ApiAttributeProfileListResponse>("/api/v1/catalog/attribute-profiles")
    .then((res) => {
      cache = Object.fromEntries(res.data.map((p) => [p.id, p.name]));
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Specification profile id -> name, for a read-only "Specification profile" column. Loaded once per page load, only when `enabled`. */
export function useProfileNames(enabled: boolean): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>(cache ?? {});
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadNames()
      .then((n) => {
        if (!cancelled) setNames(n);
      })
      .catch(() => undefined); // no names: the column shows a dash
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return names;
}
