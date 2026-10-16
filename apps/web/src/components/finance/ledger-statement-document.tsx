"use client";

import { publicMediaUrl } from "@/lib/media/public-media-url";
import {
  type LedgerPrintCompany,
  formatStatementDate,
  formatStatementDateTime,
  formatStatementMoney,
  statementAdvanceLabel,
  statementBalanceLabel,
  statementClosingValue,
  statementPartyLabel,
  statementUsesDebitCredit,
  type LedgerStatement,
} from "@/lib/finance/ledger-statement";

type Props = {
  statement: LedgerStatement;
  company: LedgerPrintCompany;
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

export function LedgerStatementDocument({ statement, company }: Props) {
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
