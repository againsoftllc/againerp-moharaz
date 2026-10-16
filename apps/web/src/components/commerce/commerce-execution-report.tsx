"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, ScrollText } from "lucide-react";

import type { AuditEntry } from "@/lib/commerce/commerce-audit.types";
import type { CommerceRunOutcome } from "@/lib/commerce/commerce-run-outcome";
import { cn, formatCurrency, formatTime } from "@/lib/utils";

export type CommerceRunSummary = {
  runId: string;
  status: string;
  sourceUrl: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  totalEntries: number;
  decisionCount: number;
  errorCount: number;
  productId?: string;
  productName?: string;
  productSku?: string;
  productPageUrl?: string;
  outcome?: CommerceRunOutcome;
  audit: AuditEntry[];
  decisions: AuditEntry[];
  error?: { message: string; step?: string; phase?: string };
};

type Props = {
  summary: CommerceRunSummary;
  variant?: "success" | "failure" | "neutral";
};

function formatDuration(ms?: number) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function levelClass(level: AuditEntry["level"]) {
  switch (level) {
    case "success":
      return "text-emerald-700";
    case "error":
      return "text-red-600";
    case "warning":
      return "text-amber-700";
    case "decision":
      return "text-primary";
    case "action":
      return "text-foreground";
    default:
      return "text-muted-foreground";
  }
}

function formatTime(ts: number) {
  return formatTime(ts);
}

function brandStatusLabel(status: "existing" | "created" | "skipped" | "unknown") {
  switch (status) {
    case "existing":
      return "existing";
    case "created":
      return "created";
    case "skipped":
      return "skipped";
    default:
      return "resolved";
  }
}

function formatPrice(price?: CommerceRunOutcome["price"]) {
  if (!price) return "—";
  return formatCurrency(price.amount, price.currency);
}

export function CommerceExecutionReport({ summary, variant = "neutral" }: Props) {
  const isSuccess = variant === "success" || summary.status === "completed";
  const isFailure = variant === "failure" || summary.status === "failed";
  const outcome = summary.outcome;

  return (
    <div
      className={cn(
        "space-y-3 rounded-md border p-3 text-xs",
        isSuccess && "border-emerald-500/30 bg-emerald-500/5",
        isFailure && "border-red-500/30 bg-red-500/5",
        !isSuccess && !isFailure && "border-input bg-background",
      )}
      data-component="COMMERCE-EXECUTION-REPORT"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {isSuccess ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
          ) : isFailure ? (
            <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden />
          ) : (
            <ScrollText className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
          <div>
            <p className="font-semibold">
              {isSuccess ? "MVP run completed" : isFailure ? "MVP run failed" : "MVP execution log"}
            </p>
            <p className="text-[10px] text-muted-foreground">Run {summary.runId.slice(0, 8)}…</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden />
          {formatDuration(summary.durationMs)}
        </div>
      </div>

      {summary.productPageUrl && summary.productId ? (
        <Link
          href={summary.productPageUrl}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90"
        >
          Open product page
          <ExternalLink className="h-3 w-3" aria-hidden />
        </Link>
      ) : null}

      {isSuccess && outcome ? (
        <div className="space-y-1 rounded border bg-background/80 p-2 font-mono text-[10px] leading-relaxed">
          <p className="font-sans text-xs font-semibold text-emerald-800">Product imported successfully</p>
          <p>Name: {outcome.name ?? summary.productName ?? "—"}</p>
          <p>SKU: {outcome.sku ?? summary.productSku ?? "—"}</p>
          <p>Price: {formatPrice(outcome.price)}</p>
          {outcome.brand ? (
            <p>
              Brand: {outcome.brand.name} ({brandStatusLabel(outcome.brand.status)})
            </p>
          ) : null}
          {outcome.categoryPath?.length ? <p>Category: {outcome.categoryPath.join(" › ")}</p> : null}
          {outcome.imagesCount != null ? <p>Images: {outcome.imagesCount} uploaded</p> : null}
          {outcome.attributesTotal != null ? (
            <p>
              Attributes: {outcome.attributesTotal} fields
              {outcome.attributesCreated != null ? ` (${outcome.attributesCreated} new)` : ""}
            </p>
          ) : null}
          <p className="truncate">Source: {summary.sourceUrl}</p>
          <p>Duration: {formatDuration(summary.durationMs)}</p>
          <p>Task ID: {summary.runId.slice(0, 8)}…</p>
        </div>
      ) : null}

      {summary.error ? (
        <p className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1.5 text-red-700">
          {summary.error.message}
        </p>
      ) : null}

      {summary.decisions.length > 0 ? (
        <div>
          <p className="mb-1 font-medium">AI decisions ({summary.decisionCount})</p>
          <ul className="space-y-1 rounded border bg-muted/20 p-2">
            {summary.decisions.map((entry) => (
              <li key={entry.id} className={cn("leading-relaxed", levelClass(entry.level))}>
                <span className="text-[10px] text-muted-foreground">{formatTime(entry.ts)} · </span>
                {entry.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="rounded border bg-muted/10 p-2">
        <summary className="cursor-pointer font-medium">
          Full execution log ({summary.totalEntries} entries)
        </summary>
        <ol className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {summary.audit.map((entry) => (
            <li key={entry.id} className="flex gap-2 leading-relaxed">
              <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(entry.ts)}</span>
              <span className={cn("uppercase text-[9px] font-medium", levelClass(entry.level))}>{entry.phase}</span>
              <span className={levelClass(entry.level)}>{entry.message}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
