"use client";

import type { FieldTrace, ValidationResult } from "../../mapper/validation";
import { Card } from "../ui";
import { cn } from "../../utils";

export function MappingDebugPanel({
  validation,
  traces,
}: {
  validation: ValidationResult;
  traces: FieldTrace[];
}) {
  const mapped = traces.filter((t) => t.status === "mapped");
  const missing = traces.filter((t) => t.status === "missing");
  const ignored = traces.filter((t) => t.status === "ignored");

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              validation.valid
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-destructive/15 text-destructive",
            )}
          >
            {validation.valid ? "Valid" : "Has errors"}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {validation.issues.length} issue(s) · {mapped.length} mapped · {missing.length} missing ·{" "}
            {ignored.length} ignored
          </span>
        </div>
        {validation.issues.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {validation.issues.map((issue, i) => (
              <li
                key={`${issue.field}-${i}`}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px]",
                  issue.severity === "error"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-amber-500/10 text-amber-800 dark:text-amber-200",
                )}
              >
                <span className="font-medium">{issue.kind}</span> · {issue.field}: {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <TraceColumn title="Mapped" items={mapped} tone="mapped" />
        <TraceColumn title="Missing" items={missing} tone="missing" />
        <TraceColumn title="Ignored" items={ignored} tone="ignored" />
      </div>
    </div>
  );
}

function TraceColumn({
  title,
  items,
  tone,
}: {
  title: string;
  items: FieldTrace[];
  tone: "mapped" | "missing" | "ignored";
}) {
  const toneClass =
    tone === "mapped"
      ? "border-emerald-500/30"
      : tone === "missing"
        ? "border-amber-500/30"
        : "border-border";

  return (
    <Card className={cn("overflow-hidden", toneClass)}>
      <div className="border-b border-border px-3 py-2 text-xs font-semibold text-foreground">
        {title} ({items.length})
      </div>
      <div className="max-h-48 overflow-auto p-2">
        {items.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">None</p>
        ) : (
          <ul className="space-y-1">
            {items.map((t, i) => (
              <li key={`${t.sourcePath}-${i}`} className="rounded bg-muted/30 px-2 py-1 text-[10px]">
                <p className="font-medium text-foreground">{t.universalField}</p>
                <p className="text-muted-foreground">← {t.sourcePath}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
