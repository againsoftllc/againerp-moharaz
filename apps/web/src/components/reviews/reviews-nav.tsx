"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";
import { cn } from "@/lib/utils";

const NAV_TAB_SUFFIXES = [
  { label: "Reviews", suffix: "/reviews" },
  { label: "Q&A", suffix: "/qa" },
  { label: "Reports", suffix: "/reviews/reports" },
  { label: "Settings", suffix: "/reviews/settings" },
] as const;

export function ReviewsNav({ compact }: { compact?: boolean }) {
  const pathname = usePathname();
  const moduleBase = useCatalogModuleBasePath();
  const tabs = (compact ? NAV_TAB_SUFFIXES.slice(0, 1) : NAV_TAB_SUFFIXES).map((tab) => ({
    label: tab.label,
    href: `${moduleBase}${tab.suffix}`,
  }));

  const isActive = (href: string) => {
    if (href === `${moduleBase}/reviews`) {
      const rest = pathname.slice(href.length);
      if (rest === "" || rest.startsWith("?")) return true;
      // Detail pages `/reviews/:id` — still highlight Reviews list
      const first = rest.replace(/^\//, "").split("/")[0] ?? "";
      const siblingRoots = new Set(["reports", "settings", "all"]);
      return rest.startsWith("/") && !siblingRoots.has(first);
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav className="flex flex-wrap gap-1 rounded-none border border-input bg-muted/30 p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "rounded-none px-3 py-1.5 text-xs font-medium transition-colors",
            isActive(tab.href)
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
