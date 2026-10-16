"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConfiguratorStatus, ConfiguratorTemplate } from "@/lib/configurator/types";
import { apiFetch } from "@/lib/api/client";
import {
  apiTemplateToConfiguratorTemplate,
  templateToApiCreatePayload,
  templateToApiUpdatePayload,
  partialTemplateToApiUpdate,
  type ApiConfiguratorTemplateListResponse,
  type ApiConfiguratorTemplateResponse,
  type CreateConfiguratorTemplateInput,
  type UpdateConfiguratorTemplateInput,
} from "@/lib/api/configurator-templates";

type UseConfiguratorTemplatesState = {
  templates: ConfiguratorTemplate[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useConfiguratorTemplates(profileId?: string): UseConfiguratorTemplatesState {
  const [templates, setTemplates] = useState<ConfiguratorTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = profileId ? `?profile_id=${encodeURIComponent(profileId)}` : "";
      const res = await apiFetch<ApiConfiguratorTemplateListResponse>(
        `/api/v1/configurator/templates${qs}`,
      );
      setTemplates(res.data.map(apiTemplateToConfiguratorTemplate));
      setTotal(res.meta.count);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load configurator templates";
      setError(message);
      setTemplates([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { templates, total, loading, error, refetch };
}

export function useConfiguratorTemplate(id: string) {
  const [template, setTemplate] = useState<ConfiguratorTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiConfiguratorTemplateResponse>(
        `/api/v1/configurator/templates/${id}`,
      );
      setTemplate(apiTemplateToConfiguratorTemplate(res.data));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load template";
      setError(message);
      setTemplate(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { template, loading, error, refetch };
}

export async function createConfiguratorTemplate(
  input: CreateConfiguratorTemplateInput,
): Promise<ConfiguratorTemplate> {
  const res = await apiFetch<ApiConfiguratorTemplateResponse>("/api/v1/configurator/templates", {
    method: "POST",
    body: JSON.stringify(templateToApiCreatePayload(input)),
  });
  return apiTemplateToConfiguratorTemplate(res.data);
}

export async function updateConfiguratorTemplate(
  id: string,
  input: UpdateConfiguratorTemplateInput,
): Promise<ConfiguratorTemplate> {
  const res = await apiFetch<ApiConfiguratorTemplateResponse>(
    `/api/v1/configurator/templates/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(templateToApiUpdatePayload(input)),
    },
  );
  return apiTemplateToConfiguratorTemplate(res.data);
}

export async function patchConfiguratorTemplate(
  id: string,
  patch: Partial<ConfiguratorTemplate>,
): Promise<ConfiguratorTemplate> {
  return updateConfiguratorTemplate(id, partialTemplateToApiUpdate(patch));
}

export async function bulkSetConfiguratorTemplateStatus(
  ids: string[],
  status: ConfiguratorStatus,
): Promise<void> {
  await apiFetch<ApiConfiguratorTemplateListResponse>("/api/v1/configurator/templates/bulk/status", {
    method: "PATCH",
    body: JSON.stringify({ ids, status }),
  });
}

export async function duplicateConfiguratorTemplate(id: string): Promise<ConfiguratorTemplate> {
  const res = await apiFetch<ApiConfiguratorTemplateResponse>(
    `/api/v1/configurator/templates/${id}/duplicate`,
    { method: "POST" },
  );
  return apiTemplateToConfiguratorTemplate(res.data);
}

export async function deleteConfiguratorTemplate(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/configurator/templates/${id}`, { method: "DELETE" });
}

export async function deleteConfiguratorTemplates(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteConfiguratorTemplate(id)));
}
