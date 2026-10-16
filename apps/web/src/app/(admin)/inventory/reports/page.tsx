"use client";

import Link from "next/link";
import { INVENTORY_REPORTS } from "@/lib/inventory/inventory-nav";

export default function InventoryReportsHubPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background px-4 py-4">
      <h1 className="text-sm font-semibold">Inventory reports</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Built from stock levels, the movement ledger, and the serial registry.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {INVENTORY_REPORTS.map((report) => (
          <Link
            key={report.id}
            href={report.href}
            className="rounded-none border border-border bg-background px-4 py-3 hover:bg-muted/30"
          >
            <p className="text-sm font-medium">{report.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{report.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
