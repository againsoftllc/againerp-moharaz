"use client";

import { useEffect, useState } from "react";
import { listWorkspaceSites } from "@/lib/api/workspace-sites";
import { useAppStore } from "@/lib/store/app-store";

/** A store the admin can switch between — one row of `workspace_sites`. */
export type ScopeSite = {
  id: string;
  name: string;
  code: string;
  isPrimary: boolean;
};

const CACHE_KEY = "againerp_scope_sites";

let memory: ScopeSite[] | null = null;
let inflight: Promise<ScopeSite[]> | null = null;
const listeners = new Set<(sites: ScopeSite[]) => void>();

function readCache(): ScopeSite[] {
  if (memory) return memory;
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      memory = parsed as ScopeSite[];
      return memory;
    }
  } catch {
    /* ignore unreadable cache */
  }
  return [];
}

function publish(sites: ScopeSite[]) {
  memory = sites;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(sites));
    } catch {
      /* storage full or blocked — the in-memory copy still works */
    }
  }
  listeners.forEach((fn) => fn(sites));
}

async function loadSites(): Promise<ScopeSite[]> {
  inflight ??= listWorkspaceSites()
    .then((rows) => {
      const sites = rows.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        isPrimary: Boolean(row.is_primary),
      }));
      publish(sites);
      return sites;
    })
    .catch(() => readCache())
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Stores for the switcher, from the API. The last result is cached so the
 * header renders a name immediately instead of flashing a placeholder.
 */
export function useScopeSites(): ScopeSite[] {
  const [sites, setSites] = useState<ScopeSite[]>(readCache);
  const companyId = useAppStore((s) => s.companyId);
  const setCompany = useAppStore((s) => s.setCompany);

  useEffect(() => {
    listeners.add(setSites);
    void loadSites();
    return () => {
      listeners.delete(setSites);
    };
  }, []);

  // The selected id is persisted, so a deleted or renamed site would leave the
  // switcher pointing at nothing.
  useEffect(() => {
    if (sites.length === 0) return;
    if (sites.some((s) => s.id === companyId)) return;
    const fallback = sites.find((s) => s.isPrimary) ?? sites[0];
    if (fallback) setCompany(fallback.id);
  }, [sites, companyId, setCompany]);

  return sites;
}

/** Display name for the active store. */
export function useActiveScopeSite(): ScopeSite | null {
  const sites = useScopeSites();
  const companyId = useAppStore((s) => s.companyId);
  return sites.find((s) => s.id === companyId) ?? sites.find((s) => s.isPrimary) ?? null;
}
