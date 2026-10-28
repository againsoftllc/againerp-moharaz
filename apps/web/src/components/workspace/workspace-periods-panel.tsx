"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, LockOpen, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterSelect } from "@/components/shared/filter-select";
import {
  fetchFinancePeriods,
  generateFinancePeriods,
  setFinancePeriodStatus,
  type ApiFinancePeriod,
} from "@/lib/api/finance-periods";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { formatDate } from "@/lib/utils";

/**
 * Accounting periods — closing a period stops journal postings on its dates,
 * which is what prevents back-dating into a month that has been reported.
 * A date with no period row counts as open, so this screen is opt-in.
 */
export function WorkspacePeriodsPanel({ embedded = false }: { embedded?: boolean }) {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<ApiFinancePeriod[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (target?: number) => {
      setLoading(true);
      try {
        const { rows: data, meta } = await fetchFinancePeriods(target);
        setRows(data);
        setYear(meta.fiscal_year);
        setYears(meta.fiscal_years.length ? meta.fiscal_years : [meta.fiscal_year]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not load periods");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    const target = year ?? new Date().getFullYear();
    try {
      await generateFinancePeriods(target);
      toast.success(`Periods generated for FY ${target}`);
      await load(target);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate periods");
    }
  }

  async function toggle(row: ApiFinancePeriod) {
    const next = row.status === "closed" ? "open" : "closed";
    setBusyId(row.id);
    try {
      const updated = await setFinancePeriodStatus(row.id, next);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast.success(`${row.name} ${next === "closed" ? "closed" : "reopened"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update period");
    } finally {
      setBusyId(null);
    }
  }

  const closedCount = rows.filter((r) => r.status === "closed").length;

  return (
    <div className={embedded ? undefined : "p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {embedded ? null : <h1 className="page-title">Accounting periods</h1>}
          <p className={embedded ? "max-w-2xl text-[11px] text-muted-foreground" : "mt-1 max-w-2xl text-xs text-muted-foreground"}>
            Closing a period blocks new journal postings on its dates — invoices, payments and stock
            moves alike. Dates with no period row stay open, so nothing is locked until you close it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {years.length > 0 && (
            <FilterSelect
              value={String(year ?? "")}
              onChange={(next) => void load(Number(next))}
              options={years.map((y) => ({ value: String(y), label: `FY ${y}` }))}
              width="w-[130px]"
              className="h-8"
              ariaLabel="Fiscal year"
            />
          )}
          <Button variant="outline" size="sm" onClick={() => void load(year ?? undefined)}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
          {canWrite && (
            <Button size="sm" onClick={() => void generate()}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Generate FY {year ?? new Date().getFullYear()}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto border border-border">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Period</th>
              <th className="px-3 py-2 font-medium">From</th>
              <th className="px-3 py-2 font-medium">To</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No periods for this fiscal year yet — generate them to start closing months.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-1.5 text-muted-foreground">{row.period_no}</td>
                  <td className="px-3 py-1.5 font-medium">{row.name}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{formatDate(row.start_date)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{formatDate(row.end_date)}</td>
                  <td className="px-3 py-1.5">
                    {row.status === "closed" ? (
                      <Badge variant="warning">Closed</Badge>
                    ) : (
                      <Badge variant="success">Open</Badge>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {canWrite && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === row.id}
                        onClick={() => void toggle(row)}
                      >
                        {row.status === "closed" ? (
                          <>
                            <LockOpen className="mr-1.5 h-3.5 w-3.5" />
                            Reopen
                          </>
                        ) : (
                          <>
                            <Lock className="mr-1.5 h-3.5 w-3.5" />
                            Close
                          </>
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {closedCount} of {rows.length} periods closed.
        </p>
      )}
    </div>
  );
}
