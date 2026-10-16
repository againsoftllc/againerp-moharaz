"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { TableColumn, TableRow } from "@/lib/dashboard/types";

type Props = {
  columns: TableColumn[];
  rows: TableRow[];
  maxRows?: number;
  viewAllHref?: string;
  className?: string;
};

/** DS-TABLE compact widget — top N rows with drill link. */
export function TableWidget({ columns, rows, maxRows = 5, viewAllHref, className }: Props) {
  const visible = rows.slice(0, maxRows);

  return (
    <div data-component="DS-TABLE" className={cn("space-y-2", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              {columns.map((col) => (
                <th key={col.key} className={cn("pb-1.5 pr-2 font-medium", col.align === "right" && "text-right")}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={i} className="border-b border-border/50 last:border-0">
                {columns.map((col) => (
                  <td key={col.key} className={cn("py-1.5 pr-2", col.align === "right" && "text-right")}>
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {viewAllHref && rows.length > maxRows ? (
        <Link href={viewAllHref} className="text-[11px] text-primary hover:underline">
          View all ({rows.length})
        </Link>
      ) : null}
    </div>
  );
}
