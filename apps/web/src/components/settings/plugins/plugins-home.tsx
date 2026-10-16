"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Download, Filter, Package } from "lucide-react";
import { toast } from "sonner";
import { PLUGIN_CATEGORIES, PLUGIN_REGISTRY } from "@/lib/settings/plugins/registry";
import type { PluginCategory } from "@/lib/settings/plugins/types";
import { usePluginsStore } from "@/lib/store/plugins-store";
import { PluginBrandMark } from "@/components/settings/plugins/plugin-field-row";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { FilterSelect } from "@/components/shared/filter-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { installBkashPlugin } from "@/lib/api/bkash-plugin";
import { installSslcommerzPlugin } from "@/lib/api/sslcommerz-plugin";
import { installPaypalPlugin } from "@/lib/api/paypal-plugin";
import { installStripePlugin } from "@/lib/api/stripe-plugin";
import { upsertPlatformSetting } from "@/lib/api/platform-settings";
import { installSmartPcBuilderPlugin } from "@/lib/api/smart-pc-builder-plugin";
import { installMarketingTrackingPlugin } from "@/lib/api/marketing-tracking-plugin";
import { fetchServerPluginStates } from "@/lib/api/plugin-install-state";

type StatusFilter = "all" | "installed" | "available";

export function PluginsHome() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<"all" | PluginCategory>("all");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const plugins = usePluginsStore((s) => s.plugins);
  const installPlugin = usePluginsStore((s) => s.installPlugin);
  const centerBound = usePluginsStore((s) => s.centerBound);
  const isPluginVisible = usePluginsStore((s) => s.isPluginVisible);
  const hydrateFromServer = usePluginsStore((s) => s.hydrateFromServer);
  const canWrite = useAdminCanWrite();

  /* The browser's copy is a cache; the server is the truth. Reading it on open
     is what makes an install done elsewhere — or on another machine — show up
     here instead of offering Install again. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const states = await fetchServerPluginStates();
        if (!cancelled) hydrateFromServer(states);
      } catch {
        /* keep whatever the browser had rather than blanking the screen */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateFromServer]);

  const visibleRegistry = useMemo(
    () => PLUGIN_REGISTRY.filter((p) => isPluginVisible(p.id)),
    [isPluginVisible, centerBound, plugins],
  );

  const installedCount = visibleRegistry.filter((p) => plugins[p.id]?.installed).length;

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return visibleRegistry.filter((plugin) => {
      const state = plugins[plugin.id];
      if (status === "installed" && !state?.installed) return false;
      if (status === "available" && state?.installed) return false;
      if (category !== "all" && plugin.category !== category) return false;
      if (!q) return true;
      return (
        plugin.name.toLowerCase().includes(q) ||
        plugin.description.toLowerCase().includes(q) ||
        plugin.category.includes(q) ||
        PLUGIN_CATEGORIES[plugin.category].label.toLowerCase().includes(q)
      );
    });
  }, [query, status, category, plugins, visibleRegistry]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof PLUGIN_REGISTRY>();
    for (const plugin of filtered) {
      const list = map.get(plugin.category) ?? [];
      list.push(plugin);
      map.set(plugin.category, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const resetFilters = () => {
    setQuery("");
    setStatus("all");
    setCategory("all");
  };

  const handleInstall = async (pluginId: string) => {
    installPlugin(pluginId);
    try {
      if (pluginId === "bkash") await installBkashPlugin();
      else if (pluginId === "sslcommerz") await installSslcommerzPlugin();
      else if (pluginId === "paypal") await installPaypalPlugin();
      else if (pluginId === "stripe") await installStripePlugin();
      else if (pluginId === "smart-pc-builder") await installSmartPcBuilderPlugin();
      else if (pluginId === "marketing-tracking") await installMarketingTrackingPlugin();
      else if (pluginId === "ai-search") {
        await upsertPlatformSetting("plugin.ai_search.installed", "true");
        await upsertPlatformSetting("plugin.ai_search.enabled", "true");
      }
      else if (pluginId === "bank-emi") {
        await upsertPlatformSetting("plugin.bank_emi.installed", "true");
      }
      toast.success("Plugin installed for storefront checkout");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to register plugin on API");
    }
  };

  return (
    <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div
        data-component="plugins-filters"
        className="product-grid-filters flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-0"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Input
            placeholder="Search plugins… e.g. Pathao, bKash"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-[220px] shrink-0 rounded-none"
          />
          <FilterSelect
            value={category}
            onChange={(next) => setCategory(next as "all" | PluginCategory)}
            width="w-[170px]"
            className="shrink-0"
            ariaLabel="Category filter"
            options={[
              { value: "all", label: "All categories" },
              ...Object.entries(PLUGIN_CATEGORIES).map(([id, meta]) => ({
                value: id,
                label: meta.label,
              })),
            ]}
          />
          <FilterSelect
            value={status}
            onChange={(next) => setStatus(next as StatusFilter)}
            width="w-[130px]"
            className="shrink-0"
            ariaLabel="Status filter"
            options={[
              { value: "all", label: "All plugins" },
              { value: "installed", label: "Installed" },
              { value: "available", label: "Available" },
            ]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-background px-3 py-3">
        {grouped.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-input bg-card">
            <Package className="h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No plugins match your filters</p>
            <Button size="sm" className="mt-4" onClick={resetFilters}>
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([categoryId, list]) => (
              <section key={categoryId}>
                <div className="mb-2">
                  <h2 className="text-sm font-semibold">
                    {PLUGIN_CATEGORIES[categoryId as PluginCategory].label}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    {PLUGIN_CATEGORIES[categoryId as PluginCategory].description}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((plugin) => {
                    const state = plugins[plugin.id];
                    const installed = Boolean(state?.installed);
                    const enabled = Boolean(state?.enabled);

                    return (
                      <div
                        key={plugin.id}
                        className="group flex flex-col rounded-xl border border-input bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                      >
                        <div className="flex items-start gap-3">
                          <PluginBrandMark name={plugin.name} color={plugin.brandColor} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold">{plugin.name}</p>
                              {installed ? (
                                <Badge variant={enabled ? "success" : "muted"}>
                                  {enabled ? "Active" : "Disabled"}
                                </Badge>
                              ) : (
                                <Badge variant="outline">Not installed</Badge>
                              )}
                            </div>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                              {plugin.description}
                            </p>
                            <p className="mt-2 text-[10px] text-muted-foreground">
                              v{plugin.version} · {plugin.author}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex gap-2 border-t border-input/60 pt-3">
                          {installed ? (
                            <Button size="sm" className="flex-1" asChild>
                              <Link href={plugin.appHref ?? `/workspace/plugins/${plugin.id}`}>
                                {plugin.appHref ? "Open" : "Configure"}{" "}
                                <ArrowRight className="ml-1 h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="flex-1"
                              disabled={!canWrite}
                              onClick={() => void handleInstall(plugin.id)}
                            >
                              <Download className="mr-1.5 h-3.5 w-3.5" /> Install
                            </Button>
                          )}
                          {plugin.appHref && installed && (
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/workspace/plugins/${plugin.id}`}>Settings</Link>
                            </Button>
                          )}
                          {plugin.website && (
                            <Button size="sm" variant="outline" asChild>
                              <a href={plugin.website} target="_blank" rel="noreferrer">
                                Website
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <div className="flex h-[34px] shrink-0 items-center gap-2 border-t border-border bg-background px-2.5">
        <span className="text-sm font-medium">Plugins</span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => setFilterSheetOpen(true)}
          aria-label="Filters"
          title="Filters"
        >
          <Filter className="h-3.5 w-3.5" />
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} shown · {installedCount} installed · {PLUGIN_REGISTRY.length} total
        </span>
      </div>

      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="right" className="w-full max-w-sm overflow-y-auto">
          <h2 className="pr-8 text-base font-semibold">Filters</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Narrow the plugin list by category and install status.
          </p>
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Category</span>
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value as "all" | PluginCategory)}
                className="w-full rounded-none"
              >
                <option value="all">All categories</option>
                {Object.entries(PLUGIN_CATEGORIES).map(([id, meta]) => (
                  <option key={id} value={id}>
                    {meta.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Status</span>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
                className="w-full rounded-none"
              >
                <option value="all">All plugins</option>
                <option value="installed">Installed</option>
                <option value="available">Available</option>
              </Select>
            </label>
          </div>
          <Button variant="outline" size="sm" className="mt-4" onClick={resetFilters}>
            Reset all filters
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
