"use client";

import { useEffect } from "react";
import { getStorefrontBaseUrl } from "@/lib/website/live-edit";

/**
 * Legacy admin Live Edit shell — always bounce to the storefront editor.
 * Do not embed /?liveEdit=1 (that is not the real Live Edit UI).
 */
export function HomeLiveEditShell() {
  useEffect(() => {
    const base = getStorefrontBaseUrl().replace(/\/$/, "") || "http://localhost:3010";
    window.location.replace(`${base}/website/live-edit/home`);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-muted-foreground">
      Opening storefront Live Edit…
    </div>
  );
}
