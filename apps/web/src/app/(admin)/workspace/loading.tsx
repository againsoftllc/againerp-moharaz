import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";

/** Workspace body only — module chrome stays fixed. */
export default function WorkspaceLoading() {
  return <ContentDataSkeleton label="Loading workspace…" />;
}
