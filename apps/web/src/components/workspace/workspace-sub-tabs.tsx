"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type WorkspaceSubTab = { label: string; href: string; /** extra paths that also select this tab */ match?: string[] };

/**
 * The strip of related pages under one Configuration entry (Odoo's "Users | Groups"): one menu entry, a few tabs, instead of a menu
 * item per page.
 */
export function WorkspaceSubTabs({ tabs, className }: { tabs: WorkspaceSubTab[]; className?: string }) {
  const pathname = usePathname();
  return (
    <div
      className={cn("flex shrink-0 gap-0 border-b border-border bg-muted/20", className)}
      role="tablist"
      aria-label="Related pages"
    >
      {tabs.map((tab) => {
        const paths = [tab.href, ...(tab.match ?? [])];
        const active = paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "-mb-px border-t-2 px-3 py-1.5 text-[12px] font-medium whitespace-nowrap transition-colors",
              active
                ? "border-[#714B67] bg-card text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export const USERS_ACCESS_TABS: WorkspaceSubTab[] = [
  { label: "Users", href: "/workspace/users" },
  { label: "Roles", href: "/workspace/roles" },
  { label: "Approval Limits", href: "/workspace/approval-limits" },
  { label: "Security", href: "/workspace/security" },
];

export const AI_ASSISTANT_TABS: WorkspaceSubTab[] = [
  { label: "Usage", href: "/workspace/ai-usage" },
  { label: "Approvals", href: "/workspace/ai-approvals" },
];
