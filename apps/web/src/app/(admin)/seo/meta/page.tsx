"use client";

import dynamic from "next/dynamic";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";

const SeoMetaView = dynamic(
  () => import("@/components/seo/seo-meta-view").then((m) => m.SeoMetaView),
  { ssr: false, loading: () => <ListGridOpenFallback /> },
);

export default function SeoMetaPage() {
  return <SeoMetaView />;
}
