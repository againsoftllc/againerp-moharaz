"use client";

import dynamic from "next/dynamic";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";

const RmaStockReport = dynamic(() => import("@/components/rma/rma-stock-report").then((m) => m.RmaStockReport), {
  ssr: false,
  loading: () => <ListGridOpenFallback />,
});

/** RMA Stock Report: everything in the RMA store and everything out with a supplier, in one report. */
export default function RmaStockReportPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <RmaStockReport />
    </div>
  );
}
