"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { SettingsLayer } from "@/lib/settings/types";
import { SETTINGS_LAYER_META, BUSINESS_SETTINGS_CATEGORIES } from "@/lib/settings/settings-schema";

const LAYERS: SettingsLayer[] = ["business", "workspace", "platform"];

export function SettingsLayerNav({ compact }: { compact?: boolean }) {
  const pathname = usePathname();

  const isActive = (layer: SettingsLayer) => {
    const base = SETTINGS_LAYER_META[layer].basePath;
    if (layer === "business") {
      if (pathname === base || pathname.startsWith(`${base}/`)) return true;
      const segment = pathname.split("/")[2];
      return BUSINESS_SETTINGS_CATEGORIES.some((c) => c.id === segment);
    }
    return pathname === base || pathname.startsWith(`${base}/`);
  };

  const tabs = compact ? LAYERS.slice(0, 2) : LAYERS;

  return (
    <nav className="flex flex-wrap gap-1 rounded-lg border border-input bg-muted/30 p-1">
      {tabs.map((layer) => {
        const meta = SETTINGS_LAYER_META[layer];
        return (
          <Link
            key={layer}
            href={meta.basePath}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              isActive(layer)
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            {meta.title}
            {meta.badge && (
              <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                {meta.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
