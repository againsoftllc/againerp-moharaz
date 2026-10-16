"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { InvoiceLayoutPreviewDocument } from "@/components/workspace/invoice-layout-preview";
import type {
  InvoiceDocumentData,
  InvoicePreviewCompany,
} from "@/components/workspace/invoice-layout-preview";
import { Button } from "@/components/ui/button";
import { mergeInvoiceLayout, type InvoiceLayout } from "@/lib/api/workspace-company";

type PublicInvoice = {
  company: InvoicePreviewCompany;
  layout: InvoiceLayout;
  document: InvoiceDocumentData;
};

export function PublicInvoiceView({ invoiceKey }: { invoiceKey: string }) {
  const [row, setRow] = useState<PublicInvoice | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/v1/public/invoices/${encodeURIComponent(invoiceKey)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setRow(null);
          return;
        }
        const body = (await res.json()) as { data?: PublicInvoice };
        if (!cancelled) setRow(body.data ?? null);
      } catch {
        if (!cancelled) setRow(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceKey]);

  if (row === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#ececec] text-sm text-[#6c757d]">
        Loading invoice…
      </div>
    );
  }

  if (!row) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#ececec] px-6 text-center">
        <p className="text-sm font-medium text-[#212529]">Invoice not found</p>
        <p className="text-xs text-[#6c757d]">This public link is invalid or no longer available.</p>
      </div>
    );
  }

  return (
    <>
      <div className="print-hide sticky top-0 z-10 flex items-center justify-end border-b border-border bg-background/95 px-4 py-2">
        <Button type="button" size="sm" className="rounded-none" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print / PDF
        </Button>
      </div>
      <div id="invoice-print-area" className="mx-auto max-w-[820px] p-4 sm:p-6">
        <InvoiceLayoutPreviewDocument
          company={row.company}
          layout={mergeInvoiceLayout(row.layout)}
          document={row.document}
        />
      </div>
    </>
  );
}
