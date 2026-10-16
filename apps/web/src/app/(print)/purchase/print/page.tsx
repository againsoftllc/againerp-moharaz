"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, X } from "lucide-react";
import { PurchaseOrderPrintDocument } from "@/components/purchase/purchase-order-print-document";
import { Button } from "@/components/ui/button";
import { readPurchasePrintPayload, type PurchasePrintPayload } from "@/lib/purchase/purchase-print";

export default function PurchasePrintPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<PurchasePrintPayload | null | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPayload(readPurchasePrintPayload(params.get("k")));
  }, []);

  if (payload === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading document…
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground">No document to print. Open a purchase order and choose Print.</p>
        <Button type="button" variant="outline" className="rounded-none" onClick={() => router.push("/purchase/orders")}>
          Back to Purchase
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="print-hide sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-2 backdrop-blur-sm">
        <Button type="button" variant="ghost" size="sm" className="rounded-none" onClick={() => window.close()}>
          <X className="mr-2 h-4 w-4" />
          Close
        </Button>
        <Button type="button" size="sm" className="rounded-none" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>
      <div id="purchase-print-area" className="mx-auto max-w-[820px]">
        <PurchaseOrderPrintDocument data={payload} />
      </div>
    </>
  );
}
