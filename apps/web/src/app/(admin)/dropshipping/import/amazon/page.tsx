"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckSquare,
  Download,
  Loader2,
  MoreHorizontal,
  RefreshCw,
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
  bulkImportAmazonProducts,
  fetchAmazonImportStatus,
  importAmazonProduct,
  searchAmazonImportProducts,
  type AmazonPricing,
  type AmazonSearchItem,
} from "@/lib/api/amazon-import";
import { ApiError } from "@/lib/api/client";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn, formatCurrency } from "@/lib/utils";

const DEFAULT_PRICING: AmazonPricing = {
  exchange_rate: 110,
  profit_bdt: 100,
  server_charge_bdt: 50,
  default_cost_usd: 10,
};

const PAGE_SIZE = 24;
const MAX_SIZE = 40;

function previewSellBdt(costUsd: number, pricing: AmazonPricing) {
  const costBdt = Math.round(costUsd * pricing.exchange_rate * 100) / 100;
  const sell =
    Math.round(
      (costBdt + (pricing.profit_bdt || 0) + (pricing.server_charge_bdt || 0)) * 100,
    ) / 100;
  return { cost_bdt: costBdt, sell_bdt: sell };
}

function AmazonImportContent() {
  const canWrite = useAdminCanWrite();
  const [q, setQ] = useState("samsung,tv");
  const [asin, setAsin] = useState("");
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<AmazonSearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [env, setEnv] = useState("sandbox");
  const [note, setNote] = useState("");
  const [pricing, setPricing] = useState<AmazonPricing>(DEFAULT_PRICING);
  const [status, setStatus] = useState<"draft" | "published">("published");
  const [costUsd, setCostUsd] = useState("10");
  const [showPricing, setShowPricing] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const s = await fetchAmazonImportStatus();
      setConfigured(s.configured);
      setEnv(s.env);
      setNote(s.note || "");
      if (s.pricing_defaults) {
        setPricing(s.pricing_defaults);
        if (s.pricing_defaults.default_cost_usd != null) {
          setCostUsd(String(s.pricing_defaults.default_cost_usd));
        }
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

  const costUsdNum = Number(costUsd) || pricing.default_cost_usd || 10;
  const hasMore = items.length > 0 && items.length >= pageSize && pageSize < MAX_SIZE;

  const runSearch = useCallback(async () => {
    const query = q.trim();
    if (!query) {
      toast.error("Enter a keyword, or import by ASIN from the toolbar");
      return;
    }
    setLoading(true);
    setPageSize(PAGE_SIZE);
    try {
      const res = await searchAmazonImportProducts({ q: query, size: PAGE_SIZE });
      setItems(res.items);
      setTotal(res.total);
      setSelected({});
      if (res.message) toast.message(res.message);
      else if (!res.items.length) toast.message("No products found");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Search failed");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q]);

  const loadMore = useCallback(async () => {
    const query = q.trim();
    if (!query || loadingMore || !hasMore) return;
    const nextSize = Math.min(MAX_SIZE, pageSize + PAGE_SIZE);
    setLoadingMore(true);
    try {
      const res = await searchAmazonImportProducts({ q: query, size: nextSize });
      setItems(res.items);
      setTotal(res.total);
      setPageSize(nextSize);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [q, loadingMore, hasMore, pageSize]);

  const pricingPayload = {
    exchange_rate: pricing.exchange_rate,
    profit_bdt: pricing.profit_bdt,
    server_charge_bdt: pricing.server_charge_bdt,
    cost_usd: costUsdNum,
  };

  const onImportAsin = async (nextAsin: string, nextTitle?: string) => {
    if (!canWrite) return;
    const clean = nextAsin.trim().toUpperCase();
    if (clean.length < 8) {
      toast.error("Enter a valid ASIN (e.g. B08N5WRWNW)");
      return;
    }
    setImportingId(clean);
    try {
      const res = await importAmazonProduct({
        asin: clean,
        status,
        title: nextTitle?.trim() || undefined,
        ...pricingPayload,
      });
      toast.success(
        res.created
          ? `Imported ${formatCurrency(Number(res.price))}${res.sandbox_stub ? " (sandbox stub)" : ""}: ${res.name.slice(0, 48)}`
          : `Refreshed: ${res.sku}`,
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

  const onImportFromToolbarAsin = async () => {
    const asins = asin
      .split(/[\s,;]+/)
      .map((x) => x.trim().toUpperCase())
      .filter((x) => x.length >= 8);
    if (!asins.length) {
      toast.error("Paste one or more ASINs");
      return;
    }
    if (asins.length === 1) {
      await onImportAsin(asins[0], title);
      return;
    }
    if (!canWrite) return;
    setBulkLoading(true);
    try {
      const res = await bulkImportAmazonProducts({
        asins,
        status,
        ...pricingPayload,
      });
      toast.success(
        `Added ${res.imported.length}, skipped ${res.skipped.length}` +
          (res.errors.length ? `, errors ${res.errors.length}` : ""),
      );
      if (res.errors[0]) toast.error(`${res.errors[0].asin}: ${res.errors[0].error}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Bulk import failed");
    } finally {
      setBulkLoading(false);
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
      const res = await bulkImportAmazonProducts({
        asins: selectedIds,
        status,
        ...pricingPayload,
      });
      toast.success(
        `Added ${res.imported.length}, skipped ${res.skipped.length}` +
          (res.errors.length ? `, errors ${res.errors.length}` : ""),
      );
      if (res.errors[0]) toast.error(`${res.errors[0].asin}: ${res.errors[0].error}`);
      setSelected({});
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Bulk import failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const toggleAll = (on: boolean) => {
    const next: Record<string, boolean> = {};
    if (on) for (const item of items) next[item.asin] = true;
    setSelected(next);
  };

  const configStatus =
    configured === true ? "connected" : configured === false ? "disconnected" : "checking";

  return (
    <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div
        data-component="amazon-import-filters"
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
            placeholder="Keyword (e.g. samsung,tv)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void runSearch()}
            className="w-[200px] shrink-0 rounded-none"
            aria-label="Search keyword"
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as "draft" | "published")}
            className="w-[140px] shrink-0 rounded-none"
            aria-label="Catalog status"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </Select>
          <Input
            placeholder="ASIN / multiple…"
            value={asin}
            onChange={(e) => setAsin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void onImportFromToolbarAsin()}
            className="w-[180px] shrink-0 rounded-none"
            aria-label="ASIN"
          />
          <Input
            placeholder="Optional title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-[140px] shrink-0 rounded-none"
            aria-label="Optional title"
          />
          {canWrite && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 rounded-none"
              disabled={Boolean(importingId) || bulkLoading || configured === false}
              onClick={() => void onImportFromToolbarAsin()}
            >
              {importingId || bulkLoading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-4 w-4" />
              )}
              Import ASIN
            </Button>
          )}
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

      {/* Pricing strip */}
      {showPricing && (
        <div className="flex min-w-0 shrink-0 flex-wrap items-end gap-2 border-b border-border bg-muted/30 px-2 py-2">
          <label className="block text-[10px] font-medium text-muted-foreground">
            USD → BDT
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
          <label className="block text-[10px] font-medium text-muted-foreground">
            Cost USD
            <Input
              type="number"
              step="0.01"
              className="mt-0.5 h-8 w-[80px] rounded-none"
              value={costUsd}
              onChange={(e) => setCostUsd(e.target.value)}
              disabled={!canWrite}
            />
          </label>
          <p className="ml-auto max-w-sm self-center text-[10px] text-muted-foreground">
            Sell ≈ cost USD × rate + profit + server ({env})
          </p>
        </div>
      )}

      {configured === false && (
        <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            Amazon SP-API not configured
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Set <code className="rounded bg-muted px-1">AMAZON_SP_*</code> in{" "}
            <code className="rounded bg-muted px-1">apps/api/.env</code> and restart the API.
          </p>
        </div>
      )}

      {configured && note ? (
        <div className="shrink-0 border-b border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
          Env: <span className="font-medium text-foreground">{env}</span> — {note}
        </div>
      ) : null}

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

      {/* Results grid — same density as AgainAPI */}
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
            <p className="text-sm font-medium">No Amazon products loaded</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Search by keyword, or paste ASIN(s) in the toolbar and import.
              {env === "sandbox" ? (
                <>
                  {" "}
                  Sandbox mock: try <code className="rounded bg-muted px-1">samsung,tv</code>.
                </>
              ) : null}
            </p>
            <Button
              size="sm"
              className="mt-4"
              onClick={() => void runSearch()}
              disabled={loading || configured === false}
            >
              <Search className="mr-1.5 h-3.5 w-3.5" />
              Search Amazon
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((item) => {
              const preview = previewSellBdt(costUsdNum, pricing);
              const isOn = Boolean(selected[item.asin]);
              const name = item.title || item.asin;
              return (
                <div
                  key={item.asin}
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
                        alt={name}
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
                        setSelected((s) => ({ ...s, [item.asin]: !s[item.asin] }))
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
                        ${costUsdNum}
                      </span>
                    </div>
                    <p className="m-0 line-clamp-2 text-[12px] leading-snug text-foreground">
                      {name}
                    </p>
                    <div className="mt-0.5 flex flex-nowrap items-center gap-1 overflow-hidden">
                      <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded border border-border bg-muted px-1 py-px text-[9px] font-semibold leading-tight text-muted-foreground">
                        {item.asin}
                      </span>
                      {item.brand ? (
                        <span className="truncate text-[9px] text-muted-foreground">
                          {item.brand}
                        </span>
                      ) : null}
                    </div>
                    {canWrite && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-1.5 h-7 w-full rounded-md text-[11px]"
                        disabled={importingId === item.asin}
                        onClick={() => void onImportAsin(item.asin, item.title)}
                      >
                        {importingId === item.asin ? (
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

      {/* Footer */}
      <div className="flex h-[34px] shrink-0 items-center gap-2 border-t border-border bg-background px-2">
        <span className="text-sm font-medium">Amazon</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void loadStatus();
            if (items.length) void runSearch();
          }}
          disabled={loading || statusLoading}
          aria-label={`Refresh Amazon (API ${configStatus})`}
          title={
            configStatus === "connected"
              ? "Amazon SP-API configured"
              : configStatus === "disconnected"
                ? "Amazon SP-API not configured"
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
            <DropdownMenuItem asChild>
              <Link href="/dropshipping/import">AgainAPI import</Link>
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
            ? `Showing ${items.length}${total > 0 ? ` of ~${total}` : ""}`
            : "Search Amazon catalog"}
        </span>
      </div>
    </div>
  );
}

export default function AmazonCatalogImportPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
              <AmazonImportContent />
    </div>
  );
}
