"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Download, ExternalLink, Info, MoreVertical, Search, Settings, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { workspaceDashboardItem, workspaceNavItems } from "@/lib/workspace/navigation-config";
import { isToggleableModuleId, useModuleSettingsStore } from "@/lib/store/module-settings-store";
import { isCenterManagedModule } from "@/lib/center/entitlements";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { moduleSettingsHref } from "@/lib/workspace/module-settings-href";
import { PLUGIN_REGISTRY } from "@/lib/settings/plugins/registry";
import { usePluginsStore } from "@/lib/store/plugins-store";
import { fetchServerPluginStates } from "@/lib/api/plugin-install-state";
import { registerPluginInstall } from "@/components/settings/plugins/plugins-home";
import { MODULE_DESCRIPTIONS } from "@/components/workspace/modules-panel";
import { cn } from "@/lib/utils";

const ALWAYS_ON = new Set(["dashboard", "workspace"]);

/** Soft app-icon colours (Odoo-style tiles): one per module, stable. */
const TILE_COLORS = [
  "from-violet-500 to-indigo-500",
  "from-sky-500 to-blue-600",
  "from-emerald-500 to-teal-600",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-600",
  "from-fuchsia-500 to-purple-600",
  "from-cyan-400 to-sky-600",
  "from-lime-500 to-green-600",
];

function tileColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
}

/** The (i) button: the description is not printed on the card; it opens on click (and shows as a tooltip on hover). */
function InfoButton({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`About ${title}`}
        aria-expanded={open}
        title={text}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-0 top-6 z-20 w-60 rounded-md border border-border bg-popover p-2 text-xs leading-4 text-popover-foreground shadow-lg"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

type AppItem = {
  key: string;
  kind: "module" | "plugin";
  title: string;
  description: string;
  icon?: LucideIcon;
  brandColor?: string;
  installed: boolean;
  locked: boolean;
  lockLabel?: string;
  openHref?: string;
  settingsHref?: string;
  website?: string;
  toggle?: (on: boolean) => void;
  install?: () => void;
};

type Filter = "all" | "installed" | "available" | "modules" | "plugins";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "installed", label: "Installed" },
  { id: "available", label: "Not installed" },
  { id: "modules", label: "Modules" },
  { id: "plugins", label: "Plugins" },
];

/**
 * Apps - one Odoo-style grid of everything that can be added to the workspace: the built-in modules (turn on / off) and the plugins
 * (install / configure). A card is an icon tile, the name, a short line and its buttons; the ⋮ menu has the rest.
 */
export function AppsGrid() {
  const canWrite = useAdminCanWrite();
  const enabled = useModuleSettingsStore((s) => s.enabled);
  const setModuleEnabled = useModuleSettingsStore((s) => s.setModuleEnabled);
  const centerBound = useModuleSettingsStore((s) => s.centerBound);
  const plugins = usePluginsStore((s) => s.plugins);
  const isPluginVisible = usePluginsStore((s) => s.isPluginVisible);
  const hydrateFromServer = usePluginsStore((s) => s.hydrateFromServer);
  const pluginCenterBound = usePluginsStore((s) => s.centerBound);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  // the browser's plugin state is a cache; the server is the truth
  useEffect(() => {
    let cancelled = false;
    void fetchServerPluginStates()
      .then((states) => {
        if (!cancelled) hydrateFromServer(states);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hydrateFromServer]);

  const items = useMemo<AppItem[]>(() => {
    const modules: AppItem[] = [
      workspaceDashboardItem,
      ...workspaceNavItems.filter((m) => isToggleableModuleId(m.id) || ALWAYS_ON.has(m.id)),
    ].map((m) => {
      const alwaysOn = ALWAYS_ON.has(m.id);
      const on = alwaysOn ? true : isToggleableModuleId(m.id) ? (enabled[m.id] ?? true) : true;
      const managed = !alwaysOn && centerBound && isCenterManagedModule(m.id);
      return {
        key: `module:${m.id}`,
        kind: "module" as const,
        title: m.title,
        description: MODULE_DESCRIPTIONS[m.id] ?? "",
        icon: m.icon,
        installed: on,
        locked: alwaysOn || managed,
        lockLabel: alwaysOn ? "Always on" : managed ? "Managed by AgainERP Center" : undefined,
        openHref: m.href,
        settingsHref: moduleSettingsHref(m.id),
        toggle: (next: boolean) => {
          if (alwaysOn || !isToggleableModuleId(m.id)) return;
          setModuleEnabled(m.id, next);
        },
      };
    });
    const pluginItems: AppItem[] = PLUGIN_REGISTRY.filter((p) => isPluginVisible(p.id)).map((p) => {
      const installed = Boolean(plugins[p.id]?.installed);
      return {
        key: `plugin:${p.id}`,
        kind: "plugin" as const,
        title: p.name,
        description: p.description,
        brandColor: p.brandColor,
        installed,
        locked: false,
        openHref: p.appHref ?? `/workspace/plugins/${p.id}`,
        settingsHref: `/workspace/plugins/${p.id}`,
        website: p.website,
        install: () => {
          void registerPluginInstall(p.id).then(
            () => toast.success(`${p.name} installed`),
            (err) => toast.error(err instanceof Error ? err.message : "Failed to install the plugin"),
          );
        },
      };
    });
    return [...modules, ...pluginItems];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, centerBound, plugins, pluginCenterBound, isPluginVisible, setModuleEnabled]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((a) => {
      if (filter === "installed" && !a.installed) return false;
      if (filter === "available" && a.installed) return false;
      if (filter === "modules" && a.kind !== "module") return false;
      if (filter === "plugins" && a.kind !== "plugin") return false;
      return !q || `${a.title} ${a.description}`.toLowerCase().includes(q);
    });
  }, [items, query, filter]);

  const renderCard = (app: AppItem) => {
    const Icon = app.icon;
    const hasMenu = Boolean(app.settingsHref || app.website || (app.kind === "module" && !app.locked && canWrite));
    return (
      <li
        key={app.key}
        className="group flex gap-3 rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
      >
        {app.brandColor ? (
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-xl font-bold text-white"
            style={{ backgroundColor: app.brandColor }}
            aria-hidden
          >
            {app.title.charAt(0).toUpperCase()}
          </span>
        ) : (
          <span
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-white",
              tileColor(app.key),
            )}
            aria-hidden
          >
            {Icon ? <Icon className="h-7 w-7" /> : <span className="text-xl font-bold">{app.title.charAt(0)}</span>}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-1">
            <div className="flex min-w-0 items-center gap-1">
              <h3 className="truncate text-sm font-semibold">{app.title}</h3>
              <InfoButton title={app.title} text={app.description} />
            </div>
            {hasMenu ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${app.title} options`}
                    className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[160px]">
                  {app.settingsHref ? (
                    <DropdownMenuItem asChild>
                      <Link href={app.settingsHref}>Settings</Link>
                    </DropdownMenuItem>
                  ) : null}
                  {app.website ? (
                    <DropdownMenuItem asChild>
                      <a href={app.website} target="_blank" rel="noreferrer">
                        Website
                      </a>
                    </DropdownMenuItem>
                  ) : null}
                  {app.kind === "module" && !app.locked && canWrite ? (
                    <DropdownMenuItem onSelect={() => app.toggle?.(!app.installed)}>
                      {app.installed ? "Disable" : "Enable"}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {app.installed ? (
              <>
                {app.openHref ? (
                  <Button asChild size="sm" className="h-7 rounded-md px-3 text-xs">
                    <Link href={app.openHref}>
                      Open <ArrowUpRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                ) : null}
                {app.settingsHref ? (
                  <Button asChild size="sm" variant="outline" className="h-7 rounded-md px-3 text-xs">
                    <Link href={app.settingsHref}>
                      <Settings className="mr-1 h-3 w-3" /> Settings
                    </Link>
                  </Button>
                ) : null}
                {app.lockLabel ? <span className="text-[10px] text-muted-foreground">{app.lockLabel}</span> : null}
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  className="h-7 rounded-md px-3 text-xs"
                  disabled={!canWrite}
                  onClick={() => (app.kind === "plugin" ? app.install?.() : app.toggle?.(true))}
                >
                  <Download className="mr-1 h-3 w-3" /> Install
                </Button>
                {app.website ? (
                  <Button asChild size="sm" variant="outline" className="h-7 rounded-md px-3 text-xs">
                    <a href={app.website} target="_blank" rel="noreferrer">
                      Learn More <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 pb-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title mr-2">Apps</h1>
        <div className="relative w-full max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps…"
            aria-label="Search apps"
            className="h-9 rounded-full pl-9 pr-8 text-sm"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
              onClick={() => setQuery("")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div role="tablist" aria-label="Filter apps" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === f.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {visible.length ? `1-${visible.length}` : "0"} / {items.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-16 text-center">
          <Search className="h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">No apps found</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 rounded-md"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Reset
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {(
            [
              { kind: "module" as const, title: "Modules", blurb: "Built-in areas of the workspace - turn them on or off" },
              { kind: "plugin" as const, title: "Plugins", blurb: "Integrations - install and configure" },
            ] as const
          ).map((group) => {
            const list = visible.filter((a) => a.kind === group.kind);
            if (list.length === 0) return null;
            return (
              <section key={group.kind} aria-labelledby={`apps-${group.kind}`}>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-2 border-b border-border pb-1.5">
                  <h2 id={`apps-${group.kind}`} className="text-base font-semibold">
                    {group.title}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {list.length} · {group.blurb}
                  </span>
                </div>
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{list.map((app) => renderCard(app))}</ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
