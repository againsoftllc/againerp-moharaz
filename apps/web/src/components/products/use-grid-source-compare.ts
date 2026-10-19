"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  fetchPriceUpdateMatches,
  refreshPriceUpdateMatches,
  removePriceUpdateLink,
  setPriceUpdateManualUrl,
  type PriceUpdateCompetitor,
  type PriceUpdateMatch,
} from "@/lib/api/price-update-plugin";

const SOURCE: PriceUpdateCompetitor = "source";

/**
 * The Source column of the Price Compare screens (company | price, stock dot, re-check, link) for the plain Products list: the grid asks
 * for the rows of the page being shown (saved status only - a plain read, no search), and re-checks / link edits go through the same
 * Price Compare calls. Without `enabled` nothing is loaded and no column is added.
 */
export function useGridSourceCompare(enabled: boolean) {
  const [matches, setMatches] = useState<Record<string, PriceUpdateMatch[]>>({});
  const [syncing, setSyncing] = useState<Set<string>>(() => new Set());
  const asked = useRef(new Set<string>());

  const put = useCallback((productId: string, match: PriceUpdateMatch) => {
    setMatches((cur) => ({
      ...cur,
      [productId]: [...(cur[productId] ?? []).filter((m) => m.competitor !== match.competitor), match],
    }));
  }, []);

  /** Load the saved status of these rows (those not asked for yet). */
  const loadIds = useCallback(
    async (ids: string[]) => {
      if (!enabled) return;
      const need = ids.filter((id) => !asked.current.has(id));
      if (need.length === 0) return;
      need.forEach((id) => asked.current.add(id));
      try {
        const rows = await fetchPriceUpdateMatches(need);
        setMatches((cur) => {
          const next = { ...cur };
          for (const id of need) next[id] = next[id] ?? [];
          for (const m of rows) next[m.product_id] = [...(next[m.product_id] ?? []).filter((x) => x.competitor !== m.competitor), m];
          return next;
        });
      } catch {
        // the Price Compare plugin may not be installed / enabled: the cells just show the company and "Not synced"
        need.forEach((id) => asked.current.delete(id));
      }
    },
    [enabled],
  );

  const onSync = useCallback(
    async (productId: string, competitor: PriceUpdateCompetitor) => {
      const key = `${productId}::${competitor}`;
      setSyncing((cur) => new Set(cur).add(key));
      try {
        const [result] = await refreshPriceUpdateMatches({ productIds: [productId], competitor, allowAi: false });
        if (!result) return;
        put(productId, result);
        if (result.status === "error") toast.error(result.status_message ?? "Price check failed");
        else if (result.status === "matched") toast.success("Source price updated");
        else if (result.status_message) toast.warning(result.status_message);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to re-check this product");
      } finally {
        setSyncing((cur) => {
          const next = new Set(cur);
          next.delete(key);
          return next;
        });
      }
    },
    [put],
  );

  const onSetManualUrl = useCallback(
    async (productId: string, competitor: PriceUpdateCompetitor, url: string, verified: boolean) => {
      if (!url.trim()) {
        try {
          put(productId, await removePriceUpdateLink({ productId, competitor }));
          toast.success("Link removed");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Couldn't remove the link");
          throw err;
        }
        return;
      }
      try {
        await setPriceUpdateManualUrl({ productId, competitor, url, verified });
        const [result] = await refreshPriceUpdateMatches({ productIds: [productId], competitor, allowAi: false });
        if (result) put(productId, result);
        if (result?.status === "matched") toast.success("Source price updated from the URL you set");
        else toast.warning(result?.status_message ?? "URL saved, but no price could be read from it");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save this URL");
        throw err;
      }
    },
    [put],
  );

  const competitors = useMemo(() => (enabled ? [{ key: SOURCE, label: "Source" }] : undefined), [enabled]);

  return { competitors, matches, loadIds, onSync, onSetManualUrl, syncingKeys: syncing };
}
