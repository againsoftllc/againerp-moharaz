import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

/** Vendors body only — navbar in layout stays fixed. */
export default function VendorsLoading() {
  return <ContentDataSkeleton label="Loading Vendors…" />;
}
