"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { ApiExpense, ApiExpenseCategory, ExpenseCreateInput } from "@/lib/api/expenses";
import type { ApiFinanceAccount, ApiFinancePaymentAccount } from "@/lib/api/finance";
import {
  previewAllocationRule,
  type ApiAllocationPreview,
  type ApiAllocationRule,
} from "@/lib/api/finance-allocation";
import { searchLinkableParties, type PartySearchResult } from "@/lib/api/party-search";
import { formatCurrency } from "@/lib/utils";

const PARTY_ROLE_LABEL: Record<PartySearchResult["role"], string> = {
  customer: "Customer",
  supplier: "Supplier",
  vendor: "Vendor",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function moneyLabel(value: number) {
  return formatCurrency(value);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ApiExpenseCategory[];
  paymentAccounts: ApiFinancePaymentAccount[];
  glAccounts: ApiFinanceAccount[];
  allocationRules: ApiAllocationRule[];
  expense: ApiExpense | null;
  canWrite?: boolean;
  /** Pre-links a new expense to this party (e.g. opened from a Customer/Supplier/Vendor's Expense tab). */
  initialPartyId?: string | null;
  initialPartyLabel?: string | null;
  onCreate: (input: ExpenseCreateInput) => Promise<void>;
  onSave: (id: string, patch: ExpenseCreateInput) => Promise<void>;
};

export function ExpenseDrawer({
  open,
  onOpenChange,
  categories,
  paymentAccounts,
  glAccounts,
  allocationRules,
  expense,
  canWrite = true,
  initialPartyId = null,
  initialPartyLabel = null,
  onCreate,
  onSave,
}: Props) {
  const isEdit = Boolean(expense);
  const readOnly = Boolean(expense && expense.status !== "draft" && expense.status !== "approved");
  const [categoryId, setCategoryId] = React.useState("");
  const [payee, setPayee] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [expenseDate, setExpenseDate] = React.useState(todayIso());
  const [amount, setAmount] = React.useState("");
  const [taxAmount, setTaxAmount] = React.useState("0");
  const [paymentAccountId, setPaymentAccountId] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [ruleId, setRuleId] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [partyId, setPartyId] = React.useState<string | null>(null);
  const [linkedPartyLabel, setLinkedPartyLabel] = React.useState<string | null>(null);
  const [partyQuery, setPartyQuery] = React.useState("");
  const [partyResults, setPartyResults] = React.useState<PartySearchResult[]>([]);
  const [partySearching, setPartySearching] = React.useState(false);
  const [partyDropdownOpen, setPartyDropdownOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [preview, setPreview] = React.useState<ApiAllocationPreview | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [editAmounts, setEditAmounts] = React.useState<Record<string, string>>({});

  const defaultAccountId = paymentAccounts.find((a) => a.is_default)?.id ?? paymentAccounts[0]?.id ?? "";
  const expenseAccounts = glAccounts.filter((a) => a.account_type === "expense");
  const selectedRule = allocationRules.find((r) => r.id === ruleId) ?? null;
  const disabled = saving || readOnly || !canWrite;

  React.useEffect(() => {
    if (!open) return;
    if (expense) {
      setCategoryId(expense.category_id);
      setPayee(expense.payee);
      setDescription(expense.description);
      setExpenseDate(expense.expense_date);
      setAmount(expense.amount);
      setTaxAmount(expense.tax_amount);
      setPaymentAccountId(expense.payment_account_id ?? defaultAccountId);
      setAccountId(expense.account_id ?? "");
      setRuleId(expense.allocation_rule_id ?? "");
      setReference(expense.reference ?? "");
      setNotes(expense.notes ?? "");
      setPartyId(expense.party_id ?? null);
      setLinkedPartyLabel(expense.party_name ?? null);
      setPartyQuery("");
      setPartyResults([]);
      if (expense.allocation_json?.lines?.length) {
        setPreview(expense.allocation_json as ApiAllocationPreview);
        if (expense.allocation_overridden) {
          const next: Record<string, string> = {};
          for (const line of expense.allocation_json.lines) {
            next[line.cost_center_id] = line.amount;
          }
          setEditAmounts(next);
        } else {
          setEditAmounts({});
        }
      } else {
        setPreview(null);
        setEditAmounts({});
      }
    } else {
      setCategoryId(categories[0]?.id ?? "");
      setPayee("");
      setDescription("");
      setExpenseDate(todayIso());
      setAmount("");
      setTaxAmount("0");
      setPaymentAccountId(defaultAccountId);
      setAccountId("");
      setRuleId("");
      setReference("");
      setNotes("");
      setPartyId(initialPartyId);
      setLinkedPartyLabel(initialPartyId ? initialPartyLabel : null);
      setPartyQuery("");
      setPartyResults([]);
      setPreview(null);
      setEditAmounts({});
    }
    setPreviewError(null);
  }, [open, expense, categories, defaultAccountId, initialPartyId, initialPartyLabel]);

  React.useEffect(() => {
    if (!partyDropdownOpen) return;
    const q = partyQuery.trim();
    if (!q) {
      setPartyResults([]);
      return;
    }
    let cancelled = false;
    setPartySearching(true);
    const handle = window.setTimeout(() => {
      void searchLinkableParties(q)
        .then((rows) => {
          if (!cancelled) setPartyResults(rows);
        })
        .finally(() => {
          if (!cancelled) setPartySearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [partyQuery, partyDropdownOpen]);

  React.useEffect(() => {
    if (selectedRule?.account_id && !accountId) {
      setAccountId(selectedRule.account_id);
    }
  }, [selectedRule, accountId]);

  const amountNum = Number(amount || 0);
  const taxNum = Number(taxAmount || 0);
  const total = (Number.isFinite(amountNum) ? amountNum : 0) + (Number.isFinite(taxNum) ? taxNum : 0);

  const hydratedKey = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      hydratedKey.current = null;
      return;
    }
    const key = `${ruleId}|${amountNum}`;
    if (expense && hydratedKey.current === null) {
      hydratedKey.current = key;
      return;
    }
    if (!ruleId || !(amountNum > 0) || readOnly) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void previewAllocationRule(ruleId, amountNum)
        .then((data) => {
          if (cancelled) return;
          setPreview(data);
          setPreviewError(null);
          setEditAmounts({});
        })
        .catch((err) => {
          if (cancelled) return;
          setPreview(null);
          setPreviewError(err instanceof Error ? err.message : "Could not preview allocation");
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, ruleId, amountNum, readOnly, expense]);

  const isValid =
    categoryId.length > 0 && payee.trim().length > 0 && expenseDate.length > 0 && amountNum > 0;

  const displayedLines = preview?.lines ?? [];
  const overrideActive = Object.keys(editAmounts).length > 0;
  const overrideTotal = displayedLines.reduce((sum, line) => {
    const raw = editAmounts[line.cost_center_id] ?? line.amount;
    const n = Number(raw);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const overrideOk = !overrideActive || Math.abs(overrideTotal - amountNum) < 0.005;

  async function handleSubmit() {
    if (!isValid || readOnly) return;
    if (ruleId && !overrideOk) {
      toast.error("Allocated amounts must equal the expense amount");
      return;
    }
    setSaving(true);
    const input: ExpenseCreateInput = {
      category_id: categoryId,
      payee: payee.trim(),
      description: description.trim(),
      expense_date: expenseDate,
      amount: amountNum,
      tax_amount: taxNum,
      payment_method: paymentAccounts.find((a) => a.id === paymentAccountId)?.kind ?? "cash",
      payment_account_id: paymentAccountId || undefined,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
      account_id: accountId || undefined,
      party_id: partyId,
      allocation_rule_id: ruleId || null,
      override_lines:
        ruleId && overrideActive
          ? displayedLines.map((line) => ({
              cost_center_id: line.cost_center_id,
              amount: Number(editAmounts[line.cost_center_id] ?? line.amount),
              basis_value: Number(line.basis_value),
            }))
          : undefined,
    };
    try {
      if (isEdit && expense) {
        await onSave(expense.id, input);
        toast.success("Expense updated");
      } else {
        await onCreate(input);
        toast.success("Expense created");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save expense");
    } finally {
      setSaving(false);
    }
  }

  const auditName = expense?.allocation_rule_name || expense?.allocation_json?.rule_name;
  const showAudit = Boolean(expense?.status === "paid" && auditName);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={isEdit ? "Edit expense" : "New expense"}
        resizable
        resizeMaxWidth={720}
        closeButton="inside"
        className="min-w-[160px] w-[520px] max-w-[720px] overflow-y-auto"
      >
        <h2 className="pr-8 text-base font-semibold">{isEdit ? `Edit ${expense?.expense_number}` : "New expense"}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {readOnly
            ? "Paid expenses cannot be edited."
            : isEdit
              ? expense?.status === "approved"
                ? "Approved but not paid — you can still edit before marking paid."
                : "Save changes, then approve and mark paid."
              : "Saved as a draft — approve it, then mark it paid."}
        </p>
        {showAudit ? (
          <p className="mt-2 border border-border bg-muted/30 px-2 py-1.5 text-xs text-foreground">
            BDT {moneyLabel(Number(expense?.amount ?? 0))} allocated using &ldquo;{auditName}&rdquo;
            {expense?.allocation_overridden ? " (amounts overridden)." : "."}
          </p>
        ) : null}

        <div className="mt-4 space-y-3.5">
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-none" disabled={disabled}>
              {categories.length === 0 && <option value="">No categories</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Paid to</Label>
            <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Vendor, landlord, employee…" disabled={disabled} />
          </div>

          <div className="relative flex flex-col gap-1.5">
            <Label>Link to party (optional)</Label>
            {linkedPartyLabel && partyId ? (
              <div className="flex items-center justify-between border border-input px-2.5 py-1.5 text-sm">
                <span className="truncate">{linkedPartyLabel}</span>
                {!disabled ? (
                  <button
                    type="button"
                    className="ml-2 shrink-0 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setPartyId(null);
                      setLinkedPartyLabel(null);
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ) : (
              <Input
                value={partyQuery}
                onChange={(e) => {
                  setPartyQuery(e.target.value);
                  setPartyDropdownOpen(true);
                }}
                onFocus={() => setPartyDropdownOpen(true)}
                onBlur={() => window.setTimeout(() => setPartyDropdownOpen(false), 150)}
                placeholder="Search customer, supplier, or vendor…"
                disabled={disabled}
              />
            )}
            {partyDropdownOpen && !linkedPartyLabel ? (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto border border-input bg-popover shadow-md">
                {partySearching ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
                ) : partyQuery.trim() && partyResults.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No matches</p>
                ) : (
                  partyResults.map((r) => (
                    <button
                      key={`${r.role}:${r.partyId}`}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-muted"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setPartyId(r.partyId);
                        setLinkedPartyLabel(`${r.name} (${PARTY_ROLE_LABEL[r.role]})`);
                        setPartyDropdownOpen(false);
                        setPartyQuery("");
                        if (!payee.trim()) setPayee(r.name);
                      }}
                    >
                      <span className="truncate">{r.name}</span>
                      <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">
                        {PARTY_ROLE_LABEL[r.role]}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this for?" disabled={disabled} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Date</Label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} disabled={disabled} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Paid from</Label>
              <Select value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)} className="w-full rounded-none" disabled={disabled}>
                {paymentAccounts.length === 0 && <option value="">No accounts</option>}
                {paymentAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Amount</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" disabled={disabled} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Tax</Label>
              <Input type="number" min="0" step="0.01" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} placeholder="0.00" disabled={disabled} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>GL account</Label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-none" disabled={disabled}>
              <option value="">6000 Operating Expenses (default)</option>
              {expenseAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Allocation rule</Label>
            <Select
              value={ruleId}
              onChange={(e) => {
                setRuleId(e.target.value);
                setPreview(null);
                setEditAmounts({});
              }}
              className="w-full rounded-none"
              disabled={disabled}
            >
              <option value="">None — single debit</option>
              {allocationRules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.name}
                </option>
              ))}
            </Select>
          </div>

          {previewError ? <p className="text-xs text-red-600 dark:text-red-400">{previewError}</p> : null}

          {displayedLines.length > 0 ? (
            <div className="border border-border">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Concern</th>
                    <th className="px-2 py-1.5 font-medium">{preview?.unit_label || "Units"}</th>
                    <th className="px-2 py-1.5 font-medium">%</th>
                    <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedLines.map((line) => (
                    <tr key={line.cost_center_id} className="border-t border-border">
                      <td className="px-2 py-1.5">
                        <span className="font-mono text-[11px] text-muted-foreground">{line.code}</span> {line.name}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">{line.basis_value}</td>
                      <td className="px-2 py-1.5 tabular-nums">{line.percentage}</td>
                      <td className="px-2 py-1.5 text-right">
                        {canWrite && !readOnly ? (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editAmounts[line.cost_center_id] ?? line.amount}
                            onChange={(e) =>
                              setEditAmounts((prev) => ({ ...prev, [line.cost_center_id]: e.target.value }))
                            }
                            className="ml-auto h-7 w-[110px] rounded-none text-right"
                            disabled={disabled}
                          />
                        ) : (
                          <span className="tabular-nums">{moneyLabel(Number(line.amount))}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/30 font-medium">
                    <td className="px-2 py-1.5" colSpan={3}>
                      Total
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${overrideOk ? "" : "text-red-600 dark:text-red-400"}`}>
                      {moneyLabel(overrideActive ? overrideTotal : displayedLines.reduce((s, l) => s + Number(l.amount), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : null}

          <div className="flex items-center justify-between border border-input bg-muted/30 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Total</span>
            <span className="text-sm font-semibold tabular-nums">{formatCurrency(total)}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Reference (optional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Invoice / receipt no." disabled={disabled} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Notes (optional)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-none border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={disabled}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-input pt-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          {!readOnly ? (
            <Button size="sm" onClick={() => void handleSubmit()} disabled={!isValid || saving || !overrideOk}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create expense"}
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
