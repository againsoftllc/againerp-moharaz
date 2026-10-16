"use client";

import { useCallback, useEffect, useState } from "react";
import type { WebsiteSettings, WebsiteSettingsInput } from "@/lib/website/website-settings";
import { defaultWebsiteSettingsValues } from "@/lib/website/website-settings";
import { fetchWebsiteSettings, updateWebsiteSettings } from "@/lib/api/website-settings";

type UseWebsiteSettingsState = {
  settings: WebsiteSettings;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  saveSettings: (input: WebsiteSettingsInput) => Promise<WebsiteSettings>;
};

export function useWebsiteSettings(): UseWebsiteSettingsState {
  const [settings, setSettings] = useState<WebsiteSettings>(defaultWebsiteSettingsValues);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await fetchWebsiteSettings();
      setSettings(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load website settings");
      setSettings(defaultWebsiteSettingsValues());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const saveSettings = useCallback(async (input: WebsiteSettingsInput) => {
    const saved = await updateWebsiteSettings(input);
    setSettings(saved);
    return saved;
  }, []);

  return { settings, loading, error, refetch, saveSettings };
}
