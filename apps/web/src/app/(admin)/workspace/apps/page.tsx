"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Puzzle } from "lucide-react";
import { ModulesPanel } from "@/components/workspace/modules-panel";
import { PluginsHome } from "@/components/settings/plugins/plugins-home";
import { cn } from "@/lib/utils";

type AppsTab = "modules" | "plugins";

const TABS: { id: AppsTab; label: string; blurb: string; icon: typeof LayoutGrid }[] = [
  { id: "modules", label: "Modules", blurb: "Turn workspace areas on or off", icon: LayoutGrid },
  { id: "plugins", label: "Plugins", blurb: "Install and configure integrations", icon: Puzzle },
];

function AppsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: AppsTab = searchParams.get("tab") === "plugins" ? "plugins" : "modules";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <header>
        <h1 className="page-title">Apps</h1>
        <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
          Everything you can add to your workspace: built-in modules and third-party plugins.
        </p>
      </header>

      <div role="tablist" aria-label="Apps" className="grid gap-2 sm:grid-cols-2">
        {TABS.map(({ id, label, blurb, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => router.replace(`/workspace/apps?tab=${id}`, { scroll: false })}
              className={cn(
                "flex items-center gap-3 border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/40",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{blurb}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={tab}>
        {tab === "modules" ? <ModulesPanel embedded /> : <PluginsHome embedded />}
      </div>
    </div>
  );
}

/** Apps hub — Modules and Plugins, each with its own list, on one page. */
export default function AppsPage() {
  return (
    <Suspense fallback={null}>
      <AppsContent />
    </Suspense>
  );
}
