"use client";

import { Menu } from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Use on dark module navbars (Catalog, Dropshipping, Inventory). */
  tone?: "light" | "dark";
};

/** Opens the left workspace navigation drawer (hamburger). */
export function WorkspaceNavDrawerToggle({ className, tone = "dark" }: Props) {
  const open = useAppStore((s) => s.mobileSidebarOpen);
  const setOpen = useAppStore((s) => s.setMobileSidebarOpen);

  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-[34px] w-9 shrink-0 items-center justify-center outline-none",
        tone === "dark"
          ? "text-white/90 hover:bg-white/[0.08] hover:text-white"
          : "text-foreground hover:bg-muted",
        className,
      )}
      onClick={() => setOpen(!open)}
      aria-label={open ? "Close navigation menu" : "Open navigation menu"}
      aria-expanded={open}
      data-component="WS-NAV-DRAWER-TOGGLE"
    >
      <Menu className="h-4 w-4" aria-hidden />
    </button>
  );
}
