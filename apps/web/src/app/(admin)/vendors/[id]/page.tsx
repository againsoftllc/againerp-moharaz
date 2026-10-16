"use client";

import { use } from "react";
import dynamic from "next/dynamic";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";

const VendorWorkspace = dynamic(
  () => import("@/components/vendors/vendor-workspace").then((m) => m.VendorWorkspace),
  { ssr: false, loading: () => <ListGridOpenFallback /> },
);

export default function VendorWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <VendorWorkspace vendorId={id} />;
}
