import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  rows?: number;
  label?: string;
  /** Show compact filter-bar placeholder above rows. */
  showFilters?: boolean;
};

function Bone({ className }: { className?: string }) {
  return <div className={cn("fb-shimmer shrink-0 rounded-none", className)} aria-hidden />;
}

/**
 * Facebook-style shimmer skeleton for list/data areas.
 * Keeps module chrome (navbar/menu) outside — only the changing body shows this.
 */
export function ContentDataSkeleton({
  className,
  rows = 12,
  label = "Loading…",
  showFilters = true,
}: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background animate-[route-fade-in_160ms_ease-out]",
        className,
      )}
    >
      <span className="sr-only">{label}</span>

      {showFilters ? (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1">
          <Bone className="h-[23px] w-[72px]" />
          <Bone className="h-[23px] w-[220px]" />
          <Bone className="h-[23px] w-[128px]" />
          <Bone className="h-[23px] w-[140px]" />
          <Bone className="hidden h-[23px] w-[148px] sm:block" />
        </div>
      ) : null}

      {/* Header row */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/20 px-3 py-2">
        <Bone className="h-3.5 w-3.5" />
        <Bone className="h-3 w-28" />
        <Bone className="h-3 w-20" />
        <Bone className="ml-auto h-3 w-16" />
        <Bone className="h-3 w-14" />
        <Bone className="h-3 w-16" />
        <Bone className="h-3 w-10" />
      </div>

      {/* Data rows */}
      <div className="min-h-0 flex-1 divide-y divide-border overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2.5"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <Bone className="h-3.5 w-3.5" />
            <Bone className="h-7 w-7" />
            <Bone
              className={cn(
                "h-3",
                i % 3 === 0 ? "w-44" : i % 3 === 1 ? "w-36" : "w-52",
              )}
            />
            <Bone className="h-3 w-20" />
            <Bone className="ml-auto h-3 w-16" />
            <Bone className="h-3 w-12" />
            <Bone className="h-5 w-14" />
          </div>
        ))}
      </div>

      {/* Footer / pagination placeholder */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-1.5">
        <Bone className="h-3 w-24" />
        <Bone className="ml-auto h-3 w-32" />
        <Bone className="h-3 w-16" />
      </div>
    </div>
  );
}
