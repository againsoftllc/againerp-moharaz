"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FinanceGridSettingsMenu } from "@/components/finance/finance-grid-settings";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { useApiHealth } from "@/lib/api/use-api-health";
import { fetchFinanceAccounts, type ApiFinanceAccount } from "@/lib/api/finance";
import {
  createAllocationRule,
  deleteAllocationRule,
  fetchAllocationRules,
  fetchCostCenters,
  updateAllocationRule,
  type ApiAllocationRule,
  type ApiCostCenter,
  type AllocationRuleLineInput,
} from "@/lib/api/finance-allocation";
import type { AllocationRuleGridHandle } from "@/components/finance/allocation-rule-grid";

const AllocationRuleGrid = dynamic(
  () => import("@/components/finance/allocation-rule-grid").then((module) => module.AllocationRuleGrid),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening allocation rules…" />,
  },
);

const METHODS = [
  { value: "quantity", label: "Quantity" },
  { value: "percentage", label: "Percentage" },
  { value: "fixed", label: "Fixed" },
  { value: "equal", label: "Equal" },
] as const;

type DraftLine = { cost_center_id: string; basis_value: string; percentage: string; fixed_amount: string };

function emptyLine(costCenterId = ""): DraftLine {
  return { cost_center_id: costCenterId, basis_value: "", percentage: "", fixed_amount: "" };
}

export default function FinanceAllocationRulesPage() {
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<AllocationRuleGridHandle>(null);
  const [rows, setRows] = useState<ApiAllocationRule[]>([]);
  const [centers, setCenters] = useState<ApiCostCenter[]>([]);
  const [accounts, setAccounts] = useState<ApiFinanceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCount, setFilterCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiAllocationRule | null>(null);
  const [name, setName] = useState("");
  const [method, setMethod] = useState<ApiAllocationRule["method"]>("quantity");
  const [unitLabel, setUnitLabel] = useState("");
  const [accountId, setAccountId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rulesRes, centersRes, accountsRes] = await Promise.all([
        fetchAllocationRules(true),
        fetchCostCenters(),
        fetchFinanceAccounts(),
      ]);
      setRows(rulesRes.data);
      setCenters(centersRes.data);
      setAccounts(accountsRes.data.filter((a) => a.account_type === "expense"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load allocation rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "finance-allocation-rules-api" });
  }, [error]);

  function openCreate() {
    setEditing(null);
    setName("");
    setMethod("quantity");
    setUnitLabel("Light Point");
    setAccountId("");
    setLines(centers.slice(0, 3).map((c) => emptyLine(c.id)));
    if (centers.length === 0) setLines([emptyLine()]);
    setOpen(true);
  }

  function openEdit(row: ApiAllocationRule) {
    setEditing(row);
    setName(row.name);
    setMethod(row.method);
    setUnitLabel(row.unit_label);
    setAccountId(row.account_id ?? "");
    setLines(
      row.lines.map((line) => ({
        cost_center_id: line.cost_center_id,
        basis_value: line.basis_value,
        percentage: line.percentage,
        fixed_amount: line.fixed_amount,
      })),
    );
    setOpen(true);
  }

  function payloadLines(): AllocationRuleLineInput[] {
    return lines
      .filter((line) => line.cost_center_id)
      .map((line) => ({
        cost_center_id: line.cost_center_id,
        basis_value: Number(line.basis_value || 0),
        percentage: Number(line.percentage || 0),
        fixed_amount: Number(line.fixed_amount || 0),
      }));
  }

  async function handleSave() {
    const ruleLines = payloadLines();
    if (!name.trim() || ruleLines.length === 0) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        method,
        unit_label: unitLabel.trim(),
        account_id: accountId || null,
        lines: ruleLines,
      };
      if (editing) {
        await updateAllocationRule(editing.id, body);
        toast.success("Rule updated");
      } else {
        await createAllocationRule(body);
        toast.success("Rule created");
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save rule");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: ApiAllocationRule) {
    if (!window.confirm(`Delete allocation rule “${row.name}”?`)) return;
    try {
      await deleteAllocationRule(row.id);
      toast.success("Rule deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cannot delete this rule");
    }
  }

  const headerLeftActions = (
    <ListGridHeaderStart title="Allocation rules">
      <FinanceGridSettingsMenu
        apiHealth={apiHealth}
        loading={loading}
        filterCount={filterCount}
        onRefresh={() => {
          void load();
          apiHealth.recheck();
        }}
        onFilters={() => gridRef.current?.openFilters()}
        onColumns={() => gridRef.current?.openColumns()}
        onExport={() => gridRef.current?.exportCsv()}
        onResetFilters={() => gridRef.current?.resetFilters()}
      />
      {canWrite ? (
        <Button size="sm" className="h-[26px] rounded-none" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New
        </Button>
      ) : null}
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <AllocationRuleGrid
        ref={gridRef}
        rows={rows}
        loading={loading && rows.length === 0}
        canWrite={canWrite}
        onFilterCountChange={setFilterCount}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading ? "Loading…" : `${rows.length} rules`}
          </span>
        }
        onEdit={openEdit}
        onDelete={(row) => void handleDelete(row)}
      />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          title={editing ? "Edit allocation rule" : "New allocation rule"}
          resizable
          closeButton="inside"
          resizeMaxWidth={720}
          className="min-w-[160px] w-[560px] max-w-[720px] overflow-y-auto rounded-none"
        >
          <h2 className="pr-8 text-base font-semibold">{editing ? "Edit allocation rule" : "New allocation rule"}</h2>
          <div className="mt-4 space-y-3.5">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Electricity — Light Point" disabled={saving} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Method</Label>
                <Select value={method} onChange={(e) => setMethod(e.target.value as ApiAllocationRule["method"])} className="w-full rounded-none" disabled={saving}>
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Unit label</Label>
                <Input value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} placeholder="Light Point" disabled={saving} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>GL account (optional)</Label>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-none" disabled={saving}>
                <option value="">Any expense account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label>Lines</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-none"
                  onClick={() => setLines((prev) => [...prev, emptyLine(centers[0]?.id ?? "")])}
                  disabled={saving}
                >
                  Add concern
                </Button>
              </div>
              <div className="border border-border">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Concern</th>
                      {method === "quantity" ? <th className="px-2 py-1.5 font-medium">Units</th> : null}
                      {method === "percentage" ? <th className="px-2 py-1.5 font-medium">%</th> : null}
                      {method === "fixed" ? <th className="px-2 py-1.5 font-medium">Amount</th> : null}
                      <th className="w-8 px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => (
                      <tr key={`${line.cost_center_id}-${index}`} className="border-t border-border">
                        <td className="px-2 py-1.5">
                          <Select
                            value={line.cost_center_id}
                            onChange={(e) =>
                              setLines((prev) => prev.map((row, i) => (i === index ? { ...row, cost_center_id: e.target.value } : row)))
                            }
                            className="w-full rounded-none"
                            disabled={saving}
                          >
                            <option value="">Select</option>
                            {centers.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.code} {c.name}
                              </option>
                            ))}
                          </Select>
                        </td>
                        {method === "quantity" ? (
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.basis_value}
                              onChange={(e) =>
                                setLines((prev) => prev.map((row, i) => (i === index ? { ...row, basis_value: e.target.value } : row)))
                              }
                              className="h-7 rounded-none"
                              disabled={saving}
                            />
                          </td>
                        ) : null}
                        {method === "percentage" ? (
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.percentage}
                              onChange={(e) =>
                                setLines((prev) => prev.map((row, i) => (i === index ? { ...row, percentage: e.target.value } : row)))
                              }
                              className="h-7 rounded-none"
                              disabled={saving}
                            />
                          </td>
                        ) : null}
                        {method === "fixed" ? (
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.fixed_amount}
                              onChange={(e) =>
                                setLines((prev) => prev.map((row, i) => (i === index ? { ...row, fixed_amount: e.target.value } : row)))
                              }
                              className="h-7 rounded-none"
                              disabled={saving}
                            />
                          </td>
                        ) : null}
                        <td className="px-2 py-1.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 rounded-none"
                            disabled={saving || lines.length <= 1}
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2 border-t border-input pt-4">
            <Button variant="outline" size="sm" className="rounded-none" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-none"
              onClick={() => void handleSave()}
              disabled={saving || !name.trim() || payloadLines().length === 0}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
