"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Clickable document / party ref in AG Grid cells — opens the related drawer. */
export const GRID_REF_LINK_CLASS =
  "block w-full min-w-0 cursor-pointer truncate text-left text-foreground no-underline hover:text-primary hover:no-underline focus-visible:outline-none";

type Props = {
  children: ReactNode;
  title?: string;
  className?: string;
  onClick: () => void;
};

export function GridRefLink({ children, title, className, onClick }: Props) {
  return (
    <button
      type="button"
      className={cn(GRID_REF_LINK_CLASS, className)}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
