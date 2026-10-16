"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";

/** A single Filters-Registry field for one Configurator slot — real typed
 * catalog attribute, a Chipset-Lookup-derived field, or a rule-engine
 * pseudo-field (qty/presence/power). Backs the condition-builder and the
 * Rules editor's field/operator pickers; see
 * apps/api/app/services/configurator_filters.py for how it's resolved. */
export type ConfiguratorFilterField = {
  code: string;
  name: string;
  field_type?: "dropdown" | "number" | "boolean" | "multi_select" | "text" | "count" | "presence" | "power";
  unit?: string | null;
  source: "attribute" | "lookup" | "special";
};

const cache = new Map<string, ConfiguratorFilterField[]>();

export function useConfiguratorFilters(categoryId: string | undefined | null): {
  fields: ConfiguratorFilterField[];
  loading: boolean;
} {
  const [fields, setFields] = useState<ConfiguratorFilterField[]>(categoryId ? (cache.get(categoryId) ?? []) : []);
  const [loading, setLoading] = useState(!!categoryId && !cache.has(categoryId));

  useEffect(() => {
    if (!categoryId) {
      setFields([]);
      setLoading(false);
      return;
    }
    const cached = cache.get(categoryId);
    if (cached) {
      setFields(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch<{ data: ConfiguratorFilterField[] }>(`/api/v1/configurator/categories/${categoryId}/filters`)
      .then((res) => {
        if (cancelled) return;
        cache.set(categoryId, res.data);
        setFields(res.data);
      })
      .catch(() => {
        if (!cancelled) setFields([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  return { fields, loading };
}

/** Same fields for several categories at once — the Rules editor needs the
 * left AND right slot's fields simultaneously. */
export function useConfiguratorFiltersByCategory(categoryIds: string[]): {
  byId: Record<string, ConfiguratorFilterField[]>;
  loading: boolean;
} {
  const key = categoryIds.slice().sort().join(",");
  const [byId, setById] = useState<Record<string, ConfiguratorFilterField[]>>({});
  const [loading, setLoading] = useState(categoryIds.some((id) => !cache.has(id)));

  useEffect(() => {
    const ids = key ? key.split(",").filter(Boolean) : [];
    if (ids.length === 0) {
      setById({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    const missing = ids.filter((id) => !cache.has(id));
    setLoading(missing.length > 0);
    Promise.all(
      missing.map((id) =>
        apiFetch<{ data: ConfiguratorFilterField[] }>(`/api/v1/configurator/categories/${id}/filters`)
          .then((res) => cache.set(id, res.data))
          .catch(() => cache.set(id, [])),
      ),
    ).then(() => {
      if (cancelled) return;
      const next: Record<string, ConfiguratorFilterField[]> = {};
      for (const id of ids) next[id] = cache.get(id) ?? [];
      setById(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { byId, loading };
}
