"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { ApiExpense, ExpensePayInput } from "@/lib/api/expenses";
import type { ApiFinancePaymentAccount } from "@/lib/api/finance";
import { formatCurrency } from "@/lib/utils";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ApiExpense | null;
  paymentAccounts: ApiFinancePaymentAccount[];
  onPay: (id: string, input: ExpensePayInput) => Promise<void>;
};

export function PayExpenseDialog({ open, onOpenChange, expense, paymentAccounts, onPay }: Props) {
  const [paymentAccountId, setPaymentAccountId] = React.useState("");
  const [paymentDate, setPaymentDate] = React.useState(todayIso());
  const [reference, setReference] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open || !expense) return;
    const defaultAccountId = expense.payment_account_id ?? paymentAccounts.find((a) => a.is_default)?.id ?? paymentAccounts[0]?.id ?? "";
    setPaymentAccountId(defaultAccountId);
    setPaymentDate(todayIso());
    setReference(expense.reference ?? "");
  }, [open, expense, paymentAccounts]);

  async function handleSubmit() {
    if (!expense || !paymentAccountId) return;
    setSaving(true);
    try {
      const account = paymentAccounts.find((a) => a.id === paymentAccountId);
      await onPay(expense.id, {
        payment_account_id: paymentAccountId,
        payment_method: account?.kind ?? "cash",
        payment_date: paymentDate,
        reference: reference.trim() || undefined,
      });
      toast.success(`${expense.expense_number} marked paid`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to pay expense");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title="Pay expense" className="w-full max-w-sm overflow-y-auto">
        {expense && (
          <>
            <h2 className="pr-8 text-base font-semibold">Pay {expense.expense_number}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {expense.payee} — {formatCurrency(Number(expense.total))}
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex flex-col gap-1.5">
                <Label>Paid from</Label>
                <Select value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)} className="w-full rounded-none" disabled={saving}>
                  {paymentAccounts.length === 0 && <option value="">No accounts</option>}
                  {paymentAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatCurrency(Number(a.balance))})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Payment date</Label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} disabled={saving} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Reference (optional)</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Receipt / transaction no." disabled={saving} />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-input pt-4">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void handleSubmit()} disabled={saving || !paymentAccountId}>
                {saving ? "Paying…" : "Mark paid"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
