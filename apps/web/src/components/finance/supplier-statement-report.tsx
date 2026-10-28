"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/shared/filter-select";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import { JournalEntrySheet } from "@/components/finance/journal-entry-sheet";
import { LedgerExportMenu } from "@/components/finance/ledger-export-menu";
import { LedgerStatementDocument } from "@/components/finance/ledger-statement-document";
import { todayIso, yearStartIso } from "@/components/finance/finance-report-shell";
import { apiFetch } from "@/lib/api/client";
import { fetchFinanceJournalEntry, type ApiFinanceJournalEntry } from "@/lib/api/finance";
import { fetchSupplierStatement } from "@/lib/api/supplier-ledger";
import { fetchWorkspaceCompany } from "@/lib/api/workspace-company";
import {
  EMPTY_LEDGER_PRINT_COMPANY,
  ledgerPrintCompanyFromWorkspace,
  ledgerStatementFromSupplier,
  type LedgerPrintCompany,
  type LedgerStatement,
} from "@/lib/finance/ledger-statement";
import { cn } from "@/lib/utils";

/**
 * Supplier Statement — OnerERP's Reports › Ledger › Supplier (spec §15.6), drawn by the shared account
 * statement (ledger layout), so Print / PDF, Excel, share link, email and WhatsApp work as on every ledger.
 */
export function SupplierStatementReport() {
  const router = useRouter();
  const search = useSearchParams();
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [supplierId, setSupplierId] = useState(search.get("supplier_id") || "");
  const [dateFrom, setDateFrom] = useState(search.get("date_from") || yearStartIso());
  const [dateTo, setDateTo] = useState(search.get("date_to") || todayIso());
  const [statement, setStatement] = useState<LedgerStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState<LedgerPrintCompany>(EMPTY_LEDGER_PRINT_COMPANY);
  const [entry, setEntry] = useState<ApiFinanceJournalEntry | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryLoading, setEntryLoading] = useState(false);

  useEffect(() => {
    apiFetch<{ data: Array<{ id: string; name: string; vendor_code?: string }> }>("/api/v1/commerce/suppliers?limit=500")
      .then((res) => setSuppliers(res.data.map((s) => ({ id: s.id, name: s.name, code: s.vendor_code ?? "" }))))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load suppliers"));
    fetchWorkspaceCompany()
      .then((row) => setCompany(ledgerPrintCompanyFromWorkspace(row)))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    if (!supplierId) {
      setStatement(null);
      return;
    }
    setLoading(true);
    try {
      setStatement(ledgerStatementFromSupplier(await fetchSupplierStatement(supplierId, { date_from: dateFrom, date_to: dateTo })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the statement");
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, [supplierId, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  // keep the choice in the URL so the statement can be bookmarked or opened from the supplier ledger
  useEffect(() => {
    const q = new URLSearchParams();
    if (supplierId) q.set("supplier_id", supplierId);
    q.set("date_from", dateFrom);
    q.set("date_to", dateTo);
    router.replace(`/finance/reports/supplier-statement?${q.toString()}`, { scroll: false });
  }, [router, supplierId, dateFrom, dateTo]);

  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: s.code ? `${s.name} (${s.code})` : s.name })),
    [suppliers],
  );

  async function openJournal(id: string) {
    setEntryOpen(true);
    setEntryLoading(true);
    try {
      setEntry((await fetchFinanceJournalEntry(id)).data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the journal entry");
    } finally {
      setEntryLoading(false);
    }
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="print-hide flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <h1 className="mr-2 text-lg font-medium">Supplier Statement</h1>
        <FilterSelect
          value={supplierId}
          onChange={setSupplierId}
          options={supplierOptions}
          placeholder="Choose a supplier"
          searchPlaceholder="Search supplier…"
          width="w-[260px]"
          ariaLabel="Supplier"
        />
        <DateRangePresetPicker
          value={{ dateFrom, dateTo }}
          onChange={(next) => {
            setDateFrom(next.dateFrom || yearStartIso());
            setDateTo(next.dateTo || todayIso());
          }}
          buttonClassName="shrink-0"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-none"
          aria-label="Refresh"
          onClick={() => void load()}
          disabled={!supplierId}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
        {statement ? <LedgerExportMenu statement={statement} disabled={loading} /> : null}
      </div>

      {/* on screen only: Print / PDF goes through the export menu's statement overlay */}
      <div className="print-hide min-h-0 flex-1 overflow-auto bg-muted/30 p-3 sm:p-6">
        {!supplierId ? (
          <p className="mx-auto max-w-[820px] border border-dashed border-border bg-background p-8 text-center text-sm text-muted-foreground">
            Choose a supplier to see their statement for the period.
          </p>
        ) : !statement ? (
          <p className="mx-auto max-w-[820px] p-8 text-center text-sm text-muted-foreground">
            {loading ? "Loading statement…" : "No statement."}
          </p>
        ) : (
          <div className="shadow-sm">
            <LedgerStatementDocument
              statement={statement}
              company={company}
              onOpenReference={(row) => row.journalEntryId && void openJournal(row.journalEntryId)}
            />
          </div>
        )}
      </div>

      <JournalEntrySheet open={entryOpen} onOpenChange={setEntryOpen} entry={entry} loading={entryLoading} />
    </div>
  );
}
