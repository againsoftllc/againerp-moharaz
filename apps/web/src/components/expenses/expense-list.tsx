"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import type { ApiExpense, ExpenseStatus } from "@/lib/api/expenses";

type Props = {
  expenses: ApiExpense[];
  loading?: boolean;
  canEdit?: boolean;
  onRowClick: (expense: ApiExpense) => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onPayClick: (expense: ApiExpense) => void;
  onDelete: (id: string) => Promise<void>;
};

function statusVariant(status: ExpenseStatus) {
  if (status === "paid") return "success" as const;
  if (status === "approved") return "warning" as const;
  if (status === "rejected") return "muted" as const;
  return "outline" as const;
}

function formatMoney(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? formatCurrency(n) : value;
}

export function ExpenseList({ expenses, loading = false, canEdit = false, onRowClick, onApprove, onReject, onPayClick, onDelete }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(id: string, action: (id: string) => Promise<void>, successMsg: string) {
    setBusyId(id);
    try {
      await action(id);
      toast.success(successMsg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(expense: ApiExpense) {
    if (!window.confirm(`Delete draft expense ${expense.expense_number}?`)) return;
    await run(expense.id, onDelete, "Expense deleted");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border bg-background">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead className="sticky top-0 z-[1] border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Expense #</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Paid to</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 font-medium">Status</th>
              {canEdit ? <th className="w-[200px] px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canEdit ? 8 : 7} className="px-3 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : expenses.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 8 : 7} className="px-3 py-10 text-center text-muted-foreground">
                  No expenses yet.
                </td>
              </tr>
            ) : (
              expenses.map((expense) => {
                const busy = busyId === expense.id;
                return (
                  <tr
                    key={expense.id}
                    className="cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-muted/30"
                    onClick={() => onRowClick(expense)}
                  >
                    <td className="px-3 py-2 font-medium">{expense.expense_number}</td>
                    <td className="px-3 py-2 text-muted-foreground">{expense.expense_date}</td>
                    <td className="px-3 py-2">{expense.category_name ?? "—"}</td>
                    <td className="px-3 py-2">{expense.payee}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground">{expense.description || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(expense.total)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant(expense.status)} className="capitalize">
                        {expense.status}
                      </Badge>
                    </td>
                    {canEdit ? (
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {(expense.status === "draft" || expense.status === "approved") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-1.5"
                              disabled={busy}
                              onClick={() => onRowClick(expense)}
                              title="Edit"
                            >
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              Edit
                            </Button>
                          )}
                          {expense.status === "draft" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-1.5 text-emerald-600 hover:text-emerald-700"
                                disabled={busy}
                                onClick={() => void run(expense.id, onApprove, "Expense approved")}
                                title="Approve"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 rounded-none px-0 text-muted-foreground hover:text-destructive"
                                disabled={busy}
                                onClick={() => void handleDelete(expense)}
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          {expense.status === "approved" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className={cn("h-6 px-1.5")}
                                disabled={busy}
                                onClick={() => onPayClick(expense)}
                                title="Mark paid"
                              >
                                <Wallet className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 rounded-none px-0 text-muted-foreground hover:text-destructive"
                                disabled={busy}
                                onClick={() => void run(expense.id, onReject, "Expense rejected")}
                                title="Reject"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
