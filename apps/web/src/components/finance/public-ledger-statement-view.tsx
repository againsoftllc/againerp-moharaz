"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { LedgerStatementDocument } from "@/components/finance/ledger-statement-document";
import { Button } from "@/components/ui/button";
import { fetchLedgerStatementShare } from "@/lib/finance/ledger-share";
import type { LedgerPrintCompany, LedgerStatement } from "@/lib/finance/ledger-statement";

export function PublicLedgerStatementView({ shareKey }: { shareKey: string }) {
  const [row, setRow] = useState<{
    statement: LedgerStatement;
    company: LedgerPrintCompany;
  } | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void fetchLedgerStatementShare(shareKey).then((payload) => {
      if (cancelled) return;
      setRow(payload ? { statement: payload.statement, company: payload.company } : null);
    });
    return () => {
      cancelled = true;
    };
  }, [shareKey]);

  if (row === undefined) {
    return <p className="p-8 text-center text-sm text-[#6c757d]">Loading statement…</p>;
  }
  if (!row) {
    return <p className="p-8 text-center text-sm text-[#6c757d]">This statement link is invalid or has expired.</p>;
  }

  return (
    <div className="min-h-screen bg-[#ececec] text-[#212529]">
      <div className="print-hide flex items-center justify-end border-b border-[#d9d9d9] bg-white px-4 py-2">
        <Button type="button" size="sm" className="rounded-none" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print / PDF
        </Button>
      </div>
      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-[820px]">
          <LedgerStatementDocument statement={row.statement} company={row.company} />
        </div>
      </div>
    </div>
  );
}
