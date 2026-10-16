"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getMappingDashboard,
  listEntityMappings,
  type EntityMapping,
  type MappingDashboardMeta,
} from "../api/mapping";

export function useMappingDashboard() {
  const [meta, setMeta] = useState<MappingDashboardMeta | null>(null);
  const [mappings, setMappings] = useState<EntityMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (filters?: { entity_type?: string; status?: string; q?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const [dash, list] = await Promise.all([
        getMappingDashboard(),
        listEntityMappings(filters),
      ]);
      setMeta(dash.meta);
      setMappings(list.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load mappings");
      setMeta(null);
      setMappings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { meta, mappings, loading, error, refetch };
}

export {
  approveEntityMapping,
  rejectEntityMapping,
  manualEntityMapping,
  resolveMappingConflict,
  mergeEntityMappings,
  scanUniversalMapping,
  scanItemMapping,
} from "../api/mapping";
