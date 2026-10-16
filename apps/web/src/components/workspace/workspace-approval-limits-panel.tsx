"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchApprovalLimits,
  saveApprovalLimit,
  type ApiApprovalLimit,
  type ApprovalLimitMeta,
} from "@/lib/api/approval-limits";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { formatCurrency } from "@/lib/utils";

/**
 * Approval ceilings per role and document. A blank cell means unlimited, so
 * nothing is restricted until a number is entered here.
 */
export function WorkspaceApprovalLimitsPanel() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<ApiApprovalLimit[]>([]);
  const [meta, setMeta] = useState<ApprovalLimitMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { rows: data, meta: m } = await fetchApprovalLimits();
      setRows(data);
      setMeta(m);
      setDrafts(
        Object.fromEntries(
          data.map((r) => [`${r.role_slug}|${r.document_type}`, r.max_amount ?? ""]),
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load approval limits");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byRole = useMemo(() => {
    const map = new Map<string, ApiApprovalLimit[]>();
    for (const row of rows) {
      const list = map.get(row.role_slug) ?? [];
      list.push(row);
      map.set(row.role_slug, list);
    }
    return map;
  }, [rows]);

  async function save(row: ApiApprovalLimit) {
    const key = `${row.role_slug}|${row.document_type}`;
    const raw = (drafts[key] ?? "").trim();
    const amount = raw === "" ? null : Number(raw);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      toast.error("Enter a positive amount, or leave blank for unlimited");
      return;
    }
    setSavingKey(key);
    try {
      const updated = await saveApprovalLimit(row.role_slug, row.document_type, amount);
      setRows((prev) =>
        prev.map((r) =>
          r.role_slug === row.role_slug && r.document_type === row.document_type ? updated : r,
        ),
      );
      toast.success(
        amount === null
          ? `${row.role_name} · ${row.document_label} — unlimited`
          : `${row.role_name} · ${row.document_label} — ${formatCurrency(amount)}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save limit");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Approval limits</h1>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            The most a role may approve on a single document. Leave a field blank for unlimited.
            Checked when an expense is approved and when a sales or purchase order is confirmed;
            a user with several roles gets the highest of them.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <p className="mt-6 text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-4 space-y-4">
          {[...byRole.entries()].map(([slug, list]) => (
            <div key={slug} className="border border-border">
              <div className="border-b border-border bg-muted/40 px-3 py-2">
                <span className="text-xs font-semibold">{list[0]?.role_name ?? slug}</span>
                <span className="ml-2 font-mono text-[10px] text-muted-foreground">{slug}</span>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {list.map((row) => {
                    const key = `${row.role_slug}|${row.document_type}`;
                    return (
                      <tr key={key} className="border-t border-border first:border-t-0">
                        <td className="px-3 py-1.5">{row.document_label}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {row.max_amount ? formatCurrency(Number(row.max_amount)) : "Unlimited"}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {canWrite && (
                            <div className="flex items-center justify-end gap-1.5">
                              <Input
                                type="number"
                                min="0"
                                placeholder="Unlimited"
                                className="h-7 w-[140px]"
                                value={drafts[key] ?? ""}
                                onChange={(e) =>
                                  setDrafts((d) => ({ ...d, [key]: e.target.value }))
                                }
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={savingKey === key}
                                onClick={() => void save(row)}
                              >
                                Save
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {meta && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {meta.roles.length} roles × {meta.documents.length} document types.
        </p>
      )}
    </div>
  );
}
