"use client";

import { publicMediaUrl } from "@/lib/media/public-media-url";
import {
  type LedgerPrintCompany,
  formatStatementDate,
  formatStatementDateTime,
  formatStatementMoney,
  formatStatementSide,
  statementAdvanceLabel,
  statementBalanceLabel,
  statementClosingValue,
  statementPartyLabel,
  statementUsesDebitCredit,
  type LedgerStatement,
  type LedgerStatementRow,
  STATEMENT_CHEQUE_STATUS,
} from "@/lib/finance/ledger-statement";

type Props = {
  statement: LedgerStatement;
  company: LedgerPrintCompany;
  /** On-screen only: makes each transaction number a link (to the line's journal entry). */
  onOpenReference?: (row: LedgerStatementRow) => void;
};

function logoSrc(url: string): string {
  const src = publicMediaUrl(url);
  if (!src) return "";
  if (src.startsWith("/") && !src.includes("?")) return `${src}?v=1`;
  return src;
}

function moneyCell(value: number | null): string {
  if (value == null || value <= 0) return "—";
  return formatStatementMoney(value);
}

export function LedgerStatementDocument({ statement, company, onOpenReference }: Props) {
  const imageSrc = logoSrc(company.logoSrc);
  const party = statementPartyLabel(statement.partyKind);
  const dueLabel = statementBalanceLabel(statement.partyKind);
  const advanceLabel = statementAdvanceLabel(statement.partyKind);
  const debitCredit = statementUsesDebitCredit(statement.partyKind);
  const billedLabel = debitCredit ? "Debit" : "Billed";
  const paidLabel = debitCredit ? "Credit" : "Paid";
  const closing = statementClosingValue(statement);
  const printed = formatStatementDateTime(statement.printedAt);
  const contact = [company.phone, company.email].filter(Boolean).join(" · ");
  const companyName = company.name.trim();

  return (
    <article className="ledger-print-doc mx-auto max-w-[820px] bg-white px-10 py-8 text-[12px] leading-snug text-[#212529] print:max-w-none print:px-8 print:py-6">
      <header className="mb-6 flex items-start justify-between gap-8 border-b-2 border-[#00a09d] pb-5">
        <div className="min-w-0">
          {imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageSrc}
              alt={companyName || "Company"}
              className="mb-2 h-9 w-auto max-w-[180px] object-contain object-left"
            />
          ) : null}
          {companyName ? (
            <p className="text-[16px] font-bold text-[#00a09d]">{companyName}</p>
          ) : null}
          {company.addressLines.map((line) => (
            <p key={line} className="text-[11px] text-[#495057]">
              {line}
            </p>
          ))}
          {contact ? <p className="text-[11px] text-[#495057]">{contact}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#00a09d]">
            Statement of account
          </p>
          <p className="mt-1 text-[18px] font-bold leading-none text-[#212529]">Account Statement</p>
          <p className="mt-2 text-[11px] text-[#495057]">Date: {printed}</p>
          <p className="text-[11px] text-[#495057]">Period: {statement.periodLabel}</p>
          <p className="text-[11px] text-[#495057]">Currency: {company.currencyLabel}</p>
        </div>
      </header>

      <section className="mb-5 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6c757d]">{party}</p>
          <p className="mt-0.5 text-[15px] font-bold">{statement.partyName}</p>
          {statement.partyCode || statement.partyAddress || statement.partyPhone ? (
            <p className="mt-0.5 text-[11px] text-[#495057]">
              {[statement.partyCode ? `Code ${statement.partyCode}` : "", statement.partyAddress, statement.partyPhone]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          <p className="mt-1 text-[11px] text-[#495057]">
            {statement.openCount} open document{statement.openCount === 1 ? "" : "s"}
          </p>
          {statement.filterNote ? (
            <p className="mt-1 text-[11px] text-[#6c757d]">{statement.filterNote}</p>
          ) : null}
        </div>
        <div className="border border-[#d9d9d9]">
          <div className="grid grid-cols-2">
            <SummaryCell label={billedLabel} value={formatStatementMoney(statement.billed)} />
            <SummaryCell label={paidLabel} value={formatStatementMoney(statement.paid)} />
            <SummaryCell
              label={dueLabel}
              value={formatStatementMoney(statement.outstanding)}
              emphasis
            />
            <SummaryCell label={advanceLabel} value={formatStatementMoney(statement.advance || 0)} />
          </div>
        </div>
      </section>

      {statement.layout === "ledger" ? (
        <LedgerLayout statement={statement} onOpenReference={onOpenReference} />
      ) : (
      <section>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#6c757d]">
          Transaction history
        </p>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#e8f4f3] text-left">
              <th className="border-b-2 border-[#00a09d] px-2 py-1.5 font-semibold">Date</th>
              <th className="border-b-2 border-[#00a09d] px-2 py-1.5 font-semibold">
                {debitCredit ? "Journal" : "Type"}
              </th>
              <th className="border-b-2 border-[#00a09d] px-2 py-1.5 font-semibold">Reference</th>
              <th className="border-b-2 border-[#00a09d] px-2 py-1.5 text-right font-semibold">
                {billedLabel}
              </th>
              <th className="border-b-2 border-[#00a09d] px-2 py-1.5 text-right font-semibold">
                {paidLabel}
              </th>
              <th className="border-b-2 border-[#00a09d] px-2 py-1.5 text-right font-semibold">
                {debitCredit ? "Due date" : "Due"}
              </th>
              <th className="border-b-2 border-[#00a09d] px-2 py-1.5 text-right font-semibold">Balance</th>
              <th className="border-b-2 border-[#00a09d] px-2 py-1.5 font-semibold">
                {debitCredit ? "Matching" : "Status"}
              </th>
            </tr>
          </thead>
          <tbody>
            {statement.rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-6 text-center text-[#6c757d]">
                  No transactions in this statement period.
                </td>
              </tr>
            ) : (
              statement.rows.map((line, idx) => (
                <tr key={`${line.reference}-${idx}`} className="border-b border-[#eeeeee]">
                  <td className="whitespace-nowrap px-2 py-1.5">{formatStatementDate(line.date)}</td>
                  <td className="px-2 py-1.5">
                    {debitCredit ? line.journal || line.type : line.type}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[10px]">{line.reference}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                    {moneyCell(line.billed)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                    {moneyCell(line.paid)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                    {debitCredit
                      ? line.dueDate
                        ? formatStatementDate(line.dueDate)
                        : "—"
                      : moneyCell(line.due)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-medium">
                    {formatStatementMoney(line.balance)}
                  </td>
                  <td className="px-2 py-1.5 capitalize">{line.status || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="px-2 py-2.5 text-right text-[12px] font-semibold">
                Closing balance
              </td>
              <td className="bg-[#fdecec] px-2 py-2.5 text-right text-[13px] font-bold tabular-nums text-[#c0392b]">
                {formatStatementMoney(closing)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </section>
      )}

      {statement.layout !== "ledger" ? <CreditAndChequeSections statement={statement} /> : null}

      <footer className="mt-8 border-t border-[#d9d9d9] pt-3 text-[10px] leading-relaxed text-[#6c757d]">
        <p>
          This is a computer-generated account statement from {companyName || "this company"}.
          Please report any discrepancy within 7 days of the statement date.
        </p>
        <p className="mt-1">
          Prepared {printed} · {statement.rows.length} line
          {statement.rows.length === 1 ? "" : "s"} shown
          {statement.rowCountTotal !== statement.rows.length ? ` of ${statement.rowCountTotal}` : ""}.
        </p>
      </footer>
    </article>
  );
}

function SummaryCell({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="border-b border-r border-[#d9d9d9] px-2.5 py-2 last:border-r-0">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-[#6c757d]">{label}</p>
      <p
        className={
          emphasis
            ? "mt-0.5 text-[14px] font-bold tabular-nums text-[#c0392b]"
            : "mt-0.5 text-[13px] font-semibold tabular-nums"
        }
      >
        {value}
      </p>
    </div>
  );
}

/** OnerERP party ledger: Opening, Dr / Cr lines with a side-marked balance, Total, then the summaries. */
function LedgerLayout({
  statement,
  onOpenReference,
}: {
  statement: LedgerStatement;
  onOpenReference?: (row: LedgerStatementRow) => void;
}) {
  const side = statement.positiveSide ?? "Dr";
  const head = "border-b-2 border-[#00a09d] px-2 py-1.5 font-semibold";
  return (
    <>
      <section>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#6c757d]">Transaction history</p>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#e8f4f3] text-left">
              <th className={head}>Date</th>
              <th className={head}>Transaction Type</th>
              <th className={head}>Particular</th>
              <th className={head}>Transaction No.</th>
              <th className={`${head} text-right`}>Dr</th>
              <th className={`${head} text-right`}>Cr</th>
              <th className={`${head} text-right`}>Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[#eeeeee]">
              <td className="px-2 py-1.5" />
              <td className="px-2 py-1.5">Opening</td>
              <td className="px-2 py-1.5">Opening Balance</td>
              <td className="px-2 py-1.5" />
              <td className="px-2 py-1.5" />
              <td className="px-2 py-1.5" />
              <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium tabular-nums">
                {formatStatementSide(statement.openingBalance ?? 0, side)}
              </td>
            </tr>
            {statement.rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-[#6c757d]">
                  No transactions in this statement period.
                </td>
              </tr>
            ) : (
              statement.rows.map((line, idx) => (
                <tr key={`${line.reference}-${idx}`} className="border-b border-[#eeeeee] align-top">
                  <td className="whitespace-nowrap px-2 py-1.5">{formatStatementDate(line.date)}</td>
                  <td className="px-2 py-1.5">{line.type}</td>
                  <td className="px-2 py-1.5">{line.particular || "—"}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[10px]">
                    {onOpenReference && line.journalEntryId ? (
                      <button
                        type="button"
                        className="text-[#00a09d] underline-offset-2 hover:underline print:text-inherit"
                        onClick={() => onOpenReference(line)}
                      >
                        {line.reference}
                      </button>
                    ) : (
                      line.reference
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{moneyCell(line.debit ?? 0)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{moneyCell(line.credit ?? 0)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium tabular-nums">
                    {formatStatementSide(line.balance, side)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td colSpan={4} className="px-2 py-2.5 text-right text-[12px]">
                Total
              </td>
              <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">{formatStatementMoney(statement.totalDebit ?? 0)}</td>
              <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">{formatStatementMoney(statement.totalCredit ?? 0)}</td>
              <td className="whitespace-nowrap bg-[#fdecec] px-2 py-2.5 text-right text-[13px] font-bold tabular-nums text-[#c0392b]">
                {formatStatementSide(statementClosingValue(statement), side)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <CreditAndChequeSections statement={statement} />
    </>
  );
}

/**
 * OnerERP's Credit Limit Summary (ledger balance, cheques written but not honoured, net outstanding, open orders),
 * the transaction summary, and the cheques not honoured yet. Shared by both statement layouts.
 */
function CreditAndChequeSections({ statement }: { statement: LedgerStatement }) {
  const side = statement.positiveSide ?? (statement.partyKind === "supplier" ? "Cr" : "Dr");
  const cs = statement.creditSummary;
  const cheques = statement.pendingCheques ?? [];
  const types = statement.transactionSummary ?? [];
  if (!cs && cheques.length === 0 && types.length === 0) return null;
  const head = "mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#6c757d]";
  return (
    <>
      {cs || types.length ? (
        <section className="mt-6 grid grid-cols-2 gap-6">
          {cs ? (
            <div>
              <p className={head}>Credit limit summary</p>
              <table className="w-full border-collapse text-[11px]">
                <tbody>
                  {cs.ledgerBalance != null ? (
                    <SummaryLine label="Ledger Balance" value={formatStatementSide(cs.ledgerBalance, side)} />
                  ) : null}
                  {cs.advChequeIssued != null ? (
                    <>
                      <SummaryLine label="Adv. Cheque Issued" value={formatStatementMoney(cs.advChequeIssued)} />
                      <SummaryLine label="Not Treated" value={formatStatementMoney(cs.notTreated ?? 0)} indent />
                      {(cs.presented ?? 0) > 0 ? (
                        <SummaryLine label="Presented" value={formatStatementMoney(cs.presented ?? 0)} indent />
                      ) : null}
                      <SummaryLine
                        label="Dishonored"
                        hint="Already back on the ledger, not deducted again"
                        value={formatStatementMoney(cs.dishonoured ?? 0)}
                        indent
                        danger={(cs.dishonoured ?? 0) > 0}
                      />
                    </>
                  ) : null}
                  <SummaryLine label="Net Outstanding" value={formatStatementSide(cs.netOutstanding, side)} strong />
                  <SummaryLine label="Unsettled Order Balance" value={formatStatementMoney(cs.unsettledOrders)} />
                  <SummaryLine
                    label="Net Outstanding (Considering Unsettled Order Value)"
                    value={formatStatementSide(cs.netWithOrders, side)}
                    strong
                  />
                  <SummaryLine label="Credit Limit" value={cs.creditLimit > 0 ? formatStatementMoney(cs.creditLimit) : "Not set"} />
                  {cs.availableCredit != null ? (
                    <SummaryLine label="Available Credit" value={formatStatementMoney(cs.availableCredit)} danger={cs.availableCredit < 0} />
                  ) : null}
                  <SummaryLine label="Credit Allowed Days" value={cs.creditDays == null ? "—" : String(cs.creditDays)} />
                </tbody>
              </table>
              {cs.openOrdersNote ? <p className="mt-1 text-[10px] text-[#6c757d]">{cs.openOrdersNote}</p> : null}
            </div>
          ) : (
            <div />
          )}
          {types.length ? (
            <div>
              <p className={head}>Transaction summary</p>
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[#e8f4f3] text-left">
                    <th className="px-2 py-1 font-semibold">Type</th>
                    <th className="px-2 py-1 text-right font-semibold">No.</th>
                    <th className="px-2 py-1 text-right font-semibold">Dr</th>
                    <th className="px-2 py-1 text-right font-semibold">Cr</th>
                  </tr>
                </thead>
                <tbody>
                  {types.map((t) => (
                    <tr key={t.type} className="border-b border-[#eeeeee]">
                      <td className="px-2 py-1">{t.type}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{t.count}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{moneyCell(t.debit)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{moneyCell(t.credit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {cheques.length > 0 ? (
        <section className="mt-6">
          <p className={head}>Cheques not honoured yet</p>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[#e8f4f3] text-left">
                <th className="border-b-2 border-[#00a09d] px-2 py-1.5 font-semibold">Cheque No.</th>
                <th className="border-b-2 border-[#00a09d] px-2 py-1.5 font-semibold">Cheque Date</th>
                <th className="border-b-2 border-[#00a09d] px-2 py-1.5 font-semibold">Bank</th>
                <th className="border-b-2 border-[#00a09d] px-2 py-1.5 font-semibold">Status</th>
                <th className="border-b-2 border-[#00a09d] px-2 py-1.5 font-semibold">Since</th>
                <th className="border-b-2 border-[#00a09d] px-2 py-1.5 font-semibold">Bill</th>
                <th className="border-b-2 border-[#00a09d] px-2 py-1.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {cheques.map((c) => (
                <tr key={`${c.number}-${c.date}`} className="border-b border-[#eeeeee]">
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[10px]">{c.number}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{formatStatementDate(c.date)}</td>
                  <td className="px-2 py-1.5">{c.bank}</td>
                  <td className={c.status === "bounced" ? "px-2 py-1.5 font-semibold text-[#c0392b]" : "px-2 py-1.5"}>
                    {STATEMENT_CHEQUE_STATUS[c.status] ?? c.status}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">{formatStatementDate(c.since)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[10px]">{c.document || "—"}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{formatStatementMoney(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}

function SummaryLine({
  label,
  value,
  strong,
  danger,
  indent,
  hint,
}: {
  label: string;
  value: string;
  strong?: boolean;
  danger?: boolean;
  indent?: boolean;
  hint?: string;
}) {
  return (
    <tr className="border-b border-[#eeeeee]">
      <td className={["py-1 pr-2", indent ? "pl-5" : "pl-2", strong ? "font-semibold" : ""].join(" ")}>
        {label}
        {hint ? <span className="block text-[9px] font-normal text-[#6c757d]">{hint}</span> : null}
      </td>
      <td
        className={[
          "whitespace-nowrap px-2 py-1 text-right tabular-nums",
          strong ? "font-semibold" : "",
          danger ? "font-semibold text-[#c0392b]" : "",
        ].join(" ")}
      >
        {value}
      </td>
    </tr>
  );
}
