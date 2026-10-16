"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/store/admin-auth-store";

type Options = {
  /** Also save on the server for this admin, so the value follows them to any browser or
   * device (grid layouts). localStorage stays as the instant first paint. */
  sync?: boolean;
};

const SYNC_DELAY_MS = 600;

/**
 * Like useState, but persisted to localStorage per admin user — each admin
 * gets their own saved value under the same key, keyed by their user id.
 */
export function useUserScopedState<T>(key: string, defaultValue: T, options?: Options) {
  const userId = useAdminAuth((s) => s.user?.id) ?? "anonymous";
  const storageKey = `againerp:${key}:${userId}`;
  // Grid layouts and column toggles follow the admin everywhere unless told otherwise.
  const sync = (options?.sync ?? /(^|:)(grid-layout|columns|columnState)(:|$)|-grid:/.test(key)) && userId !== "anonymous";

  const [value, setValue] = useState<T>(defaultValue);
  const hydratedKeyRef = useRef<string | null>(null);
  // false until the saved value has been read (local copy, or the server's answer when there's
  // no local copy) — a grid stays invisible until then so its columns don't visibly jump.
  const [loaded, setLoaded] = useState(false);
  // A local change made before the server copy arrived wins over that (older) copy.
  const touchedRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const currentKeyRef = useRef(storageKey);
  const fetchedKeyRef = useRef<string | null>(null);
  currentKeyRef.current = storageKey;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const alreadyRead = hydratedKeyRef.current === storageKey;
    if (!alreadyRead) {
      hydratedKeyRef.current = storageKey;
      touchedRef.current = false;
      const local = readLocal<T>(storageKey);
      setValue(local.found ? local.value : defaultValue);
      setLoaded(local.found || !sync);
    }
    if (!sync || fetchedKeyRef.current === storageKey) return;
    fetchedKeyRef.current = storageKey;
    // Don't keep a grid hidden for long if the server is slow.
    const giveUp = window.setTimeout(() => setLoaded(true), 1500);
    // Not tied to this effect's cleanup: React's dev double-mount would otherwise drop the reply.
    const requestedKey = storageKey;
    apiFetch<{ found: boolean; value: T }>(`/api/v1/me/ui-prefs/${encodeURIComponent(key)}`, { cache: "no-store" })
      .then((res) => {
        window.clearTimeout(giveUp);
        if (currentKeyRef.current !== requestedKey) return;
        setLoaded(true);
        if (touchedRef.current || !res.found || res.value == null) return;
        setValue(res.value);
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(res.value));
        } catch {
          // ignore quota/serialization errors
        }
      })
      .catch(() => {
        // offline / older API — localStorage still works
        window.clearTimeout(giveUp);
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, sync]);

  const setPersistedValue = useCallback(
    (updater: T | ((prev: T) => T)) => {
      touchedRef.current = true;
      setValue((prev) => {
        const next = typeof updater === "function" ? (updater as (prev: T) => T)(prev) : updater;
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore quota/serialization errors
        }
        if (sync) {
          if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
          syncTimerRef.current = window.setTimeout(() => {
            void apiFetch(`/api/v1/me/ui-prefs/${encodeURIComponent(key)}`, {
              method: "PUT",
              body: JSON.stringify({ value: next }),
            }).catch(() => {
              // kept locally; the next change retries
            });
          }, SYNC_DELAY_MS);
        }
        return next;
      });
    },
    [storageKey, sync, key],
  );

  return [value, setPersistedValue, loaded] as const;
}

function readLocal<T>(storageKey: string): { found: boolean; value: T } {
  if (typeof window === "undefined") return { found: false, value: undefined as T };
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? { found: true, value: JSON.parse(raw) as T } : { found: false, value: undefined as T };
  } catch {
    return { found: false, value: undefined as T };
  }
}
