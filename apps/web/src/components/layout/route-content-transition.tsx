"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * Soft fade-in when the route changes — shell/navbar stay put; only the
 * page body eases in (desktop-app feel). No overflow clipping so module
 * layouts can bleed edge-to-edge with negative margins.
 */
export function RouteContentTransition({ children, className }: Props) {
  const pathname = usePathname();

  return (
    <div
      key={pathname}
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col animate-[route-fade-in_160ms_ease-out] [&>*]:min-h-0 [&>*]:flex-1 [&>*]:overflow-y-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}
