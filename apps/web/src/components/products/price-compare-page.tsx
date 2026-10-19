"use client";

import { useAiChatStore } from "@/lib/store/ai-chat-store";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { BrowserExtensionInstall } from "@/components/products/browser-extension-install";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Download, Filter, MousePointerClick, RefreshCw, Settings2, Square } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { ProductGridOpenFallback } from "@/components/products/product-grid-open-fallback";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Product } from "@/lib/mock-data/products";
import type { ProductGridHandle } from "@/components/products/product-grid";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { useCatalogProducts, fetchCatalogProduct } from "@/lib/api/use-catalog-products";
import { useCatalogCategories } from "@/lib/api/use-catalog-categories";
import { useApiHealth } from "@/lib/api/use-api-health";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useViewerWriteUrlGuard } from "@/lib/hooks/use-viewer-write-url-guard";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import {
  fetchPriceUpdateCompetitors,
  fetchPriceUpdateMatches,
  fetchPriceUpdatePlugin,
  installPriceUpdatePlugin,
  updatePriceUpdatePlugin,
  refreshPriceUpdateMatches,
  setPriceUpdateManualUrl,
  removePriceUpdateLink,
  applyCompetitorValues,
  type PriceApplyField,
  type PriceApplyRow,
  type PriceUpdateCompetitor,
  type PriceUpdateCompetitorSite,
  type PriceUpdateMatch,
} from "@/lib/api/price-update-plugin";
import {
  discoverLinkViaExtension,
  isPriceExtensionAvailable,
  syncLinkViaExtension,
} from "@/lib/browser-extension";

// Small on purpose — the grid updates after every chunk completes (see
// handleRefreshCompetitorPrices below), so a smaller chunk means results land in the grid
// sooner and more often instead of one big wait, without needing a streaming/SSE backend.
const REFRESH_CHUNK_SIZE = 5;
// Upper bound per click — high enough to cover a full catalog in one click for typical store
// sizes; still bounded so a runaway click on a huge catalog can't run forever.
const REFRESH_MAX_PRODUCTS = 1000;

/**
 * Same catalog products datatable as /website/products, reused here so prices
 * can be bulk-updated from the Website module — "Live edit" is the entry point.
 */
const ProductGrid = dynamic(
  () => import("@/components/products/product-grid").then((module) => module.ProductGrid),
  {
    ssr: false,
    loading: () => <ProductGridOpenFallback />,
  },
);

const ProductFormDialog = dynamic(
  () =>
    import("@/components/products/product-form-dialog").then(
      (module) => module.ProductFormDialog,
    ),
  { ssr: false },
);

export type PriceComparePageProps = {
  /** the page this grid lives on (deep links and the ?view= dialog stay on it) */
  basePath?: string;
  title?: string;
  /** only products whose status is unlisted (and the publish / remove / archive buttons stay in the bulk bar) */
  draftOnly?: boolean;
  /** localStorage key of the grid's column layout */
  columnStateKey?: string;
};

function PriceUpdateContent({
  basePath = "/website/price-compare",
  title = "Price Compare",
  draftOnly = false,
  columnStateKey = "price-compare-grid:columnState",
}: PriceComparePageProps) {
  const buildPriceUpdateUrl = (params: URLSearchParams) => {
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  const router = useRouter();
  const searchParams = useSearchParams();
  // only the rows this screen compares: the unlisted products for the Unlisted page, the published website products for Price Compare (the 24k imported
  // drafts are not loaded there - loading every product made the page slow / fail once the catalog passed ~36k)
  const [extensionSheetOpen, setExtensionSheetOpen] = useState(false);
  const { products: allProducts, loading, error, refetch } = useCatalogProducts({ channel: "catalog", status: draftOnly ? "unlisted" : "published" });
  const products = allProducts;
  const { categories } = useCatalogCategories({ channel: "catalog" });
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const productGridRef = useRef<ProductGridHandle>(null);
  const [advancedFilterCount, setAdvancedFilterCount] = useState(0);
  const [competitorMatches, setCompetitorMatches] = useState<Record<string, PriceUpdateMatch[]>>({});
  const [competitorSites, setCompetitorSites] = useState<PriceUpdateCompetitorSite[]>([]);
  // The grid waits for the site columns so they don't pop in and shift the saved layout.
  const [competitorsLoaded, setCompetitorsLoaded] = useState(false);
  // `${productId}::${competitor}` pairs the in-progress bulk chunk is fetching right now —
  // spins the matching cell's sync icon live. Chunk-granularity, not per-item: one request
  // covers a whole chunk (all enabled competitors for every product in it) with no streaming
  // backend to report finer progress, so everything in the current chunk lights up together.
  const [syncingPairs, setSyncingPairs] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  // Product Draft: ids whose AI import (fill from the source URL) is running
  const aiImporting = useMemo(() => new Set<string>(), []);
  // the AI button opens Aladin's chat drawer for the product; the drawer does the import and asks for approvals
  // the AI button runs the product upload in the shared Aladin drawer (the same drawer as the AI icon in the top bar)
  const handleAiImport = (product: Product) =>
    useAiChatStore.getState().startProductTask({ id: product.id, name: product.name }, () => void refetch());

  const productIds = useMemo(() => products.map((p) => p.id), [products]);
  const [loadingStatus, setLoadingStatus] = useState(false);

  useEffect(() => {
    void fetchPriceUpdateCompetitors()
      .then(setCompetitorSites)
      .catch(() => {
        // Plugin may not be installed/enabled yet — grid just shows no competitor columns.
      })
      .finally(() => setCompetitorsLoaded(true));
  }, []);

  // With the plugin off, saving a link works but checking its price is refused by the API —
  // a link then sat "Not refreshed yet" with no visible reason. Say so up front instead.
  const [pluginActive, setPluginActive] = useState<boolean | null>(null);
  const [activating, setActivating] = useState(false);
  useEffect(() => {
    void fetchPriceUpdatePlugin()
      .then((p) => setPluginActive(p.installed && p.enabled))
      .catch(() => setPluginActive(null));
  }, []);
  const handleActivatePlugin = async () => {
    setActivating(true);
    try {
      await installPriceUpdatePlugin();
      const p = await updatePriceUpdatePlugin({ enabled: true });
      setPluginActive(p.installed && p.enabled);
      setCompetitorSites(await fetchPriceUpdateCompetitors());
      toast.success("Price compare is on — sync any saved link with its ↻ button");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not turn on price compare");
    } finally {
      setActivating(false);
    }
  };

  const competitorColumns = useMemo(
    () =>
      competitorSites.filter((c) => c.enabled).map((c) => ({ key: c.id, label: c.label })),
    [competitorSites],
  );

  // Which sites "Check competitor prices" covers (toolbar and the selected-rows bar). null = all.
  // Remembered per browser, so "only Ryans + Techland" stays picked between visits.
  const SITES_KEY = "priceCompare.checkSites";
  const [pickedSites, setPickedSites] = useState<string[] | null>(null);
  useEffect(() => {
    // Read after mount so the server render and the first client render match.
    try {
      const raw = window.localStorage.getItem(SITES_KEY);
      if (raw) setPickedSites(JSON.parse(raw) as string[]);
    } catch {
      /* nothing remembered */
    }
  }, []);
  const checkSites = useMemo(() => {
    const all = competitorColumns.map((c) => c.key);
    const picked = pickedSites?.filter((k) => all.includes(k)) ?? [];
    return picked.length ? picked : all;
  }, [competitorColumns, pickedSites]);
  const allSitesPicked = checkSites.length === competitorColumns.length;
  const savePickedSites = (next: string[] | null) => {
    setPickedSites(next);
    try {
      if (next) window.localStorage.setItem(SITES_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(SITES_KEY);
    } catch {
      /* private mode — the choice just isn't remembered */
    }
  };
  const toggleSite = (key: string) => {
    const next = checkSites.includes(key) ? checkSites.filter((k) => k !== key) : [...checkSites, key];
    if (next.length === 0) return; // at least one site
    savePickedSites(next.length === competitorColumns.length ? null : next);
  };
  const siteLabels = (keys: string[]) =>
    keys.map((k) => competitorColumns.find((c) => c.key === k)?.label ?? k).join(", ");

  // Auto-loads only the already-saved status (a plain DB read — no Google Search call, no
  // cost) so a page reload doesn't look like the sync "disappeared". Only the actual Google
  // Search — "Check competitor prices" / the per-cell retry — stays manual-only; that
  // distinction was lost in an earlier pass that made this whole effect manual too.
  useEffect(() => {
    if (productIds.length === 0) return;
    let cancelled = false;
    void fetchPriceUpdateMatches(productIds)
      .then((matches) => {
        if (cancelled) return;
        const grouped: Record<string, PriceUpdateMatch[]> = {};
        for (const m of matches) {
          (grouped[m.product_id] ??= []).push(m);
        }
        setCompetitorMatches(grouped);
      })
      .catch(() => {
        // Plugin may not be installed/enabled yet — grid just shows no competitor columns data.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIds.join(",")]);

  // Manual re-load button — same read, but with a toast, for "did my earlier sync really save?"
  const handleLoadSavedStatus = async () => {
    if (loadingStatus || productIds.length === 0) return;
    setLoadingStatus(true);
    try {
      const matches = await fetchPriceUpdateMatches(productIds);
      const grouped: Record<string, PriceUpdateMatch[]> = {};
      for (const m of matches) {
        (grouped[m.product_id] ??= []).push(m);
      }
      setCompetitorMatches(grouped);
      toast.success("Loaded saved competitor status");
    } catch (err) {
      // Plugin may not be installed/enabled yet — grid just shows no competitor columns data.
      toast.error(err instanceof Error ? err.message : "Failed to load competitor status");
    } finally {
      setLoadingStatus(false);
    }
  };

  // Bulk checks run as small requests one after another, so Stop can end them between requests
  // (and abort the one in flight — the server finishes that batch of ≤5 products).
  const stopRef = useRef(false);
  // In-flight batch requests (up to two run at once) — Stop aborts them all.
  const abortRef = useRef<Set<AbortController>>(new Set());
  const stopRefresh = () => {
    stopRef.current = true;
    abortRef.current.forEach((c) => c.abort());
    toast.loading("Stopping…", { id: "price-update-refresh" });
  };

  /** Cells ticked for a bulk check, as `${productId}::${competitor}` (shown when that site's
   * header tick box is on). */
  const [cellPicks, setCellPicks] = useState<Set<string>>(new Set());
  const toggleCellPick = (productId: string, competitor: PriceUpdateCompetitor) =>
    setCellPicks((prev) => {
      const next = new Set(prev);
      const key = `${productId}::${competitor}`;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // "Update price" / "Update stock" on the picked cells: preview first, then apply on confirm.
  const [applyPlan, setApplyPlan] = useState<{ field: PriceApplyField; rows: PriceApplyRow[] } | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const pickedItems = () =>
    [...cellPicks].map((key) => {
      const [productId, competitor] = key.split("::");
      return { productId, competitor };
    });
  const openApply = async (field: PriceApplyField) => {
    if (cellPicks.size === 0) return;
    setApplyBusy(true);
    try {
      const rows = await applyCompetitorValues({ field, items: pickedItems(), dryRun: true });
      setApplyPlan({ field, rows });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't prepare the update");
    } finally {
      setApplyBusy(false);
    }
  };
  const confirmApply = async () => {
    if (!applyPlan) return;
    setApplyBusy(true);
    try {
      const rows = await applyCompetitorValues({ field: applyPlan.field, items: pickedItems(), dryRun: false });
      const done = rows.filter((r) => r.applied).length;
      const failed = rows.filter((r) => r.applied === false);
      if (failed.length) {
        toast.warning(`Updated ${done} product${done === 1 ? "" : "s"} — ${failed.length} failed`, {
          description: failed[0].skip ?? undefined,
        });
      } else {
        toast.success(
          `Updated the ${applyPlan.field === "price" ? "price" : "stock status"} of ${done} product${done === 1 ? "" : "s"}`,
        );
      }
      setApplyPlan(null);
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setApplyBusy(false);
    }
  };

  type RefreshTask = { competitor?: PriceUpdateCompetitor; ids: string[] };

  const runRefreshTasks = async (tasks: RefreshTask[], label: string, productCount: number) => {
    if (refreshing) {
      toast.info("A price check is already running — wait for it to finish, or press Stop");
      return;
    }
    if (tasks.length === 0) return;
    setRefreshing(true);
    stopRef.current = false;
    const allResults: PriceUpdateMatch[] = [];
    let done = 0;
    let stopped = false;
    try {
      // Two batches in flight at once. The server reads each site in parallel with its own
      // pacing, so a second batch keeps every site busy without bursting any one of them.
      let nextTask = 0;
      const showProgress = () =>
        toast.loading(`Checking ${label} — ${done} of ${tasks.length} batches done…`, {
          id: "price-update-refresh",
          action: { label: "Stop", onClick: stopRefresh },
        });
      const runBatches = async () => {
        while (nextTask < tasks.length) {
          if (stopRef.current) {
            stopped = true;
            return;
          }
          const task = tasks[nextTask++];
          showProgress();
          const sites = task.competitor ? [task.competitor] : competitorColumns.map(({ key }) => key);
          const keys = task.ids.flatMap((id) => sites.map((key) => `${id}::${key}`));
          setSyncingPairs((prev) => new Set([...prev, ...keys]));
          const controller = new AbortController();
          abortRef.current.add(controller);
          try {
            const results = await refreshPriceUpdateMatches({
              productIds: task.ids,
              competitor: task.competitor,
              signal: controller.signal,
            });
            allResults.push(...results);
            setCompetitorMatches((prev) => {
              const next = { ...prev };
              for (const m of results) {
                const existing = (next[m.product_id] ?? []).filter((x) => x.competitor !== m.competitor);
                next[m.product_id] = [...existing, m];
              }
              return next;
            });
            done += 1;
            showProgress();
          } catch (err) {
            if (controller.signal.aborted) {
              stopped = true;
              return;
            }
            throw err;
          } finally {
            abortRef.current.delete(controller);
            setSyncingPairs((prev) => {
              const next = new Set(prev);
              for (const k of keys) next.delete(k);
              return next;
            });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(2, tasks.length) }, runBatches));

      // Second pass: cells the server couldn't read (Cloudflare block, timeout…) go to the
      // Send to AgainERP extension, one at a time in this browser, paced so the shop doesn't
      // start checking the browser too.
      let viaBrowser = 0;
      const blocked = stopped ? [] : allResults.filter((r) => r.status === "error");
      if (blocked.length > 0 && isPriceExtensionAvailable()) {
        // Several at once: the extension runs them in a few tabs and keeps each site within its
        // own limits (≤3 tabs per site, pages spaced out), so it's safe to hand it a handful.
        let next = 0;
        let finished = 0;
        const showProgress = (siteLabel: string) =>
          toast.loading(
            `${siteLabel} blocks the server — reading through your browser, ${finished} of ${blocked.length} done…`,
            { id: "price-update-refresh", action: { label: "Stop", onClick: stopRefresh } },
          );
        const worker = async () => {
          while (next < blocked.length && !stopRef.current) {
            const failed = blocked[next++];
            const site = competitorSites.find((c) => c.id === failed.competitor);
            const siteLabel = site?.label ?? failed.competitor;
            showProgress(siteLabel);
            const key = `${failed.product_id}::${failed.competitor}`;
            setSyncingPairs((prev) => new Set([...prev, key]));
            try {
              const result = failed.matched_url
                ? await syncLinkViaExtension({
                    matchId: failed.id,
                    url: failed.matched_url,
                    competitorDomain: site?.domain,
                    competitorLabel: siteLabel,
                  })
                : await discoverLinkViaExtension({
                    productId: failed.product_id,
                    competitor: failed.competitor,
                    competitorDomain: site?.domain,
                    competitorLabel: siteLabel,
                  });
              if (result.match) {
                putMatch(failed.product_id, failed.competitor, result.match);
                const at = allResults.indexOf(failed);
                if (at >= 0) allResults[at] = result.match;
              }
              if (result.ok) viaBrowser += 1;
            } finally {
              finished += 1;
              setSyncingPairs((prev) => {
                const nextSet = new Set(prev);
                nextSet.delete(key);
                return nextSet;
              });
              showProgress(siteLabel);
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(5, blocked.length) }, worker));
        if (stopRef.current) stopped = true;
      }

      const errored = allResults.filter((r) => r.status === "error");
      toast.dismiss("price-update-refresh");
      if (viaBrowser > 0 && !stopped) {
        const notFound = allResults.filter((r) => r.status !== "matched").length;
        toast.success(
          `Checked ${label} — ${viaBrowser} read through your browser` +
            (notFound ? `, ${notFound} without a price (hover the cell for why)` : ""),
          { id: "price-update-result" },
        );
      } else if (stopped) {
        toast.info(`Stopped — ${done} of ${tasks.length} batches checked (${allResults.length} prices updated)`, {
          id: "price-update-result",
        });
      } else if (errored.length > 0 && errored.length === allResults.length) {
        toast.error(errored[0].status_message ?? "All competitor price checks failed", { id: "price-update-result" });
      } else if (errored.length > 0) {
        toast.warning(
          `Checked ${label} — ${errored.length} check${errored.length === 1 ? "" : "s"} failed`,
          { id: "price-update-result", description: errored[0].status_message ?? undefined },
        );
      } else {
        toast.success(`Checked ${label} (${productCount} product${productCount === 1 ? "" : "s"})`, {
          id: "price-update-result",
        });
      }
    } catch (err) {
      toast.dismiss("price-update-refresh");
      toast.error(err instanceof Error ? err.message : "Failed to refresh competitor prices", {
        id: "price-update-result",
      });
    } finally {
      setRefreshing(false);
      stopRef.current = false;
    }
  };

  /** Bulk check for the products shown (or selected), on the sites picked in the Sites menu. */
  const handleRefreshCompetitorPrices = async (overrideIds?: string[]) => {
    // The rows on screen (search box + filters applied), not the whole catalogue.
    const sourceIds = (overrideIds ?? productGridRef.current?.getShownProductIds() ?? productIds).slice(
      0,
      REFRESH_MAX_PRODUCTS,
    );
    // One request per chunk covers every site; a subset needs one request per picked site.
    const perSite: (PriceUpdateCompetitor | undefined)[] = allSitesPicked ? [undefined] : checkSites;
    const tasks: RefreshTask[] = [];
    for (let i = 0; i < sourceIds.length; i += REFRESH_CHUNK_SIZE) {
      const ids = sourceIds.slice(i, i + REFRESH_CHUNK_SIZE);
      for (const competitor of perSite) tasks.push({ competitor, ids });
    }
    await runRefreshTasks(
      tasks,
      allSitesPicked ? "competitor prices" : `${siteLabels(checkSites)} prices`,
      sourceIds.length,
    );
  };

  /** Bulk check for just the ticked cells (e.g. 4 Ryans products and 2 Techland ones). */
  const handleRefreshPickedCells = async () => {
    const bySite = new Map<string, string[]>();
    for (const key of cellPicks) {
      const [productId, competitor] = key.split("::");
      bySite.set(competitor, [...(bySite.get(competitor) ?? []), productId]);
    }
    const tasks: RefreshTask[] = [];
    for (const [competitor, ids] of bySite) {
      for (let i = 0; i < ids.length; i += REFRESH_CHUNK_SIZE) {
        tasks.push({ competitor, ids: ids.slice(i, i + REFRESH_CHUNK_SIZE) });
      }
    }
    await runRefreshTasks(tasks, `${cellPicks.size} selected cell${cellPicks.size === 1 ? "" : "s"}`, cellPicks.size);
  };

  /** Re-check one product/competitor pair from its cell's sync button — free: re-reads the
   * saved link only (price pattern + structured data), never Google Search or AI. */
  const putMatch = (productId: string, competitor: PriceUpdateCompetitor, match: PriceUpdateMatch) =>
    setCompetitorMatches((prev) => {
      const existing = (prev[productId] ?? []).filter((m) => m.competitor !== competitor);
      return { ...prev, [productId]: [...existing, match] };
    });

  /** The server couldn't read a saved link (Cloudflare block, timeout…) — if the Send to
   * AgainERP extension is installed, read it in this browser instead. Returns its result, or
   * null when the extension can't help (not installed, no link). */
  const readWithExtension = async (
    productId: string,
    competitor: PriceUpdateCompetitor,
    failed: PriceUpdateMatch,
  ): Promise<PriceUpdateMatch | null> => {
    if (failed.status !== "error") return null;
    const site = competitorSites.find((c) => c.id === competitor);
    const label = site?.label ?? competitor;
    if (!isPriceExtensionAvailable()) {
      toast.error(`The server couldn't read ${label}`, {
        description:
          "To read it through your own browser instead, install the “Send to AgainERP” Chrome extension (or reload it at chrome://extensions → ↻), then reload this page and click ↻ again.",
        duration: 15000,
        action: { label: "Install extension", onClick: () => setExtensionSheetOpen(true) },
      });
      return failed;
    }
    const toastId = toast.loading(
      failed.matched_url
        ? `The server couldn't read ${label} — reading it in your browser…`
        : `The server can't search ${label} — finding the product page through your browser (the first time on a site can take a minute)…`,
    );
    const result = failed.matched_url
      ? await syncLinkViaExtension({
          matchId: failed.id,
          url: failed.matched_url,
          competitorDomain: site?.domain,
          competitorLabel: label,
        })
      : await discoverLinkViaExtension({
          productId,
          competitor,
          competitorDomain: site?.domain,
          competitorLabel: label,
        });
    if (result.match) putMatch(productId, competitor, result.match);
    if (result.ok && result.match) {
      toast.success(`${label} price updated through your browser`, { id: toastId });
      return result.match;
    }
    toast.error(result.error || `Your browser couldn't read ${label} either`, { id: toastId });
    return result.match;
  };

  const handleSyncCompetitor = async (productId: string, competitor: PriceUpdateCompetitor) => {
    try {
      const [result] = await refreshPriceUpdateMatches({ productIds: [productId], competitor, allowAi: false });
      if (!result) return;
      putMatch(productId, competitor, result);
      if (result.status === "error" && (await readWithExtension(productId, competitor, result))) return;
      if (result.status === "error") {
        toast.error(result.status_message ?? "Competitor price check failed");
      } else if (result.status === "matched") {
        toast.success(`${competitor} price updated`);
      } else if (result.status_message) {
        toast.warning(result.status_message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to re-check this product");
    }
  };

  /** Search (Google + AI) still can't find the right page for some products — this is the
   * fallback: paste the product's page on that site directly, skipping discovery entirely. */
  const handleSetManualUrl = async (
    productId: string,
    competitor: PriceUpdateCompetitor,
    url: string,
    verified: boolean,
  ) => {
    if (!url.trim()) {
      try {
        putMatch(productId, competitor, await removePriceUpdateLink({ productId, competitor }));
        toast.success("Link removed — this site won't be searched for this product until you add a link");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't remove the link");
        throw err;
      }
      return;
    }
    try {
      await setPriceUpdateManualUrl({ productId, competitor, url, verified });
      // The link is known now — reading its price is the free sync, no search or AI needed.
      const [result] = await refreshPriceUpdateMatches({ productIds: [productId], competitor, allowAi: false });
      if (result) putMatch(productId, competitor, result);
      if (result?.status === "error" && (await readWithExtension(productId, competitor, result))) return;
      if (result?.status === "matched") {
        toast.success(`${competitor} price updated from the ${verified ? "verified " : ""}URL you set`);
      } else if (result) {
        toast.warning(result.status_message ?? "URL saved, but no price could be read from it");
      } else {
        toast.success("URL saved");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save this URL");
      throw err;
    }
  };

  const [formSheetOpen, setFormSheetOpen] = useState(false);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [fetchedEditProduct, setFetchedEditProduct] = useState<Product | null>(null);

  const editProduct = useMemo(() => {
    if (!editProductId) return null;
    return allProducts.find((p) => p.id === editProductId) ?? fetchedEditProduct;
  }, [editProductId, allProducts, fetchedEditProduct]);

  useEffect(() => {
    if (!editProductId) {
      setFetchedEditProduct(null);
      return;
    }
    if (allProducts.some((p) => p.id === editProductId)) {
      setFetchedEditProduct(null);
      return;
    }
    let cancelled = false;
    void fetchCatalogProduct(editProductId)
      .then((product) => {
        if (!cancelled) setFetchedEditProduct(product);
      })
      .catch(() => {
        if (!cancelled) setFetchedEditProduct({ id: editProductId } as Product);
      });
    return () => {
      cancelled = true;
    };
  }, [editProductId, allProducts]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "price-update-api" });
  }, [error]);

  const pushParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.push(buildPriceUpdateUrl(params), { scroll: false });
  };

  const handleEdit = (product: Product) => {
    setEditProductId(product.id);
    setFormSheetOpen(true);
    pushParams((params) => params.delete("view"));
  };

  const closeForm = () => {
    setFormSheetOpen(false);
    setEditProductId(null);
  };

  useViewerWriteUrlGuard(formSheetOpen, closeForm);

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title={title}>
      {canWrite ? (
        <Button
          size="sm"
          className="rounded-none"
          onClick={() => productGridRef.current?.openLiveEdit()}
        >
          <MousePointerClick className="mr-1.5 h-3.5 w-3.5" />
          Live edit
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        className="rounded-none"
        onClick={() => void handleLoadSavedStatus()}
        disabled={loadingStatus}
        title="Load the competitor status already saved from a previous check — does not search Google again"
      >
        <Download className={cn("mr-1.5 h-3.5 w-3.5", loadingStatus && "animate-pulse")} />
        Load saved status
      </Button>
      {canWrite ? (
        <div className="flex">
          <Button
            size="sm"
            variant="outline"
            className="rounded-none"
            onClick={() => void handleRefreshCompetitorPrices()}
            disabled={refreshing}
            title={`Check ${allSitesPicked ? "every site" : siteLabels(checkSites)} for the products shown — pick sites with the arrow`}
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", refreshing && "animate-spin")} />
            {refreshing ? "Checking…" : "Check competitor prices"}
            {!allSitesPicked ? (
              <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-px text-[11px] font-medium text-primary">
                {siteLabels(checkSites)}
              </span>
            ) : null}
          </Button>
          {refreshing ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-none border-l-0 text-red-600 hover:text-red-700 dark:text-red-400"
              onClick={stopRefresh}
              title="Stop the running price check"
            >
              <Square className="mr-1.5 h-3 w-3 fill-current" />
              Stop
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="rounded-none border-l-0 px-1.5"
                disabled={refreshing || competitorColumns.length === 0}
                title="Choose which sites to check"
                aria-label="Choose which sites to check"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Sites to check</DropdownMenuLabel>
              {competitorColumns.map(({ key, label }) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={checkSites.includes(key)}
                  // Keep the menu open so several sites can be ticked in one go.
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => toggleSite(key)}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              {!allSitesPicked ? (
                <DropdownMenuItem onSelect={() => savePickedSites(null)}>Select all sites</DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => void handleRefreshCompetitorPrices()}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Check {allSitesPicked ? "all sites" : siteLabels(checkSites)} now
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "relative h-[26px] w-[26px] shrink-0 rounded-none",
              apiHealth.status === "connected" &&
                "border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400",
              apiHealth.status === "partial" &&
                "border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400",
              apiHealth.status === "disconnected" &&
                "border-red-500/50 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400",
              apiHealth.status === "checking" && "text-muted-foreground",
            )}
            aria-label={`Settings (${healthTitle})`}
            title={healthTitle}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {advancedFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-none bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
                {advancedFilterCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          <DropdownMenuItem
            onClick={() => {
              void refetch();
              apiHealth.recheck();
            }}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => productGridRef.current?.openFilters()}>
            <Filter className="mr-1.5 h-3 w-3" />
            Filters
            {advancedFilterCount > 0 ? (
              <span className="ml-auto text-[10px] text-muted-foreground">{advancedFilterCount}</span>
            ) : null}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Sheet open={extensionSheetOpen} onOpenChange={setExtensionSheetOpen}>
        <SheetContent side="right" title="Install the browser extension" className="w-[460px] overflow-y-auto">
          <div className="space-y-3 p-4">
            <p className="text-sm font-semibold">Send to AgainERP - Chrome extension</p>
            <BrowserExtensionInstall />
          </div>
        </SheetContent>
      </Sheet>
      {pluginActive === false ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm">
          <span>
            <span className="font-medium">Price compare is turned off.</span>{" "}
            <span className="text-muted-foreground">
              Links can be saved, but competitor prices and stock can’t be checked until it is on.
            </span>
          </span>
          <Button size="sm" className="h-7 rounded-none" disabled={activating} onClick={() => void handleActivatePlugin()}>
            {activating ? "Turning on…" : "Turn on"}
          </Button>
        </div>
      ) : null}
      {error && !loading ? (
        <div className="rounded-none border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">Could not load products from API</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3 rounded-none" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <ProductGrid
          ref={productGridRef}
          products={products}
          categories={categories}
          loading={loading && products.length === 0}
          preset="catalog"
          onView={() => undefined}
          disableView
          onEdit={handleEdit}
          // Only the product title opens the view drawer here — the rest of the row is
          // competitor links, prices and sync buttons that must not trigger it.
          nameClickAction={draftOnly ? "edit" : "view"}
          rowClickOpensView={false}
          onProductsChanged={() => void refetch()}
          onAdvancedFilterCountChange={setAdvancedFilterCount}
          headerLeftActions={headerLeftActions}
          competitors={competitorColumns}
          competitorMatches={competitorMatches}
          onSyncCompetitor={handleSyncCompetitor}
          onBulkCheckCompetitorPrices={(products) => void handleRefreshCompetitorPrices(products.map((p) => p.id))}
          bulkCheckSitesLabel={allSitesPicked ? undefined : siteLabels(checkSites)}
          columnStateKey={columnStateKey}
          onAiImport={draftOnly ? handleAiImport : undefined}
          aiImportingIds={aiImporting}
          hideCatalogBulkActions={!draftOnly}
          layoutReady={competitorsLoaded}
          onSetCellPicks={(keys, picked) =>
            setCellPicks((prev) => {
              const next = new Set(prev);
              for (const k of keys) {
                if (picked) next.add(k);
                else next.delete(k);
              }
              return next;
            })
          }
          pickedCells={cellPicks}
          onToggleCellPick={toggleCellPick}
          onCheckPickedCells={() => void handleRefreshPickedCells()}
          onApplyPicked={(field) => void openApply(field)}
          onClearCellPicks={() => setCellPicks(new Set())}
          bulkRunning={refreshing}
          onStopBulk={stopRefresh}
          onSetManualUrl={handleSetManualUrl}
          competitorSyncingKeys={syncingPairs}
          className="min-h-0 flex-1"
        />
      )}


      <Dialog.Root
        open={!!applyPlan}
        onOpenChange={(open) => {
          if (!open && !applyBusy) setApplyPlan(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-input bg-background p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold">
              {applyPlan?.field === "price" ? "Update our prices" : "Update our stock status"}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              {(() => {
                const n = applyPlan?.rows.filter((r) => !r.skip).length ?? 0;
                return applyPlan?.field === "price"
                  ? `${n} product${n === 1 ? "" : "s"} will get the competitor's price on the website and catalog.`
                  : `${n} product${n === 1 ? "" : "s"} will get the competitor's stock status.`;
              })()}
            </Dialog.Description>
            <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-md border border-input">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium">From</th>
                    <th className="px-3 py-2 font-medium">Now</th>
                    <th className="px-3 py-2 font-medium">New</th>
                  </tr>
                </thead>
                <tbody>
                  {applyPlan?.rows.map((r) => {
                    const fmt = (v: number | string | null) =>
                      v == null ? "—" : typeof v === "number" ? formatCurrency(v) : v;
                    return (
                      <tr key={r.product_id} className={cn("border-t border-input", r.skip && "text-muted-foreground")}>
                        <td className="max-w-[260px] truncate px-3 py-1.5" title={r.name}>
                          {r.name}
                        </td>
                        <td className="px-3 py-1.5">{r.site ?? "—"}</td>
                        <td className="px-3 py-1.5">{fmt(r.current)}</td>
                        <td className="px-3 py-1.5">
                          {r.skip ? <span className="italic">Skipped — {r.skip}</span> : <span className="font-medium">{fmt(r.new)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={applyBusy} onClick={() => setApplyPlan(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={applyBusy || !applyPlan?.rows.some((r) => !r.skip)}
                onClick={() => void confirmApply()}
              >
                {applyBusy ? "Updating…" : `Update ${applyPlan?.rows.filter((r) => !r.skip).length ?? 0}`}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {canWrite && formSheetOpen && editProductId && (
        <ProductFormDialog
          open={formSheetOpen}
          onOpenChange={(open) => {
            if (!open) closeForm();
            else setFormSheetOpen(true);
          }}
          mode="edit"
          product={editProduct ?? ({ id: editProductId } as Product)}
          onSaved={() => void refetch()}
        />
      )}
    </div>
  );
}

export function PriceComparePage(props: PriceComparePageProps) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={<ProductGridOpenFallback />}>
        <PriceUpdateContent {...props} />
      </Suspense>
    </div>
  );
}
