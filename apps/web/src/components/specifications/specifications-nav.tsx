"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Profiles", href: "/website/specifications/profiles" },
  { label: "Templates", href: "/website/specifications/templates" },
  { label: "AI Import", href: "/website/specifications/ai-import" },
  { label: "AI Suggestions", href: "/website/specifications/ai-suggestions" },
] as const;

export function SpecificationsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 rounded-lg border border-input bg-muted/30 p-1">
      {TABS.map((tab) => {
        const active =
          pathname === tab.href ||
          (tab.href.endsWith("/profiles") && pathname.startsWith("/website/specifications/profiles/"));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
