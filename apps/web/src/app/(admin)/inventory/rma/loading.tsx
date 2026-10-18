import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

/** RMA body only — navbar in layout stays fixed. */
export default function RmaLoading() {
  return <ContentDataSkeleton label="Loading RMA…" />;
}
