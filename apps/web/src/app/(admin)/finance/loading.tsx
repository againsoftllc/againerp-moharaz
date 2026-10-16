import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

/** Finance body only — navbar in layout stays fixed. */
export default function FinanceLoading() {
  return <ContentDataSkeleton label="Loading Finance…" />;
}
