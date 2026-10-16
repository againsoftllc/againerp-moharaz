"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addPriceUpdateCompetitor,
  fetchPriceUpdateCompetitors,
  fetchPriceUpdatePlugin,
  removePriceUpdateCompetitor,
  setPriceUpdateCompetitorEnabled,
  updatePriceUpdatePlugin,
  type PriceUpdateCompetitorSite,
  type PriceUpdatePluginRecord,
  type PriceUpdateSearchMethod,
} from "@/lib/api/price-update-plugin";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type SectionId = "settings";

/** How "Check competitor prices" may find a product page and read its price. A cell's sync
 *  button never uses these — it always re-reads the saved link for free. */
const SEARCH_METHODS: { key: PriceUpdateSearchMethod; label: string; cost: "Free" | "Paid"; detail: string }[] = [
  {
    key: "use_sitemap_match",
    label: "Sitemap matching",
    cost: "Free",
    detail: "Finds the product in the competitor's sitemap (its full product list), then opens the page to confirm brand, model and price before saving the link. Also used by the ↻ sync button.",
  },
  {
    key: "use_site_search",
    label: "On-site search",
    cost: "Free",
    detail: "Searches the competitor's own website for the product (where the site supports it, e.g. StarTech).",
  },
  {
    key: "use_google_search",
    label: "Google Search",
    cost: "Paid",
    detail: "Finds the product page with Google Custom Search. Uses your Google API quota — billed past Google's free daily limit. Needs the key below.",
  },
  {
    key: "use_google_price",
    label: "Google price fallback",
    cost: "Paid",
    detail: "When a shop blocks us (e.g. a Cloudflare browser check), read the price and stock Google stored for that product page. One Google search per blocked product (free daily quota, then billed); needs the key below. Google's copy can be a few hours or days old, so it's marked “via Google”.",
  },
  {
    key: "use_ai_pick",
    label: "AI result picking + AI check",
    cost: "Paid",
    detail: "When a search returns several products, AI decides which one is the exact same item — and when the competitor's closest pages fail the free name rules only because they word the name differently, AI checks whether one is exactly this product (brand, variant, colour, size and price rules still apply). About 300 tokens per product checked (~$0.0001 with gpt-4o-mini); used by Check competitor prices, never by the ↻ sync button. Off = unclear cases are left for you to paste the link.",
  },
  {
    key: "use_ai_price_read",
    label: "AI price reading",
    cost: "Paid",
    detail: "When the price can't be read for free from a page, AI reads the page text (AI tokens).",
  },
  {
    key: "use_ai_web_search",
    label: "AI web search",
    cost: "Paid",
    detail: "Last resort when nothing is found or a site blocks us: AI searches the web itself. The most expensive method.",
  },
];

type Props = {
  activeSection: SectionId;
};

export function PriceUpdatePluginPanel({ activeSection: _activeSection }: Props) {
  const canWrite = useAdminCanWrite();
  const [plugin, setPlugin] = useState<PriceUpdatePluginRecord | null>(null);
  const [competitors, setCompetitors] = useState<PriceUpdateCompetitorSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [searchEngineId, setSearchEngineId] = useState("");

  const [newDomain, setNewDomain] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyCompetitorId, setBusyCompetitorId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const [row, sites] = await Promise.all([fetchPriceUpdatePlugin(), fetchPriceUpdateCompetitors()]);
      setPlugin(row);
      setSearchEngineId(row.google_search_engine_id || "");
      setCompetitors(sites);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Price Compare plugin");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updatePriceUpdatePlugin({
        google_api_key: apiKey.trim() || undefined,
        google_search_engine_id: searchEngineId.trim(),
      });
      setPlugin(updated);
      setApiKey("");
      toast.success("Price Compare settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMethod = async (method: PriceUpdateSearchMethod, enabled: boolean) => {
    setPlugin((prev) => (prev ? { ...prev, [method]: enabled } : prev));
    try {
      setPlugin(await updatePriceUpdatePlugin({ [method]: enabled }));
    } catch (err) {
      setPlugin((prev) => (prev ? { ...prev, [method]: !enabled } : prev));
      toast.error(err instanceof Error ? err.message : "Could not change this setting");
    }
  };

  const handleAddWebsite = async () => {
    const domain = newDomain.trim();
    if (!domain) return;
    setAdding(true);
    try {
      const site = await addPriceUpdateCompetitor({ domain, label: newLabel.trim() || domain });
      setCompetitors((prev) => [...prev, site]);
      setNewDomain("");
      setNewLabel("");
      toast.success(`Added ${site.label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add this website");
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (site: PriceUpdateCompetitorSite, enabled: boolean) => {
    setBusyCompetitorId(site.id);
    setCompetitors((prev) => prev.map((c) => (c.id === site.id ? { ...c, enabled } : c)));
    try {
      await setPriceUpdateCompetitorEnabled(site.id, enabled);
    } catch (err) {
      setCompetitors((prev) => prev.map((c) => (c.id === site.id ? { ...c, enabled: site.enabled } : c)));
      toast.error(err instanceof Error ? err.message : "Could not update this website");
    } finally {
      setBusyCompetitorId(null);
    }
  };

  const handleRemove = async (site: PriceUpdateCompetitorSite) => {
    setBusyCompetitorId(site.id);
    try {
      await removePriceUpdateCompetitor(site.id);
      setCompetitors((prev) => prev.filter((c) => c.id !== site.id));
      toast.success(`Removed ${site.label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove this website");
    } finally {
      setBusyCompetitorId(null);
    }
  };

  if (loading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  }

  const paidOn = SEARCH_METHODS.filter((m) => m.cost === "Paid" && plugin?.[m.key]);

  return (
    <div className="space-y-5 p-4">
      <section className="space-y-3 border border-border p-4">
        <div>
          <h3 className="text-sm font-semibold">Price search methods</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Which ways <span className="font-medium">Check competitor prices</span> may use to find a product and read its
            price. With every paid method off it costs nothing: free sitemap matching finds most links by itself,
            and any it can&apos;t confirm you paste once. The ↻ sync button never uses a paid method.
          </p>
          <p className={`mt-2 text-xs font-medium ${paidOn.length ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {paidOn.length
              ? `Paid methods on: ${paidOn.map((m) => m.label).join(", ")}`
              : "Free mode — no Google or AI charges"}
          </p>
        </div>
        <div className="divide-y divide-border border border-border">
          {SEARCH_METHODS.map((m) => (
            <div key={m.key} className="flex items-start justify-between gap-4 px-3 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {m.label}
                  <Badge variant={m.cost === "Free" ? "secondary" : "outline"} className="rounded-none text-[10px]">
                    {m.cost}
                  </Badge>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{m.detail}</p>
              </div>
              <Switch
                checked={Boolean(plugin?.[m.key])}
                onCheckedChange={(checked) => void handleToggleMethod(m.key, checked)}
                disabled={!canWrite || !plugin}
                aria-label={m.label}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 border border-border p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              Automatic sync on the server
              <Badge variant="secondary" className="rounded-none text-[10px]">
                Free
              </Badge>
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Re-reads every saved competitor link on a schedule — no search, no AI. Sites that block the
              server (e.g. a Cloudflare check) are skipped here and left to the Send to AgainERP browser
              extension&apos;s auto-sync.
              {plugin?.last_auto_sync_at
                ? ` Last run: ${new Date(plugin.last_auto_sync_at).toLocaleString()}.`
                : " Not run yet."}
            </p>
          </div>
          <select
            className="h-8 shrink-0 rounded-none border border-input bg-background px-2 text-sm"
            value={String(plugin?.auto_sync_hours ?? 6)}
            disabled={!canWrite || !plugin}
            onChange={(e) => {
              const hours = Number(e.target.value);
              void updatePriceUpdatePlugin({ auto_sync_hours: hours })
                .then(setPlugin)
                .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't save"));
            }}
            aria-label="Automatic sync interval"
          >
            <option value="0">Off</option>
            <option value="1">Every hour</option>
            <option value="3">Every 3 hours</option>
            <option value="6">Every 6 hours</option>
            <option value="12">Every 12 hours</option>
            <option value="24">Once a day</option>
          </select>
        </div>
      </section>

      <section className="space-y-3 border border-border p-4">
        <div>
          <h3 className="text-sm font-semibold">Google Custom Search</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Used to find a matching product page on each competitor site. Optional — a
            competitor&apos;s product URL can also be pasted in manually per product, from the
            Catalog → Price Compare datatable, without this key.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="pu-api-key">API Key</Label>
            <Input
              id="pu-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                plugin?.google_api_key_configured
                  ? `Saved — ending in ${plugin.google_api_key_hint || "••••"}`
                  : "Google Custom Search API key"
              }
              disabled={!canWrite}
            />
          </div>
          <div>
            <Label htmlFor="pu-cx">Search Engine ID (cx)</Label>
            <Input
              id="pu-cx"
              value={searchEngineId}
              onChange={(e) => setSearchEngineId(e.target.value)}
              placeholder="e.g. 017576662512468239146:omuauf_lfve"
              disabled={!canWrite}
            />
          </div>
        </div>
        {canWrite ? (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Save settings
            </Button>
            {plugin?.google_api_key_configured ? (
              <Badge variant="success">Google Search configured</Badge>
            ) : (
              <Badge variant="muted">Google Search not configured — manual URLs only</Badge>
            )}
          </div>
        ) : null}
      </section>

      <section className="space-y-3 border border-border p-4">
        <div>
          <h3 className="text-sm font-semibold">Competitor websites</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Add any website to compare prices against — its price shows up as a column on
            Catalog → Price Compare as soon as it&apos;s added.
          </p>
        </div>
        <div className="space-y-2">
          {competitors.map((site) => (
            <div
              key={site.id}
              className="flex items-center justify-between gap-2 border border-input px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{site.label}</p>
                <p className="truncate text-xs text-muted-foreground">{site.domain}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  checked={site.enabled}
                  onCheckedChange={(checked) => void handleToggle(site, checked)}
                  disabled={!canWrite || busyCompetitorId === site.id}
                />
                {canWrite ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => void handleRemove(site)}
                    disabled={busyCompetitorId === site.id}
                    title={`Remove ${site.label}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {competitors.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">No competitor websites yet.</p>
          ) : null}
        </div>

        {canWrite ? (
          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <div className="min-w-[160px] flex-1">
              <Label htmlFor="pu-new-domain">Website domain</Label>
              <Input
                id="pu-new-domain"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="e.g. pickaboo.com"
              />
            </div>
            <div className="min-w-[140px] flex-1">
              <Label htmlFor="pu-new-label">Display name</Label>
              <Input
                id="pu-new-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Pickaboo"
              />
            </div>
            <Button size="sm" onClick={() => void handleAddWebsite()} disabled={adding || !newDomain.trim()}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add website
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
