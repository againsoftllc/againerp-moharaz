import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

/** Dashboard body only — navbar in layout stays fixed. */
export default function DashboardLoading() {
  return <ContentDataSkeleton label="Loading dashboard…" showFilters={false} />;
}
