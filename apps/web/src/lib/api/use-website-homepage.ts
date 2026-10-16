"use client";

import { useCallback, useEffect, useState } from "react";
import type { HomepageContent, WebsiteHomepage } from "@/lib/website/website-homepage";
import { defaultHomepageContent } from "@/lib/website/website-homepage";
import { fetchWebsiteHomepage, updateWebsiteHomepage } from "@/lib/api/website-homepage";

type UseWebsiteHomepageState = {
  homepage: WebsiteHomepage | null;
  content: HomepageContent;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  saveContent: (content: HomepageContent) => Promise<WebsiteHomepage>;
};

export function useWebsiteHomepage(): UseWebsiteHomepageState {
  const [homepage, setHomepage] = useState<WebsiteHomepage | null>(null);
  const [content, setContent] = useState<HomepageContent>(() => defaultHomepageContent());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await fetchWebsiteHomepage();
      setHomepage(row);
      setContent(row.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load homepage");
      setHomepage(null);
      setContent(defaultHomepageContent());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const saveContent = useCallback(async (next: HomepageContent) => {
    const saved = await updateWebsiteHomepage({ content: next });
    setHomepage(saved);
    setContent(saved.content);
    return saved;
  }, []);

  return { homepage, content, loading, error, refetch, saveContent };
}
