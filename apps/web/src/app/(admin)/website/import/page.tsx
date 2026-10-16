"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckSquare, Download, Loader2, Search, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { cn, formatCurrency } from "@/lib/utils";

const DEFAULT_PRICING: ElimPricing = {
  exchange_rate: 16,
  markup_percent: 30,
  profit_bdt: 0,
  server_charge_bdt: 0,
};

export default function ElimCatalogImportPage() {
  const [q, setQ] = useState("phone case");
  const [platform, setPlatform] = useState<ElimPlatform>("taobao");
  const [items, setItems] = useState<ElimSearchItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [pricing, setPricing] = useState<ElimPricing>(DEFAULT_PRICING);
  const [status, setStatus] = useState<"draft" | "published">("published");
  const [savingDefaults, setSavingDefaults] = useState(false);

  useEffect(() => {
    fetchElimStatus()
      .then((s) => {
        setConfigured(s.configured);
        if (s.pricing_defaults) {
          setPricing({
            exchange_rate: s.pricing_defaults.exchange_rate ?? 16,
            markup_percent: s.pricing_defaults.markup_percent ?? 30,
            profit_bdt: s.pricing_defaults.profit_bdt ?? 0,
            server_charge_bdt: s.pricing_defaults.server_charge_bdt ?? 0,
          });
        }
      })
      .catch(() => setConfigured(false));
  }, []);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([id]) => id),
    [selected],
  );

  const runSearch = useCallback(async () => {
    const query = q.trim();
    if (!query) {
      toast.error("Search keyword / category required");
      return;
    }
    setLoading(true);
    try {
      const res = await searchElimProducts({ q: query, platform, size: 24 });
      setItems(res.items);
      setTotal(res.total);
      setSelected({});
      if (!res.items.length) toast.message("No products found");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Search failed";
      toast.error(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [q, platform]);

  const pricingPayload = {
    exchange_rate: pricing.exchange_rate,
    markup_percent: pricing.markup_percent,
    profit_bdt: pricing.profit_bdt,
    server_charge_bdt: pricing.server_charge_bdt,
  };

  const onSaveDefaults = async () => {
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
              window.location.href = `/website/products/${res.product_id}`;
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

  return (
    <>
              <div className="space-y-5 p-4 lg:p-5">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Catalog · Dropship
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">Elim → Catalog</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Select products from Taobao / 1688. Website sell price ={" "}
              <strong>cost × rate × (1 + markup%)</strong> (+ optional profit / server fee). Save
              defaults so storefront China search uses the same markup %.
            </p>
            {configured === false && (
              <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                Set <code>ELIM_API_KEY</code> in <code>apps/api/.env</code> and restart API.
              </p>
            )}
          </div>

          <div className="grid gap-3 rounded-xl border border-input bg-card p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <label className="block text-[11px] font-medium text-muted-foreground">
              CNY → BDT rate
              <Input
                type="number"
                step="0.01"
                className="mt-1"
                value={pricing.exchange_rate}
                onChange={(e) =>
                  setPricing((p) => ({ ...p, exchange_rate: Number(e.target.value) || 0 }))
                }
              />
            </label>
            <label className="block text-[11px] font-medium text-muted-foreground">
              Markup %
              <Input
                type="number"
                step="0.1"
                className="mt-1"
                value={pricing.markup_percent}
                onChange={(e) =>
                  setPricing((p) => ({ ...p, markup_percent: Number(e.target.value) || 0 }))
                }
              />
            </label>
            <label className="block text-[11px] font-medium text-muted-foreground">
              Profit (BDT)
              <Input
                type="number"
                step="1"
                className="mt-1"
                value={pricing.profit_bdt}
                onChange={(e) =>
                  setPricing((p) => ({ ...p, profit_bdt: Number(e.target.value) || 0 }))
                }
              />
            </label>
            <label className="block text-[11px] font-medium text-muted-foreground">
              Server charge (BDT)
              <Input
                type="number"
                step="1"
                className="mt-1"
                value={pricing.server_charge_bdt}
                onChange={(e) =>
                  setPricing((p) => ({ ...p, server_charge_bdt: Number(e.target.value) || 0 }))
                }
              />
            </label>
            <label className="block text-[11px] font-medium text-muted-foreground">
              Catalog status
              <select
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as "draft" | "published")}
              >
                <option value="draft">Draft</option>
                <option value="published">Published (storefront)</option>
              </select>
            </label>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={savingDefaults}
                onClick={() => void onSaveDefaults()}
              >
                {savingDefaults ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Save as storefront default
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Keyword / category
              </label>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void runSearch()}
                placeholder="e.g. wireless earbuds, phone case"
              />
            </div>
            <div className="w-full sm:w-44">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Platform</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as ElimPlatform)}
              >
                <option value="taobao">Taobao</option>
                <option value="alibaba">1688 / Alibaba</option>
              </select>
            </div>
            <Button onClick={() => void runSearch()} disabled={loading || configured === false}>
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
              Search
            </Button>
          </div>

          {items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => toggleAll(true)}>
                <CheckSquare className="mr-1 h-3.5 w-3.5" /> Select all
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => toggleAll(false)}>
                <Square className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
              <Button
                size="sm"
                disabled={!selectedIds.length || bulkLoading}
                onClick={() => void onBulkImport()}
              >
                {bulkLoading ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1 h-3.5 w-3.5" />
                )}
                Add selected ({selectedIds.length})
              </Button>
              <span className="text-xs text-muted-foreground">
                Showing {items.length} of ~{total}
              </span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
              const cost = Number(item.price) || 0;
              const preview = previewSellBdt(cost, pricing);
              const isOn = Boolean(selected[item.id]);
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm",
                    isOn ? "border-primary" : "border-input",
                  )}
                >
                  <div className="relative aspect-[4/3] bg-muted">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                    <button
                      type="button"
                      className="absolute left-2 top-2 rounded bg-background/90 p-1 shadow"
                      onClick={() => setSelected((s) => ({ ...s, [item.id]: !s[item.id] }))}
                      aria-label="Select"
                    >
                      {isOn ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <p className="line-clamp-2 text-sm font-medium leading-snug">
                      {item.title || item.title_zh}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ID {item.id}
                      {item.seller_name ? ` · ${item.seller_name}` : ""}
                    </p>
                    <div className="text-xs text-muted-foreground">
                      Cost ¥{cost || "—"} → {formatCurrency(Number(preview.cost_bdt))} +{" "}
                      {pricing.markup_percent}% ({formatCurrency(Number(preview.markup_bdt))}) →{" "}
                      <span className="font-semibold text-foreground">
                        {formatCurrency(Number(preview.sell_bdt))}
                      </span>
                    </div>
                    <div className="mt-auto flex justify-end pt-1">
                      <Button
                        size="sm"
                        disabled={importingId === item.id}
                        onClick={() => void onImportOne(item)}
                      >
                        {importingId === item.id ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="mr-1 h-3.5 w-3.5" />
                        )}
                        Add to catalog
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {!loading && items.length === 0 && (
            <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              Search by product or category keyword, select, then add to catalog.
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Catalog:{" "}
            <Link href="/website/products" className="underline underline-offset-2">
              Products
            </Link>
            {" · "}
            Fulfill 1688:{" "}
            <Link href="/sales/dropship" className="underline underline-offset-2">
              Sales → Dropship
            </Link>
            {" · "}
            <Link href="/website/import/ai-url" className="underline underline-offset-2">
              Import from any URL with AI
            </Link>
          </p>
        </div>
    </>
  );
}
