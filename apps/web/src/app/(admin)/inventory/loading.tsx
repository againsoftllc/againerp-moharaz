import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

/** Inventory body only — navbar in layout stays fixed. */
export default function InventoryLoading() {
  return <ContentDataSkeleton label="Loading Inventory…" />;
}
