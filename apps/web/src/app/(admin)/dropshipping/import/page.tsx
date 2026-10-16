"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckSquare,
  Download,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  bulkImportElimProducts,
  fetchElimStatus,
  importElimProduct,
  previewSellBdt,
  saveElimPricingDefaults,
  searchElimProducts,
  type ElimPlatform,
  type ElimPricing,
  type ElimSearchItem,
} from "@/lib/api/elim-import";
import { ApiError } from "@/lib/api/client";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn, formatCurrency } from "@/lib/utils";

const DEFAULT_PRICING: ElimPricing = {
  exchange_rate: 16,
  markup_percent: 30,
  profit_bdt: 0,
  server_charge_bdt: 0,
};

function ElimImportContent() {
  const canWrite = useAdminCanWrite();
  const [q, setQ] = useState("phone case");
  const [platform, setPlatform] = useState<ElimPlatform>("taobao");
  const [items, setItems] = useState<ElimSearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [pricing, setPricing] = useState<ElimPricing>(DEFAULT_PRICING);
  const [status, setStatus] = useState<"draft" | "published">("published");
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [showPricing, setShowPricing] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const s = await fetchElimStatus();
      setConfigured(s.configured);
      if (s.pricing_defaults) {
        setPricing({
          exchange_rate: s.pricing_defaults.exchange_rate ?? 16,
          markup_percent: s.pricing_defaults.markup_percent ?? 30,
          profit_bdt: s.pricing_defaults.profit_bdt ?? 0,
          server_charge_bdt: s.pricing_defaults.server_charge_bdt ?? 0,
        });
      }
    } catch {
      setConfigured(false);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([id]) => id),
    [selected],
  );

  const PAGE_SIZE = 24;

  const hasMore = items.length > 0 && items.length < total;

  const runSearch = useCallback(async () => {
    const query = q.trim();
    if (!query) {
      toast.error("Search keyword / category required");
      return;
    }
    setLoading(true);
    try {
      const res = await searchElimProducts({ q: query, platform, page: 1, size: PAGE_SIZE });
      setItems(res.items);
      setTotal(res.total);
      setPage(res.page || 1);
      setSelected({});
      if (!res.items.length) toast.message("No products found");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Search failed";
      toast.error(msg);
      setItems([]);
      setTotal(0);
      setPage(1);
    } finally {
      setLoading(false);
    }
  }, [q, platform]);

  const loadMore = useCallback(async () => {
    const query = q.trim();
    if (!query || loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const res = await searchElimProducts({
        q: query,
        platform,
        page: nextPage,
        size: PAGE_SIZE,
      });
      if (!res.items.length) {
        setTotal(items.length);
        return;
      }
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        const appended = res.items.filter((i) => !seen.has(i.id));
        return [...prev, ...appended];
      });
      setPage(res.page || nextPage);
      setTotal(res.total);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [q, platform, page, loadingMore, hasMore, items.length]);

  const pricingPayload = {
    exchange_rate: pricing.exchange_rate,
    markup_percent: pricing.markup_percent,
    profit_bdt: pricing.profit_bdt,
    server_charge_bdt: pricing.server_charge_bdt,
  };

  const onSaveDefaults = async () => {
    if (!canWrite) return;
    setSavingDefaults(true);
    try {
      const res = await saveElimPricingDefaults(pricingPayload);
      if (res.pricing_defaults) setPricing(res.pricing_defaults);
      toast.success(res.message || "Pricing defaults saved for storefront");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save defaults");
    } finally {
      setSavingDefaults(false);
    }
  };

  const onImportOne = async (item: ElimSearchItem) => {
    if (!canWrite) return;
    setImportingId(item.id);
    try {
      const res = await importElimProduct({
        elim_id: item.id,
        platform,
        status,
        ...pricingPayload,
      });
      toast.success(
        res.created
          ? `Imported ${formatCurrency(Number(res.price))}: ${res.name.slice(0, 40)}${res.name.length > 40 ? "…" : ""}`
          : `Refreshed in catalog: ${res.sku}`,
        {
          action: {
            label: "Open",
            onClick: () => {
              window.location.href = `/dropshipping/products/${res.product_id}`;
            },
          },
        },
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setImportingId(null);
    }
  };

  const onBulkImport = async () => {
    if (!canWrite) return;
    if (!selectedIds.length) {
      toast.error("Select at least one product");
      return;
    }
    setBulkLoading(true);
    try {
      const res = await bulkImportElimProducts({
        elim_ids: selectedIds,
        platform,
        status,
        ...pricingPayload,
      });
      toast.success(
        `Added ${res.imported.length}, skipped ${res.skipped.length}` +
          (res.errors.length ? `, errors ${res.errors.length}` : ""),
      );
      if (res.errors[0]) toast.error(`${res.errors[0].elim_id}: ${res.errors[0].error}`);
      setSelected({});
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Bulk import failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const toggleAll = (on: boolean) => {
    const next: Record<string, boolean> = {};
    if (on) for (const item of items) next[item.id] = true;
    setSelected(next);
  };

  const configStatus =
    configured === true ? "connected" : configured === false ? "disconnected" : "checking";

  return (
    <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {/* Toolbar — matches product-grid filters */}
      <div
        data-component="elim-import-filters"
        className="flex min-w-0 shrink-0 items-center gap-2 border-b border-border py-2 pl-2 pr-2"
      >
        {canWrite && (
          <div className="flex shrink-0 items-center gap-2 border-r border-border bg-background pr-2">
            <Button
              size="sm"
              onClick={() => void runSearch()}
              disabled={loading || configured === false}
            >
              {loading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-1.5 h-4 w-4" />
              )}
              Search
            </Button>
          </div>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Input
            placeholder="Keyword / category…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void runSearch()}
            className="w-[220px] shrink-0 rounded-none"
            aria-label="Search keyword"
          />
          <Select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as ElimPlatform)}
            className="w-[148px] shrink-0 rounded-none"
            aria-label="Platform"
          >
            <option value="taobao">Taobao</option>
            <option value="alibaba">1688 / Alibaba</option>
          </Select>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as "draft" | "published")}
            className="w-[140px] shrink-0 rounded-none"
            aria-label="Catalog status"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </Select>
          {!canWrite && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-none"
              onClick={() => void runSearch()}
              disabled={loading || configured === false}
            >
              {loading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-1.5 h-4 w-4" />
              )}
              Search
            </Button>
          )}
        </div>
      </div>

      {/* Pricing strip (toggle from footer) */}
      {showPricing && (
        <div className="flex min-w-0 shrink-0 flex-wrap items-end gap-2 border-b border-border bg-muted/30 px-2 py-2">
          <label className="block text-[10px] font-medium text-muted-foreground">
            CNY → BDT
            <Input
              type="number"
              step="0.01"
              className="mt-0.5 h-8 w-[88px] rounded-none"
              value={pricing.exchange_rate}
              onChange={(e) =>
                setPricing((p) => ({ ...p, exchange_rate: Number(e.target.value) || 0 }))
              }
              disabled={!canWrite}
            />
          </label>
          <label className="block text-[10px] font-medium text-muted-foreground">
            Markup %
            <Input
              type="number"
              step="0.1"
              className="mt-0.5 h-8 w-[80px] rounded-none"
              value={pricing.markup_percent}
              onChange={(e) =>
                setPricing((p) => ({ ...p, markup_percent: Number(e.target.value) || 0 }))
              }
              disabled={!canWrite}
            />
          </label>
          <label className="block text-[10px] font-medium text-muted-foreground">
            Profit ৳
            <Input
              type="number"
              step="1"
              className="mt-0.5 h-8 w-[80px] rounded-none"
              value={pricing.profit_bdt}
              onChange={(e) =>
                setPricing((p) => ({ ...p, profit_bdt: Number(e.target.value) || 0 }))
              }
              disabled={!canWrite}
            />
          </label>
          <label className="block text-[10px] font-medium text-muted-foreground">
            Server ৳
            <Input
              type="number"
              step="1"
              className="mt-0.5 h-8 w-[80px] rounded-none"
              value={pricing.server_charge_bdt}
              onChange={(e) =>
                setPricing((p) => ({
                  ...p,
                  server_charge_bdt: Number(e.target.value) || 0,
                }))
              }
              disabled={!canWrite}
            />
          </label>
          {canWrite && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none"
              disabled={savingDefaults}
              onClick={() => void onSaveDefaults()}
            >
              {savingDefaults ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" />
              )}
              Save defaults
            </Button>
          )}
          <p className="ml-auto max-w-sm self-center text-[10px] text-muted-foreground">
            Sell = cost × rate × (1 + markup%) + profit + server
          </p>
        </div>
      )}

      {/* Config error */}
      {configured === false && (
        <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-300">AgainAPI not configured</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Set <code className="rounded bg-muted px-1">ELIM_API_KEY</code> in{" "}
            <code className="rounded bg-muted px-1">apps/api/.env</code> and restart the API.
          </p>
        </div>
      )}

      {/* Bulk bar — matches ProductGrid */}
      {selectedIds.length > 0 && canWrite && (
        <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium">{selectedIds.length} selected</span>
          <Button size="sm" disabled={bulkLoading} onClick={() => void onBulkImport()}>
            {bulkLoading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" />
            )}
            Add to catalog
          </Button>
          <Button size="sm" variant="outline" onClick={() => toggleAll(true)}>
            Select all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 w-7 p-0"
            onClick={() => setSelected({})}
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Results — frontstore ProductGridCard density (square thumbs, 2–6 cols) */}
      <div className="min-h-0 flex-1 overflow-auto bg-muted/20 p-2.5 sm:p-3">
        {loading && items.length === 0 ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse overflow-hidden rounded-lg border border-border bg-card"
              >
                <div className="aspect-square bg-muted" />
                <div className="space-y-1.5 p-2.5">
                  <div className="h-3 w-1/2 rounded bg-muted" />
                  <div className="h-3 w-full rounded bg-muted" />
                  <div className="h-3 w-2/3 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-16 text-center">
            <p className="text-sm font-medium">No AgainAPI products loaded</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Search by product or category keyword, select items, then add to catalog.
            </p>
            <Button
              size="sm"
              className="mt-4"
              onClick={() => void runSearch()}
              disabled={loading || configured === false}
            >
              <Search className="mr-1.5 h-3.5 w-3.5" />
              Search AgainAPI
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((item) => {
              const cost = Number(item.price) || 0;
              const preview = previewSellBdt(cost, pricing);
              const isOn = Boolean(selected[item.id]);
              const title = item.title || item.title_zh || "Untitled";
              return (
                <div
                  key={item.id}
                  className={cn(
                    "group relative flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors",
                    isOn
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/40",
                  )}
                >
                  <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-muted/40">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image}
                        alt={title}
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 h-full w-full object-contain p-2.5"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                        No image
                      </div>
                    )}
                    <button
                      type="button"
                      className="absolute left-1.5 top-1.5 z-10 rounded border border-border bg-background/95 p-0.5 shadow-sm"
                      onClick={() =>
                        setSelected((s) => ({ ...s, [item.id]: !s[item.id] }))
                      }
                      aria-label={isOn ? "Deselect" : "Select"}
                    >
                      {isOn ? (
                        <CheckSquare className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Square className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-2.5">
                    <div className="flex items-baseline justify-between gap-1.5">
                      <p className="m-0 text-[15px] font-bold tabular-nums text-rose-600 dark:text-rose-400">
                        ৳{preview.sell_bdt}
                      </p>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        ¥{cost || "—"}
                      </span>
                    </div>
                    <p className="m-0 line-clamp-2 text-[12px] leading-snug text-foreground">
                      {title}
                    </p>
                    <div className="mt-0.5 flex flex-nowrap items-center gap-1 overflow-hidden">
                      <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded border border-border bg-muted px-1 py-px text-[9px] font-semibold leading-tight text-muted-foreground">
                        +{pricing.markup_percent}%
                      </span>
                      {item.seller_name ? (
                        <span className="truncate text-[9px] text-muted-foreground">
                          {item.seller_name}
                        </span>
                      ) : null}
                    </div>
                    {canWrite && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-1.5 h-7 w-full rounded-md text-[11px]"
                        disabled={importingId === item.id}
                        onClick={() => void onImportOne(item)}
                      >
                        {importingId === item.id ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="mr-1 h-3 w-3" />
                        )}
                        Add
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {items.length > 0 && (
          <div className="flex flex-col items-center gap-1.5 py-4">
            {hasMore ? (
              <Button
                variant="outline"
                size="sm"
                className="min-w-[160px]"
                disabled={loadingMore || loading}
                onClick={() => void loadMore()}
              >
                {loadingMore ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : null}
                Load more
              </Button>
            ) : (
              <p className="text-[11px] text-muted-foreground">All results loaded</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Showing {items.length}
              {total > 0 ? ` of ~${total}` : ""}
            </p>
          </div>
        )}
      </div>

      {/* Footer chrome — mirrors Products footer strip */}
      <div className="flex h-[34px] shrink-0 items-center gap-2 border-t border-border bg-background px-2">
        <span className="text-sm font-medium">AgainAPI</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void loadStatus();
            if (items.length) void runSearch();
          }}
          disabled={loading || statusLoading}
          aria-label={`Refresh AgainAPI (API ${configStatus})`}
          title={
            configStatus === "connected"
              ? "AgainAPI configured"
              : configStatus === "disconnected"
                ? "AgainAPI not configured"
                : "Checking connection…"
          }
          className={cn(
            "h-7",
            configStatus === "connected" &&
              "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-400",
            configStatus === "disconnected" &&
              "border-red-500/40 bg-red-500/10 text-red-700 hover:bg-red-500/15 hover:text-red-700 dark:text-red-400",
          )}
        >
          <RefreshCw
            className={cn("h-4 w-4", (loading || statusLoading) && "animate-spin")}
          />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className={cn("h-7 w-7", showPricing && "border-primary bg-primary/5")}
          onClick={() => setShowPricing((v) => !v)}
          aria-label="Pricing"
          title="Pricing defaults"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
        {items.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-none"
            onClick={() => toggleAll(selectedIds.length !== items.length)}
          >
            {selectedIds.length === items.length ? (
              <>
                <Square className="mr-1 h-3.5 w-3.5" /> Clear
              </>
            ) : (
              <>
                <CheckSquare className="mr-1 h-3.5 w-3.5" /> Select all
              </>
            )}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {canWrite && (
              <DropdownMenuItem onClick={() => void onSaveDefaults()}>
                Save pricing defaults
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link href="/dropshipping/import/amazon">Amazon import</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dropshipping/products">Open products</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/sales/dropship">Fulfill 1688</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="ml-auto pr-1 text-[11px] text-muted-foreground">
          {items.length
            ? `Showing ${items.length} of ~${total}`
            : "Search AgainAPI catalog"}
        </span>
      </div>
    </div>
  );
}

export default function ElimCatalogImportPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
              <ElimImportContent />
    </div>
  );
}
