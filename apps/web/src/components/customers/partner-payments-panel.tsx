"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColDef } from "ag-grid-community";
import { toast } from "sonner";
import { AgainListGrid, NUMERIC_CELL, NUMERIC_HEADER } from "@/components/shared/again-list-grid";
import { FilterSelect } from "@/components/shared/filter-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchCustomerLedger,
  recordCustomerLedgerPayment,
  type CustomerLedger,
} from "@/lib/api/customer-ledger";
import { fetchSupplierLedger } from "@/lib/api/supplier-ledger";
import { fetchPartyCommerceLinks } from "@/lib/api/party-commerce";
import { fetchPaymentAccounts, type ApiFinancePaymentAccount } from "@/lib/api/finance";
import {
  buildPartnerLedger,
  formatLedgerMoney,
  moneyOrDash,
  type PartnerLedgerLine,
} from "@/lib/finance/partner-ledger";
import { cn, formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import {
  PartnerKpiGrid,
  PartnerSectionTitle,
  PartnerTabEmpty,
} from "@/components/customers/partner-customer-sections";

/** AgainPOS "Payments" tab. For a customer it is the POS-style "pay dues"
 * screen: open invoices with a FIFO allocation preview, the receive form, and
 * the receipt/refund history. Supplier-only parties keep the plain grid. */
type PaymentRow = PartnerLedgerLine & { id: string; amount: number; paymentFor: string };

type OpenInvoice = {
  id: string;
  invoiceNumber: string;
  date: string;
  createdAt: string;
  orderNumber: string | null;
  total: number;
  paid: number;
  due: number;
};

type HistoryRow = {
  id: string;
  dateTime: string;
  number: string;
  label: string;
  method: string | null;
  /** Signed: receipts positive, refunds and supplier payments negative. */
  amount: number;
  appliedTo: string;
};

const SOURCE_TYPE_LABEL: Record<string, string> = {
  sales_order: "Sale",
  commerce_order: "Sale",
  sales_return: "Sale Return",
  purchase_order: "Purchase",
  purchase_receipt: "Purchase",
  purchase_return: "Purchase Return",
};

const PAYMENT_METHODS = [
  { value: "bank", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "mobile", label: "Mobile money" },
  { value: "card", label: "Card" },
];

const EPSILON = 0.004;
const TH = "py-2 text-[11px] font-semibold text-muted-foreground";

function n(value: string | number | null | undefined): number {
  const x = Number(value ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function openInvoicesFrom(
  ledger: CustomerLedger | null,
  orderNumbers: Map<string, string>,
): OpenInvoice[] {
  if (!ledger) return [];
  return ledger.entries
    .filter((entry) => {
      if (entry.kind !== "receivable" || n(entry.due) <= EPSILON) return false;
      const status = (entry.status || "").toLowerCase();
      return status !== "void" && status !== "cancelled";
    })
    .map((entry) => {
      const total = n(entry.debit);
      const due = n(entry.due);
      return {
        id: entry.id,
        invoiceNumber: entry.reference,
        date: (entry.entry_date || entry.created_at || "").slice(0, 10),
        createdAt: entry.created_at || "",
        orderNumber: (entry.source_id && orderNumbers.get(entry.source_id)) || null,
        total,
        paid: Math.max(0, round2(total - due)),
        due,
      };
    })
    // Oldest first; invoices raised in the same second fall back to their number so
    // the order is stable and matches what the API will settle first.
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.invoiceNumber.localeCompare(b.invoiceNumber, undefined, { numeric: true }),
    );
}

/** Preview of how the API will spend this payment: selected invoices in table
 * order, then the unselected ones oldest-first, and whatever is left becomes
 * customer credit. */
function previewAllocation(rows: OpenInvoice[], selected: Set<string>, amount: number) {
  const alloc = new Map<string, number>();
  let remaining = Math.max(0, amount);
  for (const pass of [true, false]) {
    for (const row of rows) {
      if (selected.has(row.id) !== pass) continue;
      const take = Math.min(row.due, remaining);
      alloc.set(row.id, take > EPSILON ? round2(take) : 0);
      remaining = round2(remaining - take);
    }
  }
  return { alloc, credit: remaining > EPSILON ? remaining : 0 };
}

function historyFrom(rows: PartnerLedgerLine[], orderNumbers: Map<string, string>): HistoryRow[] {
  return rows
    .filter(
      (row) =>
        row.document === "receipt" ||
        row.document === "refund" ||
        row.document === "writeoff" ||
        row.document === "payment",
    )
    .map((row) => {
      const receivable = row.journal === "receivable";
      const orderNumber = row.sourceId ? orderNumbers.get(row.sourceId) : undefined;
      // Order-drawer payments carry a technical " · pay_xxx" entry id in notes.
      const notes = (row.notes || "").replace(/\s·\s[a-z]+_[a-z0-9]+$/i, "").trim();
      return {
        id: row.id,
        dateTime: row.dateTime || row.date,
        number: row.reference,
        label: receivable ? row.documentLabel : "Bill payment",
        method: row.paymentMethod,
        amount: receivable ? row.credit - row.debit : -row.debit,
        appliedTo: notes || (orderNumber ? `Order ${orderNumber}` : "—"),
      };
    });
}

function ReceivePaymentCard({
  customerId,
  invoices,
  onRecorded,
}: {
  customerId: string;
  invoices: OpenInvoice[];
  onRecorded: () => Promise<void> | void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(invoices.map((row) => row.id)),
  );
  const [amountText, setAmountText] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("bank");
  const [accounts, setAccounts] = useState<ApiFinancePaymentAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const allRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPaymentAccounts()
      .then((res) => {
        setAccounts(res.data);
        setAccountId((current) =>
          current || res.data.find((a) => a.is_default)?.id || res.data[0]?.id || "",
        );
      })
      .catch(() => setAccounts([]));
  }, []);

  const selectedDue = round2(
    invoices.filter((row) => selected.has(row.id)).reduce((sum, row) => sum + row.due, 0),
  );
  const amount = amountTouched ? Number.parseFloat(amountText) || 0 : selectedDue;
  const amountValue = amountTouched ? amountText : selectedDue > 0 ? String(selectedDue) : "";

  const { alloc, credit } = useMemo(
    () => previewAllocation(invoices, selected, amount),
    [invoices, selected, amount],
  );
  const allocated = round2(amount - credit);
  const leftover = round2(amount - selectedDue);
  const spill = round2(Math.max(0, leftover - credit));

  useEffect(() => {
    if (!allRef.current) return;
    allRef.current.indeterminate = selected.size > 0 && selected.size < invoices.length;
  }, [selected, invoices.length]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hint = (() => {
    if (amount <= 0) return null;
    if (invoices.length === 0) return "No open invoices — this will sit as credit until the next invoice.";
    if (leftover > EPSILON) {
      if (spill <= EPSILON) return `Leftover ${formatCurrency(credit)} will stay as credit.`;
      return `Leftover ${formatCurrency(leftover)}: ${formatCurrency(spill)} goes to unselected invoices oldest-first${
        credit > EPSILON ? `, ${formatCurrency(credit)} stays as credit` : ""
      }.`;
    }
    if (leftover < -EPSILON) {
      return `${formatCurrency(-leftover)} short of the selected due — the last selected invoice stays partly open.`;
    }
    return "Settles the selected invoices in order, oldest first.";
  })();

  const submit = async () => {
    if (submittingRef.current || amount <= 0) return;
    submittingRef.current = true;
    setSaving(true);
    try {
      const payment = await recordCustomerLedgerPayment(customerId, {
        amount,
        paymentDate,
        paymentMethod: method,
        paymentAccountId: accountId || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        receivableIds: invoices.filter((row) => selected.has(row.id)).map((row) => row.id),
      });
      const applied = (payment.allocations ?? []).map((a) => a.invoice_number);
      const appliedTo = applied.length ? applied : (payment.applied_to ?? []);
      toast.success(
        appliedTo.length
          ? `${payment.payment_number} received — applied to ${appliedTo.join(", ")}`
          : `${payment.payment_number} received — kept as credit`,
      );
      await onRecorded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <section className="border border-border/70 bg-background/60">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Receive payment
        </h3>
        {invoices.length ? (
          <span className="text-[11px] text-muted-foreground">
            {invoices.length} open · due{" "}
            <span className="font-medium text-foreground">
              {formatCurrency(invoices.reduce((sum, row) => sum + row.due, 0))}
            </span>
          </span>
        ) : null}
      </div>

      {invoices.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-border/80 text-left">
                <th className="w-8 py-2 pl-3 pr-1">
                  <input
                    ref={allRef}
                    type="checkbox"
                    aria-label="Select all invoices"
                    checked={selected.size === invoices.length}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? new Set(invoices.map((row) => row.id)) : new Set(),
                      )
                    }
                    className="h-3.5 w-3.5 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary/60"
                  />
                </th>
                <th className={cn(TH, "pr-2")}>Invoice #</th>
                <th className={cn(TH, "px-2")}>Date</th>
                <th className={cn(TH, "px-2")}>Order #</th>
                <th className={cn(TH, "px-2 text-right")}>Total</th>
                <th className={cn(TH, "px-2 text-right")}>Paid</th>
                <th className={cn(TH, "px-2 text-right")}>Due</th>
                <th className={cn(TH, "pl-2 pr-3 text-right")}>Allocate</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((row) => {
                const checked = selected.has(row.id);
                const applied = alloc.get(row.id) ?? 0;
                return (
                  <tr
                    key={row.id}
                    data-invoice={row.invoiceNumber}
                    onClick={() => toggle(row.id)}
                    className={cn(
                      "cursor-pointer border-b border-border/40 hover:bg-muted/30",
                      !checked && "text-muted-foreground",
                    )}
                  >
                    <td className="py-1.5 pl-3 pr-1">
                      <input
                        type="checkbox"
                        aria-label={`Select invoice ${row.invoiceNumber}`}
                        checked={checked}
                        onChange={() => toggle(row.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3.5 w-3.5 cursor-pointer appearance-none rounded-none border border-input bg-background checked:border-primary checked:bg-primary"
                      />
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-[11px]">{row.invoiceNumber}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{formatDate(row.date)}</td>
                    <td className={cn("px-2 py-1.5", !row.orderNumber && "text-muted-foreground")}>
                      {row.orderNumber ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(row.total)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {moneyOrDash(row.paid)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                      {formatCurrency(row.due)}
                    </td>
                    <td
                      className={cn(
                        "pl-2 pr-3 py-1.5 text-right tabular-nums",
                        applied > EPSILON
                          ? "font-medium text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground",
                      )}
                    >
                      {applied > EPSILON ? formatCurrency(applied) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/20">
                <td colSpan={6} className="py-1.5 pl-3 pr-2 text-[11px] text-muted-foreground">
                  Selected due
                </td>
                <td
                  className="px-2 py-1.5 text-right tabular-nums font-semibold"
                  data-testid="pay-dues-selected-due"
                >
                  {formatCurrency(selectedDue)}
                </td>
                <td className="pl-2 pr-3 py-1.5 text-right tabular-nums text-muted-foreground">
                  {allocated > EPSILON ? formatCurrency(allocated) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="px-3 py-3 text-[12px] text-muted-foreground">
          Nothing due — a payment now will sit as credit.
        </p>
      )}

      <div className="grid gap-3 px-3 py-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="pay-dues-amount" className="text-xs font-medium text-foreground">
              Amount
            </label>
            {amountTouched && selectedDue > 0 && Math.abs(amount - selectedDue) > EPSILON ? (
              <button
                type="button"
                className="text-[11px] text-primary hover:underline"
                onClick={() => {
                  setAmountTouched(false);
                  setAmountText("");
                }}
              >
                Use {formatCurrency(selectedDue)}
              </button>
            ) : null}
          </div>
          <Input
            id="pay-dues-amount"
            type="number"
            min={0}
            step="0.01"
            value={amountValue}
            onChange={(e) => {
              setAmountTouched(true);
              setAmountText(e.target.value);
            }}
            className="rounded-none"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="pay-dues-date" className="text-xs font-medium text-foreground">
            Date
          </label>
          <Input
            id="pay-dues-date"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="rounded-none"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Method</label>
          <FilterSelect
            value={method}
            onChange={setMethod}
            width="w-full"
            ariaLabel="Payment method"
            options={PAYMENT_METHODS}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Payment account</label>
          <FilterSelect
            value={accountId}
            onChange={setAccountId}
            width="w-full"
            ariaLabel="Payment account"
            options={
              accounts.length
                ? accounts.map((a) => ({
                    value: a.id,
                    label: `${a.name} (${formatCurrency(Number(a.balance))})`,
                  }))
                : [{ value: "", label: "No accounts" }]
            }
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="pay-dues-reference" className="text-xs font-medium text-foreground">
            Reference
          </label>
          <Input
            id="pay-dues-reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Bank transaction id, cheque no…"
            className="rounded-none"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="pay-dues-note" className="text-xs font-medium text-foreground">
            Note
          </label>
          <Input
            id="pay-dues-note"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            className="rounded-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 px-3 py-2">
        <p
          className={cn(
            "text-[11px] text-muted-foreground",
            (leftover > EPSILON || leftover < -EPSILON) && amount > 0 && "text-amber-600 dark:text-amber-400",
          )}
        >
          {hint}
        </p>
        <Button
          size="sm"
          className="shrink-0 rounded-none"
          disabled={amount <= 0 || saving}
          onClick={() => void submit()}
        >
          {saving ? "Receiving…" : `Receive ${formatCurrency(amount)}`}
        </Button>
      </div>
    </section>
  );
}

export function PartnerPaymentsPanel({
  partyId,
  customerId,
  supplierId,
  fillHeight,
  readOnly,
  orders,
  onTotals,
  onRecorded,
  onViewLedger,
}: {
  partyId?: string;
  customerId?: string;
  supplierId?: string;
  fillHeight?: boolean;
  readOnly?: boolean;
  /** This customer's sales orders — maps a receivable's source order to its number. */
  orders?: { id: string; orderNumber: string }[];
  /** Customer-side receipts total only — matches what the KPI card above
   * this tab has always meant by "Payments collected". */
  onTotals?: (totals: { totalPaid: number; totalRefunded: number }) => void;
  /** Fired after a payment is received here so the sheet/list can refresh. */
  onRecorded?: () => void;
  onViewLedger?: () => void;
}) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [customerLedger, setCustomerLedger] = useState<CustomerLedger | null>(null);
  const [resolvedCustomerId, setResolvedCustomerId] = useState(customerId?.trim() || "");
  const [collected, setCollected] = useState(0);
  const [loading, setLoading] = useState(true);
  // Bumped after each successful receipt so the form remounts clean.
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let nextCustomerId = customerId?.trim() || "";
      let nextSupplierId = supplierId?.trim() || "";
      const pid = partyId?.trim() || "";
      if (pid) {
        try {
          const links = await fetchPartyCommerceLinks(pid);
          nextCustomerId = links.customer?.id || nextCustomerId;
          nextSupplierId = links.supplier?.id || nextSupplierId;
        } catch {
          /* keep ids passed in */
        }
      }
      const [customer, supplier] = await Promise.all([
        nextCustomerId ? fetchCustomerLedger(nextCustomerId).catch(() => null) : Promise.resolve(null),
        nextSupplierId ? fetchSupplierLedger(nextSupplierId).catch(() => null) : Promise.resolve(null),
      ]);
      const built = buildPartnerLedger({ customer, supplier });
      const paymentRows = built.rows
        .filter(
          (row) =>
            row.document === "receipt" ||
            row.document === "payment" ||
            row.document === "refund" ||
            row.document === "writeoff",
        )
        .map((row) => ({
          ...row,
          amount: row.debit || row.credit,
          paymentFor: row.sourceType ? (SOURCE_TYPE_LABEL[row.sourceType] ?? "Manual") : "Manual",
        }));
      setRows(paymentRows);
      setCustomerLedger(customer);
      setResolvedCustomerId(nextCustomerId);
      const totalPaid = paymentRows
        .filter((row) => row.journal === "receivable" && row.document === "receipt")
        .reduce((sum, row) => sum + row.amount, 0);
      setCollected(totalPaid);
      onTotals?.({ totalPaid, totalRefunded: 0 });
    } catch {
      setRows([]);
      setCustomerLedger(null);
      setCollected(0);
      onTotals?.({ totalPaid: 0, totalRefunded: 0 });
    } finally {
      setLoading(false);
    }
  }, [partyId, customerId, supplierId, onTotals]);

  useEffect(() => {
    void load();
  }, [load]);

  const orderNumbers = useMemo(
    () => new Map((orders ?? []).map((order) => [order.id, order.orderNumber] as const)),
    [orders],
  );
  const openInvoices = useMemo(
    () => openInvoicesFrom(customerLedger, orderNumbers),
    [customerLedger, orderNumbers],
  );
  const history = useMemo(() => historyFrom(rows, orderNumbers), [rows, orderNumbers]);

  const columnDefs = useMemo<ColDef<PaymentRow>[]>(
    () => [
      {
        colId: "date",
        headerName: "Paid on",
        field: "date",
        width: 150,
        minWidth: 130,
        valueFormatter: (p) => (p.value ? formatDateTime(String(p.value)) : "—"),
      },
      {
        colId: "reference",
        headerName: "Reference No",
        field: "reference",
        width: 130,
        minWidth: 110,
        cellClass: "font-mono text-[11px]",
      },
      {
        colId: "amount",
        headerName: "Amount",
        field: "amount",
        width: 120,
        type: "numericColumn",
        headerClass: NUMERIC_HEADER,
        cellClass: NUMERIC_CELL,
        valueFormatter: (p) => formatLedgerMoney(Number(p.value ?? 0)),
      },
      {
        colId: "paymentMethod",
        headerName: "Payment Method",
        field: "paymentMethod",
        width: 130,
        minWidth: 110,
        valueFormatter: (p) => (p.value ? String(p.value).replace(/_/g, " ") : "—"),
      },
      {
        colId: "paymentFor",
        headerName: "Payment For",
        field: "paymentFor",
        flex: 1,
        minWidth: 120,
      },
    ],
    [],
  );

  const handleRecorded = useCallback(async () => {
    await load();
    setFormKey((key) => key + 1);
    onRecorded?.();
  }, [load, onRecorded]);

  if (!resolvedCustomerId) {
    if (!loading && rows.length === 0) {
      return (
        <PartnerTabEmpty
          title="No payments yet"
          description="Receipts collected and payments made will appear here."
        />
      );
    }
    return (
      <AgainListGrid<PaymentRow>
        embedded
        className={fillHeight ? "flex min-h-0 flex-1 flex-col" : "h-[360px]"}
        gridClassName={
          fillHeight
            ? "[&_.ag-root-wrapper]:flex [&_.ag-root-wrapper]:flex-col [&_.ag-root-wrapper-body]:min-h-0 [&_.ag-root-wrapper-body]:flex-1"
            : undefined
        }
        rowData={rows}
        columnDefs={columnDefs}
        loading={loading}
        getRowId={(p) => p.data.id}
        emptyTitle="No payments yet"
      />
    );
  }

  if (loading && !customerLedger) {
    return <p className="py-6 text-center text-[12px] text-muted-foreground">Loading payments…</p>;
  }

  const totalDue = round2(openInvoices.reduce((sum, row) => sum + row.due, 0));
  const advance = n(customerLedger?.summary.advance);

  return (
    <div className={cn("space-y-4", fillHeight && "min-h-0 flex-1 overflow-y-auto")}>
      <PartnerKpiGrid
        items={[
          {
            label: "Total due",
            value: (
              <span
                data-testid="pay-dues-total-due"
                className={cn(totalDue > EPSILON && "text-destructive")}
              >
                {formatCurrency(totalDue)}
              </span>
            ),
            sub: "Across open invoices",
            alert: totalDue > EPSILON,
          },
          {
            label: "Open invoices",
            value: <span data-testid="pay-dues-open-count">{openInvoices.length}</span>,
            sub: "Unpaid or partly paid",
          },
          {
            label: "Advance / credit",
            value: (
              <span className={cn(advance > EPSILON && "text-emerald-600 dark:text-emerald-400")}>
                {formatCurrency(advance)}
              </span>
            ),
            sub: "Prepaid, not yet applied",
          },
          {
            label: "Collected",
            value: formatCurrency(collected),
            sub: "Receipts to date",
          },
        ]}
      />

      {readOnly ? null : (
        <ReceivePaymentCard
          key={formKey}
          customerId={resolvedCustomerId}
          invoices={openInvoices}
          onRecorded={handleRecorded}
        />
      )}

      <div>
        <PartnerSectionTitle
          title="Payment history"
          action={
            onViewLedger ? (
              <button
                type="button"
                className="text-[11px] text-primary hover:underline"
                onClick={onViewLedger}
              >
                View in ledger
              </button>
            ) : undefined
          }
        />
        {history.length === 0 ? (
          <PartnerTabEmpty
            title="No payments yet"
            description="Receipts collected and refunds issued will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]" data-testid="pay-dues-history">
              <thead>
                <tr className="border-b border-border/80 text-left">
                  <th className={cn(TH, "pr-2")}>Date</th>
                  <th className={cn(TH, "px-2")}>Number</th>
                  <th className={cn(TH, "px-2")}>Type</th>
                  <th className={cn(TH, "px-2")}>Method</th>
                  <th className={cn(TH, "px-2 text-right")}>Amount</th>
                  <th className={cn(TH, "pl-2")}>Applied to</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-b border-border/40">
                    <td className="whitespace-nowrap py-1.5 pr-2">
                      {row.dateTime ? formatDateTime(row.dateTime) : "—"}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[11px]">{row.number}</td>
                    <td className="px-2 py-1.5">{row.label}</td>
                    <td className="px-2 py-1.5 capitalize">
                      {row.method ? row.method.replace(/_/g, " ") : "—"}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1.5 text-right tabular-nums",
                        row.amount < -EPSILON && "text-destructive",
                      )}
                    >
                      {formatLedgerMoney(row.amount)}
                    </td>
                    <td className="py-1.5 pl-2 text-muted-foreground">{row.appliedTo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
