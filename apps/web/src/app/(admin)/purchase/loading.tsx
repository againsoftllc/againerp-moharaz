import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

/** Purchase body only — navbar in layout stays fixed. */
export default function PurchaseLoading() {
  return <ContentDataSkeleton label="Loading Purchase…" />;
}
