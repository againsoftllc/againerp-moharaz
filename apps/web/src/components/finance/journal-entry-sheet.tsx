"use client";

import { useMemo } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import type { ApiFinanceJournalEntry, ApiFinanceJournalLine } from "@/lib/api/finance";
import { cn, formatCurrency } from "@/lib/utils";

function money(value: string | number) {
  const n = Number(value);
  return Number.isFinite(n) ? formatCurrency(n) : String(value);
}

function pretty(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

function sortJournalLines(lines: ApiFinanceJournalLine[]) {
  return [...lines].sort((a, b) => {
    const aDebit = Number(a.debit) > 0 ? 0 : 1;
    const bDebit = Number(b.debit) > 0 ? 0 : 1;
    if (aDebit !== bDebit) return aDebit - bDebit;
    return (a.account_code ?? "").localeCompare(b.account_code ?? "");
  });
}

const STATUS_TONE: Record<string, string> = {
  posted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  draft: "border-border text-foreground",
  void: "border-border bg-muted/40 text-muted-foreground",
};

export function JournalEntrySheet({
  open,
  onOpenChange,
  entry,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ApiFinanceJournalEntry | null;
  loading?: boolean;
}) {
  const lines = useMemo(() => sortJournalLines(entry?.lines ?? []), [entry?.lines]);
  const debitTotal = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const creditTotal = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  const balanced = Math.abs(debitTotal - creditTotal) < 0.005;
  const showCenter = lines.some((line) => line.cost_center_name || line.cost_center_code);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title="Journal voucher"
        resizable
        closeButton="inside"
        className="flex min-w-[160px] w-[560px] max-w-[720px] flex-col gap-0 overflow-hidden rounded-none p-0"
      >
        {entry ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-border px-4 py-3 pr-10">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">{entry.entry_number}</h2>
                <GridChipBadge className={cn("capitalize", STATUS_TONE[entry.status] ?? "")}>
                  {entry.status}
                </GridChipBadge>
                <GridChipBadge
                  className={
                    balanced
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
                  }
                >
                  {balanced ? "In balance" : "Out of balance"}
                </GridChipBadge>
              </div>
              <dl className="mt-2 grid grid-cols-[88px_1fr] gap-x-2 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Date</dt>
                <dd>{entry.entry_date}</dd>
                <dt className="text-muted-foreground">Particulars</dt>
                <dd>{entry.description || "—"}</dd>
                <dt className="text-muted-foreground">Source</dt>
                <dd className="capitalize">{pretty(entry.source_type)}</dd>
              </dl>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 border-b border-border bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="w-16 px-3 py-1.5 font-medium">Code</th>
                    <th className="px-2 py-1.5 font-medium">Account</th>
                    {showCenter ? <th className="w-24 px-2 py-1.5 font-medium">Center</th> : null}
                    <th className="w-[108px] px-3 py-1.5 text-right font-medium">Debit</th>
                    <th className="w-[108px] px-3 py-1.5 text-right font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={showCenter ? 5 : 4} className="px-3 py-6 text-center text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  ) : lines.length === 0 ? (
                    <tr>
                      <td colSpan={showCenter ? 5 : 4} className="px-3 py-6 text-center text-muted-foreground">
                        No lines on this voucher
                      </td>
                    </tr>
                  ) : (
                    lines.map((line) => {
                      const isCredit = Number(line.credit) > 0 && !(Number(line.debit) > 0);
                      return (
                        <tr key={line.id} className="border-b border-border/60 last:border-b-0">
                          <td className="px-3 py-1.5 font-mono text-[11px]">{line.account_code || "—"}</td>
                          <td className={cn("px-2 py-1.5", isCredit && "pl-6")}>
                            <p className="font-medium">
                              {isCredit ? "To " : ""}
                              {line.account_name || "—"}
                            </p>
                            {line.description && line.description !== entry.description ? (
                              <p className="text-[11px] text-muted-foreground">{line.description}</p>
                            ) : null}
                          </td>
                          {showCenter ? (
                            <td className="px-2 py-1.5 text-muted-foreground">
                              {line.cost_center_code || line.cost_center_name || "—"}
                            </td>
                          ) : null}
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {Number(line.debit) ? money(line.debit) : ""}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {Number(line.credit) ? money(line.credit) : ""}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {!loading && lines.length > 0 ? (
                  <tfoot>
                    <tr className="border-t border-border bg-muted/40 font-semibold">
                      <td className="px-3 py-2" colSpan={showCenter ? 3 : 2}>
                        Total
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(debitTotal)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(creditTotal)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
