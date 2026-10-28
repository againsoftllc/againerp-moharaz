"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ICellRendererParams } from "ag-grid-community";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/shared/filter-select";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import { GridChipBadge } from "@/components/shared/grid-chip-badge";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import {
  FinanceAgListGrid,
  NUMERIC_CELL,
  NUMERIC_HEADER,
  type FinanceAgListGridColumn,
  type FinanceAgListGridHandle,
} from "@/components/finance/finance-ag-list-grid";
import { FinanceGridSettingsMenu } from "@/components/finance/finance-grid-settings";
import { CHEQUE_STATUS_LABEL, ChequeStatusBadge } from "@/components/finance/cheque-status-badge";
import { ChequeDetailDrawer } from "@/components/finance/cheque-detail-drawer";
import { todayIso } from "@/components/finance/finance-report-shell";
import { fetchFinanceReport, fetchPaymentAccounts, type ApiFinanceReport, type ChequeStatus } from "@/lib/api/finance";
import { useApiHealth } from "@/lib/api/use-api-health";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type View = "status" | "in_hand" | "issued" | "bounced" | "party" | "history";

const VIEWS: Array<{ id: View; label: string; hint: string }> = [
  { id: "status", label: "Status-wise", hint: "Every cheque with its status on the As-on date." },
  { id: "in_hand", label: "Cheque in Hand", hint: "Received cheques not yet honoured, checked against GL 1150 and 1160." },
  { id: "issued", label: "Advance Cheque Issued", hint: "Issued cheques not yet honoured, checked against GL 2150." },
  { id: "bounced", label: "Bounce Analysis", hint: "Every dishonour in the period and what became of the cheque." },
  { id: "party", label: "Party Performance", hint: "Cheques per customer and supplier, with how often they bounced." },
  { id: "history", label: "Cheque History", hint: "Every treatment in the period." },
];

type Row = Record<string, unknown> & { id: string };

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown) {
  return value == null ? "" : String(value);
}

const moneyCol = {
  type: "numericColumn" as const,
  headerClass: NUMERIC_HEADER,
  cellClass: `${NUMERIC_CELL} font-medium`,
  valueFormatter: (p: { value: unknown }) => formatCurrency(num(p.value)),
};

const statusCol: FinanceAgListGridColumn<any> = {
  colId: "status",
  field: "status",
  headerName: "Status",
  width: 130,
  cellRenderer: (p: ICellRendererParams<Row>) =>
    p.data ? (
      <GridChipBadge title={str(p.data.oner_status)}>
        <ChequeStatusBadge status={p.data.status as ChequeStatus} className="border-0 bg-transparent p-0" />
      </GridChipBadge>
    ) : null,
};

const chequeCols: FinanceAgListGridColumn<any>[] = [
  { colId: "number", field: "cheque_number", headerName: "Cheque #", width: 130, cellClass: "font-medium" },
  { colId: "cheque_date", field: "cheque_date", headerName: "Cheque date", width: 115, valueFormatter: (p) => formatDate(str(p.value)) },
  { colId: "bank", field: "bank_name", headerName: "Bank", width: 140 },
  { colId: "amount", field: "amount", headerName: "Amount", width: 120, ...moneyCol },
  statusCol,
  { colId: "status_date", field: "status_date", headerName: "Status date", width: 115, valueFormatter: (p) => formatDate(str(p.value)) },
  { colId: "direction", field: "direction", headerName: "Type", width: 100, cellClass: "capitalize" },
  { colId: "party_code", field: "party_code", headerName: "Party code", width: 110, valueFormatter: (p) => str(p.value) || "—" },
  { colId: "party", field: "party_name", headerName: "Party", flex: 1.2, minWidth: 150 },
  { colId: "party_phone", field: "party_phone", headerName: "Phone", width: 120, hide: true, valueFormatter: (p) => str(p.value) || "—" },
  { colId: "document", field: "document_number", headerName: "Invoice / Bill", width: 130, valueFormatter: (p) => str(p.value) || "—" },
  { colId: "account", field: "payment_account_name", headerName: "Send bank", width: 140, valueFormatter: (p) => str(p.value) || "—" },
  { colId: "recorded", field: "recorded_date", headerName: "Recorded", width: 110, hide: true, valueFormatter: (p) => formatDate(str(p.value)) },
  {
    colId: "bounces",
    field: "bounce_count",
    headerName: "Dishonours",
    width: 105,
    type: "numericColumn",
    headerClass: NUMERIC_HEADER,
    cellClass: NUMERIC_CELL,
    valueFormatter: (p) => (num(p.value) > 0 ? str(p.value) : "—"),
  },
];

const CHEQUE_CSV: [string[], (r: Row) => Array<string | number>] = [
  ["Cheque #", "Cheque date", "Bank", "Amount", "Status", "Oner status", "Status date", "Type", "Party code", "Party", "Phone", "Invoice / Bill", "Send bank", "Dishonours"],
  (r) => [
    str(r.cheque_number),
    str(r.cheque_date),
    str(r.bank_name),
    num(r.amount),
    CHEQUE_STATUS_LABEL[r.status as ChequeStatus] ?? str(r.status),
    str(r.oner_status),
    str(r.status_date),
    str(r.direction),
    str(r.party_code),
    str(r.party_name),
    str(r.party_phone),
    str(r.document_number),
    str(r.payment_account_name),
    num(r.bounce_count),
  ],
];

function viewSetup(view: View): { columns: FinanceAgListGridColumn<any>[]; csv: [string[], (r: Row) => Array<string | number>] } {
  if (view === "bounced") {
    return {
      columns: [
        { colId: "bounce_date", field: "bounce_date", headerName: "Dishonoured on", width: 130, valueFormatter: (p) => formatDate(str(p.value)) },
        ...chequeCols.filter((c) => !["status_date", "bounces", "recorded"].includes(c.colId)),
        { colId: "reason", field: "reason", headerName: "Reason", flex: 1, minWidth: 150, valueFormatter: (p) => str(p.value) || "—" },
        {
          colId: "outcome",
          field: "outcome",
          headerName: "Outcome",
          width: 190,
          cellRenderer: (p: ICellRendererParams<Row>) => {
            const outcome = str(p.data?.outcome);
            return (
              <span className={cn(outcome === "Still dishonoured" && "font-medium text-red-600 dark:text-red-400")}>{outcome}</span>
            );
          },
        },
        { colId: "charge", field: "bank_charge", headerName: "Bank charge", width: 110, hide: true, ...moneyCol },
      ],
      csv: [
        ["Dishonoured on", "Cheque #", "Party", "Amount", "Bank", "Reason", "Outcome", "Status now"],
        (r) => [str(r.bounce_date), str(r.cheque_number), str(r.party_name), num(r.amount), str(r.bank_name), str(r.reason), str(r.outcome), str(r.status)],
      ],
    };
  }
  if (view === "party") {
    return {
      columns: [
        { colId: "party_code", field: "party_code", headerName: "Code", width: 110, valueFormatter: (p) => str(p.value) || "—" },
        { colId: "party", field: "party_name", headerName: "Party", flex: 1.3, minWidth: 160, cellClass: "font-medium" },
        { colId: "type", field: "party_type", headerName: "Type", width: 100, cellClass: "capitalize" },
        { colId: "count", field: "count", headerName: "Cheques", width: 95, type: "numericColumn", headerClass: NUMERIC_HEADER, cellClass: NUMERIC_CELL },
        { colId: "amount", field: "amount", headerName: "Amount", width: 125, ...moneyCol },
        { colId: "honoured", field: "honoured_amount", headerName: "Honoured", width: 125, ...moneyCol },
        { colId: "pending", field: "pending_amount", headerName: "Pending", width: 125, ...moneyCol },
        { colId: "dishonoured", field: "dishonoured_count", headerName: "Dishonoured", width: 110, type: "numericColumn", headerClass: NUMERIC_HEADER, cellClass: NUMERIC_CELL },
        {
          colId: "rate",
          field: "bounce_rate",
          headerName: "Bounce rate",
          width: 110,
          type: "numericColumn",
          headerClass: NUMERIC_HEADER,
          cellRenderer: (p: ICellRendererParams<Row>) => {
            const rate = num(p.data?.bounce_rate);
            return <span className={cn("tabular-nums", rate >= 20 && "font-semibold text-red-600 dark:text-red-400")}>{rate.toFixed(1)}%</span>;
          },
        },
      ],
      csv: [
        ["Code", "Party", "Type", "Cheques", "Amount", "Honoured", "Pending", "Dishonoured cheques", "Bounce rate %"],
        (r) => [str(r.party_code), str(r.party_name), str(r.party_type), num(r.count), num(r.amount), num(r.honoured_amount), num(r.pending_amount), num(r.dishonoured_count), num(r.bounce_rate)],
      ],
    };
  }
  if (view === "history") {
    return {
      columns: [
        { colId: "date", field: "event_date", headerName: "Date", width: 115, valueFormatter: (p) => formatDate(str(p.value)) },
        { colId: "number", field: "cheque_number", headerName: "Cheque #", width: 130, cellClass: "font-medium" },
        { colId: "party", field: "party_name", headerName: "Party", flex: 1.1, minWidth: 150 },
        { colId: "direction", field: "direction", headerName: "Type", width: 100, cellClass: "capitalize" },
        { colId: "amount", field: "amount", headerName: "Amount", width: 120, ...moneyCol },
        { colId: "action", field: "action_label", headerName: "Treatment", width: 130 },
        {
          colId: "move",
          headerName: "From → to",
          width: 190,
          valueGetter: (p) =>
            p.data
              ? `${p.data.from_status ? CHEQUE_STATUS_LABEL[p.data.from_status as ChequeStatus] ?? p.data.from_status : "—"} → ${CHEQUE_STATUS_LABEL[p.data.to_status as ChequeStatus] ?? p.data.to_status}`
              : "",
        },
        { colId: "note", field: "note", headerName: "Note", flex: 1, minWidth: 140, valueFormatter: (p) => str(p.value) || "—" },
        { colId: "actor", field: "actor", headerName: "By", width: 150, hide: true, valueFormatter: (p) => str(p.value) || "—" },
      ],
      csv: [
        ["Date", "Cheque #", "Party", "Type", "Amount", "Treatment", "From", "To", "Note", "By"],
        (r) => [str(r.event_date), str(r.cheque_number), str(r.party_name), str(r.direction), num(r.amount), str(r.action_label), str(r.from_status), str(r.to_status), str(r.note), str(r.actor)],
      ],
    };
  }
  return { columns: chequeCols, csv: CHEQUE_CSV };
}

export function ChequeRegisterReport() {
  const [view, setView] = useState<View>("status");
  const [asOf, setAsOf] = useState(todayIso());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateBasis, setDateBasis] = useState("cheque");
  const [direction, setDirection] = useState("all");
  const [status, setStatus] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [report, setReport] = useState<ApiFinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [chequeId, setChequeId] = useState<string | null>(null);

  useEffect(() => {
    fetchPaymentAccounts()
      .then((res) => setAccounts(res.data.filter((a) => a.kind === "bank").map((a) => ({ id: a.id, name: a.name }))))
      .catch(() => undefined);
  }, []);

  const gridRef = useRef<FinanceAgListGridHandle>(null);
  const apiHealth = useApiHealth();
  const usesRange = view === "status" || view === "party" || view === "bounced" || view === "history";
  const usesDirection = view !== "in_hand" && view !== "issued";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(
        await fetchFinanceReport("cheque-register", {
          view,
          as_of: asOf || undefined,
          date_from: usesRange ? dateFrom || undefined : undefined,
          date_to: usesRange ? dateTo || undefined : undefined,
          date_basis: view === "status" || view === "party" ? dateBasis : undefined,
          direction: usesDirection && direction !== "all" ? direction : undefined,
          status: view === "status" && status !== "all" ? status : undefined,
          payment_account_id: accountId !== "all" ? accountId : undefined,
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the cheque report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [view, asOf, dateFrom, dateTo, dateBasis, direction, status, accountId, usesRange, usesDirection]);

  useEffect(() => {
    void load();
  }, [load]);

  const setup = useMemo(() => viewSetup(view), [view]);
  const rows = (report?.rows ?? []) as Row[];
  const totals = (report?.totals ?? {}) as Record<string, unknown>;
  const reconciliation = (totals.reconciliation ?? []) as Array<{ account_code: string; label: string; register: string; gl: string; difference: string }>;
  const byStatus = (totals.by_status ?? []) as Array<{ direction: string; status: ChequeStatus; count: number; amount: string }>;
  const meta = VIEWS.find((v) => v.id === view)!;
  const filterCount =
    Number(Boolean(dateFrom || dateTo)) +
    Number(dateBasis !== "cheque") +
    Number(direction !== "all") +
    Number(status !== "all") +
    Number(accountId !== "all") +
    Number(asOf !== todayIso());

  function resetFilters() {
    setAsOf(todayIso());
    setDateFrom("");
    setDateTo("");
    setDateBasis("cheque");
    setDirection("all");
    setStatus("all");
    setAccountId("all");
  }

  const summary = (
    <div className="space-y-2 border-b border-border px-3 py-2 text-xs">
      <p className="text-muted-foreground">{meta.hint}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {view === "bounced" ? (
          <>
            <span>
              Dishonours <b className="tabular-nums">{num(totals.count)}</b> · {formatCurrency(num(totals.amount))}
            </span>
            <span className="text-red-600 dark:text-red-400">
              Still open <b className="tabular-nums">{num(totals.open_count)}</b> · {formatCurrency(num(totals.open_amount))}
            </span>
            <span>Bank charges {formatCurrency(num(totals.bank_charges))}</span>
          </>
        ) : view === "party" ? (
          <span>
            {num(totals.parties)} parties · {num(totals.count)} cheques · {formatCurrency(num(totals.amount))} · {num(totals.dishonoured_count)} dishonoured
          </span>
        ) : view === "history" ? (
          <span>
            {num(totals.events)} treatments on {num(totals.cheques)} cheques
          </span>
        ) : (
          <>
            <span>
              Total <b className="tabular-nums">{num(totals.count)}</b> · {formatCurrency(num(totals.amount))}
            </span>
            {byStatus.map((b) => (
              <span key={`${b.direction}:${b.status}`} className="text-muted-foreground">
                <span className="capitalize">{b.direction}</span> {CHEQUE_STATUS_LABEL[b.status] ?? b.status}: {b.count} · {formatCurrency(num(b.amount))}
              </span>
            ))}
          </>
        )}
      </div>
      {reconciliation.length > 0 ? (
        <table className="text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pr-4 font-normal">GL check</th>
              <th className="pr-4 text-right font-normal">Register</th>
              <th className="pr-4 text-right font-normal">Ledger</th>
              <th className="text-right font-normal">Difference</th>
            </tr>
          </thead>
          <tbody>
            {reconciliation.map((r) => {
              const off = Math.abs(num(r.difference)) >= 0.005;
              return (
                <tr key={r.account_code}>
                  <td className="pr-4">
                    {r.account_code} {r.label}
                  </td>
                  <td className="pr-4 text-right tabular-nums">{formatCurrency(num(r.register))}</td>
                  <td className="pr-4 text-right tabular-nums">{formatCurrency(num(r.gl))}</td>
                  <td className={cn("text-right tabular-nums", off ? "font-semibold text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                    {off ? formatCurrency(num(r.difference)) : "Matches"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <FinanceAgListGrid
        gridRef={gridRef}
        className="min-h-0 flex-1"
        storageKey={`cheque-register:${view}`}
        rows={rows}
        columns={setup.columns as FinanceAgListGridColumn[]}
        loading={loading}
        summary={summary}
        emptyTitle={filterCount > 0 ? "No cheques match your filters" : "No cheques for this report yet"}
        emptyHint={filterCount > 0 ? undefined : "Cheques recorded under Payments › Cheques show up here."}
        onResetFilters={resetFilters}
        onRowClicked={(row: Row) => {
          const id = str(row.cheque_id) || (view === "party" ? "" : str(row.id));
          if (id) setChequeId(id);
        }}
        csvFileName={`cheques-${view}-${asOf}.csv`}
        csvHeaders={setup.csv[0]}
        csvRow={setup.csv[1]}
        headerLeftActions={
          <ListGridHeaderStart title="Cheque reports">
            <FinanceGridSettingsMenu
              apiHealth={apiHealth}
              loading={loading}
              filterCount={filterCount}
              onRefresh={() => void load()}
              onFilters={() => gridRef.current?.openFilters()}
              onColumns={() => gridRef.current?.openColumns()}
              onExport={() => gridRef.current?.exportCsv()}
              onResetFilters={resetFilters}
            />
          </ListGridHeaderStart>
        }
        filterBar={
          <>
            <FilterSelect
              value={view}
              onChange={(next) => setView((next || "status") as View)}
              width="w-[190px]"
              className="shrink-0"
              ariaLabel="Report"
              options={VIEWS.map((v) => ({ value: v.id, label: v.label }))}
            />
            <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              As on
              <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-7 w-[140px] rounded-none" />
            </label>
            {usesRange ? (
              <DateRangePresetPicker
                value={{ dateFrom, dateTo }}
                onChange={(next) => {
                  setDateFrom(next.dateFrom);
                  setDateTo(next.dateTo);
                }}
                buttonClassName="shrink-0"
              />
            ) : null}
            {view === "status" || view === "party" ? (
              <FilterSelect
                value={dateBasis}
                onChange={setDateBasis}
                width="w-[150px]"
                className="shrink-0"
                ariaLabel="Date compared"
                options={[
                  { value: "cheque", label: "By cheque date" },
                  { value: "recorded", label: "By payment date" },
                  { value: "treatment", label: "By treatment date" },
                ]}
              />
            ) : null}
            {usesDirection ? (
              <FilterSelect
                value={direction}
                onChange={setDirection}
                width="w-[140px]"
                className="shrink-0"
                ariaLabel="Cheque type"
                options={[
                  { value: "all", label: "All cheques" },
                  { value: "received", label: "Received" },
                  { value: "issued", label: "Issued" },
                ]}
              />
            ) : null}
            {view === "status" ? (
              <FilterSelect
                value={status}
                onChange={setStatus}
                width="w-[140px]"
                className="shrink-0"
                ariaLabel="Status"
                options={[
                  { value: "all", label: "All statuses" },
                  ...(["received", "issued", "deposited", "presented", "cleared", "bounced", "cancelled"] as const).map((value) => ({
                    value,
                    label: CHEQUE_STATUS_LABEL[value],
                  })),
                ]}
              />
            ) : null}
            <FilterSelect
              value={accountId}
              onChange={setAccountId}
              width="w-[160px]"
              className="shrink-0"
              ariaLabel="Send bank"
              options={[{ value: "all", label: "All banks" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
            />
            {filterCount > 0 ? (
              <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-none px-2 text-xs" onClick={resetFilters}>
                Clear
              </Button>
            ) : null}
          </>
        }
      />
      <ChequeDetailDrawer
        chequeId={chequeId}
        onOpenChange={(open) => {
          if (!open) setChequeId(null);
        }}
        onChanged={() => void load()}
      />
    </div>
  );
}
