import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

/** HRM body only — navbar in layout stays fixed. */
export default function HrmLoading() {
  return <ContentDataSkeleton label="Loading HRM…" />;
}
