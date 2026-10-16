"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchCompanyAiUsage,
  fetchMyAiUsage,
  type ApiAiUsageSummary,
} from "@/lib/api/ai-usage";
import { usePermission } from "@/lib/auth/permissions";
import { formatCurrency } from "@/lib/utils";

const DAY_RANGES = [7, 30, 90];

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border bg-background/60 p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: [string, ApiAiUsageSummary["by_provider"][string]][];
}) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort(
    (a, b) =>
      (b[1].input_tokens ?? 0) + (b[1].output_tokens ?? 0) - ((a[1].input_tokens ?? 0) + (a[1].output_tokens ?? 0)),
  );
  return (
    <div className="border border-border">
      <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold">
        {title}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Calls</TableHead>
            <TableHead>Input tokens</TableHead>
            <TableHead>Output tokens</TableHead>
            <TableHead>Total tokens</TableHead>
            <TableHead>Errors</TableHead>
            <TableHead>Est. cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map(([name, entry]) => (
            <TableRow key={name}>
              <TableCell className="font-mono text-xs">{name}</TableCell>
              <TableCell>{entry.calls ?? "—"}</TableCell>
              <TableCell>{entry.input_tokens?.toLocaleString() ?? "—"}</TableCell>
              <TableCell>{entry.output_tokens?.toLocaleString() ?? "—"}</TableCell>
              <TableCell className="font-semibold">
                {((entry.input_tokens ?? 0) + (entry.output_tokens ?? 0)).toLocaleString()}
              </TableCell>
              <TableCell>{entry.errors ?? "—"}</TableCell>
              <TableCell>
                {entry.estimated_cost_usd != null ? formatCurrency(entry.estimated_cost_usd, "USD") : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Token/cost visibility for the AI OS (app/services/ai/usage_service.py) — read-only,
 * estimated from ai_audit_logs, not a billing system (master plan §25).
 */
export function WorkspaceAiUsagePanel() {
  const canSeeCompany = usePermission("workspace", "read");
  const [scope, setScope] = useState<"me" | "company">("me");
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<ApiAiUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextScope: "me" | "company", nextDays: number) => {
    setLoading(true);
    try {
      const data =
        nextScope === "company" ? await fetchCompanyAiUsage(nextDays) : await fetchMyAiUsage(nextDays);
      setSummary(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load AI usage");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(scope, days);
  }, [scope, days, load]);

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">AI usage</h1>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Token counts and estimated cost from the AI assistant, aggregated from the audit
            log. An estimate for trend visibility, not an invoice.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {DAY_RANGES.map((d) => (
            <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {canSeeCompany ? (
        <div className="mt-4 flex items-center gap-1.5">
          <Button size="sm" variant={scope === "me" ? "default" : "outline"} onClick={() => setScope("me")}>
            My usage
          </Button>
          <Button
            size="sm"
            variant={scope === "company" ? "default" : "outline"}
            onClick={() => setScope("company")}
          >
            Whole company
          </Button>
        </div>
      ) : null}

      {loading ? (
        <p className="mt-6 text-xs text-muted-foreground">Loading…</p>
      ) : !summary ? (
        <p className="mt-6 text-xs text-muted-foreground">No usage yet.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Chat turns" value={summary.chat_turns.toLocaleString()} />
            <StatCard
              label="Tool calls"
              value={summary.tool_calls.toLocaleString()}
              hint={summary.tool_errors ? `${summary.tool_errors} failed` : undefined}
            />
            <StatCard
              label="Tokens (in / out)"
              value={`${summary.total_input_tokens.toLocaleString()} / ${summary.total_output_tokens.toLocaleString()}`}
              hint={
                summary.total_cache_read_tokens
                  ? `${summary.total_cache_read_tokens.toLocaleString()} cache-read`
                  : undefined
              }
            />
            <StatCard
              label="Estimated cost"
              value={formatCurrency(summary.estimated_cost_usd, "USD")}
              hint={summary.estimated_cost_is_partial ? "Partial — includes an unpriced model" : undefined}
            />
          </div>

          <div className="space-y-4">
            <BreakdownTable title="By tool" rows={Object.entries(summary.by_tool)} />
          </div>
        </div>
      )}
    </div>
  );
}
