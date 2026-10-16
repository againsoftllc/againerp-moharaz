"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import {
  apiCloudflarePluginToPlugin,
  cloudflarePluginUpdateToApiPayload,
  type ApiCloudflareOAuthAuthorizeResponse,
  type ApiCloudflarePluginResponse,
  type CloudflarePlugin,
  type UpdateCloudflarePluginInput,
} from "@/lib/api/cloudflare-plugin";

type UseCloudflarePluginState = {
  plugin: CloudflarePlugin | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useCloudflarePlugin(): UseCloudflarePluginState {
  const [plugin, setPlugin] = useState<CloudflarePlugin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ApiCloudflarePluginResponse>("/api/v1/plugins/cloudflare");
      setPlugin(apiCloudflarePluginToPlugin(res.data));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load Cloudflare plugin";
      setError(message);
      setPlugin(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { plugin, loading, error, refetch };
}

export async function installCloudflarePlugin(): Promise<CloudflarePlugin> {
  const res = await apiFetch<ApiCloudflarePluginResponse>("/api/v1/plugins/cloudflare/install", {
    method: "POST",
  });
  return apiCloudflarePluginToPlugin(res.data);
}

export async function uninstallCloudflarePlugin(): Promise<CloudflarePlugin> {
  const res = await apiFetch<ApiCloudflarePluginResponse>("/api/v1/plugins/cloudflare/install", {
    method: "DELETE",
  });
  return apiCloudflarePluginToPlugin(res.data);
}

export async function updateCloudflarePlugin(
  input: UpdateCloudflarePluginInput,
): Promise<CloudflarePlugin> {
  const res = await apiFetch<ApiCloudflarePluginResponse>("/api/v1/plugins/cloudflare", {
    method: "PATCH",
    body: JSON.stringify(cloudflarePluginUpdateToApiPayload(input)),
  });
  return apiCloudflarePluginToPlugin(res.data);
}

export async function startCloudflareOAuth(): Promise<string> {
  const res = await apiFetch<ApiCloudflareOAuthAuthorizeResponse>(
    "/api/v1/plugins/cloudflare/oauth/authorize",
  );
  return res.data.url;
}
