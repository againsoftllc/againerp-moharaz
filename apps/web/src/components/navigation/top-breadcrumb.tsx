"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { resolveBreadcrumbs } from "@/lib/navigation/breadcrumbs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Props = {
  className?: string;
  /** Show only the last segment (mobile compact). */
  compact?: boolean;
  /** Allow expanding full path on mobile. */
  expandable?: boolean;
};

export function TopBreadcrumb({ className, compact, expandable }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const crumbs = resolveBreadcrumbs(pathname, search);
  const [expanded, setExpanded] = useState(false);

  if (crumbs.length <= 1) return null;

  const mobileCompact = compact && !expanded;
  const visible = mobileCompact ? crumbs.slice(-2) : crumbs;
  const hiddenCount = crumbs.length - visible.length;

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      {expandable && mobileCompact && hiddenCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-0.5 h-7 px-1.5 text-[10px] text-muted-foreground"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-label={`Show full breadcrumb path, ${hiddenCount} hidden segments`}
        >
          <ChevronDown className="mr-1 h-3 w-3" aria-hidden />
          Show full path
        </Button>
      ) : null}

      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {visible.map((crumb, index) => {
          const globalIndex = crumbs.length - visible.length + index;
          const isLast = globalIndex === crumbs.length - 1;
          const showSeparator = index > 0;

          return (
            <li key={`${crumb.label}-${globalIndex}`} className="flex min-w-0 items-center gap-1">
              {showSeparator && (
                <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
              )}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="max-w-[9rem] truncate rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[12rem]"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    "max-w-[10rem] truncate sm:max-w-none",
                    isLast && "font-medium text-foreground",
                  )}
                  aria-current={isLast ? "page" : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {expandable && expanded ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-0.5 h-7 px-1.5 text-[10px] text-muted-foreground"
          onClick={() => setExpanded(false)}
          aria-expanded
        >
          Collapse path
        </Button>
      ) : null}
    </nav>
  );
}
