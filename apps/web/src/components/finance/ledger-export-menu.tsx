"use client";

import { useState } from "react";
import { ChevronDown, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { LedgerStatementPrintOverlay } from "@/components/finance/ledger-statement-print-overlay";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchWorkspaceCompany } from "@/lib/api/workspace-company";
import {
  downloadLedgerExcel,
  ledgerPrintCompanyFromWorkspace,
  type LedgerStatement,
} from "@/lib/finance/ledger-statement";

function withPrintedNow(statement: LedgerStatement): LedgerStatement {
  return { ...statement, printedAt: new Date().toISOString() };
}

type Props = {
  statement: LedgerStatement;
  disabled?: boolean;
};

export function LedgerExportMenu({ statement, disabled }: Props) {
  const [printOpen, setPrintOpen] = useState(false);
  const [printStatement, setPrintStatement] = useState<LedgerStatement | null>(null);

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="ml-auto h-7 shrink-0 rounded-none px-2 text-xs"
          >
            Export
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[11rem]">
          <DropdownMenuItem
            onSelect={() => {
              const stmt = withPrintedNow(statement);
              window.setTimeout(() => {
                void fetchWorkspaceCompany()
                  .then((row) => {
                    downloadLedgerExcel(stmt, ledgerPrintCompanyFromWorkspace(row));
                    toast.success("Excel statement downloaded");
                  })
                  .catch(() => {
                    downloadLedgerExcel(stmt);
                    toast.success("Excel statement downloaded");
                  });
              }, 0);
            }}
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
            Excel (.xls)
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              const next = withPrintedNow(statement);
              window.setTimeout(() => {
                setPrintStatement(next);
                setPrintOpen(true);
              }, 0);
            }}
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            PDF / Print
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {printOpen && printStatement ? (
        <LedgerStatementPrintOverlay
          statement={printStatement}
          onClose={() => {
            setPrintOpen(false);
            setPrintStatement(null);
          }}
        />
      ) : null}
    </>
  );
}
