"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  BarChart3,
  Boxes,
  FileStack,
  FolderTree,
  GitBranch,
  Layers,
  Puzzle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfiguratorProfiles } from "@/lib/api/use-configurator-profiles";
import { useConfiguratorCategories } from "@/lib/api/use-configurator-categories";
import { useConfiguratorTemplates } from "@/lib/api/use-configurator-templates";
import { useConfiguratorBuilds } from "@/lib/api/use-configurator-builds";
import { useCompatibilityRuleStore } from "@/lib/store/compatibility-rule-store";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";
import { PcBuilderAdminGuide } from "@/components/configurator/admin/pc-builder-admin-guide";

export default function ProductConfiguratorHubPage() {
  const moduleBase = useCatalogModuleBasePath();
  const base = `${moduleBase}/product-configurator`;
  const sections = [
    { title: "Profiles", href: `${base}/profiles`, icon: Layers, desc: "PC Builder profile (more later)" },
    { title: "Categories", href: `${base}/categories`, icon: FolderTree, desc: "Slots: CPU, RAM, GPU…" },
    { title: "Rules", href: `${base}/rules`, icon: GitBranch, desc: "IF/THEN compatibility" },
    { title: "Templates", href: `${base}/templates`, icon: FileStack, desc: "Starter PC builds" },
    { title: "Saved Builds", href: `${base}/builds`, icon: Boxes, desc: "Customer PC configs" },
    { title: "Analytics", href: `${base}/analytics`, icon: BarChart3, desc: "Usage & performance" },
  ];
  const { total: profileCount } = useConfiguratorProfiles();
  const { total: categoryCount } = useConfiguratorCategories();
  const { total: templateCount } = useConfiguratorTemplates();
  const { total: buildCount } = useConfiguratorBuilds();
  const ruleCount = useCompatibilityRuleStore((s) => s.rules.length);
  const rulesLoaded = useCompatibilityRuleStore((s) => s.loaded);
  const fetchRules = useCompatibilityRuleStore((s) => s.fetchRules);

  useEffect(() => {
    if (!rulesLoaded) void fetchRules();
  }, [rulesLoaded, fetchRules]);

  return (
    <div className="flex min-h-[calc(100vh-2.75rem-1.5rem)] flex-col lg:min-h-[calc(100vh-2.75rem-2rem)]">
      <div className="shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <Puzzle className="h-5 w-5 text-indigo-600" />
          <h1 className="page-title">Builders</h1>
        </div>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
          Again Builder — focus on <span className="font-medium text-foreground">PC Builder</span>.
          Follow the guide below, then manage profiles, slots, rules, and builds.
        </p>
      </div>

      <PcBuilderAdminGuide />

      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        {[
          { label: "Profiles", value: profileCount },
          { label: "Categories", value: categoryCount },
          { label: "Rules", value: ruleCount },
          { label: "Templates", value: templateCount },
          { label: "Builds", value: buildCount },
        ].map((k) => (
          <div key={k.label} className="rounded-none border border-border bg-card px-3 py-2 text-center">
            <p className="text-lg font-semibold">{k.value}</p>
            <p className="text-[10px] text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => (
          <div key={s.href} className="rounded-none border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
            <div className="flex items-center gap-2">
              <s.icon className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-semibold">{s.title}</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
            <Button size="sm" variant="outline" className="mt-3 rounded-none" asChild>
              <Link href={s.href}>Manage →</Link>
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-none border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Related</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-7 rounded-none text-xs" asChild>
            <Link href="/configurator/attributes">Component Attributes</Link>
          </Button>
          <Button variant="outline" size="sm" className="h-7 rounded-none text-xs" asChild>
            <Link href={`${base}/rules`}>Compatibility Rules</Link>
          </Button>
          <Button variant="outline" size="sm" className="h-7 rounded-none text-xs" asChild>
            <Link href="/workspace/plugins/again-builder">Again Builder plugin</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
