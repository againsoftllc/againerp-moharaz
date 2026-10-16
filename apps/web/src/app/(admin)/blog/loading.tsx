import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

/** Blog body only — navbar in layout stays fixed. */
export default function BlogLoading() {
  return <ContentDataSkeleton label="Loading blog…" />;
}
