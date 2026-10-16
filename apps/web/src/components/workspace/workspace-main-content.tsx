import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
  /** Edge-to-edge (POS register) — no content padding or nested scroll. */
  flush?: boolean;
};

/** WS-CONTENT-* — Zone D main content slot. */
export function WorkspaceMainContent({ children, className, flush = false }: Props) {
  return (
    <main
      data-zone="D"
      data-component="WS-CONTENT"
      data-layout="LAYOUT-WORKSPACE"
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden overscroll-y-contain bg-background",
        flush
          ? "p-0 [&>*]:min-h-0 [&>*]:flex-1 [&>*]:overflow-hidden"
          : "p-3 max-md:pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:p-3 lg:p-4 [&>*]:min-h-0 [&>*]:flex-1 [&>*]:overflow-y-auto",
        className,
      )}
    >
      {children}
    </main>
  );
}
