"use client";

import Link from "next/link";
import { FINANCE_REPORTS } from "@/lib/finance/finance-nav";

export default function FinanceReportsHubPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background px-4 py-4">
      <h1 className="text-sm font-semibold">Finance reports</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Derived from the existing journal, receivables, payables, and payment accounts — not a second ledger.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {FINANCE_REPORTS.map((report) => (
          <Link
            key={report.id}
            href={report.href}
            className="border border-border bg-background px-4 py-3 hover:bg-muted/30"
          >
            <p className="text-sm font-medium">{report.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{report.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
