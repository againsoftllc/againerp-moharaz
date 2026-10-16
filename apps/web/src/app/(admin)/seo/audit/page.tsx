"use client";

import dynamic from "next/dynamic";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";

const SeoAuditView = dynamic(
  () => import("@/components/seo/seo-audit-view").then((m) => m.SeoAuditView),
  { ssr: false, loading: () => <ListGridOpenFallback /> },
);

export default function SeoAuditPage() {
  return <SeoAuditView />;
}
