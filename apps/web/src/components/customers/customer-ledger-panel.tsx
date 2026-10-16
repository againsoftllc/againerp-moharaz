"use client";

import { PartnerLedgerPanel } from "@/components/finance/partner-ledger-panel";

export function CustomerLedgerPanel({
  customerId,
  customerName,
  customerPhone,
  customerEmail,
  partyId,
  supplierId,
  fillHeight,
  readOnly,
}: {
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  partyId?: string;
  supplierId?: string;
  fillHeight?: boolean;
  readOnly?: boolean;
}) {
  return (
    <PartnerLedgerPanel
      partyId={partyId}
      customerId={customerId}
      supplierId={supplierId}
      partyName={customerName}
      partyPhone={customerPhone}
      partyEmail={customerEmail}
      fillHeight={fillHeight}
      readOnly={readOnly}
    />
  );
}
