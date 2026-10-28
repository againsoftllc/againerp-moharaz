"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/native-select";
import {
  fetchSequences,
  updateSequence,
  type ApiSequence,
} from "@/lib/api/workspace-sequences";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";

/**
 * Document numbering — one locked counter per document type, so two concurrent
 * orders can never share a number and a deleted record never frees its number.
 */
type Draft = Pick<ApiSequence, "prefix" | "suffix" | "padding" | "next_number" | "reset_policy">;

const RESET_LABELS: Record<ApiSequence["reset_policy"], string> = {
  never: "Never",
  yearly: "Every fiscal year",
  monthly: "Every month",
};

export function WorkspaceSequencesPanel({ embedded = false }: { embedded?: boolean }) {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<ApiSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchSequences());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load sequences");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(row: ApiSequence) {
    setEditing(row.code);
    setDraft({
      prefix: row.prefix,
      suffix: row.suffix,
      padding: row.padding,
      next_number: row.next_number,
      reset_policy: row.reset_policy,
    });
  }

  async function save(code: string) {
    if (!draft) return;
    setSaving(true);
    try {
      const updated = await updateSequence(code, draft);
      setRows((prev) => prev.map((r) => (r.code === code ? updated : r)));
      setEditing(null);
      setDraft(null);
      toast.success("Numbering updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={embedded ? undefined : "p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {embedded ? null : <h1 className="page-title">Document numbering</h1>}
          <p className={embedded ? "max-w-2xl text-[11px] text-muted-foreground" : "mt-1 max-w-2xl text-xs text-muted-foreground"}>
            Each document type draws from its own locked counter, so concurrent users never get the
            same number. Prefix and suffix accept {"{YYYY}"}, {"{YY}"} and {"{MM}"} tokens.
          </p>
        </div>
        <Button variant="outline" size="sm" className="rounded-none" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="mt-4 overflow-x-auto border border-border">
        <table className="w-full min-w-[860px] text-xs">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Document type</th>
              <th className="px-3 py-2 font-medium">Prefix</th>
              <th className="px-3 py-2 font-medium">Suffix</th>
              <th className="px-3 py-2 font-medium">Digits</th>
              <th className="px-3 py-2 font-medium">Next no.</th>
              <th className="px-3 py-2 font-medium">Resets</th>
              <th className="px-3 py-2 font-medium">Next number</th>
              <th className="px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isEditing = editing === row.code;
                return (
                  <tr key={row.code} className="border-t border-border align-middle">
                    <td className="px-3 py-1.5">
                      <div className="font-medium">{row.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{row.code}</div>
                    </td>
                    <td className="px-3 py-1.5">
                      {isEditing && draft ? (
                        <Input
                          className="h-7 w-[110px]"
                          value={draft.prefix}
                          onChange={(e) => setDraft({ ...draft, prefix: e.target.value })}
                        />
                      ) : (
                        <span className="font-mono">{row.prefix || "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {isEditing && draft ? (
                        <Input
                          className="h-7 w-[80px]"
                          value={draft.suffix}
                          onChange={(e) => setDraft({ ...draft, suffix: e.target.value })}
                        />
                      ) : (
                        <span className="font-mono">{row.suffix || "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {isEditing && draft ? (
                        <Input
                          type="number"
                          min="0"
                          max="12"
                          className="h-7 w-[70px]"
                          value={draft.padding}
                          onChange={(e) => setDraft({ ...draft, padding: Number(e.target.value) })}
                        />
                      ) : (
                        row.padding
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {isEditing && draft ? (
                        <Input
                          type="number"
                          min="1"
                          className="h-7 w-[100px]"
                          value={draft.next_number}
                          onChange={(e) =>
                            setDraft({ ...draft, next_number: Number(e.target.value) })
                          }
                        />
                      ) : (
                        row.next_number
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {isEditing && draft ? (
                        <Select
                          className="h-7 w-[150px]"
                          value={draft.reset_policy}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              reset_policy: e.target.value as ApiSequence["reset_policy"],
                            })
                          }
                        >
                          <option value="never">Never</option>
                          <option value="yearly">Every fiscal year</option>
                          <option value="monthly">Every month</option>
                        </Select>
                      ) : (
                        <span className="text-muted-foreground">
                          {RESET_LABELS[row.reset_policy]}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge variant="secondary" className="font-mono">
                        {row.preview}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {!canWrite ? null : isEditing ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" disabled={saving} onClick={() => void save(row.code)}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditing(null);
                              setDraft(null);
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => startEdit(row)}>
                          Edit
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Lowering “Next no.” below a number already issued is rejected at save time by the document’s
        own uniqueness check — raise it instead to skip a block of numbers.
      </p>
    </div>
  );
}
