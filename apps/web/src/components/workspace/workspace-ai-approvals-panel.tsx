"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
  fetchAiApprovals,
  resolveAiApproval,
  type AiApprovalRisk,
  type AiApprovalStatus,
  type ApiAiApproval,
} from "@/lib/api/ai-approvals";
import { useCanManageWorkspace, usePermission } from "@/lib/auth/permissions";

const FILTERS: { id: AiApprovalStatus | "all"; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

function riskVariant(risk: AiApprovalRisk) {
  if (risk === "financial" || risk === "delete" || risk === "sensitive") return "warning" as const;
  if (risk === "read") return "muted" as const;
  return "outline" as const;
}

function statusVariant(status: AiApprovalStatus) {
  if (status === "approved") return "success" as const;
  if (status === "rejected") return "warning" as const;
  return "outline" as const;
}

/**
 * What the AI wanted to do but couldn't — over an approval_limits ceiling, so it created
 * this row instead of executing (app/services/ai/approval_gate.py). Resolving here is a
 * status transition only; it does not re-run the original tool call.
 */
export function WorkspaceAiApprovalsPanel() {
  const canRead = usePermission("workspace", "read");
  const canManage = useCanManageWorkspace();
  const [filter, setFilter] = useState<AiApprovalStatus | "all">("pending");
  const [rows, setRows] = useState<ApiAiApproval[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async (nextFilter: AiApprovalStatus | "all") => {
    setLoading(true);
    try {
      const { rows: data, meta } = await fetchAiApprovals(
        nextFilter === "all" ? undefined : nextFilter,
      );
      setRows(data);
      setPendingCount(meta.pending_count);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load AI approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canRead) return;
    void load(filter);
  }, [filter, load, canRead]);

  async function resolve(id: string, status: "approved" | "rejected") {
    setResolvingId(id);
    try {
      const updated = await resolveAiApproval(id, status);
      setRows((prev) => (filter === "all" ? prev.map((r) => (r.id === id ? updated : r)) : prev.filter((r) => r.id !== id)));
      setPendingCount((n) => Math.max(0, n - 1));
      toast.success(`${updated.tool} — ${status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resolve approval");
    } finally {
      setResolvingId(null);
    }
  }

  if (!canRead) {
    return (
      <div className="rounded-none border border-border/60 bg-card p-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Workspace access required</p>
        <p className="mt-1">Only users with workspace read permission can view AI approvals.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">AI approvals</h1>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            AI tool calls that exceeded an approval limit and were routed here instead of
            executing. Resolving records your decision — it does not re-run the original action.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load(filter)}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-1.5">
        {FILTERS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filter === f.id ? "default" : "outline"}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            {f.id === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="mt-6 text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-xs text-muted-foreground">No {filter === "all" ? "" : filter} approvals.</p>
      ) : (
        <div className="mt-4 border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requested</TableHead>
                <TableHead>Tool</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(row.requested_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.tool}</TableCell>
                  <TableCell className="max-w-md text-xs">
                    <p className="text-foreground">{row.summary}</p>
                    <p className="mt-0.5 text-muted-foreground">{row.reason}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={riskVariant(row.risk)}>{row.risk}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                    {row.resolved_by ? (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">by {row.resolved_by}</p>
                    ) : null}
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      {row.status === "pending" ? (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            disabled={resolvingId === row.id}
                            onClick={() => void resolve(row.id, "approved")}
                          >
                            {resolvingId === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              "Approve"
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={resolvingId === row.id}
                            onClick={() => void resolve(row.id, "rejected")}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
