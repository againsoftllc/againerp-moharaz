"use client";

import { useEffect } from "react";
import { getPrimaryWorkspaceSite } from "@/lib/api/workspace-sites";
import { hydrateStorefrontUrlsFromSite } from "@/lib/website/live-edit";

/**
 * Boot-hydrate live-edit / Open website URLs from the primary workspace site
 * so Website Pages work without visiting /workspace/sites first.
 */
export function StorefrontUrlHydrator() {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const site = await getPrimaryWorkspaceSite();
        if (cancelled || !site) return;
        hydrateStorefrontUrlsFromSite(site);
      } catch {
        // Keep env / default :3010
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
