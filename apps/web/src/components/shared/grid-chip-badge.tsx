"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Compact grid chip — same size as catalog category badges. */
export const GRID_CHIP_CLASS = "h-auto max-w-[7rem] shrink-0 self-center truncate leading-4";

export function GridChipBadge({
  children,
  className,
  title,
  variant = "outline",
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  variant?: "outline" | "muted" | "success" | "warning" | "default" | "secondary";
}) {
  return (
    <div className="flex h-full items-center overflow-hidden">
      <Badge variant={variant} className={cn(GRID_CHIP_CLASS, className)} title={title}>
        {children}
      </Badge>
    </div>
  );
}
