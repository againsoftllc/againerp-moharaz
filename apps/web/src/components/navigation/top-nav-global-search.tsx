"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { openCommandPalette } from "@/lib/navigation/command-palette";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Icon-only trigger for narrow viewports. */
  compact?: boolean;
};

export function TopNavGlobalSearch({ className, compact }: Props) {
  if (compact) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-9 w-9 shrink-0", className)}
        onClick={openCommandPalette}
        aria-label="Open global search"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Search className="h-4 w-4" aria-hidden />
      </Button>
    );
  }

  return (
    <div className={cn("relative w-full max-w-md", className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        readOnly
        placeholder="Global search…"
        className="h-9 cursor-pointer pl-8 pr-14 text-xs"
        aria-label="Global search"
        onFocus={openCommandPalette}
        onClick={openCommandPalette}
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-input bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
        ⌘K
      </kbd>
    </div>
  );
}
