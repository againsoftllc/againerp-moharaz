"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Lock,
  LockOpen,
  Pencil,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  CALCULATION_TYPE_LABEL,
  CALCULATION_TYPE_OPTIONS,
  COMPONENT_STATUS_LABEL,
  COMPONENT_STATUS_OPTIONS,
  COMPONENT_TYPE_LABEL,
  COMPONENT_TYPE_OPTIONS,
  calculationHint,
  formatComponentAmount,
  type CalculationType,
  type ComponentStatus,
  type ComponentType,
  type SalaryComponent,
} from "@/lib/mock-data/hrm-salary-components";
import {
  createHrmSalaryComponent,
  deleteHrmSalaryComponent,
  listHrmSalaryComponents,
  updateHrmSalaryComponent,
} from "@/lib/api/hrm-salary-components";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

type FormState = {
  name: string;
  description: string;
  componentType: ComponentType;
  calculationType: CalculationType;
  value: string;
  status: ComponentStatus;
};

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    componentType: "earning",
    calculationType: "fixed",
    value: "0.00",
    status: "active",
  };
}

function formFromRow(row: SalaryComponent): FormState {
  return {
    name: row.name,
    description: row.description,
    componentType: row.componentType,
    calculationType: row.calculationType,
    value: String(row.value),
    status: row.status,
  };
}

function typeBadgeClass(type: ComponentType) {
  return type === "earning"
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "border-rose-500/30 bg-rose-500/15 text-rose-800 dark:text-rose-300";
}

function statusBadgeClass(status: ComponentStatus) {
  return status === "active"
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "border-border bg-muted/40 text-muted-foreground";
}

export function HrmSalaryComponents() {
  const canWrite = useAdminCanWrite();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<SalaryComponent[]>([]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ComponentType>("all");
  const [calcFilter, setCalcFilter] = useState<"all" | CalculationType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ComponentStatus>("all");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedType, setAppliedType] = useState<"all" | ComponentType>("all");
  const [appliedCalc, setAppliedCalc] = useState<"all" | CalculationType>("all");
  const [appliedStatus, setAppliedStatus] = useState<"all" | ComponentStatus>("all");

  const [form, setForm] = useState<FormState>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listHrmSalaryComponents();
      setRows(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load salary components");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (appliedType !== "all") list = list.filter((r) => r.componentType === appliedType);
    if (appliedCalc !== "all") list = list.filter((r) => r.calculationType === appliedCalc);
    if (appliedStatus !== "all") list = list.filter((r) => r.status === appliedStatus);
    const q = appliedSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, appliedSearch, appliedType, appliedCalc, appliedStatus]);

  function applySearch() {
    setAppliedSearch(search);
    setAppliedType(typeFilter);
    setAppliedCalc(calcFilter);
    setAppliedStatus(statusFilter);
  }

  function resetForm() {
    setEditId(null);
    setForm(emptyForm());
  }

  function startEdit(row: SalaryComponent) {
    if (row.locked) {
      toast.error("Component is locked — unlock before editing");
      return;
    }
    setEditId(row.id);
    setForm(formFromRow(row));
  }

  async function toggleLock(row: SalaryComponent) {
    try {
      const updated = await updateHrmSalaryComponent(row.id, {
        ...row,
        locked: !row.locked,
        isMandatory: !row.locked,
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      toast.success(row.locked ? "Component unlocked" : "Component locked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update component");
    }
  }

  async function saveForm() {
    if (!canWrite) return;
    if (!form.name.trim()) {
      toast.error("Component name is required");
      return;
    }
    const value = Math.max(0, Number(form.value) || 0);
    const existing = editId ? rows.find((r) => r.id === editId) : undefined;
    const payload: Omit<SalaryComponent, "id"> = {
      name: form.name.trim(),
      description: form.description.trim(),
      componentType: form.componentType,
      calculationType: form.calculationType,
      value,
      status: form.status,
      locked: existing?.locked ?? false,
      isTaxable: existing?.isTaxable ?? true,
      isMandatory: existing?.isMandatory ?? false,
    };

    setSaving(true);
    try {
      if (editId) {
        const updated = await updateHrmSalaryComponent(editId, payload);
        setRows((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        toast.success("Component updated");
      } else {
        const created = await createHrmSalaryComponent(payload);
        setRows((prev) => [created, ...prev]);
        toast.success("Component created");
      }
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save component");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: SalaryComponent) {
    if (row.locked) {
      toast.error("Unlock before deleting");
      return;
    }
    if (!window.confirm(`Delete “${row.name}”?`)) return;
    try {
      await deleteHrmSalaryComponent(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      if (editId === row.id) resetForm();
      toast.success("Component deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete component");
    }
  }

  const fieldClass =
    "h-9 w-full rounded-none border border-border bg-background px-2 text-sm text-foreground";

  if (loading) {
    return <ContentDataSkeleton label="Loading salary components…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Salary Components
      </h1>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[340px_1fr]">
        {/* Left: Add / Edit form */}
        <div className="flex h-fit flex-col rounded-none border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-semibold text-foreground">
              {editId ? "Edit Component" : "Add New Component"}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {editId
                ? "Update the selected salary component"
                : "Fill in the details to create a new salary component"}
            </p>
          </div>
          <div className="space-y-3 p-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Component Name <span className="text-red-500">*</span>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9 rounded-none"
                placeholder="e.g., Basic Salary, HRA, Tax"
                disabled={!canWrite}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Description
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="min-h-[72px] rounded-none"
                placeholder="Brief description of the component"
                disabled={!canWrite}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Type <span className="text-red-500">*</span>
              <select
                value={form.componentType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    componentType: e.target.value as ComponentType,
                  }))
                }
                className={fieldClass}
                disabled={!canWrite}
              >
                {COMPONENT_TYPE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Calculation Type <span className="text-red-500">*</span>
              <select
                value={form.calculationType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    calculationType: e.target.value as CalculationType,
                  }))
                }
                className={fieldClass}
                disabled={!canWrite}
              >
                {CALCULATION_TYPE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {form.calculationType === "fixed" ? "Fixed Amount" : "Percentage"}{" "}
              <span className="text-red-500">*</span>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                className="h-9 rounded-none"
                disabled={!canWrite}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Status <span className="text-red-500">*</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as ComponentStatus }))
                }
                className={fieldClass}
                disabled={!canWrite}
              >
                {COMPONENT_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            {canWrite ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  className={cn("h-9", GREEN_BTN)}
                  onClick={() => void saveForm()}
                  disabled={saving}
                >
                  {saving ? "Saving…" : editId ? "Save Changes" : "Create Component"}
                </Button>
                {editId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-none"
                    onClick={resetForm}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right: filters + list */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 rounded-none border border-border bg-card p-3">
            <div className="relative min-w-[160px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search components..."
                className="h-9 rounded-none pl-8"
                onKeyDown={(e) => {
                  if (e.key === "Enter") applySearch();
                }}
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "all" | ComponentType)}
              className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
            >
              <option value="all">All Types</option>
              {COMPONENT_TYPE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={calcFilter}
              onChange={(e) => setCalcFilter(e.target.value as "all" | CalculationType)}
              className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
            >
              <option value="all">All Calculations</option>
              {CALCULATION_TYPE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | ComponentStatus)}
              className="h-9 rounded-none border border-border bg-background px-2 text-sm text-foreground"
            >
              <option value="all">All Statuses</option>
              {COMPONENT_STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" className={cn("h-9", GREEN_BTN)} onClick={applySearch}>
              <Search className="size-3.5" />
              Search
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <div className="text-sm font-semibold text-foreground">Salary Components</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Manage your payroll components and their calculation methods
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-muted/60">
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Component
                    </th>
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Type
                    </th>
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Amount
                    </th>
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th className="w-[1%] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-12 text-center text-sm text-muted-foreground"
                      >
                        No salary components found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row) => (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-b border-border last:border-b-0 hover:bg-muted/20",
                          editId === row.id && "bg-muted/30",
                        )}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-start gap-2.5">
                            <div
                              className={cn(
                                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-none border",
                                row.componentType === "earning"
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                  : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
                              )}
                            >
                              {row.componentType === "earning" ? (
                                <TrendingUp className="h-3.5 w-3.5" />
                              ) : (
                                <TrendingDown className="h-3.5 w-3.5" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-foreground">{row.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {row.description || "—"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-none text-[10px] font-normal",
                              typeBadgeClass(row.componentType),
                            )}
                          >
                            {COMPONENT_TYPE_LABEL[row.componentType]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium tabular-nums text-foreground">
                            {formatComponentAmount(row)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {calculationHint(row.calculationType)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-none text-[10px] font-normal",
                                statusBadgeClass(row.status),
                              )}
                            >
                              {COMPONENT_STATUS_LABEL[row.status]}
                            </Badge>
                            {row.locked ? (
                              <Badge
                                variant="outline"
                                className="rounded-none border-amber-500/30 bg-amber-500/15 text-[10px] font-normal text-amber-800 dark:text-amber-300"
                              >
                                Locked
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {canWrite ? (
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-none text-amber-600 dark:text-amber-400"
                                onClick={() => startEdit(row)}
                                aria-label="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-none text-amber-500 dark:text-amber-300"
                                onClick={() => void toggleLock(row)}
                                aria-label={row.locked ? "Unlock" : "Lock"}
                              >
                                {row.locked ? (
                                  <LockOpen className="h-3.5 w-3.5" />
                                ) : (
                                  <Lock className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-none text-red-600 dark:text-red-400"
                                onClick={() => void remove(row)}
                                aria-label="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
