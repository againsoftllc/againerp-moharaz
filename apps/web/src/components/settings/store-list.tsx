"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  createWorkspaceSite,
  listWorkspaceSites,
  type WorkspaceSite,
} from "@/lib/api/workspace-sites";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  setup: "Setup",
};

function statusVariant(status: string) {
  if (status === "active") return "default" as const;
  if (status === "setup") return "secondary" as const;
  return "outline" as const;
}

function openUrl(site: WorkspaceSite): string | null {
  const raw =
    site.storefront_url_production ||
    site.storefront_url_local ||
    site.storefront_url_preview ||
    (site.primary_domain ? `https://${site.primary_domain}` : "");
  return raw || null;
}

export function StoreList() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<WorkspaceSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await listWorkspaceSites(q);
      setRows(data);
      const primary = data.find((s) => s.is_primary) || data[0];
      if (primary) {
        const { hydrateStorefrontUrlsFromSite } = await import("@/lib/website/live-edit");
        hydrateStorefrontUrlsFromSite(primary);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sites");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredHint = useMemo(() => query.trim(), [query]);

  const onSearch = () => {
    void load(filteredHint || undefined);
  };

  const onAdd = async () => {
    setAdding(true);
    try {
      const code = `S${String(rows.length + 1).padStart(2, "0")}`;
      const created = await createWorkspaceSite({
        code,
        name: `New site ${code}`,
        status: "setup",
        plan: "Trial",
        storefront_url_local: "http://localhost:3010",
        currency: "BDT",
        timezone: "Asia/Dhaka",
      });
      toast.success("Site created");
      window.location.href = `/website/configuration/sites/${created.id}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create site");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Manage storefront sites — brand, domain, and deploy URLs that power the customer shop.
        </p>
        <Button
          size="sm"
          className="rounded-none"
          disabled={adding}
          onClick={() => void onAdd()}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {adding ? "Adding…" : "Add site"}
        </Button>
      </div>

      <div className="rounded-none border border-border bg-muted/30 p-3">
        <label htmlFor="store-search" className="text-xs font-medium text-muted-foreground">
          Search sites
        </label>
        <div className="mt-1 flex gap-2">
          <Input
            id="store-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearch();
            }}
            placeholder="Site name, code, domain…"
            className="max-w-md rounded-none"
          />
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 rounded-none"
            onClick={onSearch}
          >
            <Search className="mr-1.5 h-3.5 w-3.5" />
            Filter
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="min-h-0 flex-1 overflow-hidden rounded-none border border-border bg-card">
        {loading ? (
          <div className="p-4">
            <ContentDataSkeleton rows={5} />
          </div>
        ) : (
          <div className="h-full overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 border-b border-border bg-muted/40 text-xs">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Site</th>
                  <th className="px-4 py-2.5 text-left font-medium">Code</th>
                  <th className="px-4 py-2.5 text-left font-medium">Domain</th>
                  <th className="px-4 py-2.5 text-right font-medium">Products</th>
                  <th className="px-4 py-2.5 text-right font-medium">Orders</th>
                  <th className="px-4 py-2.5 text-left font-medium">Plan</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No sites yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((store) => {
                    const href = openUrl(store);
                    return (
                      <tr key={store.id} className="border-b border-input/60 last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-medium">
                            {store.name}
                            {store.is_primary ? (
                              <span className="ml-2 border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Primary
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted-foreground">{store.owner || "—"}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{store.code}</td>
                        <td className="px-4 py-3">
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              {store.primary_domain || href.replace(/^https?:\/\//, "")}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <Link
                            href="/catalog/products"
                            className="text-primary hover:underline"
                            title="Open product list"
                          >
                            {store.products}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <Link
                            href="/sales"
                            className="text-primary hover:underline"
                            title="Open sales orders"
                          >
                            {store.orders}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs">{store.plan || "—"}</td>
                        <td className="px-4 py-3">
                          <Badge variant={statusVariant(store.status)} className="rounded-none">
                            {STATUS_LABELS[store.status] || store.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="outline" size="sm" className="rounded-none" asChild>
                            <Link href={`/website/configuration/sites/${store.id}`}>
                              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                              Settings
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
