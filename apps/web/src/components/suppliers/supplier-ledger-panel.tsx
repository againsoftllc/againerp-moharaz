"use client";

import { PartnerLedgerPanel } from "@/components/finance/partner-ledger-panel";

export function SupplierLedgerPanel({
  supplierId,
  supplierName,
  supplierPhone,
  supplierEmail,
  partyId,
  fillHeight,
}: {
  supplierId: string;
  supplierName?: string;
  supplierPhone?: string;
  supplierEmail?: string;
  partyId?: string;
  fillHeight?: boolean;
}) {
  return (
    <PartnerLedgerPanel
      partyId={partyId}
      supplierId={supplierId}
      partyName={supplierName}
      partyPhone={supplierPhone}
      partyEmail={supplierEmail}
      fillHeight={fillHeight}
    />
  );
}
