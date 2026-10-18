"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchServerPluginStates } from "@/lib/api/plugin-install-state";
import { registerPluginInstall } from "@/components/settings/plugins/plugins-home";
import { PLUGIN_REGISTRY } from "@/lib/settings/plugins/registry";
import { usePluginsStore } from "@/lib/store/plugins-store";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";

/** The AI parts that face the shop's customers - today the AI Search plugin (shopping assistant + smart search). */
const STOREFRONT_AI_PLUGINS = ["ai-search"];

export function AiStorefront() {
  const canWrite = useAdminCanWrite();
  const plugins = usePluginsStore((s) => s.plugins);
  const hydrateFromServer = usePluginsStore((s) => s.hydrateFromServer);

  useEffect(() => {
    void fetchServerPluginStates()
      .then(hydrateFromServer)
      .catch(() => undefined);
  }, [hydrateFromServer]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 pb-10">
        <header>
          <h1 className="page-title">Storefront AI</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            The AI your shoppers use on the website: smart search and a shopping assistant that answers from the live catalogue. Admin chat
            (Aladin) is under the Admin menu.
          </p>
        </header>

        <ul className="grid gap-3 sm:grid-cols-2">
          {PLUGIN_REGISTRY.filter((p) => STOREFRONT_AI_PLUGINS.includes(p.id)).map((plugin) => {
            const state = plugins[plugin.id];
            const installed = Boolean(state?.installed);
            const enabled = Boolean(state?.enabled);
            return (
              <li key={plugin.id} className="flex gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-xl font-bold text-white"
                  style={{ backgroundColor: plugin.brandColor }}
                  aria-hidden
                >
                  {plugin.name.charAt(0)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="text-sm font-semibold">{plugin.name}</h2>
                    {installed ? (
                      <Badge variant={enabled ? "success" : "muted"} className="rounded-none">
                        {enabled ? <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden /> : null}
                        {enabled ? "Active" : "Disabled"}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{plugin.description}</p>
                  <div className="mt-3 flex gap-1.5">
                    {installed ? (
                      <Button asChild size="sm" className="h-7 rounded-md px-3 text-xs">
                        <Link href={`/workspace/plugins/${plugin.id}`}>
                          Configure <ArrowUpRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-7 rounded-md px-3 text-xs"
                        disabled={!canWrite}
                        onClick={() =>
                          void registerPluginInstall(plugin.id).then(
                            () => toast.success(`${plugin.name} installed`),
                            (err) => toast.error(err instanceof Error ? err.message : "Failed to install the plugin"),
                          )
                        }
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
      </div>
    </div>
  );
}
