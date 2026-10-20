"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, X } from "lucide-react";
import { RmaClaimDocument } from "@/components/rma/rma-claim-document";
import { RmaDeliveryDocument } from "@/components/rma/rma-delivery-document";
import { RmaReceiveDocument } from "@/components/rma/rma-receive-document";
import { RmaReceiptDocument } from "@/components/rma/rma-receipt-document";
import { Button } from "@/components/ui/button";
import { fetchWorkspaceCompany, type WorkspaceCompany } from "@/lib/api/workspace-company";
import { readRmaPrint, type RmaPrintPayload } from "@/lib/rma/rma-print";

export default function RmaPrintPage() {
  const router = useRouter();
  const [doc, setDoc] = useState<RmaPrintPayload | null | undefined>(undefined);
  const [company, setCompany] = useState<WorkspaceCompany | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDoc(readRmaPrint(params.get("k")));
    void fetchWorkspaceCompany()
      .then(setCompany)
      .catch(() => setCompany(null));
  }, []);

  if (doc === undefined) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading document…</div>;
  }
  if (!doc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground">Nothing to print. Open a claim and choose Print receipt or Print copy.</p>
        <Button type="button" variant="outline" className="rounded-none" onClick={() => router.push("/inventory/rma")}>
          Back to RMA
        </Button>
      </div>
    );
  }

  const title =
    doc.kind === "claim"
      ? "Supplier Claim"
      : doc.kind === "receive"
        ? "Supplier Receive"
        : doc.kind === "delivery"
          ? "Customer Delivery Copy"
          : "Complaint Receive Slip";
  const reference = doc.kind === "complaint" ? doc.data.rma_number : (doc.data as { rma_number?: string }).rma_number;

  return (
    <div className="min-h-screen bg-muted/40 print:bg-white">
      {/* Control panel: title + reference on the left, actions on the right, both aligned to the sheet below. */}
      <div className="print-hide sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-[820px] items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold leading-tight">{title}</h1>
            <p className="truncate text-xs text-muted-foreground">{reference || "RMA"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-7 rounded-none px-3 text-xs" onClick={() => window.close()}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Close
            </Button>
            <Button type="button" size="sm" className="h-7 rounded-none px-3 text-xs" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Print
            </Button>
          </div>
        </div>
      </div>
      {/* The sheet: a white paper with a soft edge on screen, plain page in print. */}
      <div className="mx-auto w-full max-w-[820px] sm:px-4 sm:py-5 print:p-0">
        <div className="rma-print-doc min-h-[60vh] bg-white sm:border sm:border-border sm:shadow-sm print:border-0 print:shadow-none">
          {doc.kind === "claim" ? (
            <RmaClaimDocument copy={doc.data} company={company} />
          ) : doc.kind === "receive" ? (
            <RmaReceiveDocument copy={doc.data} company={company} />
          ) : doc.kind === "delivery" ? (
            <RmaDeliveryDocument copy={doc.data} company={company} />
          ) : (
            <RmaReceiptDocument receipt={doc.data} company={company} />
          )}
        </div>
      </div>
    </div>
  );
}
