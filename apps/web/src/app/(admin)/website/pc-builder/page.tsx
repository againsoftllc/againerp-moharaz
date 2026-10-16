"use client";

// Website → PC Builder: the same Smart PC Builder workspace as Workspace → Plugins → Smart PC Builder (one set of
// sections and components, so both screens edit the same slots, rules and settings), plus the builder profiles.
// The storefront's /pc-builder reads these slots and rules from /storefront/configurator/profiles/pc-builder.

import Link from "next/link";
import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Puzzle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmartPcBuilderPluginPanel, openStorefront } from "@/components/settings/plugins/smart-pc-builder-plugin-panel";
import { findPlugin } from "@/lib/settings/plugins/registry";
import { useSmartPcBuilderNavStore } from "@/lib/store/smart-pc-builder-nav-store";
import { cn } from "@/lib/utils";
import ConfiguratorProfilesPage from "../../dropshipping/product-configurator/profiles/page";

const SECTIONS = [
  ...(findPlugin("smart-pc-builder")?.sections ?? []).map((s) => ({ id: s.id, title: s.title })),
  { id: "profiles", title: "Builder profiles" },
];

function PcBuilderWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = SECTIONS.some((s) => s.id === params.get("section")) ? params.get("section")! : "overview";
  const badges = useSmartPcBuilderNavStore((s) => s.badges);
  const jumpToken = useSmartPcBuilderNavStore((s) => s.jumpToken);

  const open = (id: string) => {
    const next = new URLSearchParams(params.toString());
    if (id === "overview") next.delete("section");
    else next.set("section", id);
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  // a button inside one section (e.g. Rules → "Test") asks for another one
  useEffect(() => {
    const target = useSmartPcBuilderNavStore.getState().targetSection;
    if (jumpToken && target) open(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToken]);

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">PC Builder</h1>
          <p className="text-xs text-muted-foreground">
            Slots, compatibility rules and settings of the storefront PC builder — the same workspace as the Smart PC
            Builder plugin.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href="/workspace/plugins/smart-pc-builder">
              <Puzzle className="mr-1.5 h-3.5 w-3.5" />
              Plugin
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href="/pc-builder" target="_blank" rel="noreferrer" onClick={openStorefront}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Storefront
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
        <nav className="lg:sticky lg:top-4 lg:self-start">
          <ul className="flex gap-0.5 overflow-x-auto rounded-none border border-border bg-card p-1 lg:block lg:space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => open(s.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-none px-3 py-2 text-left text-xs transition-colors",
                    active === s.id
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <span>{s.title}</span>
                  {badges[s.id] ? (
                    <span
                      className={cn(
                        "text-[10px] font-semibold tabular-nums",
                        s.id === "overview" ? "bg-amber-500/15 px-1.5 text-amber-600" : "opacity-70",
                      )}
                    >
                      {badges[s.id]}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-4">
          {active === "profiles" ? <ConfiguratorProfilesPage /> : <SmartPcBuilderPluginPanel activeSection={active} />}
        </div>
      </div>
    </div>
  );
}

export default function WebsitePcBuilderPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading PC Builder…</div>}>
      <PcBuilderWorkspace />
    </Suspense>
  );
}
