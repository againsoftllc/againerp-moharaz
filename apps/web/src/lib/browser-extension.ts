import type { PriceUpdateMatch } from "@/lib/api/price-update-plugin";

/**
 * Talks to the "Send to AgainERP" Chrome extension (apps/browser-extension) through its
 * bridge.js content script. When the server can't read a competitor page (e.g. a Cloudflare
 * block), the extension reads it in the admin's own browser and saves the result itself.
 */

type ExtensionReply = {
  source: "againerp-extension";
  type: "ready" | "sync-one-result" | "discover-one-result";
  requestId?: string;
  version?: string;
  ok?: boolean;
  match?: PriceUpdateMatch | null;
  error?: string;
};

export function isPriceExtensionAvailable(): boolean {
  return typeof document !== "undefined" && Boolean(document.documentElement.dataset.againerpExtension);
}

export type ExtensionSyncResult = { ok: boolean; match: PriceUpdateMatch | null; error: string };

function askExtension(
  type: "sync-one" | "discover-one",
  item: Record<string, string | undefined>,
  timeoutMs: number,
): Promise<ExtensionSyncResult> {
  return new Promise((resolve) => {
    if (!isPriceExtensionAvailable()) {
      resolve({ ok: false, match: null, error: "The Send to AgainERP extension isn't installed in this browser" });
      return;
    }
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve({ ok: false, match: null, error: "The extension took too long" });
    }, timeoutMs);
    function onMessage(event: MessageEvent<ExtensionReply>) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== "againerp-extension" || data.type !== `${type}-result`) return;
      if (data.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve({ ok: Boolean(data.ok), match: data.match ?? null, error: data.error ?? "" });
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "againerp-page", type, requestId, item }, window.location.origin);
  });
}

/** Ask the extension to read one saved link now. Resolves (never rejects). */
export function syncLinkViaExtension(item: {
  matchId: string;
  url: string;
  competitorDomain?: string;
  competitorLabel?: string;
}): Promise<ExtensionSyncResult> {
  return askExtension(
    "sync-one",
    {
      match_id: item.matchId,
      url: item.url,
      competitor_domain: item.competitorDomain,
      competitor_label: item.competitorLabel,
    },
    120_000,
  );
}

/** No link yet and the server is blocked: the extension reads the competitor's sitemap in this
 * browser, AgainERP picks the best pages, the extension opens them and the first one that passes
 * the product check is saved with its price. The first run on a site reads its whole sitemap. */
export function discoverLinkViaExtension(item: {
  productId: string;
  competitor: string;
  competitorDomain?: string;
  competitorLabel?: string;
}): Promise<ExtensionSyncResult> {
  return askExtension(
    "discover-one",
    {
      product_id: item.productId,
      competitor: item.competitor,
      competitor_domain: item.competitorDomain,
      competitor_label: item.competitorLabel,
    },
    300_000,
  );
}
