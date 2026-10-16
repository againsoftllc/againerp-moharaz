"use client";

import { Loader2 } from "lucide-react";

type Props = {
  /** Shown under the filter chrome while the AG Grid chunk / first paint settles. */
  label?: string;
};

/**
 * Shared list-datatable open shell — use for any module AG Grid page so navigation
 * paints filter chrome immediately (no full ContentDataSkeleton flash).
 *
 * Pattern:
 * ```tsx
 * const Grid = dynamic(() => import("./x-grid").then(m => m.XGrid), {
 *   ssr: false,
 *   loading: () => <ListGridOpenFallback label="Opening …" />,
 * });
 * // …
 * <Grid loading={loading && rows.length === 0} … />
 * ```
 */
export function ListGridOpenFallback({ label = "Opening list…" }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background animate-[route-fade-in_160ms_ease-out]">
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-2">
        <div className="h-[26px] w-14 animate-pulse rounded-none bg-muted" />
        <div className="h-[26px] w-[26px] animate-pulse rounded-none bg-muted" />
        <div className="h-[26px] w-[220px] animate-pulse rounded-none bg-muted" />
        <div className="h-[26px] w-[148px] animate-pulse rounded-none bg-muted" />
        <div className="h-[26px] w-[148px] animate-pulse rounded-none bg-muted" />
        <div className="ml-auto h-[26px] w-16 animate-pulse rounded-none bg-muted" />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {label}
      </div>
    </div>
  );
}
