"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { SalesOrderPrintDocument } from "@/components/sales/sales-order-print-document";
import { Button } from "@/components/ui/button";
import type { SalesPrintPayload } from "@/lib/sales/sales-print";

type Props = {
  data: SalesPrintPayload;
  onClose: () => void;
};

export function SalesOrderPrintOverlay({ data, onClose }: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div className="sales-print-portal print-hide fixed inset-0 z-[250] flex flex-col bg-[#ececec] dark:bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-background px-4 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          <X className="mr-2 h-4 w-4" />
          Close
        </Button>
        <Button type="button" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div id="sales-print-area" className="mx-auto max-w-[820px]">
          <SalesOrderPrintDocument data={data} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
