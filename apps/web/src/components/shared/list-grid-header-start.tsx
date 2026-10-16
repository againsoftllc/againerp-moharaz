"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** Visible page name left of New / toolbar actions (theme tokens). */
  title: string;
  children?: ReactNode;
  className?: string;
};

/**
 * Shared list-datatable toolbar start:
 * `[Page name] [New] [⋯]` — use inside every module's `headerLeftActions`.
 */
export function ListGridHeaderStart({ title, children, className }: Props) {
  return (
    <div className={cn("flex shrink-0 items-center gap-2", className)}>
      <span
        className={cn(
          "inline-flex h-[26px] shrink-0 select-none items-center",
          "border-l-2 border-primary bg-primary/5 px-2",
          "text-xs font-bold leading-none tracking-tight text-foreground",
          "dark:bg-primary/10",
        )}
        aria-current="page"
      >
        {title}
      </span>
      {children}
    </div>
  );
}
