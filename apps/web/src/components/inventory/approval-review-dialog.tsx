"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { fetchApprovalDetail, type ApprovalDetail, type ApprovalFact, type ApprovalRequest, type ApprovalTable } from "@/lib/api/approvals";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<string, string> = {
  good: "font-semibold text-emerald-600 dark:text-emerald-400",
  warn: "font-semibold text-amber-600 dark:text-amber-400",
  bad: "font-semibold text-red-600 dark:text-red-400",
};

const LINK_LABEL = {
  sales_order: "Sales order",
  quotation: "Quotation",
  stock_adjustment: "Stock adjustment",
  stock_transfer: "Stock transfer",
} as const;

function FactRows({ facts }: { facts: ApprovalFact[] }) {
  return (
    <div className="grid gap-x-8 sm:grid-cols-2">
      {facts.map((fact) => (
        <div key={fact.label} className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-x-2 border-b border-border/50 py-[5px]">
          <span className="text-[13px] font-medium leading-[1.4] text-foreground/80">{fact.label}</span>
          <span className={cn("min-w-0 break-words text-[13px] leading-[1.4] text-foreground", fact.tone && TONE_CLASS[fact.tone])}>{fact.value}</span>
        </div>
      ))}
    </div>
  );
}

function DocumentTable({ table }: { table: ApprovalTable }) {
  return (
    <div>
      <p className="border-b border-border pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{table.title}</p>
      <div className="mt-2 overflow-x-auto border border-border/70 bg-background">
        <table className="w-full min-w-[30rem] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {table.columns.map((col) => (
                <th key={col.key} className={cn("px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", col.align === "right" ? "text-right" : "text-left")}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} className={cn("border-b border-border/50 last:border-b-0", table.warn_rows.includes(i) && "bg-amber-500/10")}>
                {table.columns.map((col, c) => (
                  <td key={col.key} className={cn("px-2 py-1.5 align-top", col.align === "right" ? "text-right tabular-nums" : "text-left", c === 0 && "font-medium")}>
                    {row[col.key] || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {table.footer ? (
            <tfoot>
              <tr className="border-t border-border bg-muted/20 font-semibold">
                {table.columns.map((col) => (
                  <td key={col.key} className={cn("px-2 py-1.5", col.align === "right" ? "text-right tabular-nums" : "text-left")}>
                    {table.footer?.[col.key] ?? ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

/**
 * For the few requests that have no drawer of their own to open (a standalone invoice, a voucher between two accounts, a
 * confirm of several orders at once): the values of the request, read now, in a small dialog. Approve / Reject stay on the
 * decision card beside it. A confirm of several orders lists them; each opens its own drawer.
 */
export function ApprovalReviewDialog({
  request,
  onClose,
  onOpenOrder,
}: {
  request: ApprovalRequest;
  onClose: () => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchApprovalDetail(request.id);
        if (!cancelled) setDetail(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this request");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [request.id]);

  const doc = detail?.document;
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{request.group_label} · approval request</p>
            <h2 className="mt-0.5 break-words text-[16px] font-bold leading-tight text-foreground">
              {request.label}
              {request.reference ? ` · ${request.reference}` : ""}
            </h2>
            {request.party ? <p className="text-[13px] text-muted-foreground">{request.party}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {error ? <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p> : null}
          {!doc && !error ? <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p> : null}
          {doc?.notes.map((note) => (
            <p key={note} className="border-l-2 border-[#00a09d] bg-[#00a09d]/5 px-3 py-1.5 text-[12px] text-muted-foreground">
              {note}
            </p>
          ))}
          {doc && doc.facts.length > 0 ? <FactRows facts={doc.facts} /> : null}
          {doc?.tables.map((table) => (
            <DocumentTable key={table.title} table={table} />
          ))}
          {doc && doc.links.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Open</span>
              {doc.links.map((link) => (
                <button
                  key={link.kind + link.id}
                  type="button"
                  onClick={() => onOpenOrder(link.id)}
                  className="inline-flex h-6 items-center border border-[#00a09d]/50 bg-[#00a09d]/5 px-2 text-[12px] font-medium text-[#00796b] hover:bg-[#00a09d]/15 dark:text-[#4fd1c5]"
                >
                  {LINK_LABEL[link.kind]} {link.label} ›
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
