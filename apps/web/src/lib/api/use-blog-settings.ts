"use client";

import { useCallback, useEffect, useState } from "react";
import type { BlogSettings, BlogSettingsInput } from "@/lib/blog/blog-settings";
import { defaultBlogSettingsValues } from "@/lib/blog/blog-settings";
import { fetchBlogSettings, updateBlogSettings } from "@/lib/api/blog-settings";

type UseBlogSettingsState = {
  settings: BlogSettings;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  saveSettings: (input: BlogSettingsInput) => Promise<BlogSettings>;
};

export function useBlogSettings(): UseBlogSettingsState {
  const [settings, setSettings] = useState<BlogSettings>(defaultBlogSettingsValues);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await fetchBlogSettings();
      setSettings(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load blog settings");
      setSettings(defaultBlogSettingsValues());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const saveSettings = useCallback(async (input: BlogSettingsInput) => {
    const saved = await updateBlogSettings(input);
    setSettings(saved);
    return saved;
  }, []);

  return { settings, loading, error, refetch, saveSettings };
}
