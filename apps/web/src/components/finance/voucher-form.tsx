"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { FilterSelect } from "@/components/shared/filter-select";
import { AgainFormRow, AgainUnderlineInput, AgainUnderlineTextarea } from "@/components/again/again-form-sheet";
import type { ApiFinanceAccount, ApiFinancePaymentAccount } from "@/lib/api/finance";
import type { ApiCostCenter } from "@/lib/api/finance-allocation";
import type { ApiVoucherLine, VoucherLineInput, VoucherType } from "@/lib/api/finance-vouchers";
import { cn, formatCurrency } from "@/lib/utils";

/** Heads other screens own; the server refuses them on a voucher line too (voucher_service.OWNED_HEADS). */
const OWNED_HEAD_CODES = new Set(["1100", "2100", "1150", "1160", "2150"]);

export type VoucherFormLine = {
  key: string;
  accountId: string;
  description: string;
  debit: string;
  credit: string;
  costCenterId: string;
};

export type VoucherForm = {
  voucherType: VoucherType;
  date: string;
  description: string;
  reference: string;
  paymentAccountId: string;
  toPaymentAccountId: string;
  amount: string;
  lines: VoucherFormLine[];
};

export type VoucherLookups = {
  accounts: ApiFinanceAccount[];
  paymentAccounts: ApiFinancePaymentAccount[];
  costCenters: ApiCostCenter[];
};

let lineSeq = 0;
export function newLine(partial: Partial<VoucherFormLine> = {}): VoucherFormLine {
  lineSeq += 1;
  return { key: `l${Date.now()}-${lineSeq}`, accountId: "", description: "", debit: "", credit: "", costCenterId: "", ...partial };
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function emptyVoucherForm(voucherType: VoucherType): VoucherForm {
  return {
    voucherType,
    date: todayIso(),
    description: "",
    reference: "",
    paymentAccountId: "",
    toPaymentAccountId: "",
    amount: "",
    lines: voucherType === "contra" ? [] : voucherType === "journal" ? [newLine(), newLine()] : [newLine()],
  };
}

const zeroToBlank = (value: string | null | undefined) => (value && Number(value) !== 0 ? String(Number(value)) : "");

export function formLinesFrom(lines: ApiVoucherLine[]): VoucherFormLine[] {
  return lines.map((line) =>
    newLine({
      accountId: line.account_id,
      description: line.description ?? "",
      debit: zeroToBlank(line.debit),
      credit: zeroToBlank(line.credit),
      costCenterId: line.cost_center_id ?? "",
    }),
  );
}

const num = (value: string) => Number.parseFloat(value) || 0;
const decimal = (value: string) => value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");

export function voucherTotals(form: VoucherForm) {
  if (form.voucherType === "contra") {
    const amount = num(form.amount);
    return { debit: amount, credit: amount, amount };
  }
  const debit = form.lines.reduce((sum, line) => sum + num(line.debit), 0);
  const credit = form.lines.reduce((sum, line) => sum + num(line.credit), 0);
  return { debit, credit, amount: form.voucherType === "credit" ? credit : debit };
}

/** Lines the API takes: the side the voucher type allows, blank lines dropped (templates keep lines with no amount). */
export function linesPayload(form: VoucherForm, { keepBlankAmounts = false } = {}): VoucherLineInput[] {
  if (form.voucherType === "contra") return [];
  return form.lines
    .filter((line) => line.accountId && (keepBlankAmounts || num(line.debit) > 0 || num(line.credit) > 0))
    .map((line) => ({
      account_id: line.accountId,
      description: line.description.trim() || null,
      debit: form.voucherType === "credit" ? "0" : String(num(line.debit)),
      credit: form.voucherType === "debit" ? "0" : String(num(line.credit)),
      cost_center_id: line.costCenterId || null,
    }));
}

/** What is still missing before the voucher can be saved (null = ready). Mirrors voucher_service checks. */
export function voucherProblem(form: VoucherForm): string | null {
  const totals = voucherTotals(form);
  if (form.voucherType !== "journal" && !form.paymentAccountId) return "Choose the cash / bank account";
  if (form.voucherType === "contra") {
    if (!form.toPaymentAccountId) return "Choose the account the money goes to";
    if (form.toPaymentAccountId === form.paymentAccountId) return "Choose two different accounts";
    return totals.amount > 0 ? null : "Enter the amount";
  }
  if (form.lines.some((line) => !line.accountId && (num(line.debit) > 0 || num(line.credit) > 0))) return "Every line with an amount needs a head";
  if (form.voucherType === "journal") {
    if (linesPayload(form).length < 2) return "A journal needs at least two lines";
    if (Math.abs(totals.debit - totals.credit) > 0.004) return `Debits and credits differ by ${formatCurrency(Math.abs(totals.debit - totals.credit))}`;
  }
  return totals.amount > 0 ? null : "Enter at least one amount";
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h3 className="mb-1 border-b border-border/80 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

type Props = {
  form: VoucherForm;
  onChange: (patch: Partial<VoucherForm>) => void;
  lookups: VoucherLookups;
  readOnly?: boolean;
  /** Templates have no date / reference and may leave amounts blank. */
  template?: boolean;
};

/** Header + lines of a voucher or a voucher template (docs/common/formcommon.md rows, @container responsive). */
export function VoucherFormBody({ form, onChange, lookups, readOnly = false, template = false }: Props) {
  const type = form.voucherType;
  const cashGl = React.useMemo(() => new Set(lookups.paymentAccounts.map((a) => a.gl_account_id)), [lookups.paymentAccounts]);
  const headOptions = React.useMemo(
    () =>
      lookups.accounts
        .filter((a) => a.is_active && !cashGl.has(a.id) && !OWNED_HEAD_CODES.has(a.code))
        .map((a) => ({ value: a.id, label: `${a.code} ${a.name}` })),
    [lookups.accounts, cashGl],
  );
  const accountLabel = React.useMemo(() => new Map(lookups.accounts.map((a) => [a.id, `${a.code} ${a.name}`])), [lookups.accounts]);
  const payOptions = lookups.paymentAccounts
    .filter((a) => a.is_active || a.id === form.paymentAccountId || a.id === form.toPaymentAccountId)
    .map((a) => ({ value: a.id, label: `${a.name} (${formatCurrency(Number(a.balance))})` }));
  const centerOptions = [{ value: "", label: "—" }, ...lookups.costCenters.filter((c) => c.is_active).map((c) => ({ value: c.id, label: c.name }))];
  const totals = voucherTotals(form);
  const showDebit = type === "debit" || type === "journal";
  const showCredit = type === "credit" || type === "journal";

  const patchLine = (key: string, changes: Partial<VoucherFormLine>) =>
    onChange({ lines: form.lines.map((line) => (line.key === key ? { ...line, ...changes } : line)) });
  const removeLine = (key: string) => onChange({ lines: form.lines.filter((line) => line.key !== key) });

  const fromLabel =
    type === "debit" ? "Paid from" : type === "credit" ? "Received into" : type === "contra" ? "From account" : null;

  return (
    <div className="space-y-4">
      <Section title="Voucher">
        <div className="grid gap-x-8 @xl:grid-cols-2">
          {!template ? (
            <AgainFormRow label="Date">
              {readOnly ? (
                <span className="text-sm">{form.date}</span>
              ) : (
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => onChange({ date: e.target.value })}
                  className="h-7 w-full border-0 border-b border-border bg-transparent text-sm outline-none focus:border-primary"
                />
              )}
            </AgainFormRow>
          ) : null}
          {!template ? (
            <AgainFormRow label="Reference">
              <AgainUnderlineInput
                value={form.reference}
                onChange={(v) => onChange({ reference: v })}
                readOnly={readOnly}
                placeholder={readOnly ? "—" : "Bill no, cheque no, deposit slip…"}
              />
            </AgainFormRow>
          ) : null}
          {fromLabel ? (
            <AgainFormRow label={fromLabel}>
              <FilterSelect
                value={form.paymentAccountId}
                onChange={(v) => onChange({ paymentAccountId: v })}
                options={payOptions}
                searchThreshold={0}
                placeholder="Cash / bank account…"
                width="w-full"
                avoidCollisions
                ariaLabel={fromLabel}
                disabled={readOnly}
              />
            </AgainFormRow>
          ) : null}
          {type === "contra" ? (
            <AgainFormRow label="To account">
              <FilterSelect
                value={form.toPaymentAccountId}
                onChange={(v) => onChange({ toPaymentAccountId: v })}
                options={payOptions}
                searchThreshold={0}
                placeholder="Cash / bank account…"
                width="w-full"
                avoidCollisions
                ariaLabel="To account"
                disabled={readOnly}
              />
            </AgainFormRow>
          ) : null}
          {type === "contra" ? (
            <AgainFormRow label="Amount">
              <AgainUnderlineInput value={form.amount} onChange={(v) => onChange({ amount: decimal(v) })} readOnly={readOnly} placeholder="0.00" />
            </AgainFormRow>
          ) : null}
        </div>
        <AgainFormRow label="Description" className="mt-1">
          <AgainUnderlineTextarea value={form.description} onChange={(v) => onChange({ description: v })} rows={2} readOnly={readOnly} />
        </AgainFormRow>
      </Section>

      {type !== "contra" ? (
        <Section title={type === "debit" ? "Debited heads" : type === "credit" ? "Credited heads" : "Lines"}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b border-border/70 text-left text-[11px] text-muted-foreground">
                  <th className="py-1.5 pr-2 font-semibold">Account head</th>
                  <th className="py-1.5 pr-2 font-semibold">Particulars</th>
                  <th className="w-[130px] py-1.5 pr-2 font-semibold">Cost center</th>
                  {showDebit ? <th className="w-[110px] py-1.5 pr-2 text-right font-semibold">{type === "journal" ? "Debit" : "Amount"}</th> : null}
                  {showCredit ? <th className="w-[110px] py-1.5 pr-2 text-right font-semibold">{type === "journal" ? "Credit" : "Amount"}</th> : null}
                  {!readOnly ? <th className="w-8" /> : null}
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line) => (
                  <tr key={line.key} className="border-b border-border/40 align-middle">
                    <td className="py-1 pr-2">
                      {readOnly ? (
                        accountLabel.get(line.accountId) ?? "—"
                      ) : (
                        <FilterSelect
                          value={line.accountId}
                          onChange={(v) => patchLine(line.key, { accountId: v })}
                          options={headOptions}
                          searchThreshold={0}
                          placeholder="Choose head…"
                          searchPlaceholder="Search code or name…"
                          width="w-full"
                          avoidCollisions
                          ariaLabel="Account head"
                        />
                      )}
                    </td>
                    <td className="py-1 pr-2">
                      <AgainUnderlineInput value={line.description} onChange={(v) => patchLine(line.key, { description: v })} readOnly={readOnly} />
                    </td>
                    <td className="py-1 pr-2">
                      {readOnly ? (
                        lookups.costCenters.find((c) => c.id === line.costCenterId)?.name ?? "—"
                      ) : (
                        <FilterSelect
                          value={line.costCenterId}
                          onChange={(v) => patchLine(line.key, { costCenterId: v })}
                          options={centerOptions}
                          width="w-full"
                          avoidCollisions
                          ariaLabel="Cost center"
                        />
                      )}
                    </td>
                    {showDebit ? (
                      <td className="py-1 pr-2">
                        <AgainUnderlineInput
                          value={line.debit}
                          onChange={(v) => patchLine(line.key, { debit: decimal(v), ...(decimal(v) ? { credit: "" } : {}) })}
                          readOnly={readOnly}
                          inputClassName="text-right tabular-nums"
                          placeholder="0.00"
                        />
                      </td>
                    ) : null}
                    {showCredit ? (
                      <td className="py-1 pr-2">
                        <AgainUnderlineInput
                          value={line.credit}
                          onChange={(v) => patchLine(line.key, { credit: decimal(v), ...(decimal(v) ? { debit: "" } : {}) })}
                          readOnly={readOnly}
                          inputClassName="text-right tabular-nums"
                          placeholder="0.00"
                        />
                      </td>
                    ) : null}
                    {!readOnly ? (
                      <td className="py-1 text-right">
                        <button
                          type="button"
                          className="p-1 text-muted-foreground hover:text-destructive"
                          aria-label="Remove line"
                          onClick={() => removeLine(line.key)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-[11px] font-semibold">
                  <td className="py-1.5" colSpan={3}>
                    {!readOnly ? (
                      <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => onChange({ lines: [...form.lines, newLine()] })}>
                        <Plus className="h-3 w-3" /> Add a line
                      </button>
                    ) : null}
                  </td>
                  {showDebit ? <td className="py-1.5 pr-2 text-right tabular-nums">{formatCurrency(totals.debit)}</td> : null}
                  {showCredit ? <td className="py-1.5 pr-2 text-right tabular-nums">{formatCurrency(totals.credit)}</td> : null}
                  {!readOnly ? <td /> : null}
                </tr>
              </tfoot>
            </table>
          </div>
          <p className={cn("mt-1 text-[11px] text-muted-foreground", type === "journal" && Math.abs(totals.debit - totals.credit) > 0.004 && "text-amber-600 dark:text-amber-400")}>
            {type === "debit"
              ? `Each head is debited; ${formatCurrency(totals.amount)} is credited to the account it is paid from.`
              : type === "credit"
                ? `Each head is credited; ${formatCurrency(totals.amount)} is debited to the account it is received into.`
                : Math.abs(totals.debit - totals.credit) > 0.004
                  ? `Debits and credits differ by ${formatCurrency(Math.abs(totals.debit - totals.credit))}.`
                  : "Debits equal credits."}{" "}
            Cash / bank heads and the customer, supplier and cheque control heads are not offered: their own screens post them.
          </p>
        </Section>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          The amount leaves the first account and arrives in the second (Dr to account, Cr from account).
        </p>
      )}
    </div>
  );
}
