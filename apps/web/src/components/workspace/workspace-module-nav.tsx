"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isModuleNavTabActive, resolveModuleContext } from "@/lib/workspace/module-nav";

/** WS-MODNAV-* — Zone B module navigation tabs. */
export function WorkspaceModuleNav() {
  const pathname = usePathname();
  const ctx = resolveModuleContext(pathname);

  if (!ctx) return null;

  return (
    <nav
      data-zone="B"
      data-component="WS-MODNAV"
      className="sticky top-14 z-20 flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      aria-label={`${ctx.moduleLabel} navigation`}
    >
      <span className="mr-2 hidden shrink-0 text-xs font-semibold text-muted-foreground sm:inline">
        {ctx.moduleLabel}
      </span>
      {ctx.tabs.map((tab) => {
        const active = isModuleNavTabActive(pathname, tab.href);
        return (
          <Link
            key={`${tab.id}-${tab.href}`}
            href={tab.href}
            data-nav-id={tab.id}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent",
              active && "bg-accent text-foreground shadow-sm",
            )}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
