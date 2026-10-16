import {
  formatStatementMoney,
  statementClosingValue,
  statementFileName,
  type LedgerPrintCompany,
  type LedgerStatement,
} from "@/lib/finance/ledger-statement";

export type LedgerStatementSharePayload = {
  kind: "ledger-statement";
  statement: LedgerStatement;
  company: LedgerPrintCompany;
};

function isSharePayload(value: unknown): value is LedgerStatementSharePayload {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.kind === "ledger-statement" && Boolean(row.statement) && Boolean(row.company);
}

export function ledgerStatementShareUrl(key: string): string {
  const path = `/statement/${encodeURIComponent(key)}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export async function createLedgerStatementShareLink(
  statement: LedgerStatement,
  company: LedgerPrintCompany,
): Promise<string> {
  const key = `commerce-stmt-${crypto.randomUUID()}`;
  const res = await fetch(`/api/v1/ephemeral/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payload: { kind: "ledger-statement", statement, company } satisfies LedgerStatementSharePayload,
      ttl_seconds: 604_800,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text.slice(0, 180) || "Could not create share link");
  }
  return ledgerStatementShareUrl(key);
}

export async function fetchLedgerStatementShare(key: string): Promise<LedgerStatementSharePayload | null> {
  const res = await fetch(`/api/v1/ephemeral/${encodeURIComponent(key)}`, { cache: "no-store" });
  if (!res.ok) return null;
  const body = (await res.json()) as { payload?: unknown };
  return isSharePayload(body.payload) ? body.payload : null;
}

export function ledgerStatementShareMessage(statement: LedgerStatement, url?: string): string {
  const closing = formatStatementMoney(statementClosingValue(statement));
  const lines = [
    `Account statement — ${statement.partyName}`,
    `Period: ${statement.periodLabel}`,
    `Outstanding: ${closing}`,
  ];
  if (url) lines.push("", url);
  return lines.join("\n");
}

export function downloadLedgerStatementHtml(root: HTMLElement, statement: LedgerStatement): void {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (src.startsWith("/")) img.setAttribute("src", `${window.location.origin}${src}`);
  });
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Account statement — ${statement.partyName}</title>
  <style>
    body { margin: 0; background: #ececec; color: #212529; font-family: ui-sans-serif, system-ui, sans-serif; }
    .wrap { padding: 24px; }
    @media print { body { background: #fff; } .wrap { padding: 0; } }
  </style>
</head>
<body>
  <div class="wrap">${clone.outerHTML}</div>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = statementFileName(statement, "html");
  a.click();
  URL.revokeObjectURL(href);
}
