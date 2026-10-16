"use client";

import { use } from "react";
import dynamic from "next/dynamic";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";

const SupplierWorkspace = dynamic(
  () => import("@/components/suppliers/supplier-workspace").then((m) => m.SupplierWorkspace),
  { ssr: false, loading: () => <ListGridOpenFallback /> },
);

export default function SupplierWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <SupplierWorkspace supplierId={id} />;
}
