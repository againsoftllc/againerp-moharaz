"use client";

import { useMemo, useState } from "react";
import {
  ExternalLink,
  Filter,
  Globe,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { ConnectedWebsiteDrawer } from "@/components/workspace/connected-websites/connected-website-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  useConnectedWebsitesStore,
  type ConnectedWebsite,
  type WebsiteEnvironment,
} from "@/lib/store/connected-websites-store";
import { cn } from "@/lib/utils";

type EnvFilter = "all" | WebsiteEnvironment;
type DrawerState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; website: ConnectedWebsite };

export function ConnectedWebsitesHome() {
  const websites = useConnectedWebsitesStore((s) => s.websites);
  const remove = useConnectedWebsitesStore((s) => s.remove);
  const setPrimary = useConnectedWebsitesStore((s) => s.setPrimary);
  const setStatus = useConnectedWebsitesStore((s) => s.setStatus);

  const [search, setSearch] = useState("");
  const [envFilter, setEnvFilter] = useState<EnvFilter>("all");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState>({ mode: "closed" });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return websites.filter((w) => {
      if (envFilter !== "all" && w.environment !== envFilter) return false;
      if (!q) return true;
      return (
        w.name.toLowerCase().includes(q) ||
        w.baseUrl.toLowerCase().includes(q) ||
        (w.notes?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [websites, search, envFilter]);

  const primary = websites.find((w) => w.isPrimary);

  const resetFilters = () => {
    setSearch("");
    setEnvFilter("all");
  };

  const handleRemove = (website: ConnectedWebsite) => {
    if (!window.confirm(`Remove “${website.name}” from connected websites?`)) return;
    remove(website.id);
    toast.success("Website removed");
  };

  return (
    <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div
        data-component="connected-websites-filters"
        className="product-grid-filters flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-0"
      >
        <div className="flex shrink-0 items-center gap-2 border-r border-border bg-background pr-2">
          <Button size="sm" onClick={() => setDrawer({ mode: "create" })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New
          </Button>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Input
            placeholder="Search name or URL…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[220px] shrink-0 rounded-none"
          />
          <Select
            value={envFilter}
            onChange={(e) => setEnvFilter(e.target.value as EnvFilter)}
            className="w-[130px] shrink-0 rounded-none"
          >
            <option value="all">All environments</option>
            <option value="local">Local</option>
            <option value="live">Live</option>
          </Select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-background px-3 py-3">
        {filtered.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-start justify-center gap-2 rounded-lg border border-dashed border-border bg-card px-6 py-12">
            <Globe className="h-8 w-8 text-muted-foreground" aria-hidden />
            <h2 className="text-lg font-semibold text-foreground">
              {websites.length === 0 ? "No storefront connected" : "No matches"}
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {websites.length === 0
                ? "Connect a separate storefront (e.g. AgainERP local or live). The primary URL is used for open / live edit / preview."
                : "Try a different search or environment filter."}
            </p>
            {websites.length === 0 ? (
              <Button size="sm" className="mt-2" onClick={() => setDrawer({ mode: "create" })}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Connect website
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">Website</th>
                  <th className="px-3 py-2.5 text-left font-medium">Base URL</th>
                  <th className="px-3 py-2.5 text-left font-medium">Env</th>
                  <th className="px-3 py-2.5 text-left font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((website) => (
                  <tr
                    key={website.id}
                    className="border-b border-border/60 last:border-0 hover:bg-muted/20"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{website.name}</p>
                        {website.isPrimary ? (
                          <Badge variant="default" className="gap-1 text-[10px]">
                            <Star className="h-2.5 w-2.5" />
                            Primary
                          </Badge>
                        ) : null}
                      </div>
                      {website.notes ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{website.notes}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <a
                        href={website.baseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-[280px] items-center gap-1 truncate font-mono text-xs text-primary hover:underline"
                      >
                        {website.baseUrl}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={website.environment === "local" ? "secondary" : "outline"}>
                        {website.environment === "local" ? "Local" : "Live"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        variant={website.status === "connected" ? "default" : "outline"}
                        className={cn(
                          website.status === "connected" &&
                            "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                        )}
                      >
                        {website.status === "connected" ? "Connected" : "Disconnected"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {!website.isPrimary ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => {
                              setPrimary(website.id);
                              toast.success(`“${website.name}” is now primary`);
                            }}
                          >
                            Set primary
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7"
                          onClick={() => window.open(website.baseUrl, "_blank", "noopener,noreferrer")}
                        >
                          Open
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7"
                          onClick={() => setDrawer({ mode: "edit", website })}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7"
                          onClick={() =>
                            setStatus(
                              website.id,
                              website.status === "connected" ? "disconnected" : "connected",
                            )
                          }
                          title="Toggle connection status"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-destructive hover:text-destructive"
                          onClick={() => handleRemove(website)}
                          aria-label={`Remove ${website.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex h-[34px] shrink-0 items-center gap-2 border-t border-border bg-background px-2.5">
        <span className="text-sm font-medium">Websites</span>
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
        <span className="ml-auto truncate text-xs text-muted-foreground">
          {filtered.length} shown · {websites.length} total
          {primary ? ` · Primary: ${primary.name}` : ""}
        </span>
      </div>

      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="right" className="w-full max-w-sm overflow-y-auto">
          <h2 className="pr-8 text-base font-semibold">Filters</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Narrow connected storefronts by environment.
          </p>
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Environment</span>
              <Select
                value={envFilter}
                onChange={(e) => setEnvFilter(e.target.value as EnvFilter)}
                className="w-full rounded-none"
              >
                <option value="all">All environments</option>
                <option value="local">Local</option>
                <option value="live">Live</option>
              </Select>
            </label>
          </div>
          <Button variant="outline" size="sm" className="mt-4" onClick={resetFilters}>
            Reset all filters
          </Button>
        </SheetContent>
      </Sheet>

      <ConnectedWebsiteDrawer
        open={drawer.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open) setDrawer({ mode: "closed" });
        }}
        website={drawer.mode === "edit" ? drawer.website : null}
      />
    </div>
  );
}
