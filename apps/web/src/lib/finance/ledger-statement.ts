import { mergeInvoiceLayout, type WorkspaceCompany } from "@/lib/api/workspace-company";
import { formatCompanyDate, formatCompanyDateTime } from "@/lib/localisation/company-format";
import { findCurrency } from "@/lib/localisation/currency-options";
import { getCompanyFormat } from "@/lib/store/company-format-store";
import { formatCurrency } from "@/lib/utils";

export type LedgerStatementPartyKind = "supplier" | "customer" | "partner";

export type LedgerStatementRow = {
  date: string;
  type: string;
  journal?: string;
  reference: string;
  dueDate?: string;
  billed: number;
  paid: number;
  due: number | null;
  balance: number;
  status: string;
};

export type LedgerStatementAgeing = {
  current: number;
  days30: number;
  days60: number;
  days90Plus: number;
};

export type LedgerStatement = {
  partyKind: LedgerStatementPartyKind;
  partyName: string;
  partyEmail?: string;
  partyPhone?: string;
  periodLabel: string;
  filterNote: string;
  printedAt: string;
  billed: number;
  paid: number;
  outstanding: number;
  advance: number;
  overdue: number;
  openCount: number;
  ageing: LedgerStatementAgeing;
  rows: LedgerStatementRow[];
  rowCountTotal: number;
};

export type LedgerPrintCompany = {
  name: string;
  logoSrc: string;
  addressLines: string[];
  phone: string;
  email: string;
  currencyLabel: string;
};

export const EMPTY_LEDGER_PRINT_COMPANY: LedgerPrintCompany = {
  name: "",
  logoSrc: "",
  addressLines: [],
  phone: "",
  email: "",
  currencyLabel: "BDT (৳)",
};

function statementCurrencyLabel(code: string | null | undefined): string {
  const c = findCurrency(code);
  if (!c) return "BDT (৳)";
  return c.symbol ? `${c.code} (${c.symbol})` : c.code;
}

/** Letterhead from Workspace → Company setup (invoice logo, else company logo). */
export function ledgerPrintCompanyFromWorkspace(row: WorkspaceCompany): LedgerPrintCompany {
  const invoice = mergeInvoiceLayout(row.invoice_layout);
  const logoSrc = invoice.logo_url.trim() || (row.logo_url ?? "").trim();
  const cityLine = [row.city, row.state, row.zip_code]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const addressLines = [row.street, row.street2, cityLine, row.country]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  return {
    name: (row.name || row.legal_name || "").trim(),
    logoSrc,
    addressLines,
    phone: (row.phone || row.mobile || "").trim(),
    email: (row.email ?? "").trim(),
    currencyLabel: statementCurrencyLabel(row.currency_code),
  };
}

export function statementPartyLabel(kind: LedgerStatementPartyKind): string {
  if (kind === "supplier") return "Supplier";
  if (kind === "partner") return "Partner";
  return "Customer";
}

export function statementBalanceLabel(kind: LedgerStatementPartyKind): string {
  return kind === "supplier" ? "We owe" : "They owe";
}

export function statementAdvanceLabel(kind: LedgerStatementPartyKind): string {
  if (kind === "supplier") return "Advance";
  if (kind === "partner") return "We owe";
  return "Credit";
}

export function statementUsesDebitCredit(kind: LedgerStatementPartyKind): boolean {
  return kind === "partner";
}

export function statementClosingValue(stmt: LedgerStatement): number {
  return Number(stmt.outstanding || 0) - Number(stmt.advance || 0);
}

export function formatStatementMoney(value: number): string {
  return formatCurrency(value);
}

export function formatStatementDate(iso: string): string {
  return formatCompanyDate(iso, getCompanyFormat());
}

export function formatStatementDateTime(iso: string): string {
  return formatCompanyDateTime(iso, getCompanyFormat());
}

export function statementPeriodLabel(dateFrom: string, dateTo: string): string {
  if (!dateFrom && !dateTo) return "All transactions";
  const from = dateFrom ? formatStatementDate(dateFrom) : "…";
  const to = dateTo ? formatStatementDate(dateTo) : "…";
  return `${from} – ${to}`;
}

export function statementFileSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "account";
}

export function statementFileName(stmt: LedgerStatement, ext: "xls" | "pdf" | "html"): string {
  const day = stmt.printedAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
  return `account-statement-${statementFileSlug(stmt.partyName)}-${day}.${ext}`;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textCell(value: string, style?: string, mergeAcross?: number): string {
  const attrs = [
    style ? ` ss:StyleID="${style}"` : "",
    mergeAcross ? ` ss:MergeAcross="${mergeAcross}"` : "",
  ].join("");
  return `<Cell${attrs}><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
}

function numberCell(value: number, style = "Money"): string {
  const n = Number.isFinite(value) ? value : 0;
  return `<Cell ss:StyleID="${style}"><Data ss:Type="Number">${n.toFixed(2)}</Data></Cell>`;
}

function blankCell(style?: string): string {
  const attrs = style ? ` ss:StyleID="${style}"` : "";
  return `<Cell${attrs}/>`;
}

function row(cells: string, height?: number): string {
  const h = height ? ` ss:Height="${height}"` : "";
  return `<Row${h}>${cells}</Row>`;
}

export function buildLedgerSpreadsheetMl(
  stmt: LedgerStatement,
  company: LedgerPrintCompany = EMPTY_LEDGER_PRINT_COMPANY,
): string {
  const party = statementPartyLabel(stmt.partyKind);
  const dueLabel = statementBalanceLabel(stmt.partyKind);
  const advanceLabel = statementAdvanceLabel(stmt.partyKind);
  const debitCredit = statementUsesDebitCredit(stmt.partyKind);
  const billedLabel = debitCredit ? "Debit" : "Billed";
  const paidLabel = debitCredit ? "Credit" : "Paid";
  const closing = statementClosingValue(stmt);
  const printed = formatStatementDateTime(stmt.printedAt);
  const colCount = 8;
  const last = colCount - 1;
  const companyName = company.name || "Company";
  const addressText = company.addressLines.join(", ");
  const contactText = [company.phone, company.email].filter(Boolean).join("  ·  ");

  const headerRows = [
    row(textCell(companyName, "Company", last), 28),
    ...(addressText ? [row(textCell(addressText, "Muted", last))] : []),
    ...(contactText ? [row(textCell(contactText, "Muted", last))] : []),
    row(textCell("", undefined, last), 8),
    row(textCell("ACCOUNT STATEMENT", "Title", last), 26),
    row(textCell(`${party} ledger — professional statement of account`, "Muted", last)),
    row(textCell("", undefined, last), 8),
    row(
      `${textCell("Account", "Label")}${textCell(stmt.partyName, "Strong", 2)}${textCell("Statement date", "Label")}${textCell(printed, "Value", 2)}`,
    ),
    row(
      `${textCell("Account type", "Label")}${textCell(party, "Value", 2)}${textCell("Period", "Label")}${textCell(stmt.periodLabel, "Value", 2)}`,
    ),
    row(
      `${textCell("Open documents", "Label")}${textCell(String(stmt.openCount), "Value", 2)}${textCell("Currency", "Label")}${textCell(company.currencyLabel, "Value", 2)}`,
    ),
  ];

  if (stmt.filterNote) {
    headerRows.push(row(textCell(stmt.filterNote, "Muted", last)));
  }

  headerRows.push(row(textCell("", undefined, last), 10));
  headerRows.push(row(textCell("ACCOUNT SUMMARY", "Section", last), 22));
  headerRows.push(
    row(
      `${textCell(billedLabel, "SummaryHead")}${textCell(paidLabel, "SummaryHead")}${textCell(dueLabel, "SummaryHead")}${textCell(advanceLabel, "SummaryHead")}${blankCell()}${blankCell()}${blankCell()}${blankCell()}`,
    ),
  );
  headerRows.push(
    row(
      `${numberCell(stmt.billed, "SummaryMoney")}${numberCell(stmt.paid, "SummaryMoney")}${numberCell(stmt.outstanding, "SummaryDue")}${numberCell(stmt.advance, "SummaryMoney")}${blankCell()}${blankCell()}${blankCell()}${blankCell()}`,
      22,
    ),
  );
  headerRows.push(row(textCell("", undefined, last), 8));
  headerRows.push(row(textCell("TRANSACTION HISTORY", "Section", last), 22));
  headerRows.push(
    row(
      `${textCell("Date", "ColHead")}${textCell(debitCredit ? "Journal" : "Type", "ColHead")}${textCell("Reference", "ColHead")}${textCell(billedLabel, "ColHeadRight")}${textCell(paidLabel, "ColHeadRight")}${textCell(debitCredit ? "Due date" : "Due", "ColHeadRight")}${textCell("Balance", "ColHeadRight")}${textCell(debitCredit ? "Matching" : "Status", "ColHead")}`,
      20,
    ),
  );

  const bodyRows = stmt.rows.map((line) =>
    row(
      `${textCell(formatStatementDate(line.date), "Body")}${textCell(
        debitCredit ? line.journal || line.type : line.type,
        "Body",
      )}${textCell(line.reference, "Mono")}${
        line.billed > 0 ? numberCell(line.billed) : blankCell("Money")
      }${line.paid > 0 ? numberCell(line.paid) : blankCell("Money")}${
        debitCredit
          ? textCell(line.dueDate ? formatStatementDate(line.dueDate) : "—", "Body")
          : line.due != null && line.due > 0
            ? numberCell(line.due)
            : blankCell("Money")
      }${numberCell(line.balance)}${textCell(line.status || "—", "Body")}`,
    ),
  );

  const footerRows = [
    row(textCell("", undefined, last), 8),
    row(
      `${textCell("Closing balance", "FooterLabel", 5)}${numberCell(closing, "FooterDue")}${blankCell()}`,
      22,
    ),
    row(textCell("", undefined, last), 8),
    row(
      textCell(
        `This is a computer-generated account statement from ${companyName}. Please report any discrepancy within 7 days of the statement date.`,
        "FooterNote",
        last,
      ),
    ),
    row(
      textCell(
        `Prepared ${printed}  ·  ${stmt.rows.length} line${stmt.rows.length === 1 ? "" : "s"} shown${
          stmt.rowCountTotal !== stmt.rows.length ? ` of ${stmt.rowCountTotal}` : ""
        }.`,
        "FooterNote",
        last,
      ),
    ),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#212529"/>
  </Style>
  <Style ss:ID="Company">
   <Font ss:FontName="Calibri" ss:Size="18" ss:Bold="1" ss:Color="#00A09D"/>
  </Style>
  <Style ss:ID="Title">
   <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#212529"/>
  </Style>
  <Style ss:ID="Section">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#00A09D" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Muted">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#6C757D"/>
  </Style>
  <Style ss:ID="Label">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#6C757D"/>
  </Style>
  <Style ss:ID="Value">
   <Font ss:FontName="Calibri" ss:Size="11"/>
  </Style>
  <Style ss:ID="Strong">
   <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1"/>
  </Style>
  <Style ss:ID="SummaryHead">
   <Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#6C757D"/>
   <Interior ss:Color="#F4F4F4" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D0D0D0"/>
   </Borders>
  </Style>
  <Style ss:ID="SummaryMoney">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1"/>
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>
  <Style ss:ID="SummaryDue">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Color="#C0392B"/>
   <NumberFormat ss:Format="#,##0.00"/>
  </Style>
  <Style ss:ID="ColHead">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#212529"/>
   <Interior ss:Color="#E8F4F3" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#00A09D"/>
   </Borders>
  </Style>
  <Style ss:ID="ColHeadRight">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#212529"/>
   <Interior ss:Color="#E8F4F3" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#00A09D"/>
   </Borders>
  </Style>
  <Style ss:ID="Body">
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EEEEEE"/>
   </Borders>
  </Style>
  <Style ss:ID="Mono">
   <Font ss:FontName="Consolas" ss:Size="10"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EEEEEE"/>
   </Borders>
  </Style>
  <Style ss:ID="Money">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0.00"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#EEEEEE"/>
   </Borders>
  </Style>
  <Style ss:ID="FooterLabel">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
  </Style>
  <Style ss:ID="FooterDue">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="13" ss:Bold="1" ss:Color="#C0392B"/>
   <NumberFormat ss:Format="#,##0.00"/>
   <Interior ss:Color="#FDECEC" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="FooterNote">
   <Font ss:FontName="Calibri" ss:Size="9" ss:Color="#6C757D"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Account Statement">
  <Table ss:ExpandedColumnCount="${colCount}" ss:DefaultRowHeight="18">
   <Column ss:Width="88"/>
   <Column ss:Width="78"/>
   <Column ss:Width="160"/>
   <Column ss:Width="100"/>
   <Column ss:Width="100"/>
   <Column ss:Width="100"/>
   <Column ss:Width="110"/>
   <Column ss:Width="80"/>
   ${[...headerRows, ...bodyRows, ...footerRows].join("\n   ")}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <PageSetup>
    <Layout x:Orientation="Landscape"/>
    <Header x:Margin="0.25"/>
    <Footer x:Margin="0.25"/>
    <PageMargins x:Bottom="0.4" x:Left="0.4" x:Right="0.4" x:Top="0.4"/>
   </PageSetup>
   <FitToPage/>
   <Print>
    <FitWidth>1</FitWidth>
    <FitHeight>0</FitHeight>
    <ValidPrinterInfo/>
    <PaperSizeIndex>9</PaperSizeIndex>
   </Print>
   <FreezePanes/>
   <FrozenNoSplit/>
  </WorksheetOptions>
 </Worksheet>
</Workbook>
`;
}

export function downloadLedgerExcel(
  stmt: LedgerStatement,
  company: LedgerPrintCompany = EMPTY_LEDGER_PRINT_COMPANY,
): void {
  const xml = `\uFEFF${buildLedgerSpreadsheetMl(stmt, company)}`;
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = statementFileName(stmt, "xls");
  a.click();
  URL.revokeObjectURL(url);
}
