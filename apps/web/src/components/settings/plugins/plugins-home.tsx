"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  Package,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PLUGIN_CATEGORIES, PLUGIN_REGISTRY } from "@/lib/settings/plugins/registry";
import type { PluginCategory } from "@/lib/settings/plugins/types";
import { usePluginsStore } from "@/lib/store/plugins-store";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { installBkashPlugin } from "@/lib/api/bkash-plugin";
import { installSslcommerzPlugin } from "@/lib/api/sslcommerz-plugin";
import { installPaypalPlugin } from "@/lib/api/paypal-plugin";
import { installStripePlugin } from "@/lib/api/stripe-plugin";
import { upsertPlatformSetting } from "@/lib/api/platform-settings";
import { installSmartPcBuilderPlugin } from "@/lib/api/smart-pc-builder-plugin";
import { installMarketingTrackingPlugin } from "@/lib/api/marketing-tracking-plugin";
import { fetchServerPluginStates } from "@/lib/api/plugin-install-state";

type StatusFilter = "all" | "installed" | "available";

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "installed", label: "Installed" },
  { id: "available", label: "Available" },
];

export function PluginsHome({ embedded = false }: { embedded?: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<"all" | PluginCategory>("all");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPluginVisible, centerBound, plugins],
  );

  const installedCount = visibleRegistry.filter((p) => plugins[p.id]?.installed).length;
  const activeCount = visibleRegistry.filter(
    (p) => plugins[p.id]?.installed && plugins[p.id]?.enabled,
  ).length;
  const statusCounts: Record<StatusFilter, number> = {
    all: visibleRegistry.length,
    installed: installedCount,
    available: visibleRegistry.length - installedCount,
  };

  const usedCategories = (Object.keys(PLUGIN_CATEGORIES) as PluginCategory[]).filter((id) =>
    visibleRegistry.some((p) => p.category === id),
  );

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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {embedded ? <h2 className="text-sm font-semibold">Plugins</h2> : <h1 className="page-title">Plugins</h1>}
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            Connect couriers, payment gateways, marketing tools and more. Install a plugin, then
            configure it to start using it.
          </p>
        </div>
        <dl className="flex items-center gap-5 text-xs">
          <div>
            <dt className="text-muted-foreground">Installed</dt>
            <dd className="text-base font-semibold tabular-nums">{installedCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Active</dt>
            <dd className="text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {activeCount}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Available</dt>
            <dd className="text-base font-semibold tabular-nums">{statusCounts.available}</dd>
          </div>
        </dl>
      </header>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              placeholder="Search plugins… e.g. Pathao, bKash"
              aria-label="Search plugins"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 rounded-none pl-8 pr-8 text-xs"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                onClick={() => setQuery("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <div
            role="tablist"
            aria-label="Filter by status"
            className="inline-flex w-full border border-border bg-card sm:w-auto"
          >
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={status === tab.id}
                onClick={() => setStatus(tab.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none",
                  status === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "tabular-nums text-[10px]",
                    status === tab.id ? "text-primary-foreground/80" : "text-muted-foreground",
                  )}
                >
                  {statusCounts[tab.id]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Filter by category"
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {(["all", ...usedCategories] as ("all" | PluginCategory)[]).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={category === id}
              onClick={() => setCategory(id)}
              className={cn(
                "shrink-0 border px-2.5 py-1 text-[11px] font-medium transition-colors",
                category === id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {id === "all" ? "All categories" : PLUGIN_CATEGORIES[id].label}
            </button>
          ))}
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="flex flex-col items-center gap-1 border border-dashed border-border px-4 py-12 text-center">
          <Package className="h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">No plugins match your filters</p>
          <p className="text-xs text-muted-foreground">
            Try a different search, status or category.
          </p>
          <Button variant="outline" size="sm" className="mt-2 rounded-none" onClick={resetFilters}>
            Reset filters
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([categoryId, list]) => (
            <section key={categoryId} aria-labelledby={`plugin-cat-${categoryId}`}>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
                <h2 id={`plugin-cat-${categoryId}`} className="text-sm font-semibold">
                  {PLUGIN_CATEGORIES[categoryId as PluginCategory].label}
                </h2>
                <span className="text-[11px] text-muted-foreground">
                  {list.length} · {PLUGIN_CATEGORIES[categoryId as PluginCategory].description}
                </span>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((plugin) => {
                  const state = plugins[plugin.id];
                  const installed = Boolean(state?.installed);
                  const enabled = Boolean(state?.enabled);

                  return (
                    <li
                      key={plugin.id}
                      className="flex flex-col border border-border bg-card p-3 transition-colors hover:border-primary/50"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center text-sm font-bold text-white"
                          style={{ backgroundColor: plugin.brandColor }}
                          aria-hidden
                        >
                          {plugin.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="text-sm font-semibold">{plugin.name}</h3>
                            {installed ? (
                              <Badge variant={enabled ? "success" : "muted"} className="rounded-none">
                                {enabled ? <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden /> : null}
                                {enabled ? "Active" : "Disabled"}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-muted-foreground">
                            {plugin.description}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2 border-t border-border/70 pt-2.5">
                        <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                          v{plugin.version} · {plugin.author}
                        </span>
                        <div className="ml-auto flex shrink-0 items-center gap-1">
                          {plugin.website ? (
                            <Button size="icon" variant="ghost" className="h-7 w-7 rounded-none" asChild>
                              <a
                                href={plugin.website}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`${plugin.name} website`}
                                title="Visit website"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          ) : null}
                          {installed ? (
                            <>
                              {plugin.appHref ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 rounded-none px-2 text-xs"
                                  asChild
                                >
                                  <Link href={`/workspace/plugins/${plugin.id}`}>Settings</Link>
                                </Button>
                              ) : null}
                              <Button size="sm" className="h-7 rounded-none px-2.5 text-xs" asChild>
                                <Link href={plugin.appHref ?? `/workspace/plugins/${plugin.id}`}>
                                  {plugin.appHref ? "Open" : "Configure"}
                                  <ArrowRight className="ml-1 h-3 w-3" />
                                </Link>
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              className="h-7 rounded-none px-2.5 text-xs"
                              disabled={!canWrite}
                              onClick={() => void handleInstall(plugin.id)}
                            >
                              <Download className="mr-1 h-3 w-3" /> Install
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
