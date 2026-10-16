import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

/** CRM body only — navbar in layout stays fixed. */
export default function CrmLoading() {
  return <ContentDataSkeleton label="Loading CRM…" />;
}
