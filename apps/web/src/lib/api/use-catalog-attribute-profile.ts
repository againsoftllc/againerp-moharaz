"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AttributeGroup,
  AttributeProfile,
  AttributeSpec,
} from "@/lib/mock-data/attribute-profiles";
import { fetchAttributeProfile } from "@/lib/api/use-catalog-attribute-profiles";

type UseCatalogAttributeProfileState = {
  profile: AttributeProfile | null;
  groups: AttributeGroup[];
  attributes: AttributeSpec[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useCatalogAttributeProfile(profileId: string): UseCatalogAttributeProfileState {
  const [profile, setProfile] = useState<AttributeProfile | null>(null);
  const [groups, setGroups] = useState<AttributeGroup[]>([]);
  const [attributes, setAttributes] = useState<AttributeSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!profileId) {
      setProfile(null);
      setGroups([]);
      setAttributes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAttributeProfile(profileId);
      setProfile(data.profile);
      setGroups(data.groups);
      setAttributes(data.attributes);
    } catch (err) {
      setProfile(null);
      setGroups([]);
      setAttributes([]);
      setError(err instanceof Error ? err.message : "Profile not found");
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { profile, groups, attributes, loading, error, refetch };
}
