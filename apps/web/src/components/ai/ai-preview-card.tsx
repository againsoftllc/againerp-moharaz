"use client";

import * as React from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One review card for every AI action that previews before it changes data (docs/AI/ai.md step 1.2): a quotation, a purchase
 * order, an expense, an order confirmation, a lead, a product edit ... The server sends `{ status: "preview", preview: {...} }`; this
 * shows it as a readable card (title, the fields, line items as a table) with Accept / Deny, instead of a paragraph the model wrote.
 */

type Json = unknown;
const MONEY_KEY = /(total|amount|price|subtotal|tax|discount|cost|value|balance|paid|due)/i;
const HIDDEN_KEY = /^(id|.*_id|action|note|notes_for_model)$/i;
const MAX_COLUMNS = 6;

const humanize = (s: string) => {
  const t = s.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function isObject(v: Json): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function scalar(key: string, v: Json): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && MONEY_KEY.test(key))) {
    const n = Number(v);
    if (Number.isFinite(n)) return MONEY_KEY.test(key) ? `৳${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : n.toLocaleString("en-US");
  }
  return String(v);
}

function Value({ k, v }: { k: string; v: Json }) {
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-muted-foreground">—</span>;
    if (v.every(isObject)) {
      const rows = v as Record<string, Json>[];
      const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).filter((c) => !HIDDEN_KEY.test(c)).slice(0, MAX_COLUMNS);
      return (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                {cols.map((c) => (
                  <th key={c} className="px-2 py-1 text-left font-medium">
                    {humanize(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  {cols.map((c) => (
                    <td key={c} className={cn("px-2 py-1", MONEY_KEY.test(c) && "text-right tabular-nums")}>
                      {isObject(r[c]) || Array.isArray(r[c]) ? JSON.stringify(r[c]) : scalar(c, r[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return <span>{v.map((x) => (isObject(x) ? JSON.stringify(x) : scalar(k, x))).join(", ")}</span>;
  }
  if (isObject(v)) {
    const entries = Object.entries(v).filter(([ek, ev]) => !HIDDEN_KEY.test(ek) && ev !== null && ev !== "");
    return (
      <span>
        {entries.map(([ek, ev], i) => (
          <React.Fragment key={ek}>
            {i > 0 ? " · " : ""}
            <span className="text-muted-foreground">{humanize(ek)}:</span> {isObject(ev) || Array.isArray(ev) ? JSON.stringify(ev) : scalar(ek, ev)}
          </React.Fragment>
        ))}
      </span>
    );
  }
  return <span className={cn(MONEY_KEY.test(k) && "font-semibold tabular-nums")}>{scalar(k, v)}</span>;
}

export function AiPreviewCard({
  tool,
  preview,
  busy,
  onAccept,
  onDeny,
}: {
  tool: string;
  preview: Record<string, Json>;
  busy?: boolean;
  onAccept: () => void;
  onDeny: () => void;
}) {
  const title = typeof preview.action === "string" && preview.action ? preview.action : humanize(tool);
  const entries = Object.entries(preview).filter(([k, v]) => !HIDDEN_KEY.test(k) && v !== null && v !== undefined && v !== "");
  const wide = (v: Json) => Array.isArray(v) || (isObject(v) && Object.keys(v).length > 3);
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-card p-3 text-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Review before it is done</p>
      <p className="font-semibold">{title}</p>
      <dl className="space-y-2">
        {entries.map(([k, v]) => (
          <div key={k} className={cn(wide(v) ? "space-y-1" : "grid grid-cols-[9rem_1fr] items-baseline gap-2")}>
            <dt className="text-xs text-muted-foreground">{humanize(k)}</dt>
            <dd className="min-w-0 break-words">
              <Value k={k} v={v} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-muted-foreground">Nothing is done until you press Accept.</p>
      <div className="flex gap-2">
        <Button size="sm" className="h-8 rounded-full px-3" disabled={busy} onClick={onAccept}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} Accept
        </Button>
        <Button size="sm" variant="outline" className="h-8 rounded-full px-3" disabled={busy} onClick={onDeny}>
          <X className="mr-1 h-3.5 w-3.5" /> Deny
        </Button>
      </div>
    </div>
  );
}
