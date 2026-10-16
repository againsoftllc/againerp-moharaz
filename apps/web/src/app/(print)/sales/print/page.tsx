"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, X } from "lucide-react";
import { SalesOrderPrintDocument } from "@/components/sales/sales-order-print-document";
import { InvoiceLayoutPreviewDocument } from "@/components/workspace/invoice-layout-preview";
import { Button } from "@/components/ui/button";
import { readSalesPrintPayload, type SalesPrintPayload } from "@/lib/sales/sales-print";

export default function SalesPrintPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<SalesPrintPayload | null | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPayload(readSalesPrintPayload(params.get("k")));
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
        <p className="text-muted-foreground">No document to print. Open an order and choose Print.</p>
        <Button type="button" variant="outline" onClick={() => router.push("/sales")}>
          Back to Sales
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="print-hide sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-2 backdrop-blur-sm">
        <Button type="button" variant="ghost" size="sm" onClick={() => window.close()}>
          <X className="mr-2 h-4 w-4" />
          Close
        </Button>
        <Button type="button" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      <div id="sales-print-area" className="mx-auto max-w-[820px]">
        {payload.invoicePrint ? (
          <InvoiceLayoutPreviewDocument
            company={payload.invoicePrint.company}
            layout={payload.invoicePrint.layout}
            packing={payload.invoicePrint.packing}
            kind={payload.invoicePrint.kind ?? "invoice"}
            document={payload.invoicePrint.document}
          />
        ) : (
          <SalesOrderPrintDocument data={payload} />
        )}
      </div>
    </>
  );
}
