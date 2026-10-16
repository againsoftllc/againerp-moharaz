import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";

/** Website body only — navbar in layout stays fixed; filter shell paints immediately. */
export default function WebsiteLoading() {
  return <ListGridOpenFallback label="Opening website…" />;
}
