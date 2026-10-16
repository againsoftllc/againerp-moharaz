"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { type ApiFinancePaymentAccount } from "@/lib/api/finance";
import { formatCurrency } from "@/lib/utils";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export type SettleTarget = {
  id: string;
  label: string;
  counterpartyName: string;
  balance: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: SettleTarget | null;
  paymentAccounts: ApiFinancePaymentAccount[];
  onSettle: (
    id: string,
    input: { amount: string; payment_account_id: string; payment_date?: string; reference?: string; notes?: string },
  ) => Promise<void>;
};

export function SettlePaymentDrawer({ open, onOpenChange, target, paymentAccounts, onSettle }: Props) {
  const [amount, setAmount] = React.useState("");
  const [paymentAccountId, setPaymentAccountId] = React.useState("");
  const [paymentDate, setPaymentDate] = React.useState(todayIso());
  const [reference, setReference] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open || !target) return;
    setAmount(target.balance);
    setPaymentAccountId(paymentAccounts.find((a) => a.is_default)?.id ?? paymentAccounts[0]?.id ?? "");
    setPaymentDate(todayIso());
    setReference("");
  }, [open, target, paymentAccounts]);

  const amountNum = Number(amount || 0);
  const isValid = Boolean(target) && amountNum > 0 && amountNum <= Number(target?.balance ?? 0) && Boolean(paymentAccountId);

  async function handleSubmit() {
    if (!target || !isValid) return;
    setSaving(true);
    try {
      await onSettle(target.id, {
        amount,
        payment_account_id: paymentAccountId,
        payment_date: paymentDate,
        reference: reference.trim() || undefined,
      });
      toast.success("Payment recorded");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title="Record payment" className="w-full max-w-sm overflow-y-auto">
        {target && (
          <>
            <h2 className="pr-8 text-base font-semibold">Record payment</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {target.label} — {target.counterpartyName}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Outstanding: <span className="font-medium text-foreground">{formatCurrency(Number(target.balance))}</span>
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex flex-col gap-1.5">
                <Label>Amount</Label>
                <Input
                  type="number"
                  min="0"
                  max={target.balance}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Into / from account</Label>
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
                <Label>Date</Label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} disabled={saving} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Reference (optional)</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction / receipt no." disabled={saving} />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-input pt-4">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void handleSubmit()} disabled={!isValid || saving}>
                {saving ? "Saving…" : "Record payment"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
