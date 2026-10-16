import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

/**
 * Soft loading cue for Suspense — Facebook-style shimmer in the data area.
 * Module navbar / shell stay mounted above (via layout); only body swaps here.
 */
export function AdminPageLoading({ label = "Loading…" }: { label?: string }) {
  return <ContentDataSkeleton label={label} />;
}
