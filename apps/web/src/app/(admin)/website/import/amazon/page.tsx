"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  bulkImportAmazonProducts,
  fetchAmazonImportStatus,
  importAmazonProduct,
  searchAmazonImportProducts,
  type AmazonPricing,
  type AmazonSearchItem,
} from "@/lib/api/amazon-import";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils";

const DEFAULT_PRICING: AmazonPricing = {
  exchange_rate: 110,
  profit_bdt: 100,
  server_charge_bdt: 50,
  default_cost_usd: 10,
};

export default function AmazonCatalogImportPage() {
  const [q, setQ] = useState("samsung,tv");
  const [asin, setAsin] = useState("B07N4M94X4");
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<AmazonSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [env, setEnv] = useState("sandbox");
  const [note, setNote] = useState("");
  const [pricing, setPricing] = useState<AmazonPricing>(DEFAULT_PRICING);
  const [status, setStatus] = useState<"draft" | "published">("published");
  const [costUsd, setCostUsd] = useState("10");

  useEffect(() => {
    fetchAmazonImportStatus()
      .then((s) => {
        setConfigured(s.configured);
        setEnv(s.env);
        setNote(s.note || "");
        if (s.pricing_defaults) {
          setPricing(s.pricing_defaults);
          if (s.pricing_defaults.default_cost_usd != null) {
            setCostUsd(String(s.pricing_defaults.default_cost_usd));
          }
        }
      })
      .catch(() => setConfigured(false));
  }, []);

  const runSearch = useCallback(async () => {
    const query = q.trim();
    if (!query) {
      toast.error("Enter a keyword (production) or use ASIN import below");
      return;
    }
    setLoading(true);
    try {
      const res = await searchAmazonImportProducts({ q: query, size: 20 });
      setItems(res.items);
      if (res.message) toast.message(res.message);
      else if (!res.items.length) toast.message("No products found");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Search failed");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [q]);

  const pricingPayload = {
    exchange_rate: pricing.exchange_rate,
    profit_bdt: pricing.profit_bdt,
    server_charge_bdt: pricing.server_charge_bdt,
    cost_usd: Number(costUsd) || pricing.default_cost_usd || 10,
  };

  const onImportAsin = async (nextAsin: string, nextTitle?: string) => {
    const clean = nextAsin.trim().toUpperCase();
    if (clean.length < 8) {
      toast.error("Enter a valid ASIN (e.g. B08N5WRWNW)");
      return;
    }
    setImporting(clean);
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
              window.location.href = `/website/products/${res.product_id}`;
            },
          },
        },
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setImporting(null);
    }
  };

  const onBulkFromText = async () => {
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
    setImporting("bulk");
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
      setImporting(null);
    }
  };

  return (
    <>
              <div className="space-y-5 p-4 lg:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">Amazon Import</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Import Amazon ASINs into AgainERP catalog (USD → BDT) — same idea as Elim Import.
              </p>
            </div>
            <Link href="/website/import" className="text-sm text-sky-700 hover:underline">
              ← Elim / China Import
            </Link>
          </div>

          {configured === false ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Amazon SP-API credentials missing. Set <code>AMAZON_SP_*</code> in{" "}
              <code>apps/api/.env</code>.
            </div>
          ) : null}

          {configured ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              Env: <strong>{env}</strong>
              {note ? <p className="mt-1 text-zinc-500">{note}</p> : null}
            </div>
          ) : null}

          <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 md:grid-cols-4">
            <label className="text-sm">
              <span className="mb-1 block text-zinc-600">USD → BDT rate</span>
              <Input
                type="number"
                value={pricing.exchange_rate}
                onChange={(e) =>
                  setPricing((p) => ({ ...p, exchange_rate: Number(e.target.value) || 0 }))
                }
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-zinc-600">Profit (BDT)</span>
              <Input
                type="number"
                value={pricing.profit_bdt}
                onChange={(e) =>
                  setPricing((p) => ({ ...p, profit_bdt: Number(e.target.value) || 0 }))
                }
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-zinc-600">Server fee (BDT)</span>
              <Input
                type="number"
                value={pricing.server_charge_bdt}
                onChange={(e) =>
                  setPricing((p) => ({ ...p, server_charge_bdt: Number(e.target.value) || 0 }))
                }
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-zinc-600">Cost USD (fallback)</span>
              <Input type="number" value={costUsd} onChange={(e) => setCostUsd(e.target.value)} />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-zinc-600">Status on import:</span>
            {(["published", "draft"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  status === s ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-900">Import by ASIN (recommended)</h2>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                value={asin}
                onChange={(e) => setAsin(e.target.value)}
                placeholder="B08N5WRWNW or multiple ASINs"
                className="flex-1"
              />
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional title (sandbox stub)"
                className="md:w-72"
              />
              <Button
                type="button"
                disabled={Boolean(importing)}
                onClick={() => void onBulkFromText()}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="ml-2">Import</span>
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-900">Keyword search (production catalog)</h2>
            <p className="text-xs text-zinc-500">
              Sandbox mock: type exactly <code className="rounded bg-zinc-100 px-1">samsung,tv</code> or{" "}
              <code className="rounded bg-zinc-100 px-1">samsung tv</code>. Live search needs production env.
            </p>
            <div className="flex gap-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="samsung,tv"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runSearch();
                }}
              />
              <Button type="button" variant="outline" disabled={loading} onClick={() => void runSearch()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-2">Search</span>
              </Button>
            </div>

            {items.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <div key={item.asin} className="rounded-lg border border-zinc-100 p-3">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" className="mb-2 h-28 w-full object-contain" />
                    ) : null}
                    <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">{item.asin}</p>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-2"
                      disabled={importing === item.asin}
                      onClick={() => void onImportAsin(item.asin, item.title)}
                    >
                      Import
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
    </>
  );
}
